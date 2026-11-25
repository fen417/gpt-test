import * as THREE from 'three';
import {compactColorEligible,selectSceneColor,displayVariant} from './compact-color-target.js';
import { WorldPost,canFuseBloom } from './world-post.js';
import { renderTimed } from './gpu-pass-timing.js';
import { webGpuWorldStages, makeGpuReflectionReceiver } from './webgpu-world-stages.js';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { texture, uv, uniform, vec2, vec3, vec4, Fn, If, min, max, distance,
  smoothstep, dot, sin, fract, clamp, acesFilmicToneMapping } from 'three/tsl';
import { smaa } from 'three/addons/tsl/display/SMAANode.js';
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
    this.nativeTarget=this.target;this.frameGeneration=null;this.compactActive=false;
    this.compactSupported=Boolean(renderer.backend?.device?.features?.has('rg11b10ufloat-renderable'));
    this.maxSamples=4;
    this.ldrTarget=new THREE.RenderTarget(1,1,{depthBuffer:false});
    this.upscaledTarget=new THREE.RenderTarget(1,1,{depthBuffer:false});
    for(const target of [this.ldrTarget,this.upscaledTarget])target.texture.colorSpace=THREE.NoColorSpace;
    this.fsrQuality='off';this.fsrScale=1;this.size=new THREE.Vector2();
    this.useFxaa=uniform(1);this.sharpen=uniform(.12);this.grain=uniform(.0015);
    this.gradeTint=uniform(new THREE.Vector3(1,1,1));this.grading=uniform(new THREE.Vector2(1,1));this.vignetteGain=uniform(.08);
    this.time=uniform(0);this.exposure=uniform(1.06);this.invSize=uniform(new THREE.Vector2(1,1));
    this.inputSize=uniform(new THREE.Vector2(1,1));this.outputSize=uniform(new THREE.Vector2(1,1));
    this.rcasSharpness=uniform(.4);
    const geometry=fullScreenGeometry();
    this.geometry=geometry;
    const source=texture(this.target.texture), sampled=source.sample(uv());
    this.sourceTexture=source; // Single attachment scene color; FG captures finished post output.
    this.displayStages=new Map();
    this.bloomGain=uniform(0);this.bloomInputs=Array.from({length:4},()=>texture(this.target.texture));
    this.buildDisplay=(variant,levels=0)=>{
    const [useFxaa,useSharpen,useGrade,useVignette,useGrain]=[...variant].map(v=>v==='1');
    const filtered=useFxaa?fxaa(source):null;
    const postColor=Fn(()=>{
      const color=vec3(sampled.rgb).toVar();
      for(let i=0;i<levels;i++)color.addAssign(this.bloomInputs[i].sample(uv()).rgb.mul(this.bloomGain).mul([.62,.23,.10,.05][i]));
      // Shader control flow matters on low-end GPUs: disabled FXAA/sharpening
      // must not execute their expensive texture samples.
      if(useFxaa)color.assign(filtered.rgb);
      if(useSharpen){
        const tx=this.invSize;
        const a=source.sample(uv().add(vec2(tx.x,0))).rgb;
        const b=source.sample(uv().sub(vec2(tx.x,0))).rgb;
        const c=source.sample(uv().add(vec2(0,tx.y))).rgb;
        const d=source.sample(uv().sub(vec2(0,tx.y))).rgb;
        const lo=min(color,min(min(a,b),min(c,d))),hi=max(color,max(max(a,b),max(c,d)));
        color.assign(clamp(color.add(color.sub(a.add(b).add(c).add(d).mul(.25)).mul(this.sharpen)),lo,hi));
      }
      const mapped=acesFilmicToneMapping(color,this.exposure).toVar();
      if(useGrade){
        const adjusted=mapped.add(mapped.mul(mapped.oneMinus()).mul(mapped.sub(.32)).mul(this.grading.x.sub(1)).mul(4));
        const luma=dot(adjusted,vec3(.2126,.7152,.0722));
        mapped.assign(max(vec3(0),vec3(luma).add(adjusted.sub(luma).mul(this.grading.y)).mul(this.gradeTint)));
      }
      const vignette=useVignette?smoothstep(.1,.8,distance(uv(),vec2(.5))).mul(this.vignetteGain.negate()).add(1):1;
      const noise=useGrain?fract(sin(dot(uv().mul(this.outputSize).add(this.time),vec2(12.9898,78.233))).mul(43758.5453)).sub(.5).mul(this.grain):0;
      // WebGPU Renderer r181 does its own color-space output pass on
      // the default framebuffer. Keep intermediate FSR/FG targets linear and
      // don't manually encode sRGB, or the image becomes blown out.
      return vec4(mapped.mul(vignette).add(noise),1);
    })();
    return stage(geometry,postColor);
    };
    const initial=this.buildDisplay('11111');this.displayStages.set('11111:0',initial);this.scene=initial.scene;this.material=initial.material;
    const easu=stage(geometry,easuNode(texture(this.ldrTarget.texture),this.inputSize,this.outputSize));
    this.easuScene=easu.scene;this.easuMaterial=easu.material;
    const rcas=stage(geometry,rcasNode(texture(this.upscaledTarget.texture),this.outputSize,this.rcasSharpness));
    this.rcasScene=rcas.scene;this.rcasMaterial=rcas.material;
    this.camera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
    this.worldEffects=new WorldPost(renderer,THREE.RenderTarget,post=>webGpuWorldStages(post,this.geometry,this.camera),true,makeGpuReflectionReceiver);
  }
  setUpscaling(quality='off',adaptive=1,sharpness=40){
    this.fsrQuality=quality;
    this.fsrScale=quality==='off'?1:fsr1RenderScale(quality,adaptive);
    this.rcasSharpness.value=Math.max(0,Math.min(1,Number(sharpness)/100||0));
  }
  setImage(effects,grade){
    this.effects=effects;
    this.gradeTint.value.fromArray(grade.tint);
    this.grading.value.set(grade.contrast,grade.saturation);
    this.vignetteGain.value=grade.vignette;
    this.grainSetting=grade.grain;
  }
  begin(quality='high'){
    // FG never changes the world render target or its MSAA policy.
    // There is no velocity MRT, so the normal scene AA is safe to retain.
    const mode=this.antialias;
    const samples=mode==='msaa4'||quality==='high'&&(mode==='auto'||mode==='on')?this.maxSamples:0;
    const fsr=this.fsrQuality!=='off'&&this.fsrScale<.995;
    this.useFxaa.value=this.antialias==='off'?0:samples>0?0:1;
    this.sharpen.value=fsr?0:quality==='high'?0:.12;
    const r=this.renderer;r.getDrawingBufferSize(this.size);
    const w=Math.max(1,Math.round(this.size.x*(fsr?this.fsrScale:1)));
    const h=Math.max(1,Math.round(this.size.y*(fsr?this.fsrScale:1)));
    this.frameGeneration?.resize(this.size.x,this.size.y);
    if(mode==='smaa'){
      if(!this.smaa){
        const input=new THREE.RenderTarget(1,1,{depthBuffer:false});
        const node=smaa(texture(input.texture));
        this.smaa={input,node,...stage(this.geometry,node)};
      }
      const {input}=this.smaa;
      if(input.width!==w||input.height!==h)input.setSize(w,h);
    }else this.disposeSmaa();
    this.smaaActive=Boolean(this.smaa?.node._areaTexture.version&&this.smaa.node._searchTexture.version);
    this.invSize.value.set(1/w,1/h);
    this.outputSize.value.copy(this.size);
    if(fsr){
      if(this.ldrTarget.width!==w||this.ldrTarget.height!==h)this.ldrTarget.setSize(w,h);
      if(this.upscaledTarget.width!==this.size.x||this.upscaledTarget.height!==this.size.y)this.upscaledTarget.setSize(this.size.x,this.size.y);
      this.inputSize.value.set(w,h);
    }
    let effects;
    try{effects=this.worldEffects.configure(this.effects,w,h,samples);}
    catch(error){throw Object.assign(new Error('World post configuration failed',{cause:error}),{s09PostFault:'depth'});}
    const compact=this.compactSupported&&compactColorEligible(quality,effects,samples,this.frameGeneration?.enabled);
    const changed=this.compactActive!==compact||this.target.width!==w||this.target.height!==h;
    selectSceneColor(this,compact,w,h,THREE.RenderTarget);
    if(this.target.samples!==samples){this.target.dispose();this.target.samples=samples;}
    if(changed)this.frameGeneration?.reset();
    this.sourceTexture.value=this.target.texture;
    if(this.smaaActive)this.useFxaa.value=0;
    else if(effects&&this.worldEffects.world.depthTexture&&mode!=='off')this.useFxaa.value=1;
    const worldSamples=effects&&!this.worldEffects.directWorld?this.worldEffects.world.samples:samples;
    this.activeAA=this.smaaActive?'SMAA':this.useFxaa.value>.5?'FXAA':worldSamples?'MSAA '+worldSamples+'×':'Выкл.';
    this.aaFallback=mode==='smaa'&&!this.smaaActive?'SMAA ещё недоступно':mode.startsWith('msaa')&&worldSamples!==Number(mode.slice(4))?'MSAA несовместимо с активными эффектами или GPU':null;
    r.setRenderTarget(effects&&!this.worldEffects.directWorld?this.worldEffects.world:this.target);
  }
  end(time,quality,profiler){
    const r=this.renderer,reset=r.info.autoReset,oldToneMapping=r.toneMapping;
    r.info.autoReset=false;
    // ACES is already applied in postColor. Disable the automatic tone map,
    // but keep automatic sRGB conversion for final screen presentations.
    r.toneMapping=THREE.NoToneMapping;
    this.time.value=time;this.grain.value=this.grainSetting??(quality==='low'?0:.0015);
    this.exposure.value=r.toneMappingExposure;
    const g=this.gradeTint.value,v=this.grading.value;
    const variant=displayVariant({fxaa:this.useFxaa.value>.5,sharpen:this.sharpen.value>0,grade:v.x!==1||v.y!==1||g.x!==1||g.y!==1||g.z!==1,vignette:this.vignetteGain.value!==0,grain:this.grain.value!==0});
    const bloom=this.worldEffects.bloom??[],levels=canFuseBloom(bloom.length,this.useFxaa.value>.5,this.sharpen.value>0)?bloom.length:0;
    const key=variant+':'+levels;
    let display=this.displayStages.get(key);
    if(!display){display=this.buildDisplay(variant,levels);this.displayStages.set(key,display);}
    this.scene=display.scene;this.material=display.material;
    try {
      this.sourceTexture.value=this.worldEffects.finishBloom(this.target,profiler,levels>0);
      if(levels){this.bloomGain.value=this.worldEffects.state.bloomGain;for(let i=0;i<levels;i++)this.bloomInputs[i].value=bloom[i].texture;}
      const finalTarget=this.frameGeneration?.enabled?this.frameGeneration.nextRealTarget():null;
      const output=this.smaaActive?this.smaa.input:finalTarget;
      if(this.fsrQuality!=='off'&&this.fsrScale<.995){
        r.setRenderTarget(this.smaaActive?this.smaa.input:this.ldrTarget);renderTimed(r,this.scene,this.camera,profiler,'display');
        if(this.smaaActive){r.setRenderTarget(this.ldrTarget);renderTimed(r,this.smaa.scene,this.camera,profiler,'smaa');}
        const timing=profiler?.beginPass('fsr');
        try{
          r.setRenderTarget(this.upscaledTarget);r.render(this.easuScene,this.camera);
          r.setRenderTarget(finalTarget);r.render(this.rcasScene,this.camera);
        }finally{if(timing)profiler.endPass();}
      }else {
        r.setRenderTarget(output);
        renderTimed(r,this.scene,this.camera,profiler,'display');
      }
      if(this.smaaActive&&!(this.fsrQuality!=='off'&&this.fsrScale<.995)){
        r.setRenderTarget(finalTarget);renderTimed(r,this.smaa.scene,this.camera,profiler,'smaa');
      }
      if(this.frameGeneration?.enabled){
        const timing=profiler?.beginPass('realPresent');
        try{this.frameGeneration.presentReal();}
        finally{if(timing)profiler.endPass();}
      }
    }finally{this.sourceTexture.value=this.target.texture;r.setRenderTarget(null);r.toneMapping=oldToneMapping;r.info.autoReset=reset;}
  }
  disposeSmaa(){
    if(!this.smaa)return;
    this.smaa.material.dispose();this.smaa.node.dispose();this.smaa.input.dispose();
    this.smaa=null;
  }
  dispose(){
    this.disposeSmaa();
    this.worldEffects.receivers.dispose();
    this.worldEffects.dispose();
    this.nativeTarget.dispose();this.compactTarget?.dispose();this.ldrTarget.dispose();this.upscaledTarget.dispose();
    this.geometry.dispose();for(const stage of this.displayStages.values())stage.material.dispose();this.displayStages.clear();this.easuMaterial.dispose();this.rcasMaterial.dispose();
  }
}
