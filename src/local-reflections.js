import * as THREE from 'three';

// Capture volumes are scoped to the open pool deck and the rooms they describe.
// Warehouse bounds come from the map so they also follow layout adjustments.
export function zonesFor(map) {
  if(map.id==='fy_pool_day')return [{id:'pool-deck',x:4,y:1.8,z:0,w:24,d:48,minY:-1.3,maxY:4.9}];
  if(map.id==='linden_estate')return [{id:'manor-ground',x:-1,y:1.65,z:0,w:24,d:11,minY:.15,maxY:3.3}];
  if(map.id==='port')return map.structures.map(({id,x,z,w,d,h})=>({id,x,y:2.7,z,w:w-1.2,d:d-1.2,minY:.1,maxY:h}));
  return [];
}

function preserveSkyIrradiance(renderer, sky, local) {
  // The r181 CubeUV atlas ends in a row of 16 px faces. Copy the three
  // roughest slots (mips 0 to -2) from the sky into the local probe. Three
  // uses mip -2 for diffuse IBL, so room transitions only change reflections.
  const tile = 16, first = 4 * 3 * tile, end = 7 * 3 * tile;
  const skyY=sky.image.height-4*tile, localY=local.image.height-4*tile;
  const region=new THREE.Box2(new THREE.Vector2(first,skyY),new THREE.Vector2(end,skyY+2*tile));
  renderer.copyTextureToTexture(sky,local,region,new THREE.Vector2(first,localY));
}

export class LocalReflections {
  targets=new Map();
  failed=new Set();

  // Probe generation is an explicit loading-screen operation. Never render
  // six cube faces or run PMREM in an ordinary gameplay or menu frame.
  requested(owner){
    const quality=owner.graphicsEffects?.localReflections;
    return !owner.lowQuality&&!owner.presentingCampaign&&['medium','high'].includes(quality)?quality:null;
  }

  async prewarm(owner,signal,yieldFrame=()=>new Promise(resolve=>requestAnimationFrame(resolve)),fence=async()=>{}){
    const quality=this.requested(owner);
    if(!quality)return;
    const map=owner.map,world=owner.worlds.get(map.id);
    if(!world||world.model&&!world.model.base&&!world.fallback)return;
    if(this.map!==map||this.quality!==quality||this.dirty){
      this.dispose();this.map=map;this.quality=quality;this.zones=zonesFor(map);
    }
    const start=performance.now();
    for(const zone of this.zones){
      signal.throwIfAborted();
      if(this.targets.has(zone.id)||this.failed.has(zone.id))continue;
      await yieldFrame();signal.throwIfAborted();
      if(owner.map!==map||this.map!==map||this.quality!==quality)return;
      try{this.targets.set(zone.id,this.capture(owner,zone));}
      catch(error){this.failed.add(zone.id);console.warn('Local reflection unavailable:',zone.id,error);}
      await fence();signal.throwIfAborted();
    }
    this.warmupMs=Math.round(performance.now()-start);this.dirty=false;
  }

  invalidate(){this.dirty=true;}

  prepare(owner, menu, warming) {
    this.active=null;
    if(!this.requested(owner)||this.map!==owner.map)return null;
    const {x,y,z}=owner.camera.position;
    const zone=this.zones.find(p=>Math.abs(x-p.x)<p.w/2&&Math.abs(z-p.z)<p.d/2&&y>=p.minY&&y<p.maxY);
    // During shader warmup also compile a local-environment variant even
    // when the spawn is outside the probe volume.
    const target=this.targets.get(zone?.id)??(warming?this.targets.values().next().value:null);
    if(target)this.active=zone?.id??'warmup';
    return target?.texture??null;
  }

  stats(){return {ready:this.targets.size,total:this.zones?.length??0,failed:this.failed.size,dirty:!!this.dirty,warmupMs:this.warmupMs??0};}

  capture(owner, zone) {
    const {renderer,scene,staticRoot,worldRoot}=owner, sky=owner.atmosphere.sky;
    const previousTarget=renderer.getRenderTarget(), face=renderer.getActiveCubeFace(), mip=renderer.getActiveMipmapLevel();
    const autoClear=renderer.autoClear, shadows=renderer.shadowMap.enabled;
    const skyPosition=sky.position.clone();
    const hidden=worldRoot.children.filter(child=>child!==staticRoot&&child!==sky&&child.visible);
    // Water should not recursively reflect itself or trigger a transmission pass in the probe.
    staticRoot.traverse(child=>{if(child.visible&&(child.name==='Port water'||child.userData.waterReflection))hidden.push(child);});
    const keyLights=scene.children.filter(child=>child.isDirectionalLight);
    const intensities=keyLights.map(light=>light.intensity);
    const transient=scene.children.filter(light=>light.isPointLight),transientIntensity=transient.map(light=>light.intensity);
    // Keep capture cost bounded: one static capture per zone/quality, no per-frame cube render.
    const cube=new THREE.WebGLCubeRenderTarget(this.quality==='high'?128:64,{type:THREE.HalfFloatType});
    const camera=new THREE.CubeCamera(.15,180,cube);
    camera.position.set(zone.x,zone.y,zone.z);
    const Generator=owner.webgpu?.PMREMGenerator??THREE.PMREMGenerator;
    let generator, target;
    try{
      for(const child of hidden)child.visible=false;
      for(const light of transient)light.intensity=0;
      // A capture uses the sky environment as its bounce light and does not
      // move the main camera's shadow maps. Reduce direct light under roofs.
      if(zone.id!=='pool-deck')for(const light of keyLights)light.intensity*=.22;
      sky.position.copy(camera.position);
      renderer.shadowMap.enabled=false;
      renderer.autoClear=true;
      camera.update(renderer,scene);
      generator=new Generator(renderer);
      target=generator.fromCubemap(cube.texture);
      preserveSkyIrradiance(renderer,owner.atmosphere.envTexture,target.texture);
      return target;
    }catch(error){
      target?.dispose();
      throw error;
    }finally{
      renderer.setRenderTarget(previousTarget,face,mip);
      renderer.autoClear=autoClear;
      renderer.shadowMap.enabled=shadows;
      sky.position.copy(skyPosition);
      for(let i=0;i<keyLights.length;i++)keyLights[i].intensity=intensities[i];
      for(let i=0;i<transient.length;i++)transient[i].intensity=transientIntensity[i];
      for(const child of hidden)child.visible=true;
      generator?.dispose();
      cube.dispose();
    }
  }

  dispose() {
    for(const target of this.targets.values())target.dispose();
    this.targets.clear();
    this.failed.clear();
    this.active=this.map=this.quality=null;this.zones=[];this.dirty=false;this.warmupMs=0;
  }
}
