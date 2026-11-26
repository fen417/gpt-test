import * as THREE from 'three';
import { FPS_HANDS, FPS_ARM_POSITION_SCALE, loadFPSHands as loadDefaultHands } from './fps-hands-data.js';
let gripProfiles={};
let pendingProfiles;
export async function loadFPSHands(){
  pendingProfiles??=fetch(new URL('./assets/grip-overrides.json',import.meta.url))
    .then(response=>{if(!response.ok)throw Error('Grip profiles '+response.status);return response.json();})
    .then(data=>{gripProfiles=data;})
    .catch(error=>{console.warn('Custom FPS grips unavailable',error);});
  await Promise.all([loadDefaultHands(),pendingProfiles]);
}
export function savedGrip(weapon,side){return gripProfiles[weapon]?.[side]??null;}

// Each editor/weapon rig owns its custom geometry; defaults remain intact.
function decodedGripGeometry(fields){
  const data=Object.fromEntries(Object.entries(fields).map(([name,encoded])=>[name,Uint8Array.from(atob(encoded),c=>c.charCodeAt(0))]));
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(unpack(data.p,Int16Array,FPS_ARM_POSITION_SCALE),3));
  geometry.setAttribute('normal',new THREE.BufferAttribute(unpack(data.n,Int16Array,32767),3));
  geometry.setAttribute('uv',new THREE.BufferAttribute(unpack(data.uv,Uint16Array,65535),2));
  geometry.setIndex(new THREE.BufferAttribute(unpack(data.index,Uint16Array,1),1));
  if(data.morph){
    geometry.morphAttributes.position=[new THREE.BufferAttribute(unpack(data.morph,Int16Array,FPS_ARM_POSITION_SCALE),3)];
    geometry.morphAttributes.normal=[new THREE.BufferAttribute(unpack(data.morphN,Int16Array,16000),3)];
    geometry.morphTargetsRelative=true;
  }
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  return geometry;
}
export function createGripApplier(mesh,wrist,owned){
  const base=mesh.geometry,offset=new THREE.Vector3(),rotatedWrist=new THREE.Vector3();
  const euler=new THREE.Euler();
  let previous=null,fields=null;
  return entry=>{
    if(entry===previous)return offset;
    previous=entry;
    if((entry?.geometry??null)!==fields){
      fields=entry?.geometry??null;
      if(mesh.geometry!==base){owned.delete(mesh.geometry);mesh.geometry.dispose();}
      mesh.geometry=fields?decodedGripGeometry(fields):base;
      if(fields)owned.add(mesh.geometry);
      mesh.updateMorphTargets();
    }
    const p=entry?.params;
    offset.fromArray(p?.position??[0,0,0]);
    const r=p?.rotation??[0,0,0];
    mesh.quaternion.setFromEuler(euler.set(...r.map(THREE.MathUtils.degToRad)));
    // Rotate around the cuff, not around the weapon origin.
    rotatedWrist.copy(wrist).applyQuaternion(mesh.quaternion);
    mesh.position.copy(wrist).sub(rotatedWrist).add(offset);
    return offset;
  };
}

const geometries = new Map();
let textures;
// Shared source maps; rig disposal must not dispose these global assets.
export function fpsHandTextures() {
  if (textures) return textures;
  const loader = new THREE.TextureLoader();
  const load = (url, color = false) => {
    const texture = loader.load(url);
    texture.flipY = false;
    texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.anisotropy = 4;
    return texture;
  };
  textures = {
    color: load(new URL('./assets/fps-hands/basecolor.webp', import.meta.url).href, true),
    normal: load(new URL('./assets/fps-hands/normal.webp', import.meta.url).href),
    orm: load(new URL('./assets/fps-hands/orm.webp', import.meta.url).href),
  };
  return textures;
}

function unpack(bytes,Type,scale){
  const packed=new Type(bytes.buffer,bytes.byteOffset,bytes.byteLength/Type.BYTES_PER_ELEMENT);
  return scale===1?packed:Float32Array.from(packed,value=>value/scale);
}

function createFPSPart(pose, material) {
  if (!geometries.has(pose)) {
    const data = FPS_HANDS[pose];
    if (!data) throw new Error(`Unknown first-person hand pose: ${pose}`);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(unpack(data.p, Int16Array, FPS_ARM_POSITION_SCALE), 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(unpack(data.n, Int16Array, 32767), 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(unpack(data.uv, Uint16Array, 65535), 2));
    geometry.setIndex(new THREE.BufferAttribute(unpack(data.index, Uint16Array, 1), 1));
    if (data.morph) {
      geometry.morphAttributes.position = [new THREE.BufferAttribute(unpack(data.morph, Int16Array, FPS_ARM_POSITION_SCALE), 3)];
      geometry.morphAttributes.normal = [new THREE.BufferAttribute(unpack(data.morphN, Int16Array, 16000), 3)];
      geometry.morphTargetsRelative = true;
    }
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    geometries.set(pose, geometry);
  }
  // Each rig owns its clone. Cached decoded data survives weapon-rig disposal.
  return new THREE.Mesh(geometries.get(pose).clone(), material);
}

export function createFPSHand(pose, material) {
  const hand = createFPSPart(pose, material);
  hand.name = `imported-fps-hand-${pose}`;
  return hand;
}

export function createFPSSleeve(side, material, shoulder, wrist) {
  const sleeve = createFPSPart('sleeve' + side, material);
  const direction = wrist.clone().sub(shoulder);
  const length = direction.length();
  const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction.normalize());
  sleeve.geometry.applyMatrix4(new THREE.Matrix4().compose(shoulder, rotation, new THREE.Vector3(1, 1, length / .6)));
  sleeve.name = `imported-fps-sleeve-${side.toLowerCase()}`;
  return sleeve;
}
