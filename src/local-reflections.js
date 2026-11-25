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

  prepare(owner, menu, warming) {
    this.active=null;
    const quality=owner.graphicsEffects?.localReflections;
    if(!['medium','high'].includes(quality)||owner.lowQuality){
      if(this.map)this.dispose();
      return null;
    }
    if(owner.presentingCampaign)return null;
    if(this.map!==owner.map||this.quality!==quality){
      this.dispose();
      this.map=owner.map;this.quality=quality;
      this.zones=zonesFor(this.map);
    }
    const {x,y,z}=owner.camera.position;
    const zone=this.zones.find(p=>Math.abs(x-p.x)<p.w/2&&Math.abs(z-p.z)<p.d/2&&y>=p.minY&&y<p.maxY);
    const world=owner.worlds.get(owner.map.id);
    if(world.model&&!world.model.base&&!world.fallback)return null;
    // Warm one capture with the map. Additional warehouses are cached the
    // first time the player approaches them, before entering their interior.
    const nearby=zone??(!menu&&this.zones.find(p=>Math.abs(x-p.x)<p.w/2+8&&Math.abs(z-p.z)<p.d/2+8));
    const candidate=nearby||(warming?this.zones[0]:null);
    if(candidate&&!this.targets.has(candidate.id)&&!this.failed.has(candidate.id)){
      try{this.targets.set(candidate.id,this.capture(owner,candidate));}
      catch(error){this.failed.add(candidate.id);console.warn('Local reflection unavailable:',candidate.id,error);}
    }
    const target=this.targets.get(zone?.id);
    if(target)this.active=zone.id;
    return target?.texture??null;
  }

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
    this.active=this.map=this.quality=null;
  }
}
