import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {pairMaterials,mapSector} from './visuals.js';

// Colours are baked in linear space, so identical surface/shader settings can
// share one draw without quantising paint colours or changing texture tiling.
export function batchStaticWorld(root,{excluded=new Set(),sectorSize=96}={}){
  root.updateMatrixWorld(true);
  const keys=new WeakMap(),materials=new Map(),batches=new Map(),originals=new Set();
  function signature(material){
    if(keys.has(material))return keys.get(material);
    const meta={textures:{},images:{}};
    for(const value of Object.values(material))if(value?.isTexture)meta.textures[value.uuid]={uuid:value.uuid};
    const data=material.toJSON(meta);
    for(const key of ['uuid','metadata','name','color','vertexColors','userData'])delete data[key];
    const result=JSON.stringify(data)+'/'+material.customProgramCacheKey()+'/'+material.onBeforeCompile.toString();keys.set(material,result);return result;
  }
  function materialKey(material){return signature(material)+'/'+(material._lowMaterial?signature(material._lowMaterial):'');}
  root.traverse(object=>{
    if(!object.isMesh||object.isInstancedMesh||object.children.length||object.userData.noBatch)return;
    for(let node=object;node;node=node.parent)if(excluded.has(node))return;
    const array=Array.isArray(object.material),groups=array?object.geometry.groups:[{start:0,count:object.geometry.index?.count??object.geometry.attributes.position.count,materialIndex:0}];
    if(array&&groups.some(group=>object.material[group.materialIndex]?.transparent))return;
    for(const group of groups){
      const material=array?object.material[group.materialIndex]:object.material;
      if(!material||material.transparent||!material.color)continue;
      if(material._lowMaterial?.color&&!material.color.equals(material._lowMaterial.color))continue;
      const surface=materialKey(material),sector=mapSector(object.matrixWorld,sectorSize);
      const attributes=Object.keys(object.geometry.attributes).filter(name=>name!=='color').sort().join(',');
      const key=`${surface}/${object.castShadow}/${object.receiveShadow}/${sector}/${attributes}`;
      if(!batches.has(key))batches.set(key,{surface,material,parts:[]});
      batches.get(key).parts.push({object,group});
    }
  });
  for(const {surface,material,parts} of batches.values()){
    if(parts.length<2)continue;
    let combinedMaterial=materials.get(surface);
    if(!combinedMaterial){
      const clone=source=>{const m=source.clone();m.color.setRGB(1,1,1);m.vertexColors=true;m.onBeforeCompile=source.onBeforeCompile;return m;};
      combinedMaterial=clone(material);if(material._lowMaterial)pairMaterials(combinedMaterial,clone(material._lowMaterial));materials.set(surface,combinedMaterial);
    }
    const geometries=parts.map(({object,group})=>{
      const original=object.geometry,geometry=original.clone().applyMatrix4(object.matrixWorld);
      const indices=original.index?.array??Uint32Array.from({length:original.attributes.position.count},(_,i)=>i);
      const transformedIndices=Uint32Array.from(indices.subarray(group.start,group.start+group.count));
      if(object.matrixWorld.determinant()<0)for(let i=0;i<transformedIndices.length;i+=3)[transformedIndices[i],transformedIndices[i+1]]=[transformedIndices[i+1],transformedIndices[i]];
      geometry.setIndex(new THREE.BufferAttribute(transformedIndices,1));geometry.clearGroups();
      const originalMaterial=Array.isArray(object.material)?object.material[group.materialIndex]:object.material;
      const originalColour=originalMaterial.vertexColors?original.attributes.color:null,colours=new Float32Array(original.attributes.position.count*3),colour=originalMaterial.color;
      for(let i=0;i<original.attributes.position.count;i++){
        colours[i*3]=colour.r*(originalColour?.getX(i)??1);colours[i*3+1]=colour.g*(originalColour?.getY(i)??1);colours[i*3+2]=colour.b*(originalColour?.getZ(i)??1);
      }
      geometry.setAttribute('color',new THREE.BufferAttribute(colours,3));return geometry;
    });
    const geometry=mergeGeometries(geometries,false);geometries.forEach(g=>g.dispose());
    if(!geometry)continue;
    geometry.computeBoundingSphere();geometry.userData.owned=true;
    const first=parts[0].object,mesh=new THREE.Mesh(geometry,combinedMaterial);mesh.castShadow=first.castShadow;mesh.receiveShadow=first.receiveShadow;root.add(mesh);
    for(const {object,group} of parts){
      // An array-material mesh may have groups that were not merged. Keep only
      // those groups on the source instead of deleting a partly consumed mesh.
      if(Array.isArray(object.material)){
        if(!originals.has(object)){object.geometry=object.geometry.clone();originals.add(object);}
        object.geometry.groups=object.geometry.groups.filter(g=>g.start!==group.start||g.materialIndex!==group.materialIndex);
      }else originals.add(object);
    }
  }
  for(const mesh of originals)if(!Array.isArray(mesh.material)||!mesh.geometry.groups.length){mesh.removeFromParent();if(mesh.geometry.userData.owned||Array.isArray(mesh.material))mesh.geometry.dispose();}
}
