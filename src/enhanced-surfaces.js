import {RELIEF_DEPTH, RELIEF_STEPS, RELIEF_RANGE} from './surface-relief.js';
import {makeWeatherMask,weatherParameters,surfaceRepeat} from './map-weathering.js';
import {setWebGlWeathering} from './webgl-map-weathering.js';
import {setWebGlRelief} from './webgl-surface-relief.js';
import {SafeWebGpuKtx2Loader} from './webgpu-ktx2.js';
import {DETAIL_SIZE,choosePbrSize,PBR_PACK_VERSION} from './pbr-library.js';
import {KTX2Loader} from 'three/addons/loaders/KTX2Loader.js';
import * as THREE from 'three';

let urls={};
try{urls=import.meta.glob('./assets/remaster/*.webp',{eager:true,query:'?url',import:'default'});}catch(error){if(typeof window!=='undefined')throw error;}
const legacyUrl=(surface,channel,size)=>{
  const asset=surface==='earth'&&channel!=='diff'?'sand':surface;
  const limit=Math.min(size,1024);
  for(const n of [1024,512,256]){
    if(n>limit)continue;
    const url=urls['./assets/remaster/'+asset+'-'+channel+'-'+n+'.webp'];
    if(url)return url;
  }
  return null;
};

export class EnhancedSurfaces {
  loader=new THREE.TextureLoader();
  originals=new Map();
  textures=new Map();
  loadedRefresh=false;
  manifest=null;

  constructor(renderer,setRelief=setWebGlRelief,setWeathering=setWebGlWeathering,suspendWeathering=()=>{}) {
    this.renderer=renderer;
    this.setRelief=setRelief;this.setWeathering=setWeathering;this.suspendWeathering=suspendWeathering;
    const features=renderer.backend?.device?.features;
    const extensions=renderer.extensions;
    const compressed=renderer.isWebGPURenderer
      ? ['texture-compression-bc','texture-compression-etc2','texture-compression-astc'].some(x=>features?.has(x))
      : ['WEBGL_compressed_texture_s3tc','EXT_texture_compression_bptc','WEBGL_compressed_texture_etc','WEBGL_compressed_texture_astc'].some(x=>extensions?.has(x));
    this.limit=Math.min(compressed?4096:2048,renderer.capabilities?.maxTextureSize??renderer.backend?.device?.limits?.maxTextureDimension2D??4096);
    this.compressed=compressed;
    this.base=new URL('pbr-v1/',document.baseURI);
  }

  ensureManifest() {
    if(this.manifestRequest)return;
    this.manifestPending=true;
    this.manifestRequest=fetch(new URL('manifest.json',this.base))
      .then(r=>{if(!r.ok)throw Error('PBR manifest '+r.status);return r.json();})
      .then(data=>{if(data.version!==PBR_PACK_VERSION||!data.files)throw Error('Invalid PBR pack');this.manifest=data.files;this.scheduleRefresh();})
      .catch(error=>console.warn('PBR pack unavailable; legacy textures remain active',error))
      .finally(()=>{this.manifestPending=false;if(this.loadedRefresh)this.scheduleRefresh();});
  }

  getKtxLoader() {
    if(!this.ktx){
      this.ktx=this.renderer.isWebGPURenderer?new SafeWebGpuKtx2Loader():new KTX2Loader();
      this.ktx.allowCompression=true;
      this.ktx.setTranscoderPath(new URL('basis/',document.baseURI).href).setWorkerLimit(2).detectSupport(this.renderer);
    }
    return this.ktx;
  }

  // Coalesce all completed requests into one material pass. A slow
  // texture may finish mid-match; never rebuild the map's material graphs
  // in an ordinary active frame. Apply pending work on a loading/pause frame.
  scheduleRefresh() {
    this.loadedRefresh=true;
    if(this.refreshScheduled)return;
    this.refreshScheduled=true;
    requestAnimationFrame(()=>{
      this.refreshScheduled=false;
      this.flushRefresh();
    });
  }

