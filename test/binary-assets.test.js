import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import * as THREE from 'three';
import {gunzipSync} from 'node:zlib';
import {performance} from 'node:perf_hooks';
import {FPS_HANDS as sourceHands} from '../art-source/generated/fps-hands-data.js';
import {FPS_HANDS,loadFPSHands} from '../src/fps-hands-data.js';
import {installSoldierAsset,soldierAssetKey,createAssetRig} from '../src/soldier-assets.js';
import {createSoldierRig,animateSoldier,beginDeath,animateDeath} from '../src/soldier.js';
import {CLASS_WEAPONS} from '../shared/world.js';

test('external hand data preserves every original byte and concurrent loads share one request',async()=>{
  const original=globalThis.fetch;let requests=0;
  globalThis.fetch=async()=>{requests++;const bytes=await readFile(new URL('../src/assets/fps-hands.bin.gz',import.meta.url));return new Response(bytes);};
  try{
    await Promise.all([loadFPSHands(),loadFPSHands()]);assert.equal(requests,1);
    for(const [pose,fields] of Object.entries(sourceHands))for(const [name,base64] of Object.entries(fields)){
      assert.deepEqual(Buffer.from(FPS_HANDS[pose][name]),Buffer.from(base64,'base64'),`${pose}.${name}`);
    }
  }finally{globalThis.fetch=original;}
});

test('prebuilt soldier rigs preserve geometry, skinning and live animation without procedural construction',async()=>{
  const ctx={fillRect(){},drawImage(){},beginPath(){},closePath(){},moveTo(){},lineTo(){},fill(){},stroke(){},arc(){},save(){},restore(){},getImageData(x,y,w,h){return {data:new Uint8ClampedArray(w*h*4)};},putImageData(){}};
  const previous={document:globalThis.document,Image:globalThis.Image,ImageData:globalThis.ImageData};
  globalThis.document={createElement:()=>({width:8,height:8,getContext:()=>ctx})};globalThis.Image=class{set src(v){queueMicrotask(()=>this.onload?.());}};globalThis.ImageData=class{constructor(data){this.data=data;}};
  try{
    const owner={},measurements=[];
    for(const classId of Object.keys(CLASS_WEAPONS)){
      const player={id:'same',team:0,classId,weaponId:CLASS_WEAPONS[classId][0],x:0,y:0,z:0,shotSeq:0};
      let start=performance.now();const source=createSoldierRig(owner,player),proceduralMs=performance.now()-start;
      const bytes=gunzipSync(await readFile(new URL(`../src/assets/soldiers/${soldierAssetKey(player)}.bin.gz`,import.meta.url)));
      start=performance.now();installSoldierAsset(soldierAssetKey(player),bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));const loaded=createSoldierRig(owner,player),loadedMs=performance.now()-start;
      measurements.push({classId,proceduralMs,loadedMs});
      for(const lod of ['detailGeometry','mediumGeometry','distantGeometry']){
        assert.deepEqual(loaded[lod].index.array,source[lod].index.array);
        for(const [name,attribute] of Object.entries(source[lod].attributes))assert.deepEqual(loaded[lod].attributes[name].array,attribute.array,`${classId}/${lod}/${name}`);
      }
      for(const rig of [source,loaded]){
        animateSoldier(rig,{dt:.05,player:{...player,x:.25,z:-.1,yaw:.2,pitch:.1,sprint:true}});
        beginDeath(rig,0);animateDeath(rig,{age:.5});rig.group.updateMatrixWorld(true);
      }
      for(let i=0;i<source.body.skeleton.bones.length;i++){
        const a=source.body.skeleton.bones[i].matrixWorld.elements,b=loaded.body.skeleton.bones[i].matrixWorld.elements;
        assert.ok(a.every((v,j)=>Math.abs(v-b[j])<1e-6),`${classId} bone ${i} preserves animation`);
        const original=source.body.skeleton.boneInverses[i].elements;
        assert.ok(loaded.body.skeleton.boneInverses[i].elements.every((value,j)=>Math.abs(value-original[j])<1e-10*Math.max(1,Math.abs(original[j]))),'bind matrices preserve geometry within floating-point roundoff');
      }
    }
    await owner.soldierHeadReady;
    if(process.env.MEASURE_ASSETS)await writeFile(process.env.MEASURE_ASSETS,JSON.stringify(measurements,null,2)+'\n');
  }finally{for(const [key,value] of Object.entries(previous))if(value===undefined)delete globalThis[key];else globalThis[key]=value;}
});

test('all shipped LODs keep the same joint connections and far gait advances before returning to skinning',async()=>{
  const links=geometry=>{
    const result=new Set(),ids=geometry.attributes.skinIndex,weights=geometry.attributes.skinWeight,index=geometry.index;
    for(let i=0;i<index.count;i+=3){const bones=new Set();for(let j=0;j<3;j++)for(let k=0;k<4;k++)if(weights.array[index.getX(i+j)*4+k]>.001)bones.add(ids.array[index.getX(i+j)*4+k]);const list=[...bones].sort((a,b)=>a-b);for(let a=0;a<list.length;a++)for(let b=a+1;b<list.length;b++)result.add(list[a]+'/'+list[b]);}
    return result;
  };
  for(const file of await readdir(new URL('../src/assets/soldiers/',import.meta.url))){
    const [team,classId,weaponId]=file.replace('.bin.gz','').split('-'),key=file.replace('.bin.gz',''),bytes=gunzipSync(await readFile(new URL('../src/assets/soldiers/'+file,import.meta.url)));
    installSoldierAsset(key,bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));const player={id:'p',team:Number(team),classId,weaponId,x:0,y:0,z:0,shotSeq:0},rig=createAssetRig({},player,new THREE.MeshBasicMaterial()),near=links(rig.detailGeometry);
    for(const lod of [rig.mediumGeometry,rig.distantGeometry])for(const link of links(lod))assert.ok(near.has(link),`${file} must not connect separate limbs: ${link}`);
    for(let frame=0;frame<120;frame++){rig.group.position.z=-frame*.08;animateSoldier(rig,{dt:1/60,player:{...player,z:rig.group.position.z},lightweight:true});}
    const motion=rig.motion;assert.ok(motion.speed>4);assert.ok(motion.feet.every(foot=>Math.abs(foot.planted.z-rig.group.position.z)<2));
    animateSoldier(rig,{dt:1/60,player:{...player,z:rig.group.position.z}});assert.equal(rig.motion,motion);assert.ok(motion.time>1.9,'returning does not reset locomotion time');
  }
});
