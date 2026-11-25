import * as THREE from 'three';
import {gunzipSync} from 'fflate';
import {ARCH_LIGHT_VERSION,ARCH_LIGHT_MAPS,decodeChartUV,geometryKey} from './architecture-lightmap-format.js';

function tex(data,size,format){
  const t=new THREE.DataTexture(data,size,size,format,THREE.UnsignedByteType);
  t.channel=1;t.colorSpace=THREE.NoColorSpace;t.flipY=false;
  t.minFilter=t.magFilter=THREE.LinearFilter;t.generateMipmaps=false;t.needsUpdate=true;return t;
}
function makeMaps(data,size){
  const ao=new Uint8Array(size*size*2);
  for(let i=0,j=0;i<data.length;i+=4,j+=2){ao[j]=255;ao[j+1]=data[i+3];}
  return {light:tex(data,size,THREE.RGBAFormat),ao:tex(ao,size,THREE.RGFormat)};
}
export class ArchitectureLightmaps{
  meshes=new Map();materials=new Map();serial=0;
  suspend(){
    for(const [mesh,record] of this.meshes){
      if(mesh.geometry===record.baked)mesh.geometry=record.original;
      record.baked.dispose();
    }
    this.meshes.clear();
    for(const [m,base] of this.materials){
      Object.assign(m,base);delete m.userData.architectureLightmap;m.needsUpdate=true;
    }
    this.materials.clear();this.appliedRevision=-1;
  }
  clear(){
    this.serial++;this.suspend();this.light?.dispose();this.ao?.dispose();
    this.light=this.ao=null;this.meta=this.charts=null;this.map=null;this.pending=false;this.failed=false;
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
      this.meta=meta;this.charts=charts;Object.assign(this,makeMaps(rgba,meta.size));this.pending=false;this.appliedRevision=-1;
    }catch(error){if(serial===this.serial){this.pending=false;this.failed=true;console.warn('Architecture lightmaps unavailable:',map.id,error);}}
  }
  update(owner){
    const settings=owner.graphicsEffects??{},lighting=settings.architectureLight??'off',occlusion=settings.architectureAO??'off';
    const map=owner.map,world=owner.worlds?.get(map?.id);
    // Night-vision scenes and animated time-of-day retain their authored light.
    if((lighting==='off'&&occlusion==='off')||!ARCH_LIGHT_MAPS[map?.id]||!world?.model||world.fallback||owner.presentingCampaign){
      if(this.map)this.clear();return;
    }
    if(this.map!==map){this.clear();this.map=map;this.pending=true;this.load(map,this.serial);}
    if(!this.meta||!world.model.base)return;
    const mode=lighting+'/'+occlusion;
    if(this.appliedRevision===owner.staticMaterialRevision&&this.mode===mode)return;
    owner.indirectLighting?.suspend();this.suspend();this.mode=mode;
    const meta=this.meta,root=world.model.base,byId=new Map(meta.entries.map(e=>[e.id,e])),active=new Set(),candidates=[];
    // Match the original GLB mesh order, count and full position/index fingerprint.
    // Only named base layers are baked; detail meshes sharing a material use a
    // neutral chart so no invalid UV1 shader inputs occur.
    let ordinal=0;
    root.traverse(mesh=>{
      if(!mesh.isMesh)return;
      const entry=byId.get(ordinal++),m=mesh.material,g=mesh.geometry;
      if(!entry||entry.name!==mesh.name||entry.key!==geometryKey(g)||entry.count!==(g.index?.count??g.attributes.position.count)||Array.isArray(m)||!(m?.isMeshStandardMaterial||m?.isMeshLambertMaterial)||m.transparent)return;
      if(entry.offset<0||entry.offset+entry.count>this.charts.length)return;
      candidates.push({mesh,entry});active.add(m);
    });
    if(!candidates.length){this.failed=true;this.appliedRevision=owner.staticMaterialRevision;return;}
    const targets=new Map(candidates.map(x=>[x.mesh,x.entry]));
    owner.staticRoot.traverse(mesh=>{
      if(!mesh.isMesh||!active.has(mesh.material))return;
      const original=mesh.geometry,entry=targets.get(mesh);
      const baked=entry&&original.index?original.toNonIndexed():original.clone();
      const uv=entry?decodeChartUV(this.charts.subarray(entry.offset,entry.offset+entry.count),meta.size):new Float32Array(baked.attributes.position.count*2).fill(.5/meta.size);
      baked.setAttribute('uv1',new THREE.BufferAttribute(uv,2));
      baked.boundingBox=original.boundingBox?.clone()??null;baked.boundingSphere=original.boundingSphere?.clone()??null;
      mesh.geometry=baked;this.meshes.set(mesh,{original,baked});
    });
    for(const m of active){
      this.materials.set(m,{lightMap:m.lightMap,lightMapIntensity:m.lightMapIntensity,aoMap:m.aoMap,aoMapIntensity:m.aoMapIntensity});
      if(lighting!=='off'){m.lightMap=this.light;m.lightMapIntensity=lighting==='high'?.85:.45;m.userData.architectureLightmap=true;}
      if(occlusion!=='off'){m.aoMap=this.ao;m.aoMapIntensity=occlusion==='high'?.78:.43;}
      m.needsUpdate=true;
    }
    this.appliedRevision=owner.staticMaterialRevision;
  }
  stats(){return this.map?{map:this.map.id,pending:this.pending,failed:this.failed,ready:!!this.meta,meshes:this.meshes.size,bakedTriangles:this.meta?.baked??0,bytes:this.meta?this.meta.size*this.meta.size*6:0}:null;}
  dispose(){this.clear();}
}
