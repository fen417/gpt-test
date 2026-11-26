import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { pairMaterials } from './visuals.js';

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

function vehicleModel(url, names, paintPart) {
  let parts, loading;
  const geometry = name => parts.get(name).geometry;
  return {
    load() {
      return loading ??= loader.loadAsync(url).then(({scene}) => {
        const model = new Map();
        for(const name of names){
          const mesh=scene.getObjectByName(name);
          if(!mesh?.isMesh)throw new Error('Missing vehicle mesh ' + name);
          mesh.geometry.userData.sharedVehicleGeometry=true;
          model.set(name,mesh);
        }
        for(const texture of Object.values(model.get(paintPart).material)){
          if(texture?.isTexture)texture.userData.sharedVehicleTexture=true;
        }
        parts=model;
      }).catch(error=>console.error('Vehicle model',url,error));
    },
    ready: () => Boolean(parts),
    geometry,
    material: name => parts.get(name).material,
    finish(tint) {
      const high=parts.get(paintPart).material.clone();
      if(tint)high.color.setHex(tint);
      return pairMaterials(high,new THREE.MeshLambertMaterial({
        color:high.color,map:high.map,vertexColors:high.vertexColors,
      }));
    },
    part(parent,name,material,castShadow=true) {
      const mesh=new THREE.Mesh(geometry(name),material);
      mesh.name=name;
      mesh.castShadow=castShadow;
      mesh.receiveShadow=!material.transparent;
      parent.add(mesh);
      return mesh;
    },
  };
}

export const humveeModel = vehicleModel(new URL('./assets/humvee/humvee.glb',import.meta.url).href,[
  'BodyPaint','Chassis','ExteriorDetail','Cabin','CabinDetail','Steering',
  'Wheel','WheelLow','Turret','GunVisual','SpeedNeedle','Markings',
  ...Array.from({length:7},(_,i)=>'glass'+i),
],'BodyPaint');

export const humveeRemaster = vehicleModel(new URL('./assets/humvee/humvee-high.glb',import.meta.url).href,[
  'BodyPaint','Chassis','ExteriorDetail','Cabin','CabinDetail','Instruments',
  'Steering','Wheel','Turret','GunVisual','SpeedNeedle','Markings','glass0',
],'BodyPaint');

export const atvModel = vehicleModel(new URL('./assets/atv/atv.glb',import.meta.url).href,[
  'Body','BodyDetail','Controls','ControlDetail','Wheel','WheelLow','Badge',
],'Body');

const blackHawkParts=['Airframe','Cabin','MainRotor','TailRotor','Minigun','MinigunBarrels'];

function prepareBlackHawkScene(scene,prefixes,detailed=false) {
  for(const prefix of prefixes){
    if(!scene.getObjectByName(prefix))throw Error('Missing Black Hawk root '+prefix);
    for(const part of blackHawkParts){
      if(!scene.getObjectByName(`${prefix}_${part}`))throw Error(`Missing Black Hawk part ${part} in ${prefix}`);
    }
  }
  const interiorMaterials=new Map();
  scene.traverse(mesh=>{
    if(!mesh.isMesh)return;
    mesh.geometry.userData.sharedVehicleGeometry=true;
    let high=mesh.material;
    let parent=mesh,interior=false;
    while(parent&&parent!==scene){
      if((detailed?/_Cabin$/:/_Cabin$|_Airframe$/).test(parent.name)){interior=true;break;}
      parent=parent.parent;
    }
    const cabinFinish=detailed?/liner|rubber|canvas|webbing/i:/enamel|liner|rubber|canvas|webbing/i;
    if(interior&&!high.transparent&&cabinFinish.test(high.name)){
      const original=high;
      high=interiorMaterials.get(original);
      if(!high){
        high=original.clone();
        if(!detailed){
          high.metalness=Math.min(high.metalness??0,.12);
          high.color.lerp(new THREE.Color(0x6b7063),.18);
        }
        high.emissive.copy(high.color);
        high.emissiveIntensity=.075;
        high.emissiveMap=high.map;
        interiorMaterials.set(original,high);
      }
      mesh.material=high;
    }
    if(detailed)high.envMapIntensity=high.transparent ? .65 : .42;
    if(high.transparent){
      high.side=THREE.DoubleSide;
      high.depthWrite=false;
    }
    mesh.castShadow=mesh.receiveShadow=!high.transparent;
    if(detailed||high._lowMaterial)return;
    pairMaterials(high,new THREE.MeshLambertMaterial({
      color:high.color,map:high.map,emissive:high.emissive,emissiveMap:high.emissiveMap,emissiveIntensity:high.emissiveIntensity,
      transparent:high.transparent,opacity:high.opacity,depthWrite:high.depthWrite,side:high.side,
    }));
  });
}

let blackHawkScene, blackHawkLoading, blackHawkDetail, blackHawkDetailLoading;
export const blackHawkModel = {
  load() {
    return blackHawkLoading ??= loader.loadAsync(new URL('./assets/black-hawk/black-hawk.glb',import.meta.url).href)
      .then(({scene})=>{
        prepareBlackHawkScene(scene,['LOD0','LOD1','LOD2']);
        blackHawkScene=scene;
      }).catch(error=>{blackHawkLoading=null;console.error('Black Hawk model:',error);});
  },
  loadDetail() {
    return blackHawkDetailLoading ??= loader.loadAsync(new URL('./assets/black-hawk/black-hawk-high.glb',import.meta.url).href)
      .then(({scene})=>{
        prepareBlackHawkScene(scene,['HD'],true);
        blackHawkDetail=scene.getObjectByName('HD');
      }).catch(error=>console.error('Detailed Black Hawk model:',error));
  },
  ready:()=>Boolean(blackHawkScene),
  clone:()=>blackHawkScene.clone(true),
  cloneDetail:()=>blackHawkDetail?.clone(true),
};

export const lightVehicleModels = {
  atv:atvModel,
  humvee:{...humveeModel,loadDetail:humveeRemaster.load},
  'black-hawk':blackHawkModel,
};
