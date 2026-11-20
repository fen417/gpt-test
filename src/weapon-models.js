import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const urls = {
  ak12: new URL('./assets/infantry/ak12m.glb', import.meta.url).href,
  ar416: new URL('./assets/infantry/ar416.glb', import.meta.url).href,
  mcx9: new URL('./assets/infantry/mcx9.glb', import.meta.url).href,
  vk45: new URL('./assets/infantry/vk45.glb', import.meta.url).href,
  mg36: new URL('./assets/infantry/mg36.glb', import.meta.url).href,
  pkp: new URL('./assets/infantry/pkp.glb', import.meta.url).href,
  p19: new URL('./assets/infantry/p19.glb', import.meta.url).href,
  m50: new URL('./assets/infantry/m50.glb', import.meta.url).href,
};
const animatedParts = {
  ak12: ['Bolt', 'Magazine'],
  ar416: ['Bolt', 'Magazine'],
  mcx9: ['Bolt', 'Magazine', 'Muzzle_Exit'],
  vk45: ['Bolt', 'Magazine', 'Muzzle_Exit'],
  mg36: ['Bolt', 'Magazine', 'Muzzle_Exit'],
  pkp: ['Bolt', 'Magazine', 'FeedCover', 'Muzzle_Exit'],
  p19: ['Slide', 'Trigger', 'Magazine'],
  m50: ['Slide', 'Trigger', 'Magazine', 'Hammer'],
};
const templates = new Map();
let pending;

export function loadWeaponModels() {
  if (pending) return pending;
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  pending = Promise.all(Object.entries(urls).map(async ([id, url]) => {
    try {
      const {scene} = await loader.loadAsync(url);
      if (!animatedParts[id].every(part => scene.getObjectByName(part))) {
        throw new Error('Missing animated weapon parts');
      }
      templates.set(id, scene);
    } catch (error) {
      console.warn('Weapon model:', id, error);
    }
  }));
  return pending;
}

export function cloneWeaponModel(id) {
  return templates.get(id)?.clone(true);
}
