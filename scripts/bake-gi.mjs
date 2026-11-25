import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {MAPS} from '../shared/world.js';
import {ALHADRA} from '../shared/campaign/alhadra.js';
import {ALHADRA_DESERT} from '../shared/campaign/alhadra-desert.js';
import {TEL_MAZIN} from '../shared/campaign/tel-mazin.js';
import {NAHAR} from '../shared/campaign/nahar.js';
import {SAFRA} from '../shared/campaign/safra.js';
import {bakeProbeField,GI_VERSION} from '../src/gi-probes.js';
import {ARCH_LIGHT_MAPS} from '../src/architecture-lightmap-format.js';
import {collectGiTriangles,createGiTracer} from './gi-geometry.mjs';

const dir='public/gi-v1';await mkdir(dir,{recursive:true});
const maps=[...Object.values(MAPS),ALHADRA,ALHADRA_DESERT,TEL_MAZIN,NAHAR,SAFRA];
const manifest={version:GI_VERSION,maps:{}},loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
globalThis.self??=globalThis;
let previous={maps:{}};try{previous=JSON.parse(await readFile(dir+'/manifest.json','utf8'));}catch{}
const save=()=>writeFile(dir+'/manifest.json',JSON.stringify(manifest,null,2)+'\n');
const hash=b=>createHash('sha256').update(b).digest('hex');
const algorithm=hash(Buffer.concat(await Promise.all(['scripts/bake-gi.mjs','scripts/gi-geometry.mjs','src/gi-probes.js'].map(p=>readFile(p)))));
async function glb(bytes){
  return (await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
}
async function proceduralScene(map){
  const {createCanvas}=await import('@napi-rs/canvas');
  globalThis.document??={createElement:()=>createCanvas(512,512)};
  const [{createMapModelBuilder},{createSurfaceMaterials},{buildMapScene}]=await Promise.all([
    import('../src/renderer.js'),import('../src/visuals.js'),import('../src/map-scene.js')]);
  const surfaces=createSurfaceMaterials({capabilities:{getMaxAnisotropy:()=>2}},{bake:true});
  const owner=createMapModelBuilder(surfaces);owner.scene=new THREE.Group();owner.map=map;
  buildMapScene(owner,map,{skipObjectives:true});
  return {scene:owner.scene,surfaces};
}
function geometryHash(triangles){
  const digest=createHash('sha256'),buf=Buffer.allocUnsafe(12*4);
  for(const t of triangles){
    [t.x,t.y,t.z,t.ex,t.ey,t.ez,t.fx,t.fy,t.fz,...t.color].forEach((v,i)=>buf.writeFloatLE(v,i*4));
    digest.update(buf);
  }
  return digest.digest('hex');
}
for(const map of maps){
  const folder=ARCH_LIGHT_MAPS[map.id],procedural=map.id==='safra'||map.id==='quarry';
  let triangles,source,baseBytes,detailBytes;
  if(procedural){
    const {scene,surfaces}=await proceduralScene(map);
    triangles=collectGiTriangles(scene);
    if(map.id==='quarry'){
      const {loadQuarryDetail}=await import('../src/quarry-model.js');
      const sourceScene=await glb(await readFile('src/assets/quarry/detail.glb'));
      const layer=await loadQuarryDetail(map,surfaces.metal,sourceScene);
      for(const t of collectGiTriangles(layer,{detail:true}))triangles.push(t);
    }
    source=hash(algorithm+geometryHash(triangles));
  }else{
    if(!folder)throw Error('GI source unavailable '+map.id);
    [baseBytes,detailBytes]=await Promise.all(['base','detail'].map(name=>readFile('src/assets/'+folder+'/'+name+'.glb')));
    source=hash(algorithm+hash(baseBytes)+hash(detailBytes)+JSON.stringify([map.width,map.depth,map.size,map.layoutVersion??0]));
  }
  const old=previous.maps?.[map.id];
  if(previous.version===GI_VERSION&&old?.source===source){
    try{const bytes=await readFile(dir+'/'+old.file);if(bytes.length!==old.bytes||hash(bytes)!==old.sha256)throw Error('bad cache');
      manifest.maps[map.id]=old;await save();console.log('GI cached',map.id,old.triangles);continue;
    }catch{}
  }
  if(!triangles){
    triangles=collectGiTriangles(await glb(baseBytes));
    for(const t of collectGiTriangles(await glb(detailBytes),{detail:true}))triangles.push(t);
  }
  const tracer=createGiTracer(triangles);
  const {data,...meta}=bakeProbeField(map,{tracer});
  const file=map.id+'.rgba',bytes=Buffer.from(data),sha256=hash(bytes);
  await writeFile(dir+'/'+file,bytes);
  manifest.maps[map.id]={...meta,source,file,bytes:bytes.length,sha256,triangles:tracer.triangleCount};
  await save();
  console.log('GI geometry',map.id,tracer.triangleCount+' triangles',meta.nx+'x'+meta.nz+'x3',bytes.length+' bytes');
}
