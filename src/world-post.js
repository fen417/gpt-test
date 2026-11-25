import {HeatSources} from './heat-sources.js';
import {cameraModes} from './camera-effects.js';
import {ReflectionReceivers, makeGlReflectionReceiver} from './reflection-receivers.js';
import * as THREE from 'three';
import {atmosphereProfile,fogLayerParameters} from './atmosphere-profile.js';

const aoSteps = { off: 0, low: 4, high: 12, gtao: 24 };
export const reflectionSteps={off:0,low:8,medium:16,high:32};
const contactSteps = { off: 0, low: 4, medium: 7, high: 12 };
const atmosphereSteps = { off: 0, low: 1, medium: 3, high: 7, ultra: 12 };
const bloomSettings = { off: [0, 0], low: [1, .075], medium: [2, .11], high: [3, .155], ultra: [4, .19] };

// Fuse only when the display samples each pixel once. Adjacent-pixel filters
// retain the precomposited HDR source rather than multiplying bloom taps.
export const canFuseBloom=(levels,fxaa,sharpen)=>levels>0&&!fxaa&&!sharpen;
// Without motion vectors, only reuse history for effectively stationary views.
export function stableEffectHistory(previous,current){
  return Boolean(previous&&current.time>previous.time&&current.time-previous.time<.08&&previous.key===current.key&&previous.position.distanceToSquared(current.position)<1e-6&&Math.abs(previous.orientation.dot(current.orientation))>1-1e-8&&previous.projection.equals(current.projection)&&previous.sun.distanceToSquared(current.sun)<1e-8&&Math.abs(previous.strength-current.strength)<.001);
}
export class WorldPost {
  constructor(renderer, Target, createStages, webgpu = false, createReceiver=makeGlReflectionReceiver) {
    this.renderer = renderer;
    this.Target = Target;
    this.createStages = createStages;
    this.webgpu = webgpu;
    this.receivers=new ReflectionReceivers(createReceiver);
    this.state = {
      projection: new THREE.Matrix4(), inverseProjection: new THREE.Matrix4(),
      sunView: new THREE.Vector3(), sunScreen: new THREE.Vector2(), sunColor: new THREE.Color(),
      fogColor: new THREE.Color(), cameraY: 0, upView: new THREE.Vector3(),
      depthSize: new THREE.Vector2(), effectPixel: new THREE.Vector2(),
      steps: new THREE.Vector3(), reflectionSteps:0, shore:new THREE.Vector2(), waterPixel:new THREE.Vector2(),
      worldXView:new THREE.Vector3(), cameraX:0, cameraZ:0, time:0,
      waterActive:0, receiverActive:0,
      cameraEffects:new THREE.Vector3(), chromaticGain:0, previousClipFromView:new THREE.Matrix4(),
      heatSources:new THREE.Matrix4(), heatStrength:new THREE.Vector4(), heatTime:0,
      atmosphereStrength: 0, airProfile:new THREE.Vector3(.012,21,.65), bloomGain: 0,
      fogLayer:new THREE.Vector4(),fogLayerUp:new THREE.Vector3(),fogEyeY:0,fogLayerTint:new THREE.Color(),
      historyReuse:0,historyPhase:0,
      volumeSplits: new THREE.Vector3(),
      volumeMatrix0: new THREE.Matrix4(), volumeMatrix1: new THREE.Matrix4(), volumeMatrix2: new THREE.Matrix4(),
    };
    this.shadowMaps=[];
    this.heat=new HeatSources(this.state,webgpu);
    this.previousViewProjection=new THREE.Matrix4();
    this.previousProjection=new THREE.Matrix4();
    this.previousPosition=new THREE.Vector3();
    this.previousOrientation=new THREE.Quaternion();
    this.temporalPrevious={position:new THREE.Vector3(),orientation:new THREE.Quaternion(),projection:new THREE.Matrix4(),sun:new THREE.Vector3()};
    this.temporalView={position:new THREE.Vector3(),orientation:new THREE.Quaternion(),projection:new THREE.Matrix4(),sun:new THREE.Vector3()};
    this.temporalValid=false;this.temporalFrame=0;this.temporalReused=0;
    this.passes = 0;
    this.memory = 0;
  }

