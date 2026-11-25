import * as THREE from 'three';
import {uploadPrefix} from './render-work.js';
import {makeFoliageTexture,foliageGeometry} from './vegetation-art.js';
import {authoredPlants,createPlacement,grassTile,foliageLOD,FOLIAGE_LEVEL,GRASS_CELL} from './vegetation-placement.js';
import {makeGlFoliageMaterial} from './webgl-vegetation.js';
const center=(x,z,size)=>[Math.floor(x/size),Math.floor(z/size)];
export class Vegetation{
  constructor(makeMaterial=makeGlFoliageMaterial){
    this.makeMaterial=makeMaterial;this.root=new THREE.Group();this.root.name='S09 streamed vegetation';this.assets=new Map();this.tiles=new Map();this.authored=[];this.hidden=new Map();this.grassPool=[];this.tileCache=new Map();this.poolHits=0;this.tileHits=0;
    this.uniforms={time:{value:0},wind:{value:0},transmission:{value:0},sun:{value:new THREE.Vector3(0,1,0)}};
    this.dummy=new THREE.Object3D();this.tint=new THREE.Color();this.white=new THREE.Color(0xffffff);
  }
  asset(kind,lod){
    const texKind=kind==='palm'&&lod===2?'palm-impostor':kind;
    if(!this.assets.has(texKind)){
      const texture=makeFoliageTexture(texKind),mat=this.makeMaterial(texture,this.uniforms);
      this.assets.set(texKind,{texture,...mat,geometries:new Map()});
    }
    const asset=this.assets.get(texKind);
    if(!asset.geometries.has(lod))asset.geometries.set(lod,foliageGeometry(kind,lod));
    return {...asset,geometry:asset.geometries.get(lod)};
  }
  batch(plants,kind,lod){
    if(!plants.length)return null;
    const a=this.asset(kind,lod),capacity=kind==='grass'?Math.max(16,2**Math.ceil(Math.log2(plants.length))):plants.length;
    let mesh;
    if(kind==='grass'){
      const i=this.grassPool.findIndex(m=>m.instanceMatrix.count===capacity);
      if(i>=0){mesh=this.grassPool.splice(i,1)[0];this.poolHits++;}
    }
    if(!mesh){mesh=new THREE.InstancedMesh(a.geometry,a.material,capacity);if(kind==='grass')mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);}
    mesh.geometry=a.geometry;mesh.material=a.material;mesh.count=plants.length;mesh.visible=true;mesh.castShadow=false;
    mesh.name='S09 '+kind+' instances';mesh.userData.noBatch=true;mesh.userData.vegetation=true;mesh.receiveShadow=kind!=='grass';
    for(let i=0;i<plants.length;i++){
      const p=plants[i],d=this.dummy;d.position.set(p.x,p.y,p.z);d.rotation.set(0,p.yaw,0);d.scale.setScalar(p.scale);d.updateMatrix();
      mesh.setMatrixAt(i,d.matrix);
      this.tint.setHex(p.color).lerp(this.white,.57).multiplyScalar(p.shade);
      mesh.setColorAt(i,this.tint);
    }
    if(kind==='grass'){mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);uploadPrefix(mesh.instanceMatrix,plants.length);uploadPrefix(mesh.instanceColor,plants.length);}
    else{mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;}
    mesh.computeBoundingSphere();mesh.boundingSphere.radius+=.6;mesh.customDepthMaterial=a.depth;
    this.root.add(mesh);return {mesh,kind,lod,plants};
  }
  swap(entry,lod){
    if(entry.lod===lod)return;const a=this.asset(entry.kind,lod);
    entry.mesh.geometry=a.geometry;entry.mesh.material=a.material;entry.mesh.customDepthMaterial=a.depth;entry.lod=lod;
    entry.mesh.computeBoundingSphere();entry.mesh.boundingSphere.radius+=.6;
  }
  remove(entry,recycle=false){if(entry?.mesh){const mesh=entry.mesh;mesh.removeFromParent();
    if(recycle&&entry.kind==='grass'&&this.grassPool.length<24){mesh.count=0;mesh.visible=false;this.grassPool.push(mesh);}
    else mesh.dispose();
  }}
  cachedTile(key,x,z,density){
    if(this.tileCache.has(key)){const plants=this.tileCache.get(key);this.tileCache.delete(key);this.tileCache.set(key,plants);this.tileHits++;return plants;}
    const plants=grassTile(this.map,this.placement,x,z,density);this.tileCache.set(key,plants);
    while(this.tileCache.size>160)this.tileCache.delete(this.tileCache.keys().next().value);
    return plants;
  }
  restoreLegacy(){for(const [mesh,mask] of this.hidden)mesh.layers.mask=mask;this.hidden.clear();}
  hideLegacy(root){
    if(!this.authored.some(e=>e.kind==='palm')||!root)return;
    root.traverse(o=>{
      if(o.isMesh&&(o.userData.villageSurface==='leaf'||o.userData.legacyPalmLeaf)&&!this.hidden.has(o)){
        this.hidden.set(o,o.layers.mask);o.layers.mask=0;
      }
    });
  }
  invalidate(){this.dirty=true;}
  clear(){
    this.restoreLegacy();for(const e of this.authored)this.remove(e);for(const e of this.tiles.values())this.remove(e);
    this.authored=[];this.tiles.clear();for(const mesh of this.grassPool)mesh.dispose();this.grassPool.length=0;this.tileCache.clear();this.selectedTiles=null;this.root.removeFromParent();this.map=null;this.key=null;this.last=null;this.dirty=true;
  }
  configure(owner,quality,density,distance){
    const map=owner.map,key=[map.id,quality,density,distance].join('/');
    if(this.map===map&&this.key===key)return false;
    this.clear();this.map=map;this.key=key;this.placement=createPlacement(map);owner.worldRoot.add(this.root);
    const chunks=new Map();
    for(const p of authoredPlants(map)){
      const [x,z]=center(p.x,p.z,48),id=p.kind+'/'+x+'/'+z;
      if(!chunks.has(id))chunks.set(id,[]);chunks.get(id).push(p);
    }
    for(const plants of chunks.values()){
      const p=plants[0],e=this.batch(plants,p.kind,2);
      if(e){e.x=plants.reduce((s,p)=>s+p.x,0)/plants.length;e.z=plants.reduce((s,p)=>s+p.z,0)/plants.length;this.authored.push(e);}
    }
    return true;
  }
  update(owner){
    const settings=owner.graphicsEffects??{},requested=settings.vegetation??'legacy',quality=owner.lowQuality&&requested!=='legacy'?'low':requested;
    const level=FOLIAGE_LEVEL[quality]??0;
    if(!level||!owner.map){if(this.map){this.clear();return true;}return false;}
    const density=owner.map.id==='fy_pool_day'?0:Math.min(owner.lowQuality?.25:1,(Number(settings.grassDensity)||0)/100),radius=Math.min(owner.lowQuality?20:100,Number(settings.grassDistance)||20);
    let shadowChanged=this.configure(owner,quality,density,radius);
    if(this.dirty){this.hideLegacy(owner.staticRoot);this.dirty=false;shadowChanged=true;}
    const camera=owner.camera.position;this.uniforms.time.value=owner.clock;
    this.uniforms.wind.value=settings.vegetationWind==='high'?1:settings.vegetationWind==='low'?.43:0;
    this.uniforms.transmission.value=settings.foliageTransmission==='high'?Math.min(.28,(owner.sun.intensity??0)*.072):0;
    this.uniforms.sun.value.copy(owner.sunOffset).normalize().transformDirection(owner.camera.matrixWorldInverse);
    const [cx,cz]=center(camera.x,camera.z,GRASS_CELL),moving=!this.last||Math.hypot(camera.x-this.last.x,camera.z-this.last.z)>7||owner.clock-this.last.time>.7;
    const shadowMode=settings.vegetationShadows,shadowModeChanged=this.lastShadowMode!==shadowMode;
    this.lastShadowMode=shadowMode;
    if(moving||shadowModeChanged){
      this.last={x:camera.x,z:camera.z,time:owner.clock};
      const wanted=new Map(),limit=Math.ceil(radius/GRASS_CELL)+1;
      if(density>0){
        for(let z=cz-limit;z<=cz+limit;z++)for(let x=cx-limit;x<=cx+limit;x++){
          const dx=(x+.5)*GRASS_CELL-camera.x,dz=(z+.5)*GRASS_CELL-camera.z,d=Math.hypot(dx,dz);
          if(d<=radius+GRASS_CELL*.55)wanted.set(x+'/'+z,{x,z,d});
        }
      }
      const cap=level===1?12:level===2?24:level===3?38:52;
      this.selectedTiles=new Map([...wanted].sort((a,b)=>a[1].d-b[1].d).slice(0,cap));
      for(const [key,e] of this.tiles)if(!this.selectedTiles.has(key)){this.remove(e,true);this.tiles.delete(key);if(e.mesh?.castShadow)shadowChanged=true;}
    }
    if(this.selectedTiles){
      // Spread grass generation across consecutive frames instead of bursts
      // of five allocations every movement update. Do not reduce coverage.
      let created=0;const start=performance.now(),limit=owner.deferAssetRefresh?1:5;
      for(const [key,p] of this.selectedTiles){
        const lod=foliageLOD(p.d,quality,true);let e=this.tiles.get(key);
        if(!e&&created<limit&&(created===0||performance.now()-start<1)){
          const plants=this.cachedTile(key,p.x,p.z,density);
          e=this.batch(plants,'grass',lod)??{empty:true};this.tiles.set(key,e);created++;
        }
        if(e&&!e.empty){
          const casts=shadowMode==='high'&&p.d<34;
          if(e.mesh.castShadow!==casts||casts&&e.lod!==lod)shadowChanged=true;
          this.swap(e,lod);e.mesh.castShadow=casts;
        }
      }
    }
    if(moving||shadowModeChanged)for(const e of this.authored){
      const distance=Math.hypot(e.x-camera.x,e.z-camera.z);
      const lod=foliageLOD(distance,quality),casts=shadowMode==='high'||shadowMode==='low'&&distance<65;
      if(e.mesh.castShadow!==casts||casts&&e.lod!==lod)shadowChanged=true;
      this.swap(e,lod);e.mesh.castShadow=casts;
    }
    for(const a of this.assets.values())a.update?.();
    return shadowChanged;
  }
  prewarmAssets(owner){
    if(!this.map)return;
    const kinds=new Set(this.authored.map(e=>e.kind));if(Number(owner.graphicsEffects?.grassDensity)>0&&this.map.id!=='fy_pool_day')kinds.add('grass');
    this.warmupKinds=kinds;
    for(const kind of kinds)for(let lod=0;lod<=2;lod++)this.asset(kind,lod);
  }
  warmupSamples(owner,position){
    if(!this.map)return;
    const matrix=new THREE.Matrix4().makeTranslation(position.x,position.y-1,position.z),samples=[];
    // Compile actual instanced geometry layouts and the palm impostor variant.
    // Samples are never added to the map or persistent authored/grass lists.
    for(const [kind,a] of this.assets)if(this.warmupKinds?.has(kind==='palm-impostor'?'palm':kind))for(const g of a.geometries.values()){
      const mesh=new THREE.InstancedMesh(g,a.material,1);mesh.setMatrixAt(0,matrix);mesh.setColorAt(0,this.white);mesh.frustumCulled=false;
      mesh.userData.vegetation=true;mesh.customDepthMaterial=a.depth;mesh.receiveShadow=kind!=='grass';mesh.castShadow=['low','high'].includes(owner.graphicsEffects?.vegetationShadows);
      this.root.add(mesh);samples.push(mesh);
    }
    return ()=>{for(const mesh of samples){mesh.removeFromParent();mesh.dispose();}};
  }
  stats(){return {authored:this.authored.reduce((n,e)=>n+e.mesh.count,0),grass:[...this.tiles.values()].reduce((n,e)=>n+(e.mesh?.count??0),0),batches:this.authored.length+[...this.tiles.values()].filter(e=>!e.empty).length,tiles:this.tiles.size,pooledBuffers:this.grassPool.length,cachedTiles:this.tileCache.size,poolHits:this.poolHits,tileHits:this.tileHits};}
  dispose(){this.clear();for(const a of this.assets.values()){a.texture.dispose();a.material.dispose();a.depth?.dispose();for(const g of a.geometries.values())g.dispose();}this.assets.clear();}
}
