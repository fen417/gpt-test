
import {Group,Mesh,Matrix4} from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {dressingBatchPivot,dressingBatchName,dressingPropTransform} from '../../shared/campaign/m05-editor.js';
// The GLB exporter puts each spatial batch at the original 48 m pivot.
// Wrap the original mesh, never rewrite the baked geometry.
export function wrapDressingBatches(scene,edits={}){
 for(const node of [...scene.children]){
  if(!/^m05_(set|detail)_-?\d+_-?\d+$/.test(node.name))continue;
  const name=node.name,pivot=dressingBatchPivot(name),wrapper=new Group();
  wrapper.name=name;wrapper.position.fromArray(pivot);wrapper.userData.dressingBatch=true;
  node.name=name+'-mesh';
  node.position.x-=pivot[0];node.position.y-=pivot[1];node.position.z-=pivot[2];
  scene.add(wrapper);wrapper.add(node);applyDressingNodeEdit(wrapper,edits[name]);
 }
}
export function applyDressingNodeEdit(node,edit){
 const p=dressingBatchPivot(node.name);
 node.position.fromArray(edit?.position??p);node.rotation.set(...(edit?.rotation??[0,0,0]),'XYZ');node.scale.setScalar(edit?.scale??1);
 node.userData.dressingRemoved=Boolean(edit?.removed);node.visible=!node.userData.dressingRemoved;node.updateMatrixWorld(true);
}

export async function loadDressingSource(){
 const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
 return (await loader.loadAsync(import.meta.env.BASE_URL+'campaign/m05/dressing-source.glb')).scene;
}
export function applyPropNode(node,prop,edit){
 const t=edit??dressingPropTransform(prop);
 node.position.fromArray(t.position);node.rotation.set(...t.rotation,'XYZ');node.scale.setScalar(t.scale);
 node.userData.propRemoved=Boolean(t.removed);node.visible=!node.userData.propRemoved;node.updateMatrixWorld(true);
}
// Editor keeps named instances editable. Runtime merges only affected batches;
// untouched ones keep their original packed GLB exactly as before.
export function expandDressing(scene,source,props,edits={},editor=false){
 const originals=new Map();source.traverse(n=>{if(n.name.startsWith('m05-dress-'))originals.set(n.name,n);});
 const batches=new Map(scene.children.filter(n=>n.userData.dressingBatch).map(n=>[n.name,n]));
 const affected=new Set(props.filter(p=>Object.hasOwn(edits,p.id)).map(dressingBatchName));
 const selected=props.filter(p=>editor||affected.has(dressingBatchName(p)));
 for(const p of selected)if(!originals.has(p.id)||!batches.has(dressingBatchName(p)))throw Error('Исходная модель не совпадает с картой: '+p.id);
 const expanded=new Map();
 for(const p of selected){
  const name=dressingBatchName(p),batch=batches.get(name);
  if(!expanded.has(name)){
   const group=new Group();group.name=name+'-individual';batch.add(group);expanded.set(name,group);
   const baked=batch.children.find(n=>n.name===name+'-mesh');if(baked)baked.visible=false;
  }
  const original=originals.get(p.id),node=original.clone(true);
  node.name=p.id;node.userData.editorProp=p.id;applyPropNode(node,p,edits[p.id]);expanded.get(name).add(node);
 }
 if(!editor)for(const [name,group] of expanded){
  // Merge by material + attribute layout to preserve the original shading.
  const buckets=new Map();
  for(const node of group.children){
   if(!node.visible)continue;
   node.updateMatrixWorld(true);
   node.traverse(mesh=>{
    if(!mesh.isMesh||Array.isArray(mesh.material))return;
    const g=mesh.geometry.clone();
    // The group's parent may itself be transformed by the batch editor.
    const inverse=group.matrixWorld.clone().invert(),matrix=new Matrix4().multiplyMatrices(inverse,mesh.matrixWorld);
    g.applyMatrix4(matrix);
    const key=mesh.material.uuid+':'+Object.keys(g.attributes).sort().join(',')+':'+!!g.index;
    if(!buckets.has(key))buckets.set(key,{mat:mesh.material,geometries:[]});buckets.get(key).geometries.push(g);
   });
  }
  const merged=[];
  for(const {mat,geometries} of buckets.values()){
   const g=mergeGeometries(geometries);
   if(!g){for(const geo of geometries)geo.dispose();continue;}
   for(const geo of geometries)geo.dispose();const mesh=new Mesh(g,mat);mesh.name=name+'-merged';merged.push(mesh);
  }
  // If merging is unsupported, preserve the unmerged objects instead.
  if(merged.length===buckets.size&&merged.length){group.clear();group.add(...merged);}else for(const mesh of merged)mesh.geometry.dispose();
 }
 return expanded;
}
