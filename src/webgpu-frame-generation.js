// Conservative WebGPU frame generation for Three.js r181.
//
// Do not enable renderer.setMRT({output,velocity}) on the main world render:
// custom node shaders, shadow passes, sprites and skinned classic materials can
// generate incomplete fragment targets on older hardware (including HD 610).
// Three's VelocityNode can also fail when scene materials change mid-frame.
// This path uses only already color-corrected frames and camera reprojection.
// It is not FSR 3 / optical-flow hardware frame generation.
import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { texture, uniform, uv, vec2, vec4, Fn, clamp, length, select } from 'three/tsl';
import { FrameGenerationPolicy } from './frame-generation-policy.js';

const screenTriangle=()=>{
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,3,-1,0,-1,3,0],3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute([0,1,2,1,0,-1],2));
  return geometry;
};
const stage=(geometry,fragmentNode)=>{
  const material=new MeshBasicNodeMaterial({depthTest:false,depthWrite:false,fog:false});
  material.toneMapped=false;material.fragmentNode=fragmentNode;
  const scene=new THREE.Scene();
  scene.add(new THREE.Mesh(geometry,material));
  return {scene,material};
};

export class WebGpuFrameGeneration {
  constructor(renderer,post){
    this.renderer=renderer;this.post=post;
    this.policy=new FrameGenerationPolicy();
    this.enabled=false;this.fault=null;
    this.history=null;this.geometry=null;this.blit=null;this.synthetic=null;
    this.currentIndex=0;this.writeIndex=0;this.colorReady=0;
    this.extrapolation=uniform(.5);
    this.lastMotion=uniform(new THREE.Vector2(0,0));
    this.lateLook=uniform(new THREE.Vector2(0,0));
    this.lastCameraMotion=new THREE.Vector2();
  }
  initialize(){
    this.history=[0,1].map(()=>new THREE.RenderTarget(1,1,{
      depthBuffer:false,type:THREE.UnsignedByteType,samples:0
    }));
    for(const target of this.history)target.texture.colorSpace=THREE.NoColorSpace;
    this.geometry=screenTriangle();
    this.camera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
    this.blit=this.history.map(target=>stage(this.geometry,texture(target.texture).sample(uv())));
    this.synthetic=this.history.map((current,index)=>{
      const last=this.history[1-index];
      const latestTexture=texture(current.texture);
      const priorTexture=texture(last.texture);
      const node=Fn(()=>{
        const p=uv();
        const movement=this.lastMotion.mul(this.extrapolation).add(this.lateLook);
        const sourceUV=p.sub(movement).toVar();
        const safeUV=clamp(sourceUV,vec2(.001),vec2(.999));
        const original=latestTexture.sample(p).rgb;
        const moved=latestTexture.sample(safeUV).rgb;
        const old=priorTexture.sample(safeUV.sub(this.lastMotion)).rgb;
        // Do not warp across moving silhouettes, flashes, HUD, or disocclusions.
        // When temporal agreement is weak, display the latest REAL pixel.
        const inBounds=sourceUV.x.greaterThan(.001).and(sourceUV.x.lessThan(.999))
          .and(sourceUV.y.greaterThan(.001)).and(sourceUV.y.lessThan(.999));
        const stable=length(moved.sub(old)).lessThan(.20)
          .and(length(movement).lessThan(.035)).and(inBounds);
        return vec4(select(stable,moved,original),1);
      })();
      return stage(this.geometry,node);
    });
  }
  resize(width,height){
    if(!this.enabled||!this.history)return;
    const w=Math.max(1,Math.round(width)),h=Math.max(1,Math.round(height));
    if(this.history[0].width!==w||this.history[0].height!==h){
      for(const target of this.history)target.setSize(w,h);
      this.reset();
    }
  }
  setMode(mode){
    if(this.fault&&mode!=='off')return;
    const next=['off','auto','1.5','2'].includes(mode)?mode:'off';
    if(next===this.policy.mode)return;
    this.policy.setMode(next);
    this.enabled=next!=='off';
    if(this.enabled){
      if(!this.history)this.initialize();
      this.reset();
    }else this.release();
  }
  // Kept as compatible no-ops for the game's render loop. NEVER modify the
  // world's render targets, shaders, shadows, scene graph or renderer MRT.
  beginWorld(){}
  endWorld(){}
  nextRealTarget(){
    this.writeIndex=1-this.currentIndex;
    return this.history[this.writeIndex];
  }
  draw(stageToDraw){
    const r=this.renderer;
    const oldToneMapping=r.toneMapping;
    r.toneMapping=THREE.NoToneMapping;
    try {
      r.setRenderTarget(null);
      r.render(stageToDraw.scene,this.camera);
    }finally{r.toneMapping=oldToneMapping;}
  }
  presentReal(){
    if(!this.enabled)return;
    this.currentIndex=this.writeIndex;
    this.colorReady=Math.min(2,this.colorReady+1);
    this.draw(this.blit[this.currentIndex]);
  }
  generate(now,meta=null){
    if(!this.enabled||this.colorReady<2)return false;
    const period=this.policy.lastReal-this.policy.previousReal;
    const alpha=Math.max(.15,Math.min(1.1,(now-this.policy.lastReal)/Math.max(8,period||16.67)));
    this.extrapolation.value=alpha;
    this.lateLook.value.set(0,0);
    const last=this.policy.lastMeta;
    if(meta&&last&&Number.isFinite(meta.yaw)&&Number.isFinite(meta.pitch)){
      const correction=this.cameraDisplacement(last,meta);
      this.lateLook.value.copy(correction).sub(this.lastCameraMotion.clone().multiplyScalar(alpha));
    }
    this.draw(this.synthetic[this.currentIndex]);
    this.policy.noteGenerated(now);
    return true;
  }
  cameraDisplacement(previous,current){
    const angle=Math.atan2(Math.sin(current.yaw-previous.yaw),Math.cos(current.yaw-previous.yaw));
    const vertical=current.pitch-previous.pitch;
    const size=this.post.size;
    const aspect=Math.max(.5,(size.x||1)/Math.max(1,size.y||1));
    const divisor=2*Math.tan((current.fov??85)*Math.PI/360);
    return new THREE.Vector2(-angle/(divisor*aspect),vertical/divisor);
  }
  shouldGenerate(now,meta){
    return this.enabled&&this.colorReady>=2&&this.policy.shouldGenerate(now,meta);
  }
  noteReal(now,meta,elapsedMs){
    if(!this.enabled)return;
    const previous=this.policy.lastMeta;
    this.lastCameraMotion.set(0,0);
    if(this.policy.compatible(meta,previous))
      this.lastCameraMotion.copy(this.cameraDisplacement(previous,meta));
    this.lastMotion.value.copy(this.lastCameraMotion);
    this.policy.noteReal(now,meta,elapsedMs);
  }
  reset(){
    this.colorReady=0;this.policy.clearHistory();
    this.lastMotion.value.set(0,0);
    this.lastCameraMotion.set(0,0);
  }
  error(error){
    console.warn('[SECTOR 09] Frame generation disabled (WebGPU preserved):',error);
    this.fault=String(error?.message??error);
    this.enabled=false;this.policy.setMode('off');this.release();
  }
  release(){
    for(const target of this.history??[])target.dispose();
    for(const pass of [...(this.blit??[]),...(this.synthetic??[])])pass.material.dispose();
    this.geometry?.dispose();
    this.history=null;this.geometry=null;this.blit=null;this.synthetic=null;this.colorReady=0;
  }
  stats(){
    return {...this.policy.summary(),enabled:this.enabled,fault:this.fault,
      gpuMs:null,latencyEstimateMs:null,method:'camera-reprojection'};
  }
  dispose(){this.enabled=false;this.release();}
}
