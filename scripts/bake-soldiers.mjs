import {gzipSync} from 'node:zlib';
import { mkdir,writeFile } from 'node:fs/promises';
import { createSoldierRig } from '../src/soldier.js';
import { CLASSES,CLASS_WEAPONS,SIDEARMS } from '../shared/world.js';
const ctx={fillRect(){},drawImage(){},beginPath(){},closePath(){},moveTo(){},lineTo(){},fill(){},stroke(){},arc(){},save(){},restore(){},getImageData(x,y,w,h){return {data:new Uint8ClampedArray(w*h*4)};},putImageData(){}};
globalThis.document={createElement:()=>({width:8,height:8,getContext:()=>ctx})};globalThis.Image=class{set src(v){queueMicrotask(()=>this.onload?.());}};globalThis.ImageData=class{constructor(data){this.data=data;}};
await mkdir('src/assets/soldiers',{recursive:true});const owner={};
for(const team of [0,1])for(const classId of Object.keys(CLASSES))for(const weaponId of [...CLASS_WEAPONS[classId],...SIDEARMS]){
  const rig=createSoldierRig(owner,{id:'template',team,classId,weaponId,x:0,z:0,shotSeq:0}),nodes=[];rig.group.traverse(node=>nodes.push(node));
  const ids=new Map(nodes.map((node,index)=>[node,index])),geometries=[],geometryIds=new Map(),parts=[];let offset=0;
  const attribute=value=>{const descriptor={type:value.array.constructor.name,itemSize:value.itemSize,normalized:value.normalized,offset,length:value.array.length};parts.push(new Uint8Array(value.array.buffer,value.array.byteOffset,value.array.byteLength));offset+=value.array.byteLength;const padding=(4-offset%4)%4;if(padding){parts.push(new Uint8Array(padding));offset+=padding;}return descriptor;};
  const geometry=source=>{if(!geometryIds.has(source)){geometryIds.set(source,geometries.length);geometries.push({attributes:Object.fromEntries(Object.entries(source.attributes).map(([name,value])=>[name,attribute(value)])),index:source.index?attribute(source.index):null,userData:{actorOwned:true,simplificationError:source.userData.simplificationError}});}return geometryIds.get(source);};
  const descriptions=nodes.map(node=>({type:node.isBone?'bone':node.isSkinnedMesh?'skinned':node.isMesh?'mesh':'group',parent:ids.get(node.parent)??-1,name:node.name,position:node.position.toArray(),quaternion:node.quaternion.toArray(),scale:node.scale.toArray(),visible:node.visible,castShadow:node.castShadow,receiveShadow:node.receiveShadow,frustumCulled:node.frustumCulled,
    ...(node.geometry?{geometry:geometry(node.geometry)}:{}),...(node.isMesh&&!node.isSkinnedMesh?{material:{color:node.material.color.getHex(),opacity:node.material.opacity,transparent:node.material.transparent,depthWrite:node.material.depthWrite,side:node.material.side,blending:node.material.blending,toneMapped:node.material.toneMapped}}:{})}));
  const refs={};for(const key of ['group','pose','spine','body','head','rifle','magazine','marker','flash'])refs[key]=ids.get(rig[key]);for(const key of ['legs','arms','knees','elbows','ankles','wrists'])refs[key]=rig[key].map(node=>ids.get(node));
  const header={nodes:descriptions,geometries,refs,lods:[rig.detailGeometry,rig.mediumGeometry,rig.distantGeometry].map(geometry),bones:rig.body.skeleton.bones.map(bone=>ids.get(bone)),inverse:rig.body.skeleton.boneInverses.map(matrix=>matrix.toArray()),bindMatrix:rig.body.bindMatrix.toArray(),state:{pistol:rig.pistol,initialized:false,deathAge:0,alive:true,recoil:0,flinch:0,flinchSide:0,seed:0,stepIndex:0}};
  const json=new TextEncoder().encode(JSON.stringify(header)),start=(json.length+7)&~3,result=new Uint8Array(start+offset);new DataView(result.buffer).setUint32(0,json.length,true);result.set(json,4);let cursor=start;for(const part of parts){result.set(part,cursor);cursor+=part.length;}
  await writeFile(`src/assets/soldiers/${team}-${classId}-${weaponId}.bin.gz`,gzipSync(result,{level:9}));console.log(`${team} ${classId} ${weaponId}: ${result.length} bytes`);
}
await owner.soldierHeadReady;
