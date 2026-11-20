import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { texture, uv, uniform, vec2, vec3, vec4, Fn, If, min, max, distance,
  smoothstep, dot, sin, fract, clamp, renderOutput, acesFilmicToneMapping } from 'three/tsl';
import { fxaa } from 'three/addons/tsl/display/FXAANode.js';
import { fsr1RenderScale } from './fsr1.js';
import { easuNode, rcasNode } from './webgpu-fsr1.js';

const fullScreenGeometry=()=>{
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,3,-1,0,-1,3,0],3));
  // WebGPU render-target textures use a top-left origin. The GLSL fullscreen
  // triangle's bottom-left UVs vertically mirror both the world and FPV
  // weapon when sampled by TSL. Match Three.js WebGPU QuadMesh's default
  // orientation (top-left = 0,0; bottom-left = 0,1) for every post/FSR stage.
  g.setAttribute('uv',new THREE.Float32BufferAttribute([0,1,2,1,0,-1],2));
  return g;
};
const stage=(geometry,fragmentNode)=>{
  const material=new MeshBasicNodeMaterial({depthTest:false,depthWrite:false,fog:false});
  material.toneMapped=false;
  material.fragmentNode=fragmentNode;
  const scene=new THREE.Scene();
  scene.add(new THREE.Mesh(geometry,material));
  return {scene,material};
};

export class WebGpuPostPass {
  constructor(renderer,{antialias='auto'}={}){
    this.renderer=renderer;this.antialias=antialias;
    this.target=new THREE.RenderTarget(1,1,{type:THREE.HalfFloatType,depthBuffer:true});
    this.maxSamples=4;
    this.ldrTarget=new THREE.RenderTarget(1,1,{depthBuffer:false});
    this.upscaledTarget=new THREE.RenderTarget(1,1,{depthBuffer:false});
    for(const target of [this.ldrTarget,this.upscaledTarget])target.texture.colorSpace=THREE.NoColorSpace;
    this.fsrQuality='off';this.fsrScale=1;this.size=new THREE.Vector2();
    this.useFxaa=uniform(1);this.sharpen=uniform(.12);this.grain=uniform(.0015);
    this.time=uniform(0);this.exposure=uniform(1.06);this.invSize=uniform(new THREE.Vector2(1,1));
    this.inputSize=uniform(new THREE.Vector2(1,1));this.outputSize=uniform(new THREE.Vector2(1,1));
    this.rcasSharpness=uniform(.6);
    const geometry=fullScreenGeometry();
    this.geometry=geometry;
    const source=texture(this.target.texture), sampled=source.sample(uv());
    const filtered=fxaa(source);
    const postColor=Fn(()=>{
      const color=vec3(sampled.rgb).toVar();
      // Shader control flow matters on low-end GPUs: disabled FXAA/sharpening
      // must not execute their expensive texture samples.
      If(this.useFxaa.greaterThan(.5),()=>{color.assign(filtered.rgb);});
      If(this.sharpen.greaterThan(0),()=>{
        const tx=this.invSize;
        const a=source.sample(uv().add(vec2(tx.x,0))).rgb;
        const b=source.sample(uv().sub(vec2(tx.x,0))).rgb;
        const c=source.sample(uv().add(vec2(0,tx.y))).rgb;
        const d=source.sample(uv().sub(vec2(0,tx.y))).rgb;
        const lo=min(color,min(min(a,b),min(c,d))),hi=max(color,max(max(a,b),max(c,d)));
        color.assign(clamp(color.add(color.sub(a.add(b).add(c).add(d).mul(.25)).mul(this.sharpen)),lo,hi));
      });
      const mapped=acesFilmicToneMapping(color,this.exposure);
      const vignette=vec3(1).mul(smoothstep(.1,.8,distance(uv(),vec2(.5)))).mul(-.08).add(1);
      const pixel=uv().mul(this.outputSize);
      const noise=fract(sin(dot(pixel.add(this.time),vec2(12.9898,78.233))).mul(43758.5453)).sub(.5).mul(this.grain);
      return renderOutput(vec4(mapped.mul(vignette).add(noise),1),THREE.NoToneMapping,THREE.SRGBColorSpace);
    })();
    const post=stage(geometry,postColor);this.scene=post.scene;this.material=post.material;
    const easu=stage(geometry,easuNode(texture(this.ldrTarget.texture),this.inputSize,this.outputSize));
    this.easuScene=easu.scene;this.easuMaterial=easu.material;
    const rcas=stage(geometry,rcasNode(texture(this.upscaledTarget.texture),this.outputSize,this.rcasSharpness));
    this.rcasScene=rcas.scene;this.rcasMaterial=rcas.material;
    this.camera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  }
  setUpscaling(quality='off',adaptive=1){
    this.fsrQuality=quality;
    this.fsrScale=quality==='off'?1:fsr1RenderScale(quality,adaptive);
  }
  begin(quality='high'){
    const samples=quality==='high'&&this.antialias!=='off'?this.maxSamples:0;
    if(this.target.samples!==samples){this.target.dispose();this.target.samples=samples;}
    const fsr=this.fsrQuality!=='off'&&this.fsrScale<.995;
    this.useFxaa.value=this.antialias==='off'?0:quality==='high'&&samples>0?0:1;
    this.sharpen.value=fsr?0:quality==='high'?0:.12;
    const r=this.renderer;r.getDrawingBufferSize(this.size);
    const w=Math.max(1,Math.round(this.size.x*(fsr?this.fsrScale:1)));
    const h=Math.max(1,Math.round(this.size.y*(fsr?this.fsrScale:1)));
    if(this.target.width!==w||this.target.height!==h)this.target.setSize(w,h);
    this.invSize.value.set(1/w,1/h);
    this.outputSize.value.copy(this.size);
    if(fsr){
      if(this.ldrTarget.width!==w||this.ldrTarget.height!==h)this.ldrTarget.setSize(w,h);
      if(this.upscaledTarget.width!==this.size.x||this.upscaledTarget.height!==this.size.y)this.upscaledTarget.setSize(this.size.x,this.size.y);
      this.inputSize.value.set(w,h);
    }
    r.setRenderTarget(this.target);
  }
  end(time,quality){
    const r=this.renderer,reset=r.info.autoReset;r.info.autoReset=false;
    this.time.value=time;this.grain.value=quality==='low'?0:.0015;
    this.exposure.value=r.toneMappingExposure;
    try {
      if(this.fsrQuality!=='off'&&this.fsrScale<.995){
        r.setRenderTarget(this.ldrTarget);r.render(this.scene,this.camera);
        r.setRenderTarget(this.upscaledTarget);r.render(this.easuScene,this.camera);
        r.setRenderTarget(null);r.render(this.rcasScene,this.camera);
      }else {r.setRenderTarget(null);r.render(this.scene,this.camera);}
    }finally{r.setRenderTarget(null);r.info.autoReset=reset;}
  }
  dispose(){
    this.target.dispose();this.ldrTarget.dispose();this.upscaledTarget.dispose();
    this.geometry.dispose();this.material.dispose();this.easuMaterial.dispose();this.rcasMaterial.dispose();
  }
}