  configure(effects, width, height, samples) {
    const ao = aoSteps[effects?.ao] ?? 0;
    const contact = contactSteps[effects?.contact] ?? 0;
    const atmosphere = this.atmosphereAllowed===false?0:atmosphereSteps[effects?.atmosphere] ?? 0;
    this.fogQuality=this.atmosphereAllowed===false?'off':effects?.heightFog??'off';
    this.heightFog=this.fogQuality==='low'||this.fogQuality==='high';
    const [levels, gain] = bloomSettings[effects?.bloom ?? 'off'];
    const reflections=this.reflector||this.receiverMode?(reflectionSteps[effects?.reflections]??0):0;
    const receiverMask=Boolean(reflections&&this.receiverMode);
    const hierarchy=reflections===32;
    const mask=ao+contact+atmosphere>0;
    const temporal=ao>12||atmosphere>=7;
    const blur=(this.inMenu||this.cinematic)?cameraModes.blur[effects?.motionBlur]??0:0;
    const dof=(this.cinematic&&(effects?.depthOfField??'off')!=='off')||(this.inMenu&&effects?.depthOfField==='on');
    const flare=this.aiming?0:cameraModes.flare[effects?.lensFlare]??0;
    const chromatic=this.aiming?0:cameraModes.chromatic[effects?.chromatic]??0;
    // Camera effects are compiled according to selected settings, not
    // transient aiming/firing state. Uniforms still disable them while aiming.
    this.cameraFX=Boolean(blur||dof||cameraModes.flare[effects?.lensFlare]||cameraModes.chromatic[effects?.chromatic]);
    this.hasHeat=effects?.heatDistortion==='high';
    const depth=mask||reflections>0||this.softEnabled||this.softSmoke||this.cameraFX||this.hasHeat||this.heightFog;
    if(!blur)this.previousClock=undefined;
    if (!depth && !levels) {
      if (this.world) this.dispose();
      return false;
    }
    const key = Boolean(depth) + '/' + this.cameraFX + '/' + this.hasHeat + '/' + mask + '/' + Boolean(reflections) + '/' + receiverMask + '/' + levels + '/' + this.heightFog + '/' + hierarchy + '/' + temporal;
    if (this.key !== key) {
      this.dispose();
      this.key = key;
      this.world = new this.Target(1, 1, { type: THREE.HalfFloatType, depthBuffer: true,
        depthTexture: depth ? new THREE.DepthTexture(1, 1, THREE.FloatType) : null });
      if (mask) this.mask = this.colorTarget(true);
      if(temporal)this.maskHistory=this.colorTarget(true);
      if (reflections) this.reflection=this.colorTarget();
      if(hierarchy)this.depthHierarchy=[this.colorTarget(true),this.colorTarget(true)];
      if (receiverMask) this.receiverMask=new this.Target(1,1,{type:THREE.HalfFloatType,depthBuffer:true,
        minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter});
      this.bloom = Array.from({ length: levels }, () => this.colorTarget());
      this.stages = this.createStages(this);
    }
    // r181 WebGPU has no sampled MSAA depth resolve. Use FXAA on the
    // composited world in both APIs when sampled world depth is needed.
    this.directWorld=Boolean(!depth&&levels);this.bloomFused=false;
    const worldSamples = 0; // bloom output is single-sampled; direct world uses the main target
    const world = this.world;
    if (world.samples !== worldSamples) { world.dispose(); world.samples = worldSamples; }
    this.resize(world, width, height);
    const temporalKey=ao+'/'+contact+'/'+atmosphere+'/'+this.fogQuality+'/'+width+'/'+height;
    if(this.temporalKey!==temporalKey){this.resetTemporal();this.temporalKey=temporalKey;}
    this.state.steps.set(ao, contact, atmosphere);
    this.state.cameraEffects.set(blur,Number(dof),flare);
    this.state.chromaticGain=chromatic;
    this.state.reflectionSteps=reflections;
    this.state.depthSize.set(width, height);
    this.state.bloomGain = gain;
    this.state.waterActive=Number(Boolean(this.reflector));
    this.state.receiverActive=Number(receiverMask&&this.receivers.count>0);
    this.passes = Number(!this.directWorld) + levels + Number(levels>0) + Number(mask) + Number(Boolean(reflections&&(this.state.waterActive||this.state.receiverActive))) + this.state.receiverActive + Number(Boolean(this.softSmoke));
    this.memory = width * height * (12 + worldSamples * 12);
    if (this.mask) {
      const divisor=ao<=4&&contact===0&&atmosphere<=1?4:2;
      this.resize(this.mask, Math.ceil(width / divisor), Math.ceil(height / divisor));
      this.state.effectPixel.set(1 / this.mask.width, 1 / this.mask.height);
      this.memory += this.mask.width * this.mask.height * 8;
      if(this.maskHistory){this.resize(this.maskHistory,this.mask.width,this.mask.height);this.memory+=this.mask.width*this.mask.height*8;}
    }
    if(this.reflection){
      const divisor=effects.reflections==='low'?4:2;
      this.resize(this.reflection,Math.ceil(width/divisor),Math.ceil(height/divisor));
      this.state.waterPixel.set(1/this.reflection.width,1/this.reflection.height);
      this.memory+=this.reflection.width*this.reflection.height*8;
      if(this.depthHierarchy){
        this.resize(this.depthHierarchy[0],Math.ceil(width/4),Math.ceil(height/4));
        this.resize(this.depthHierarchy[1],Math.ceil(width/16),Math.ceil(height/16));
        this.memory+=this.depthHierarchy.reduce((n,t)=>n+t.width*t.height*8,0);
        if(this.state.waterActive||this.state.receiverActive)this.passes+=2;
      }
      if(this.receiverMask){
        this.resize(this.receiverMask,this.reflection.width,this.reflection.height);
        this.memory+=this.receiverMask.width*this.receiverMask.height*12;
      }
    }
    for (let i = 0; i < levels; i++) {
      this.resize(this.bloom[i], Math.ceil(width / (4 << i)), Math.ceil(height / (4 << i)));
      this.memory += this.bloom[i].width * this.bloom[i].height * 8;
    }
    return true;
  }

