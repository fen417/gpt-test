import * as THREE from 'three';
import { FPS_HANDS } from './fps-hands-data.js';

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
  // The source ambient occlusion has its own UV set.
  textures.ao = textures.orm.clone(); textures.ao.channel = 1;
  return textures;
}

function unpack(text, Type, scale) {
  const binary = atob(text), bytes = new Uint8Array(binary.length);
  for (let i = 0; i < bytes.length; i++) bytes[i] = binary.charCodeAt(i);
  const packed = new Type(bytes.buffer);
  return scale === 1 ? packed : Float32Array.from(packed, value => value / scale);
}

export function createFPSHand(pose, material) {
  if (!geometries.has(pose)) {
    const data = FPS_HANDS[pose];
    if (!data) throw new Error(`Unknown first-person hand pose: ${pose}`);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(unpack(data.p, Int16Array, 100000), 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(unpack(data.n, Int16Array, 32767), 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(unpack(data.uv, Uint16Array, 65535), 2));
    geometry.setAttribute('uv1', new THREE.BufferAttribute(unpack(data.uv1, Uint16Array, 65535), 2));
    geometry.setIndex(new THREE.BufferAttribute(unpack(data.index, Uint16Array, 1), 1));
    geometry.morphAttributes.position = [new THREE.BufferAttribute(unpack(data.morph, Int16Array, 100000), 3)];
    geometry.morphAttributes.normal = [new THREE.BufferAttribute(unpack(data.morphN, Int16Array, 16000), 3)];
    geometry.morphTargetsRelative = true;
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    geometries.set(pose, geometry);
  }
  // Each rig owns its clone. Cached decoded data survives weapon-rig disposal.
  const hand = new THREE.Mesh(geometries.get(pose).clone(), material);
  hand.name = `imported-fps-hand-${pose}`;
  return hand;
}
