import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';

const url=new URL('../assets/alhadra/depot-props.glb',import.meta.url).href;
let depotLoad;

export function loadDepotProps(){
  return depotLoad??=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url).then(({scene})=>{
    const materials=new Set();
    scene.traverse(mesh=>{
      if(!mesh.isMesh)return;
      materials.add(mesh.material);
      const uv=mesh.geometry.attributes.uv;
      for(let i=0;i<uv.count;i++)uv.setY(i,1-uv.getY(i));
    });
    for(const material of materials)material.dispose();
    return scene;
  }).catch(error=>{
    depotLoad=null;
    throw error;
  });
}

export class CampaignDepotProps {
  constructor(renderer,asset,parent){
    this.renderer=renderer;
    this.asset=asset;
    this.parent=parent;
    this.materials=new Map();
  }

  create(kind,x,z){
    const model=this.asset.getObjectByName(kind).clone();
    this.parent.add(model);
    if(kind==='DepotTruck')groundCampaignTruck(model,this.renderer.map.terrain,x,z);
    else model.position.set(x,this.renderer.map.terrain.heightAt(x,z),z);
    return model;
  }

  material(surface,high,destroyed){
    const key=[surface,high,destroyed].join('/');
    if(!this.materials.has(key)){
      const source=this.renderer.alhadraModel.surface(surface);
      const material=(high?source:source._lowMaterial).clone();
      if(destroyed)material.color.setRGB(.29,.25,.22);
      this.materials.set(key,material);
    }
    return this.materials.get(key);
  }

  update(model,destroyed=false){
    const high=this.renderer.quality==='high';
    const detail=high&&this.renderer.detailLevel===2;
    const appearance=`${high}/${detail}/${destroyed}`;
    if(model.userData.appearance===appearance)return;
    model.userData.appearance=appearance;
    if(model.name==='FuelDrum'){
      model.rotation.z=destroyed?Math.PI/2:0;
      model.position.y=this.renderer.map.terrain.heightAt(model.position.x,model.position.z)+(destroyed?.55:0);
    }
    model.traverse(mesh=>{
      if(!mesh.isMesh)return;
      const {villageSurface,villageCaster,depotDetail,depotWreck}=mesh.userData;
      mesh.visible=depotWreck?destroyed:
        (!depotDetail||detail)&&(villageSurface!=='canvas'||!destroyed);
      mesh.material=this.material(villageSurface,high,destroyed);
      mesh.castShadow=villageCaster===true;
      mesh.receiveShadow=true;
    });
  }

  dispose(){
    for(const material of this.materials.values())material.dispose();
  }
}

export function groundCampaignTruck(group,terrain,x,z,yaw=0){
  const c=Math.cos(yaw),s=Math.sin(yaw),sample=(lx,lz)=>terrain.heightAt(x+c*lx+s*lz,z-s*lx+c*lz);
  const sx=(sample(1.31,0)-sample(-1.31,0))/2.62,sz=(sample(0,2.4)-sample(0,-2.4))/4.8;
  const base=sample(0,0),correction=Math.max(...[-1.31,1.31].flatMap(lx=>[-2.52,-.84,2.24].map(lz=>sample(lx,lz)-base-sx*lx-sz*lz)));
  group.position.set(x,base+correction,z);group.rotation.set(-Math.atan(sz),yaw,Math.atan(sx),'YXZ');
}
