
import {Group} from 'three';
import {dressingBatchPivot} from '../../shared/campaign/m05-editor.js';
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