  flushRefresh(){
    if(!this.loadedRefresh||this.shouldDefer?.()||this.manifestPending)return false;
    if([...this.textures.values()].some(entry=>entry.pending))return false;
    this.loadedRefresh=false;
    if(this.latest)this.update(...this.latest);
    return true;
  }

  load(surface,channel,size) {
    const sizes=this.manifest?.[surface]?.[channel]??[];
    const selected=choosePbrSize(sizes,size,this.limit);
    const fallback=legacyUrl(surface,channel,size);
    const url=selected?new URL(surface+'-'+channel+'-'+selected+'.ktx2',this.base).href:fallback;
    if(!url)return [null,null];
    if(!this.textures.has(url)){
      const entry={texture:null,pending:true};
      this.textures.set(url,entry);
      const request=selected?this.getKtxLoader().loadAsync(url):this.loader.loadAsync(url);
      request.catch(error=>{
        if(selected&&fallback&&this.textures.get(url)===entry)return this.loader.loadAsync(fallback);
        throw error;
      }).then(texture=>{
        if(this.textures.get(url)!==entry){texture.dispose();return;}
        texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
        texture.colorSpace=channel==='diff'?THREE.SRGBColorSpace:THREE.NoColorSpace;
        entry.texture=texture;entry.pending=false;
        this.scheduleRefresh();
      }).catch(error=>{
        entry.pending=false;
        console.warn('Surface texture unavailable',url,error);
        if(this.textures.get(url)===entry)this.scheduleRefresh();
      });
    }
    return [url,this.textures.get(url).texture];
  }

  update(root,settings,anisotropy,mapId) {
    this.beforeUpdate?.();
    if(!root)return;
    const size=DETAIL_SIZE[settings.surfaceDetail]??0;
    const aoSize={low:256,high:1024}[settings.bakedAO]??0;
    const weather=['low','high'].includes(settings.mapWeathering);
    if(!size&&!aoSize&&!weather){this.clear();return;}
    this.latest=[root,settings,anisotropy,mapId];
    if(size||aoSize)this.ensureManifest();
    if(weather&&!this.weatherMask)this.weatherMask=makeWeatherMask();
    const active=new Set(),updated=new Set();
    const get=(surface,channel,resolution)=>{
      const [key,tex]=this.load(surface,channel,resolution);
      if(key)active.add(key);
      if(tex){
        if(tex.anisotropy!==anisotropy){tex.anisotropy=anisotropy;tex.needsUpdate=true;}
        const repeat=surfaceRepeat(surface);
        if(tex.repeat.x!==repeat||tex.repeat.y!==repeat)tex.repeat.set(repeat,repeat);
      }
      return tex;
    };
    const updateMaterial=material=>{
      const surface=material?.userData.remasterSurface;
      const weatherSurface=material?.userData.weatherSurface??surface;
      if(!weatherSurface||material.transparent||!(material.isMeshStandardMaterial||material.isMeshLambertMaterial)||updated.has(material))return;
      updated.add(material);
      const standard=material.isMeshStandardMaterial;
      if(!this.originals.has(material)){
        this.originals.set(material,{map:material.map,aoMap:material.aoMap,aoMapIntensity:material.aoMapIntensity,
          ...(standard?{normalMap:material.normalMap,roughnessMap:material.roughnessMap,metalnessMap:material.metalnessMap,
            bumpMap:material.bumpMap,roughness:material.roughness,metalness:material.metalness,normalScale:material.normalScale.clone()}:{}),
        });
      }
      const base=this.originals.get(material);
      const detail=surface&&size&&surface!=='ceramic'&&standard;
      const pack=surface&&(aoSize||detail)?get(surface,'arm',Math.max(aoSize,detail?Math.min(size,2048):0)):null;
      const color=detail?get(surface,'diff',size):null;
      const normal=detail?get(surface,'nor_gl',size):null;
      const ready=Boolean(color&&normal&&pack);
      const maps={map:ready&&!material.userData.preserveAlbedo?color:base.map,aoMap:aoSize&&pack?pack:base.aoMap};
      if(standard){
        maps.normalMap=ready?normal:base.normalMap;
        maps.roughnessMap=ready?pack:base.roughnessMap;
        maps.metalnessMap=ready&&surface==='metal'?pack:base.metalnessMap;
        maps.bumpMap=ready?null:base.bumpMap;
        material.normalScale.copy(base.normalScale);
        if(ready)material.normalScale.multiplyScalar(surface==='rock'?2.6:surface==='sand'?.92:surface==='cloth'?1.2:1.75);
        material.roughness=ready?1:base.roughness;
        material.metalness=ready&&surface==='metal'?1:base.metalness;
      }
      if(Object.entries(maps).some(([key,value])=>material[key]!==value)){
        Object.assign(material,maps);material.needsUpdate=true;
      }
      material.aoMapIntensity=aoSize&&pack?(material.userData.estateFinish?.24:settings.architectureAO!=='off'?.38:settings.ao==='off'?.8:.5):base.aoMapIntensity;
      this.suspendWeathering(material);
      const steps=RELIEF_STEPS[settings.relief],scale=RELIEF_DEPTH[surface];
      const relief=ready&&steps&&scale&&!['sand','earth','grass'].includes(surface)&&!material.userData.groundShadowPatched&&!material.userData.disableRelief;
      this.setRelief(material,relief?get(surface,'disp',Math.min(size,steps>8?1024:512)):null,steps,scale,RELIEF_RANGE[settings.relief]);
      const params=weather?weatherParameters(mapId,weatherSurface,settings.mapWeathering):null;
      this.setWeathering(material,params?this.weatherMask:null,params);
    };
    root.traverse(object=>{
      if(!object.isMesh||!object.geometry.hasAttribute('uv'))return;
      if(Array.isArray(object.material))object.material.forEach(updateMaterial);
      else updateMaterial(object.material);
    });
    for(const [material,base] of this.originals){
      if(updated.has(material))continue;
      this.restore(material,base);
      this.originals.delete(material);
    }
    for(const [key,entry] of this.textures){
      if(active.has(key))continue;
      entry.texture?.dispose();this.textures.delete(key);
    }
    if(!weather){this.weatherMask?.dispose();this.weatherMask=null;}
  }