  colorTarget(nearest = false) {
    const filter = nearest ? THREE.NearestFilter : THREE.LinearFilter;
    return new this.Target(1, 1, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: filter, magFilter: filter });
  }

  resize(target, width, height) {
    if (target.width !== width || target.height !== height) target.setSize(width, height);
  }

  resetTemporal(){this.temporalValid=false;this.temporalFrame=0;this.state.historyReuse=0;}

  prepareTemporal(camera,sunOffset,time){
    this.maskWrite=this.mask;this.maskRead=this.maskHistory??null;this.state.historyReuse=0;
    if(!this.maskHistory)return;
    const view=this.temporalView;view.position.copy(camera.position);view.orientation.copy(camera.quaternion);view.projection.copy(camera.projectionMatrix);view.sun.copy(sunOffset).normalize();
    view.time=time;view.strength=this.state.atmosphereStrength;view.key=this.temporalKey+'/'+this.shadowMaps.length;
    const stable=this.temporalValid&&stableEffectHistory(this.temporalPrevious,view);
    this.state.historyReuse=Number(stable);this.state.historyPhase=this.temporalFrame%2;
    if(stable)this.temporalReused++;
    this.maskWrite=this.temporalFrame%2?this.maskHistory:this.mask;
    this.maskRead=this.temporalFrame%2?this.mask:this.maskHistory;
  }
  finishTemporal(){
    if(!this.maskHistory)return;
    const previous=this.temporalPrevious;this.temporalPrevious=this.temporalView;this.temporalView=previous;
    this.temporalFrame++;this.temporalValid=true;
  }

  apply(output, camera, scene, sunOffset, sun, campaign, time, cascades, profiler) {
    if(this.directWorld)return;
    const r = this.renderer, state = this.state;
    if (this.mask||this.reflection||this.cameraFX||this.hasHeat||this.heightFog) {
      state.projection.copy(camera.projectionMatrix);
      state.inverseProjection.copy(camera.projectionMatrixInverse);
      state.sunView.copy(sunOffset).transformDirection(camera.matrixWorldInverse);
      state.upView.set(0, 1, 0).transformDirection(camera.matrixWorldInverse);
      state.cameraY = camera.position.y;
      const dir = state.sunView, p = state.projection.elements;
      state.sunScreen.set(p[0] * dir.x, p[5] * dir.y).multiplyScalar(.5 / Math.max(.05, -dir.z));
      if (this.webgpu) state.sunScreen.y *= -1;
      state.sunScreen.addScalar(.5);
      state.sunColor.copy(sun.color);
      state.fogColor.copy(scene.fog.color);
      const profile=this.airClimate??atmosphereProfile(null);
      const active=this.atmosphereAllowed!==false&&(!campaign||this.atmosphereAllowed===true);
      state.atmosphereStrength=active?Math.min(1,sun.intensity/3)*profile[8]:0;
      state.airProfile.set(.008+profile[4]*1.7,profile[5],profile[7]);
      state.fogLayer.set(...fogLayerParameters(profile,this.fogQuality,scene.fog.density));
      state.fogLayerUp.copy(state.upView);state.fogEyeY=state.cameraY;state.fogLayerTint.copy(state.fogColor);
    }
    const cascade = state.steps.z>=7&&state.atmosphereStrength>0 ? cascades?.csm : null;
    this.shadowMaps.length=0;
    if(cascade && cascade.lights.length===cascade.cascades){
      const far=Math.min(cascade.maxFar,camera.far);
      for(let i=0;i<cascade.lights.length;i++){
        const shadow=cascade.lights[i].shadow;
        const map=this.webgpu?cascade._shadowNodes[i]?.shadowMap?.depthTexture:shadow.map?.texture;
        if(!map){this.shadowMaps.length=0;break;}
        this.shadowMaps.push(map);
        state['volumeMatrix'+i].multiplyMatrices(shadow.matrix,camera.matrixWorld);
        state.volumeSplits.setComponent(i,(far-camera.near)*cascade.breaks[i]+(this.webgpu?camera.near:0));
      }
    }
    if(state.cameraEffects.x){
      const elapsed=time-(this.previousClock??time);
      const stableView=elapsed>0&&elapsed<=.12&&this.previousProjection.equals(camera.projectionMatrix)
        &&this.previousPosition.distanceToSquared(camera.position)<5
        &&Math.abs(this.previousOrientation.dot(camera.quaternion))>.998;
      if(stableView){
        state.previousClipFromView.multiplyMatrices(this.previousViewProjection,camera.matrixWorld);
        state.cameraEffects.x*=Math.min(1,(1/60)/elapsed);
      }else state.cameraEffects.x=0;
      this.previousClock=time;
      this.previousProjection.copy(camera.projectionMatrix);
      this.previousViewProjection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
      this.previousPosition.copy(camera.position);
      this.previousOrientation.copy(camera.quaternion);
    }
    if(this.reflection){
      if(this.reflector)state.shore.copy(this.reflector);
      state.worldXView.set(1,0,0).transformDirection(camera.matrixWorldInverse);
      state.cameraX=camera.position.x;
      state.cameraZ=camera.position.z;
      state.time=time;
    }
    try {
      if(state.receiverActive)this.receivers.render(r,this.receiverMask,camera,profiler);
      this.prepareTemporal(camera,sunOffset,time);
      this.stages.render(output,profiler);
      this.finishTemporal();
    } catch(error) {
      throw Object.assign(new Error('World screen effects failed',{cause:error}),{s09PostFault:'depth'});
    } finally {
      r.setRenderTarget(output);
    }
  }

  finishBloom(input,profiler,fuse=false) {
    this.bloomFused=Boolean(fuse&&this.bloom?.length);
    if(this.bloomFused)this.passes=Math.max(0,this.passes-1);
    try{return this.stages?.renderBloom(input,profiler,!this.bloomFused)??input.texture;}
    catch(error){throw Object.assign(new Error('HDR bloom failed',{cause:error}),{s09PostFault:'bloom'});}
  }

  dispose() {
    this.stages?.dispose();
    this.world?.dispose();
    this.mask?.dispose();this.maskHistory?.dispose();this.maskHistory=this.maskRead=this.maskWrite=null;this.resetTemporal();
    this.reflection?.dispose();
    this.receiverMask?.dispose();
    for(const target of this.depthHierarchy??[])target.dispose();this.depthHierarchy=null;
    for (const target of this.bloom ?? []) target.dispose();
    this.world = this.mask = this.reflection = this.receiverMask = this.bloom = this.stages = this.key = null;
    this.shadowMaps.length=0;
    this.previousClock=undefined;
    this.directWorld=false;this.bloomFused=false;this.passes = this.memory = 0;
  }
}
