import {HeatSources} from './heat-sources.js';
import {cameraModes} from './camera-effects.js';
import * as THREE from 'three';

const aoSteps = { off: 0, low: 4, high: 12, gtao: 24 };
const reflectionSteps={off:0,low:8,medium:13,high:21};
const contactSteps = { off: 0, low: 4, medium: 7, high: 12 };
const atmosphereSteps = { off: 0, low: 1, medium: 3, high: 7, ultra: 12 };
const bloomSettings = { off: [0, 0], low: [1, .075], medium: [2, .11], high: [3, .155], ultra: [4, .19] };

export class WorldPost {
  constructor(renderer, Target, createStages, webgpu = false) {
    this.renderer = renderer;
    this.Target = Target;
    this.createStages = createStages;
    this.webgpu = webgpu;
    this.state = {
      projection: new THREE.Matrix4(), inverseProjection: new THREE.Matrix4(),
      sunView: new THREE.Vector3(), sunScreen: new THREE.Vector2(), sunColor: new THREE.Color(),
      fogColor: new THREE.Color(), cameraY: 0, upView: new THREE.Vector3(),
      depthSize: new THREE.Vector2(), effectPixel: new THREE.Vector2(),
      steps: new THREE.Vector3(), reflectionSteps:0, shore:new THREE.Vector2(), waterPixel:new THREE.Vector2(),
      worldXView:new THREE.Vector3(), cameraX:0, time:0,
      cameraEffects:new THREE.Vector3(), chromaticGain:0, previousClipFromView:new THREE.Matrix4(),
      heatSources:new THREE.Matrix4(), heatStrength:new THREE.Vector4(), heatTime:0,
      atmosphereStrength: 0, bloomGain: 0,
      volumeSplits: new THREE.Vector3(),
      volumeMatrix0: new THREE.Matrix4(), volumeMatrix1: new THREE.Matrix4(), volumeMatrix2: new THREE.Matrix4(),
    };
    this.shadowMaps=[];
    this.heat=new HeatSources(this.state,webgpu);
    this.previousViewProjection=new THREE.Matrix4();
    this.previousProjection=new THREE.Matrix4();
    this.previousPosition=new THREE.Vector3();
    this.previousOrientation=new THREE.Quaternion();
    this.passes = 0;
    this.memory = 0;
  }

  configure(effects, width, height, samples) {
    const ao = aoSteps[effects?.ao] ?? 0;
    const contact = contactSteps[effects?.contact] ?? 0;
    const atmosphere = atmosphereSteps[effects?.atmosphere] ?? 0;
    const [levels, gain] = bloomSettings[effects?.bloom ?? 'off'];
    const reflections=this.reflector?(reflectionSteps[effects?.reflections]??0):0;
    const mask=ao+contact+atmosphere>0;
    const blur=(this.inMenu||this.cinematic)?cameraModes.blur[effects?.motionBlur]??0:0;
    const dof=(this.cinematic&&(effects?.depthOfField??'off')!=='off')||(this.inMenu&&effects?.depthOfField==='on');
    const flare=this.aiming?0:cameraModes.flare[effects?.lensFlare]??0;
    const chromatic=this.aiming?0:cameraModes.chromatic[effects?.chromatic]??0;
    this.cameraFX=Boolean(blur||dof||flare||chromatic);
    this.hasHeat=effects?.heatDistortion==='high'&&(mask||reflections>0||this.heat.count>0||this.hasHeat);
    const depth=mask||reflections>0||this.softSmoke||this.cameraFX||this.hasHeat;
    if(!blur)this.previousClock=undefined;
    if (!depth && !levels) {
      if (this.world) this.dispose();
      return false;
    }
    const key = Boolean(depth) + '/' + this.cameraFX + '/' + this.hasHeat + '/' + mask + '/' + Boolean(reflections) + '/' + levels;
    if (this.key !== key) {
      this.dispose();
      this.key = key;
      this.world = new this.Target(1, 1, { type: THREE.HalfFloatType, depthBuffer: true,
        depthTexture: depth ? new THREE.DepthTexture(1, 1, THREE.FloatType) : null });
      if (mask) this.mask = this.colorTarget(true);
      if (reflections) this.reflection=this.colorTarget();
      this.bloom = Array.from({ length: levels }, () => this.colorTarget());
      this.stages = this.createStages(this);
    }
    // r181 WebGPU has no sampled MSAA depth resolve. Use FXAA on the
    // composited world in both APIs when sampled world depth is needed.
    const worldSamples = depth ? 0 : samples;
    const world = this.world;
    if (world.samples !== worldSamples) { world.dispose(); world.samples = worldSamples; }
    this.resize(world, width, height);
    this.state.steps.set(ao, contact, atmosphere);
    this.state.cameraEffects.set(blur,Number(dof),flare);
    this.state.chromaticGain=chromatic;
    this.state.reflectionSteps=reflections;
    this.state.depthSize.set(width, height);
    this.state.bloomGain = gain;
    this.passes = 1 + levels + Number(mask) + Number(Boolean(reflections)) + Number(Boolean(this.softSmoke));
    this.memory = width * height * (12 + worldSamples * 12);
    if (this.mask) {
      const divisor=ao<=4&&contact<=4&&atmosphere<=1?4:2;
      this.resize(this.mask, Math.ceil(width / divisor), Math.ceil(height / divisor));
      this.state.effectPixel.set(1 / this.mask.width, 1 / this.mask.height);
      this.memory += this.mask.width * this.mask.height * 8;
    }
    if(this.reflection){
      this.resize(this.reflection,Math.ceil(width/2),Math.ceil(height/2));
      this.state.waterPixel.set(1/this.reflection.width,1/this.reflection.height);
      this.memory+=this.reflection.width*this.reflection.height*8;
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

  apply(output, camera, scene, sunOffset, sun, campaign, time, cascades, profiler) {
    const r = this.renderer, state = this.state;
    if (this.mask||this.reflection||this.cameraFX||this.hasHeat) {
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
      state.atmosphereStrength = campaign ? 0 : Math.min(1, sun.intensity / 3);
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
      state.shore.copy(this.reflector);
      state.worldXView.set(1,0,0).transformDirection(camera.matrixWorldInverse);
      state.cameraX=camera.position.x;
      state.time=time;
    }
    try {
      this.stages.render(output,profiler);
    } finally {
      r.setRenderTarget(output);
    }
  }

  dispose() {
    this.stages?.dispose();
    this.world?.dispose();
    this.mask?.dispose();
    this.reflection?.dispose();
    for (const target of this.bloom ?? []) target.dispose();
    this.world = this.mask = this.reflection = this.bloom = this.stages = this.key = null;
    this.shadowMaps.length=0;
    this.previousClock=undefined;
    this.passes = this.memory = 0;
  }
}
