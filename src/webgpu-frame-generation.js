// Opt-in WebGPU motion-vector frame generation. No CPU readback, no WebGL fallback.
// World position/skin/camera motion comes from Three.js r181's native velocity MRT.
// Intermediate frames use conservative *forward extrapolation* of the last
// post-processed image (not a delayed 2-frame optical-flow interpolation).
import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { mrt, output, velocity, texture, uniform, uv, vec2, vec4,
  Fn, abs, clamp, length, max, select } from 'three/tsl';
import { FrameGenerationPolicy } from './frame-generation-policy.js';

const triangle=()=>{
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,3,-1,0,-1,3,0],3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute([0,1,2,1,0,-1],2));
  return geometry;
};
const makeStage=(geometry,node)=>{
  const material=new MeshBasicNodeMaterial({depthTest:false,depthWrite:false,fog:false});
  material.toneMapped=false;material.fragmentNode=node;
  const scene=new THREE.Scene();scene.add(new THREE.Mesh(geometry,material));
  return {scene,material};
};

export class WebGpuFrameGeneration {
  constructor(renderer,post){
    this.renderer=renderer;this.post=post;
    this.policy=new FrameGenerationPolicy();
    this.enabled=false;this.fault=null;
    this.target=null;this.history=null;this.geometry=null;
    this.writeIndex=0;this.currentIndex=0;this.colorReady=0;
    this.extrapolation=uniform(.55);
    this.lateLookCorrection=uniform(new THREE.Vector2());
    this.lastCameraMotion=new THREE.Vector2();
    this.customFragmentMaterials=new Map();
  }
  initialize(){
    const depth=new THREE.DepthTexture(1,1,THREE.UnsignedIntType);
    depth.format=THREE.DepthFormat;
    depth.minFilter=THREE.NearestFilter;depth.magFilter=THREE.NearestFilter;
    this.target=new THREE.RenderTarget(1,1,{type:THREE.HalfFloatType,depthBuffer:true,
      depthTexture:depth,count:2,samples:0});
    // Three.js MRTNode resolves fragment outputs by EXACT texture name.
    // A debug label such as 'FG velocity ...' silently produces an output
    // with no shader location and invalidates WebGPU's render pipelines.
    this.target.textures[0].name='output';
    this.target.textures[1].name='velocity';
    this.target.textures[1].colorSpace=THREE.NoColorSpace;
    this.history=[0,1].map(()=>new THREE.RenderTarget(1,1,{depthBuffer:false,type:THREE.UnsignedByteType}));
    for(const target of this.history)target.texture.colorSpace=THREE.NoColorSpace;
    this.geometry=triangle();this.camera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
    this.mrt=mrt({output,velocity});
    this.blit=this.history.map(target=>makeStage(this.geometry,texture(target.texture).sample(uv())));
    const velocityMap=texture(this.target.textures[1]);
    const depthMap=texture(this.target.depthTexture);
    this.synthetic=this.history.map((current,i)=>{
      const previous=this.history[1-i];
      const latest=texture(current.texture),last=texture(previous.texture);
      const fragment=Fn(()=>{
        const p=uv();
        // Three's velocity is current minus previous in NDC, not UV.
        const motion=velocityMap.sample(p).xy.mul(vec2(.5,-.5));
        // Keep the latest mouse look on a synthetic frame; do not blindly
        // extrapolate camera rotation after the player stopped the mouse.
        const displacement=motion.mul(this.extrapolation).add(this.lateLookCorrection);
        const sourceUV=p.sub(displacement).toVar();
        const clamped=clamp(sourceUV,vec2(0),vec2(1));
        const previousUV=clamp(sourceUV.sub(motion),vec2(0),vec2(1));
        const original=latest.sample(p).rgb;
        const warped=latest.sample(clamped).rgb;
        const prior=last.sample(previousUV).rgb;
        const d0=depthMap.sample(p).r;
        const d1=depthMap.sample(clamped).r;
        const within=sourceUV.x.greaterThan(.001).and(sourceUV.x.lessThan(.999))
          .and(sourceUV.y.greaterThan(.001)).and(sourceUV.y.lessThan(.999));
        // Don't warp across silhouettes, transparencies, flashes or unknown history.
        // Sample depth only with MSAA disabled: WebGPU cannot resolve depth MSAA.
        const trustworthy=within.and(length(motion).lessThan(.035))
          .and(abs(d0.sub(d1)).lessThan(max(.002,d0.mul(.004))))
          .and(length(warped.sub(prior)).lessThan(.35));
        return vec4(select(trustworthy,warped,original),1);
      })();
      return makeStage(this.geometry,fragment);
    });
  }
  resize(width,height){
    if(!this.enabled)return;
    const w=Math.max(1,Math.round(width)),h=Math.max(1,Math.round(height));
    if(this.history[0].width!==w||this.history[0].height!==h){
      for(const target of this.history)target.setSize(w,h);
      this.colorReady=0;this.policy.clearHistory();
    }
  }
  setMode(mode){
    if(this.fault&&mode!=='off')return;
    const valid=['off','auto','1.5','2'].includes(mode)?mode:'off';
    if(valid===this.policy.mode)return;
    this.policy.setMode(valid);
    this.enabled=valid!=='off';
    if(this.enabled){
      if(!this.target)this.initialize();
      this.post.target=this.target;
      this.post.sourceTexture.value=this.target.texture;
      this.colorReady=0;
    }else{
      this.renderer.setMRT(null);
      this.restoreCustomMaterials();
      this.post.target=this.post.nativeTarget;
      this.post.sourceTexture.value=this.post.nativeTarget.texture;
      this.release();
    }
  }
  beginWorld(scene){
    if(!this.enabled)return;
    // In r181 NodeMaterial.setup() only merges renderer.getMRT() when the
    // material uses the built-in fragment path. Custom fragmentNode shaders
    // bypass that path, so they must provide both attachments explicitly.
    // Scan once when enabled (and again if a different scene is loaded).
    if(scene && scene!==this.patchedScene){
      this.restoreCustomMaterials();
      scene.traverse(object=>{
        const materials=Array.isArray(object.material)?object.material:[object.material];
        for(const material of materials){
          if(!material?.isNodeMaterial || !material.fragmentNode ||
            this.customFragmentMaterials.has(material))continue;
          const original=material.fragmentNode;
          this.customFragmentMaterials.set(material,original);
          material.fragmentNode=mrt({output:original,velocity});
          material.needsUpdate=true;
        }
      });
      this.patchedScene=scene;
    }
    this.renderer.setMRT(this.mrt);
  }
  endWorld(){
    // Always restore, including after a synchronous draw exception.
    this.renderer.setMRT(null);
  }
  restoreCustomMaterials(){
    for(const [material,original] of this.customFragmentMaterials){
      material.fragmentNode=original;
      material.needsUpdate=true;
    }
    this.customFragmentMaterials.clear();
    this.patchedScene=null;
  }
  nextRealTarget(){
    this.writeIndex=1-this.currentIndex;
    return this.history[this.writeIndex];
  }
  presentReal(){
    if(!this.enabled)return;
    this.currentIndex=this.writeIndex;
    this.colorReady=Math.min(2,this.colorReady+1);
    const oldToneMapping=this.renderer.toneMapping;
    this.renderer.toneMapping=THREE.NoToneMapping;
    try {
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.blit[this.currentIndex].scene,this.camera);
    } finally {this.renderer.toneMapping=oldToneMapping;}
  }
  generate(now,meta=null){
    if(!this.enabled||this.colorReady<2)return false;
    const period=this.policy.lastReal-this.policy.previousReal;
    const alpha=Math.max(.15,Math.min(1.1,(now-this.policy.lastReal)/Math.max(8,period||16.67)));
    this.extrapolation.value=alpha;
    this.lateLookCorrection.value.set(0,0);
    const last=this.policy.lastMeta;
    if(meta&&last&&Number.isFinite(meta.yaw)&&Number.isFinite(meta.pitch)){
      const dyaw=Math.atan2(Math.sin(meta.yaw-last.yaw),Math.cos(meta.yaw-last.yaw));
      const dpitch=meta.pitch-last.pitch;
      const size=this.post.size;
      const aspect=Math.max(.5,(size.x||1)/Math.max(1,size.y||1));
      const divisor=2*Math.tan((meta.fov??85)*Math.PI/360);
      this.lateLookCorrection.value.set(
        -dyaw/(divisor*aspect)-this.lastCameraMotion.x*alpha,
        dpitch/divisor-this.lastCameraMotion.y*alpha
      );
    }
    const oldToneMapping=this.renderer.toneMapping;
    this.renderer.toneMapping=THREE.NoToneMapping;
    try {
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.synthetic[this.currentIndex].scene,this.camera);
    } finally {this.renderer.toneMapping=oldToneMapping;}
    this.policy.noteGenerated(now);
    return true;
  }
  shouldGenerate(now,meta){
    return this.enabled&&this.colorReady>=2&&this.policy.shouldGenerate(now,meta);
  }
  noteReal(now,meta,elapsedMs){
    if(!this.enabled)return;
    const previous=this.policy.lastMeta;
    this.lastCameraMotion.set(0,0);
    if(this.policy.compatible(meta,previous)){
      const dyaw=Math.atan2(Math.sin(meta.yaw-previous.yaw),Math.cos(meta.yaw-previous.yaw));
      const dpitch=meta.pitch-previous.pitch;
      const size=this.post.size,aspect=Math.max(.5,(size.x||1)/Math.max(1,size.y||1));
      const divisor=2*Math.tan((meta.fov??85)*Math.PI/360);
      this.lastCameraMotion.set(-dyaw/(divisor*aspect),dpitch/divisor);
    }
    this.policy.noteReal(now,meta,elapsedMs);
  }
  reset(){
    this.colorReady=0;this.policy.clearHistory();
  }
  error(error){
    console.warn('[SECTOR 09] Frame generation disabled:',error);
    this.fault=String(error?.message??error);
    this.enabled=false;this.policy.setMode('off');
    this.post.target=this.post.nativeTarget;
    this.post.sourceTexture.value=this.post.nativeTarget.texture;
    this.renderer.setMRT(null);this.restoreCustomMaterials();this.release();
  }
  release(){
    this.target?.dispose();this.target?.depthTexture?.dispose();
    for(const target of this.history??[])target.dispose();
    for(const stage of [...this.blit??[],...this.synthetic??[]])stage.material.dispose();
    this.geometry?.dispose();this.target=null;this.history=null;this.blit=null;this.synthetic=null;
  }
  stats(){return {...this.policy.summary(),enabled:this.enabled,fault:this.fault,
    gpuMs:null,latencyEstimateMs:null}; /* unavailable: don't invent FG GPU timestamps/input latency */}
  dispose(){this.enabled=false;this.renderer.setMRT(null);this.restoreCustomMaterials();this.release();}
}
