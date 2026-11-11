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
  for(const box of boxes){
    if(Math.abs(origin.x-box.x)>box.w/2+closest||Math.abs(origin.z-box.z)>box.d/2+closest)continue;
    let near=0,far=closest;
    for(const [axis,min,max]of [['x',box.x-box.w/2,box.x+box.w/2],['y',0,box.h],['z',box.z-box.d/2,box.z+box.d/2]]){
      const component=direction[axis];
      if(Math.abs(component)<1e-8){if(origin[axis]<min||origin[axis]>max){far=-1;break;}continue;}
      let a=(min-origin[axis])/component,b=(max-origin[axis])/component;
      if(a>b)[a,b]=[b,a];near=Math.max(near,a);far=Math.min(far,b);if(near>far)break;
    }
    if(near<=far&&far>=0)closest=Math.min(closest,Math.max(0,near));
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
