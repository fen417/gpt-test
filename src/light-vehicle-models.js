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

export const atvModel = vehicleModel(new URL('./assets/atv/atv.glb',import.meta.url).href,[
  'Body','BodyDetail','Controls','ControlDetail','Wheel','WheelLow','Badge',
],'Body');

export const lightVehicleModels = {atv:atvModel,humvee:humveeModel};
