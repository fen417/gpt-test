import * as THREE from 'three';
import { renderTimed } from './gpu-pass-timing.js';

export const SOFT_PARTICLE_LAYER=2;
// Do not pay for an offscreen pass when a few small puffs are cheaper to
// draw directly. Nearby smoke keeps full-resolution silhouettes.
export function chooseHalfSmoke(mode,count,near,coverage){return mode==='half'||mode!=='full'&&count>=12&&!near&&coverage>=.8;}
const blending={transparent:true,depthTest:false,depthWrite:false,toneMapped:false,blending:THREE.CustomBlending,blendSrc:THREE.OneFactor,blendDst:THREE.OneMinusSrcAlphaFactor,blendSrcAlpha:THREE.OneFactor,blendDstAlpha:THREE.OneMinusSrcAlphaFactor};
function glSmokeComposite(geometry,layer,depth){
  const uniforms={smokeLayer:{value:layer},worldDepth:{value:depth},smallSize:{value:new THREE.Vector2()},fullSize:{value:new THREE.Vector2()},clipRange:{value:new THREE.Vector2()}};
  const material=new THREE.ShaderMaterial({...blending,uniforms,vertexShader:'varying vec2 at;void main(){at=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:`
    varying vec2 at;uniform sampler2D smokeLayer,worldDepth;uniform vec2 smallSize,fullSize,clipRange;
    float distanceAt(vec2 uv){float d=texture2D(worldDepth,uv).r;return clipRange.x*clipRange.y/(clipRange.y-d*(clipRange.y-clipRange.x));}
    void main(){
      float center=distanceAt(at);vec2 grid=at*smallSize-.5,base=floor(grid),f=fract(grid);
      vec4 sum=vec4(0.);float weights=0.;
      for(int i=0;i<4;i++){
        vec2 o=vec2(float(i%2),float(i/2));vec2 uv=(clamp(base+o,vec2(0.),smallSize-1.)+.5)/smallSize;
        vec2 b=mix(1.-f,f,o);float diff=abs(distanceAt(uv)-center);
        float w=b.x*b.y*exp(-diff/max(.04,center*.012));
        sum+=texture2D(smokeLayer,uv)*w;weights+=w;
      }
      gl_FragColor=weights>.005?sum/weights:vec4(0.);
    }`});
  const scene=new THREE.Scene();scene.add(new THREE.Mesh(geometry,material));return {scene,material,uniforms};
}

export class SoftSmokePass {
  constructor(owner, depth) {
    const base=owner.effectBatches.smoke.material;
    if(owner.webgpu){
      this.material=owner.webgpu.createSmokeMaterial(owner.activeSmokeTexture??owner.smokeTexture,depth,base.userData.smokeUniforms);
      this.uniforms=this.material.userData.softSmokeUniforms;
    }else{
      const material=this.material=base.clone();
      this.uniforms={worldDepth:{value:depth},frameSize:{value:new THREE.Vector2()},renderSize:{value:new THREE.Vector2()},clipRange:{value:new THREE.Vector2()}};
      material.uniforms={...base.uniforms,...this.uniforms};
      material.fragmentShader=`
        uniform sampler2D worldDepth;
        uniform vec2 renderSize,clipRange;
        float viewDistance(float depth){
          return (clipRange.x*clipRange.y)/(clipRange.y-depth*(clipRange.y-clipRange.x));
        }
      `+material.fragmentShader.replace('#include <tonemapping_fragment>',`
        float world=viewDistance(texture2D(worldDepth,gl_FragCoord.xy/renderSize).r);
        float particle=viewDistance(gl_FragCoord.z);
        gl_FragColor.a*=smoothstep(.01,.48,world-particle);
        if(gl_FragColor.a<.002)discard;
        #include <tonemapping_fragment>
      `);
    }
    this.material.depthTest=false;this.scale=1;this.clearColor=new THREE.Color();this.compositeCamera=new THREE.Camera();
  }

  ensureHalf(owner,depth){
    if(this.half)return;
    const Target=owner.webgpu?THREE.RenderTarget:THREE.WebGLRenderTarget;
    this.half=new Target(1,1,{type:THREE.HalfFloatType,depthBuffer:false,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter});
    this.geometry=new THREE.BufferGeometry();this.geometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,3,-1,0,-1,3,0],3));
    this.geometry.setAttribute('uv',new THREE.Float32BufferAttribute(owner.webgpu?[0,1,2,1,0,-1]:[0,0,2,0,0,2],2));
    this.composite=owner.webgpu?owner.webgpu.createSmokeComposite(this.geometry,this.half.texture,depth,blending):glSmokeComposite(this.geometry,this.half.texture,depth);
  }

  render(owner, target, profiler) {
    const {renderer,scene,camera}=owner, smoke=owner.effectBatches.smoke;
    const mask=camera.layers.mask, background=scene.background;
    const autoClear=renderer.autoClear, shadows=renderer.shadowMap.enabled,output=renderer.getRenderTarget();
    const base=smoke.material;
    const u=this.uniforms;
    u.worldDepth.value=target.depthTexture;
    u.frameSize.value.set(target.width,target.height);
    u.clipRange.value.set(camera.near,camera.far);
    const mode=owner.graphicsEffects?.softParticleResolution??'auto';
    const half=!this.halfFailed&&(owner.forceHalfSmokeWarmup||chooseHalfSmoke(mode,smoke.count,owner.nearSmoke,owner.smokeCoverage??0));
    this.scale=1;
    try{
      camera.layers.set(SOFT_PARTICLE_LAYER);
      scene.background=null;
      renderer.autoClear=false;
      renderer.shadowMap.enabled=false;
      smoke.material=this.material;
      if(half){
        let clearAlpha;
        try{
          this.ensureHalf(owner,target.depthTexture);
          const width=Math.ceil(target.width/2),height=Math.ceil(target.height/2);
          if(this.half.width!==width||this.half.height!==height)this.half.setSize(width,height);
          clearAlpha=renderer.getClearAlpha();renderer.getClearColor(this.clearColor);
          renderer.setRenderTarget(this.half);renderer.setClearColor(0,0);renderer.clear(true,false,false);
          u.renderSize?.value.set(width,height);
          renderTimed(renderer,scene,camera,profiler,'softParticlesHalf');
          renderer.setRenderTarget(output);renderer.setClearColor(this.clearColor,clearAlpha);clearAlpha=undefined;
          const v=this.composite.uniforms;v.worldDepth.value=target.depthTexture;v.smallSize.value.set(width,height);v.fullSize.value.set(target.width,target.height);v.clipRange.value.copy(u.clipRange.value);
          renderTimed(renderer,this.composite.scene,this.compositeCamera,profiler,'softParticlesResolve');this.scale=.5;
        }catch(error){this.halfFailed=true;console.warn('Half-resolution smoke unavailable; using full resolution',error);}
        finally{renderer.setRenderTarget(output);if(clearAlpha!==undefined)renderer.setClearColor(this.clearColor,clearAlpha);}
      }
      if(this.scale===1){u.renderSize?.value.set(target.width,target.height);renderTimed(renderer,scene,camera,profiler,'softParticles');}
    }finally{
      smoke.material=base;
      camera.layers.mask=mask;
      scene.background=background;
      renderer.autoClear=autoClear;
      renderer.shadowMap.enabled=shadows;
    }
  }

  dispose() { this.material.dispose();this.half?.dispose();this.geometry?.dispose();this.composite?.material.dispose(); }
}
