import { rayCollider } from '../shared/asset-colliders.js';
import { boxBounds } from '../shared/geometry.js';
import { SpatialIndex } from '../shared/spatial-index.js';
const coverIndices=new WeakMap(),coverCandidates=[];
// View models get their own depth pass, while retaining normal self-occlusion.
export const VIEWMODEL_LAYER=1;
export function prepareViewModel(group){
  group.traverse(object=>{
    object.layers.set(VIEWMODEL_LAYER);
    if(!object.isMesh)return;
    object.castShadow=false;object.receiveShadow=false;object.renderOrder=0;
    for(const material of Array.isArray(object.material)?object.material:[object.material]){
      const changed=!material.depthTest||(!material.transparent&&!material.depthWrite);
      material.depthTest=true;if(!material.transparent)material.depthWrite=true;
      if(changed)material.needsUpdate=true;
    }
  });
}

export function distanceToCover(origin,direction,boxes,maxDistance=1.6){
  let closest=maxDistance;
  let index=coverIndices.get(boxes);
  if(!index){index=new SpatialIndex(boxes,8,b=>b.minX===undefined?boxBounds(b):b);coverIndices.set(boxes,index);}
  const endX=origin.x+direction.x*maxDistance,endZ=origin.z+direction.z*maxDistance;
  for (const box of index.query(Math.min(origin.x,endX),Math.min(origin.z,endZ),Math.max(origin.x,endX),Math.max(origin.z,endZ),coverCandidates)) {
    const collider = box.minX === undefined ? boxBounds(box) : box;
    closest = Math.min(closest, rayCollider(origin, direction, collider, closest));
  }
  return closest;
}

export function drawWorldAndViewModel(renderer,scene,camera,weapon,worldRoot){
  const mask=camera.layers.mask,autoClear=renderer.autoClear,autoReset=renderer.info.autoReset;
  const background=scene.background;
  const shadowAutoUpdate=renderer.shadowMap?.autoUpdate;
  const worldVisible=worldRoot?.visible;
  const updateWorld=scene.matrixWorldAutoUpdate;
  renderer.info.autoReset=false;renderer.info.reset();
  try{
    renderer.autoClear=true;camera.layers.set(0);renderer.render(scene,camera);
    if(weapon?.visible){
      // A solid scene background forces Three.js to clear color even with autoClear off.
      scene.background=null;
      if(renderer.shadowMap)renderer.shadowMap.autoUpdate=false;
      if(worldRoot)worldRoot.visible=false;
      // Both passes share a camera and transforms. The first pass already updated them.
      scene.matrixWorldAutoUpdate=false;
      renderer.autoClear=false;renderer.clearDepth();camera.layers.set(VIEWMODEL_LAYER);renderer.render(scene,camera);
    }
  }finally{
    scene.background=background;
    if(worldRoot)worldRoot.visible=worldVisible;
    scene.matrixWorldAutoUpdate=updateWorld;
    camera.layers.mask=mask;
    renderer.autoClear=autoClear;
    renderer.info.autoReset=autoReset;
    if(renderer.shadowMap)renderer.shadowMap.autoUpdate=shadowAutoUpdate;
  }
}
