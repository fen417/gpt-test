import {fetchBinary} from './binary-assets.js';
import * as THREE from 'three';
const assets=new Map(),pending=new Map();
const types={Float32Array,Uint32Array,Uint16Array,Int16Array,Uint8Array,Int8Array};
export const soldierAssetKey=player=>`${player.team?1:0}-${player.classId}-${player.weaponId}`;
export const soldierAssetState=key=>assets.get(key);
export function installSoldierAsset(key,buffer){
  const length=new DataView(buffer).getUint32(0,true),header=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,4,length)));
  const start=(length+7)&~3;const data={header,buffer,start};assets.set(key,data);return data;
}
export function requestSoldierAsset(key){
  if(!pending.has(key))pending.set(key,fetchBinary(new URL(`./assets/soldiers/${key}.bin.gz`,import.meta.url)).then(buffer=>installSoldierAsset(key,buffer)).catch(error=>{assets.set(key,false);console.warn(error.message);return false;}));
  return pending.get(key);
}
export function createAssetRig(owner,player,atlas){
  const data=assets.get(soldierAssetKey(player));if(!data)return null;const {header,buffer,start}=data;
  const geometries=header.geometries.map(description=>{
    const geometry=new THREE.BufferGeometry();for(const [name,attribute] of Object.entries(description.attributes))geometry.setAttribute(name,new THREE.BufferAttribute(new types[attribute.type](buffer,start+attribute.offset,attribute.length),attribute.itemSize,attribute.normalized));
    if(description.index){const index=description.index;geometry.setIndex(new THREE.BufferAttribute(new types[index.type](buffer,start+index.offset,index.length),1));}
    geometry.userData={...description.userData,actorOwned:true};geometry.computeBoundingSphere();return geometry;
  });
  const nodes=header.nodes.map(description=>{
    let node;if(description.type==='bone')node=new THREE.Bone();else if(description.type==='skinned')node=new THREE.SkinnedMesh(geometries[description.geometry],atlas);else if(description.type==='mesh')node=new THREE.Mesh(geometries[description.geometry],new THREE.MeshBasicMaterial(description.material));else node=new THREE.Group();
    node.name=description.name;node.position.fromArray(description.position);node.quaternion.fromArray(description.quaternion);node.scale.fromArray(description.scale);node.visible=description.visible;node.castShadow=description.castShadow;node.receiveShadow=description.receiveShadow;node.frustumCulled=description.frustumCulled;return node;
  });
  header.nodes.forEach((description,index)=>{if(description.parent>=0)nodes[description.parent].add(nodes[index]);});
  const rig={...header.state};for(const [name,index] of Object.entries(header.refs))rig[name]=Array.isArray(index)?index.map(i=>nodes[i]):nodes[index];
  rig.detailGeometry=geometries[header.lods[0]];rig.mediumGeometry=geometries[header.lods[1]];rig.distantGeometry=geometries[header.lods[2]];
  rig.group.updateMatrixWorld(true);rig.body.bind(new THREE.Skeleton(header.bones.map(i=>nodes[i]),header.inverse.map(matrix=>new THREE.Matrix4().fromArray(matrix))),new THREE.Matrix4().fromArray(header.bindMatrix));
  Object.assign(rig,{lastX:player.x,lastZ:player.z,lastShot:player.shotSeq,team:player.team,classId:player.classId,weaponId:player.weaponId});return rig;
}
