import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

const attrKey=g=>Object.entries(g.attributes).sort(([a],[b])=>a.localeCompare(b)).map(([k,a])=>[k,a.itemSize,a.normalized,a.array?.constructor.name,a.gpuType].join(':')).join('/')+'/'+Boolean(g.index);
const eligible=g=>g&&g.attributes.position&&!Object.keys(g.morphAttributes).length&&Object.values(g.attributes).every(a=>a.isBufferAttribute&&!a.isInterleavedBufferAttribute&&!a.isFloat16BufferAttribute&&!a.isInstancedBufferAttribute)&&g.drawRange.start===0&&g.drawRange.count>= (g.index?.count??g.attributes.position.count);
const sameSkeleton=(a,b)=>a.bones.length===b.bones.length&&a.bones.every((bone,i)=>bone===b.bones[i]&&a.boneInverses[i].equals(b.boneInverses[i]));

// Preserve every vertex and its skin weights. Only combine truly identical
// bind spaces, skeletons, material and independent visibility. Optional
// pouches are excluded; their per-soldier selection must survive.
export function batchInfantryBody(scene,levels){
  const candidates=[],consumed=new Set(),mergedLods=new Map(),replaced=new Set();let saved=0;
  for(const [name,lods] of levels){
    const node=scene.getObjectByName(name);
    if(!node||node.userData.optionalPouch)continue;
    let index=0;
    node.traverse(mesh=>{
      if(!mesh.isMesh)return;
      const slot=index++,geometries=[mesh.geometry,...[1,2,3].map(i=>lods[i]?.[slot])];
      if(!mesh.isSkinnedMesh||mesh.children.length||!mesh.visible||!mesh.material||Array.isArray(mesh.material)||mesh.material.transparent||!geometries.every(eligible))return;
      candidates.push({node,mesh,slot,geometries,keys:geometries.map(attrKey).join('|')});
    });
  }
  for(const a of candidates){
    if(consumed.has(a))continue;
    // Restrict to sibling base meshes with an identical local transform.
    const group=candidates.filter(b=>!consumed.has(b)&&a.mesh.parent===b.mesh.parent&&a.mesh.material===b.mesh.material&&a.keys===b.keys&&a.mesh.matrix.equals(b.mesh.matrix)&&a.mesh.bindMode===b.mesh.bindMode&&a.mesh.bindMatrix.equals(b.mesh.bindMatrix)&&sameSkeleton(a.mesh.skeleton,b.mesh.skeleton));
    if(group.length<2)continue;
    // Keep the original traversal count/indices used by the LOD registry:
    // skip absorbed mesh slots instead of removing their node.
    const merged=[0,1,2,3].map(i=>mergeGeometries(group.map(b=>b.geometries[i]),false));
    if(merged.some(g=>!g)){merged.forEach(g=>g?.dispose());continue;}
    replaced.add(a.mesh.geometry);a.mesh.geometry=merged[0];mergedLods.set(a.node.name+'/'+a.slot,merged);
    for(const b of group.slice(1)){b.mesh.userData.batchedBodyHidden=true;b.mesh.visible=false;}
    for(const b of group)consumed.add(b);
    saved+=group.length-1;
  }
  return {saved,mergedLods,replaced};
}

// Frozen floor pickups need neither animated pivots nor hidden variants.
// Merge opaque, rigid surfaces using the original material and UVs.
export function batchRigidPickup(root){
  root.updateMatrixWorld(true);
  const inverse=root.matrixWorld.clone().invert(),batches=new Map(),owned=new Set();
  root.traverseVisible(mesh=>{
    if(!mesh.isMesh||mesh.isSkinnedMesh||mesh.isInstancedMesh||mesh.children.length||Array.isArray(mesh.material)||!mesh.material||mesh.material.transparent||!eligible(mesh.geometry)||mesh.matrixWorld.determinant()<=0)return;
    const key=mesh.material.uuid+'/'+attrKey(mesh.geometry);
    if(!batches.has(key))batches.set(key,[]);
    batches.get(key).push(mesh);
  });
  let saved=0;
  for(const meshes of batches.values()){
    if(meshes.length<2)continue;
    const pieces=meshes.map(mesh=>mesh.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,mesh.matrixWorld)));
    const merged=mergeGeometries(pieces,false);pieces.forEach(g=>g.dispose());if(!merged)continue;
    const batch=new THREE.Mesh(merged,meshes[0].material);
    batch.castShadow=false;batch.receiveShadow=false;root.add(batch);owned.add(merged);
    for(const mesh of meshes)mesh.removeFromParent();
    saved+=meshes.length-1;
  }
  return {saved,owned};
}
