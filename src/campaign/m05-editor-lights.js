
import {Group,PointLight,SpotLight,Vector3,Euler} from 'three';
export function createEditorLights(definitions=[]){
 const root=new Group();root.name='world-editor-lights';
 for(const d of definitions){
  const node=new Group();node.name=d.id;node.position.fromArray(d.position);node.userData.lightDefinition=d;
  const light=d.type==='spot'?new SpotLight(d.color,d.intensity,d.distance,d.angle,d.penumbra,2):new PointLight(d.color,d.intensity,d.distance,2);
  node.add(light);
  if(light.isSpotLight){
   light.target.position.copy(new Vector3(0,0,-1).applyEuler(new Euler(...d.rotation,'XYZ')));node.add(light.target);
   light.shadow.mapSize.set(512,512);light.shadow.camera.near=.2;light.shadow.camera.far=d.distance;light.shadow.bias=-.0002;light.shadow.normalBias=.02;
  }
  root.add(node);
 }
 return root;
}
// Cap simultaneous lights, especially on integrated GPUs. Authoring order
// is the priority; shadow maps are deliberately limited to two spotlights.
export function updateEditorLights(root,quality){
 if(!root)return;
 let left=quality==='high'?8:quality==='medium'?4:2,shadows=quality==='high'?2:0;
 for(const node of root.children){
  const d=node.userData.lightDefinition,light=node.children[0];
  const allowed=d.detail==='low'||d.detail==='medium'&&quality!=='low'||d.detail==='high'&&quality==='high';
  const on=allowed&&left>0;if(on)left--;
  node.visible=on;const cast=on&&light.isSpotLight&&d.shadow&&shadows>0;if(cast)shadows--;
  if(light.castShadow&&!cast)light.shadow?.dispose();light.castShadow=cast;
 }
}
export function disposeEditorLights(root){root?.traverse(n=>{if(n.isLight)n.shadow?.dispose();});root?.removeFromParent();}
