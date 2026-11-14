import * as THREE from 'three';
import { MeshoptSimplifier } from 'meshoptimizer/simplifier';

await MeshoptSimplifier.ready;

// Keep original vertices (including the exact four bone IDs/weights). Only
// topology changes; joint weights are never averaged across independent limbs.
export function simplifySoldier(source,triangles,error=.04){
  const count=source.attributes.position.count,stride=16,attributes=new Float32Array(count*stride);
  const channels=[['normal',3],['uv',2],['color',3],['skinIndex',4],['skinWeight',4]];
  for(let i=0;i<count;i++){let at=i*stride;for(const [name,size] of channels){const a=source.attributes[name];for(let k=0;k<size;k++)attributes[at++]=a.array[i*size+k]/(name==='skinIndex'?32:1);}}
  const [indices,deviation]=MeshoptSimplifier.simplifyWithAttributes(Uint32Array.from(source.index.array),source.attributes.position.array,3,attributes,stride,[.2,.2,.2,1,1,1,1,1,8,8,8,8,8,8,8,8],null,triangles*3,error,['Permissive','Prune']);
  const remap=new Map(),vertices=[],compact=Uint32Array.from(indices,index=>{if(!remap.has(index)){remap.set(index,vertices.length);vertices.push(index);}return remap.get(index);});
  const result=new THREE.BufferGeometry();
  for(const [name,attr] of Object.entries(source.attributes)){
    const array=new attr.array.constructor(vertices.length*attr.itemSize);
    for(let i=0;i<vertices.length;i++)for(let k=0;k<attr.itemSize;k++)array[i*attr.itemSize+k]=attr.array[vertices[i]*attr.itemSize+k];
    result.setAttribute(name,new THREE.BufferAttribute(array,attr.itemSize,attr.normalized));
  }
  result.setIndex(new THREE.BufferAttribute(compact,1));result.computeBoundingSphere();result.userData={...source.userData,actorOwned:true,simplificationError:deviation};return result;
}