  restore(material,base){
    this.setWeathering(material,null);
    this.setRelief(material,null);
    const {normalScale,...values}=base;
    Object.assign(material,values);
    if(normalScale)material.normalScale.copy(normalScale);
    material.needsUpdate=true;
  }

  estimatedBytes(){
    let bytes=0;
    for(const {texture:tex} of this.textures.values()){
      if(!tex?.image)continue;
      if(tex.mipmaps?.length&&tex.mipmaps.every(m=>m.data))bytes+=tex.mipmaps.reduce((sum,m)=>sum+m.data.byteLength,0);
      else bytes+=tex.image.width*tex.image.height*4*4/3;
    }
    if(this.weatherMask)bytes+=this.weatherMask.image.data.byteLength*4/3;
    return Math.round(bytes);
  }

  stats(){
    let compressed=0,loaded=0,pending=0,maxSize=0;
    for(const entry of this.textures.values()){
      if(entry.pending)pending++;
      if(!entry.texture)continue;
      loaded++;if(entry.texture.isCompressedTexture)compressed++;
      maxSize=Math.max(maxSize,entry.texture.image?.width??0,entry.texture.image?.height??0);
    }
    return {pack:!!this.manifest,hardwareCompression:this.compressed,limit:this.limit,loaded,compressed,pending,deferredRefresh:this.loadedRefresh,maxSize,bytes:this.estimatedBytes(),weathering:Boolean(this.weatherMask)};
  }

  clear(){
    this.latest=null;this.loadedRefresh=false;
    for(const [material,base] of this.originals)this.restore(material,base);
    for(const entry of this.textures.values())entry.texture?.dispose();
    this.originals.clear();this.textures.clear();
    this.weatherMask?.dispose();this.weatherMask=null;
  }

  dispose(){this.clear();this.ktx?.dispose();this.ktx=null;}
}
