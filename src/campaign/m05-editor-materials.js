
import {DoubleSide,FrontSide} from 'three';
// Slot IDs use the traversal order of the immutable imported GLB, not UUIDs.
export function materialSlots(root){
  const out=[];let i=0;
  root.traverse(n=>{if(!n.isMesh)return;for(const [j,material] of [n.material].flat().entries())if(material)out.push({key:i+':'+j,node:n,index:j,material});i++;});
  return out;
}
export function releaseEditorMaterials(root){
  root.traverse(n=>{if(!n.isMesh)return;for(const mat of [n.material].flat())if(mat?.userData.editorMaterialOverride)mat.dispose();});
}
export function applyEditorMaterials(root,overrides={}){
  const slots=materialSlots(root);
  for(const {key,node,index,material} of slots){
    const values=overrides[key];if(!values)continue;
    const mat=material.clone();mat.userData.editorMaterialOverride=true;
    for(const [k,v] of Object.entries(values)){
      if(k==='color'||k==='emissive')mat[k]?.set(v);
      else if(k==='normalStrength')mat.normalScale?.set(v,v);
      else if(k==='doubleSide')mat.side=v?DoubleSide:FrontSide;
      else if(k in mat)mat[k]=v;
    }
    if(values.opacity!==undefined){mat.transparent=values.opacity<1||material.transparent;mat.depthWrite=!mat.transparent;}
    mat.needsUpdate=true;
    if(Array.isArray(node.material)){const a=node.material.slice();a[index]=mat;node.material=a;}else node.material=mat;
  }
}
