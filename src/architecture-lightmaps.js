import * as THREE from 'three';
import {gunzipSync} from 'fflate';
import {setWebGlArchitectureAO} from './webgl-architecture-ao.js';
import {ARCH_LIGHT_VERSION,ARCH_LIGHT_MAPS,decodeChartUV,geometryKey,meshGeometryKey,proceduralReceiver,architectureIntensity} from './architecture-lightmap-format.js';

function tex(data,size,format){
  const t=new THREE.DataTexture(data,size,size,format,THREE.UnsignedByteType);
  t.channel=1;t.colorSpace=THREE.NoColorSpace;t.flipY=false;
  t.minFilter=t.magFilter=THREE.LinearFilter;t.generateMipmaps=false;t.needsUpdate=true;return t;
}
export class ArchitectureLightmaps{
  meshes=new Map();materials=new Map();serial=0;keys=new WeakMap();
  constructor(setAO=setWebGlArchitectureAO){this.setAO=setAO;}
  suspend(keepGeometry=false){
    if(!keepGeometry){
    for(const [mesh,record] of this.meshes){
      if(mesh.geometry===record.baked)mesh.geometry=record.original;
      record.baked.dispose();
    }
    this.meshes.clear();
    }
    for(const [m,base] of this.materials){
      this.setAO(m,null);
      Object.assign(m,base);delete m.userData.architectureLightmap;m.needsUpdate=true;
    }
    this.materials.clear();this.appliedRevision=-1;
  }
  clear(){
    this.serial++;this.suspend();this.light?.dispose();
    this.light=null;this.meta=this.charts=null;this.map=null;this.pending=false;this.failed=false;
  }
  async load(map,serial){
    try{
      const base=new URL('architecture-v1/',document.baseURI);
      const manifest=await fetch(new URL('manifest.json',base)).then(r=>{if(!r.ok)throw Error('Architecture manifest '+r.status);return r.json();});
      const meta=manifest.maps?.[map.id];
      if(manifest.version!==ARCH_LIGHT_VERSION||!meta||!Number.isInteger(meta.size)||meta.size>2048||meta.size<128)throw Error('Architecture atlas unavailable '+map.id);
      const bytes=async name=>gunzipSync(new Uint8Array(await fetch(new URL(name,base)).then(r=>{if(!r.ok)throw Error(name+' '+r.status);return r.arrayBuffer();})));
      const [rgba,raw]=await Promise.all([bytes(meta.atlas),bytes(meta.charts)]);
      if(serial!==this.serial)return;
      if(rgba.length!==meta.size*meta.size*4||raw.length%2)throw Error('Invalid architecture atlas size');
      const view=new DataView(raw.buffer,raw.byteOffset,raw.byteLength),charts=new Uint16Array(raw.length/2);
      for(let i=0;i<charts.length;i++)charts[i]=view.getUint16(i*2,true);
      this.meta=meta;this.charts=charts;this.light=tex(rgba,meta.size,THREE.RGBAFormat);this.pending=false;this.appliedRevision=-1;
    }catch(error){if(serial===this.serial){this.pending=false;this.failed=true;console.warn('Architecture lightmaps unavailable:',map.id,error);}}
  }
  update(owner){
    const settings=owner.graphicsEffects??{},lighting=settings.architectureLight??'off',occlusion=settings.architectureAO??'off';
    const map=owner.map,world=owner.worlds?.get(map?.id);
    // Dynamic mission lighting remains authoritative. No direct sunlight is
    // baked into the atlas; intensity follows the authored sun/ambient state.
    const procedural=map?.id==='safra';
    if((lighting==='off'&&occlusion==='off')||!ARCH_LIGHT_MAPS[map?.id]||!world||(!world.model&&!procedural)||world.fallback){
      if(this.map){owner.indirectLighting?.suspend();this.clear();}return;
    }
    if(this.map!==map){this.clear();this.map=map;this.pending=true;this.load(map,this.serial);}
    if(!this.meta||(!procedural&&!world.model?.base))return;
    const mode=lighting+'/'+occlusion;
    if(this.appliedRevision===owner.staticMaterialRevision&&this.mode===mode){this.updateIntensity(owner,lighting);return;}
    owner.indirectLighting?.suspend();this.suspend(true);this.mode=mode;
    const meta=this.meta,root=procedural?world.root:world.model.base,byId=new Map(meta.entries.map(e=>[procedural?e.key:e.id,e])),active=new Set(),candidates=[];
    // Match the original GLB mesh order, count and full position/index fingerprint.
    // Only named base layers are baked; detail meshes sharing a material use a
    // neutral chart so no invalid UV1 shader inputs occur.
    let ordinal=0;
    root.traverse(mesh=>{
      if(!mesh.isMesh)return;
      const id=ordinal++,m=mesh.material,g=this.meshes.get(mesh)?.original??mesh.geometry;
      if(procedural&&!proceduralReceiver(mesh))return;
      if(!this.keys.has(g))this.keys.set(g,geometryKey(g));
      const key=procedural?meshGeometryKey(mesh,g):this.keys.get(g);
      const entry=byId.get(procedural?key:id);
      if(!entry||(!procedural&&entry.name!==mesh.name)||entry.key!==key||entry.count!==(g.index?.count??g.attributes.position.count)||Array.isArray(m)||!(m?.isMeshStandardMaterial||m?.isMeshLambertMaterial)||m.transparent)return;
      if(entry.offset<0||entry.offset+entry.count>this.charts.length)return;
      candidates.push({mesh,entry});active.add(m);
    });
    if(!candidates.length){this.suspend();this.failed=true;this.appliedRevision=owner.staticMaterialRevision;return;}
    const targets=new Map(candidates.map(x=>[x.mesh,x.entry]));
    const visited=new Set();
    owner.staticRoot.traverse(mesh=>{
      if(!mesh.isMesh||!active.has(mesh.material))return;
      visited.add(mesh);
      const existing=this.meshes.get(mesh),entry=targets.get(mesh);
      if(existing&&mesh.geometry===existing.baked&&existing.entry===entry)return;
      const original=existing?.original??mesh.geometry;
      if(existing)existing.baked.dispose();
      const baked=entry&&original.index?original.toNonIndexed():original.clone();
      const uv=entry?decodeChartUV(this.charts.subarray(entry.offset,entry.offset+entry.count),meta.size):new Float32Array(baked.attributes.position.count*2).fill(.5/meta.size);
      const attr=new THREE.BufferAttribute(uv,2);
      baked.setAttribute('uv1',attr);baked.setAttribute('s09ArchitectureUV',attr);
      baked.boundingBox=original.boundingBox?.clone()??null;baked.boundingSphere=original.boundingSphere?.clone()??null;
      mesh.geometry=baked;this.meshes.set(mesh,{original,baked,entry});
    });
    for(const [mesh,record] of this.meshes)if(!visited.has(mesh)){
      if(mesh.geometry===record.baked)mesh.geometry=record.original;
      record.baked.dispose();this.meshes.delete(mesh);
    }
    for(const m of active){
      this.materials.set(m,{lightMap:m.lightMap,lightMapIntensity:m.lightMapIntensity});
      if(lighting!=='off'){m.lightMap=this.light;m.userData.architectureLightmap=true;}
      if(occlusion!=='off')this.setAO(m,this.light,occlusion==='high'?.78:.43);
      m.needsUpdate=true;
    }
    this.updateIntensity(owner,lighting);
    this.appliedRevision=owner.staticMaterialRevision;
  }
  updateIntensity(owner,lighting){
    if(lighting==='off')return;
    const value=architectureIntensity(lighting,{campaign:owner.presentingCampaign,nightVision:owner.campaignNightVision,sun:owner.sun?.intensity,hemi:owner.hemiLight?.intensity});
    for(const m of this.materials.keys())m.lightMapIntensity=value;
  }
  stats(){return this.map?{map:this.map.id,pending:this.pending,failed:this.failed,ready:!!this.meta,meshes:this.meshes.size,bakedTriangles:this.meta?.baked??0,bytes:this.meta?this.meta.size*this.meta.size*4:0}:null;}
  dispose(){this.clear();}
}
