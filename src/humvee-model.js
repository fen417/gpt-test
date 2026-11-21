import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { pairMaterials } from './visuals.js';

const partNames = [
  'BodyPaint', 'Chassis', 'ExteriorDetail', 'Cabin', 'CabinDetail', 'Steering',
  'Wheel', 'WheelLow', 'Turret', 'GunVisual', 'SpeedNeedle', 'Markings',
  ...Array.from({ length: 7 }, (_, i) => 'glass' + i),
];
let parts, loading;

export function loadHumveeAssets() {
  return loading ??= new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
    .loadAsync(new URL('./assets/humvee/humvee.glb', import.meta.url).href)
    .then(({ scene }) => {
      const model = new Map();
      for (const name of partNames) {
        const mesh = scene.getObjectByName(name);
        if (!mesh?.isMesh) throw new Error('Missing Humvee mesh ' + name);
        mesh.geometry.userData.sharedHumveeGeometry = true;
        model.set(name, mesh);
      }
      for (const texture of Object.values(model.get('BodyPaint').material)) {
        if (texture?.isTexture) texture.userData.sharedHumveeTexture = true;
      }
      parts = model;
    })
    .catch(error => console.error('Humvee assets', error));
}

export const humveeAssetsReady = () => !!parts;
export const humveeGeometry = name => parts.get(name).geometry;

export function humveeFinish(tint) {
  const high = parts.get('BodyPaint').material.clone();
  if (tint) high.color.setHex(tint);
  return pairMaterials(high, new THREE.MeshLambertMaterial({
    color: high.color, map: high.map, vertexColors: high.vertexColors,
  }));
}

export function humveePart(parent, name, material, castShadow = true) {
  const mesh = new THREE.Mesh(humveeGeometry(name), material);
  mesh.name = name;
  mesh.castShadow = castShadow;
  mesh.receiveShadow = !material.transparent;
  parent.add(mesh);
  return mesh;
}
