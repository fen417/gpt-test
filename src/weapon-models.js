import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const urls = {
  ak12: new URL('./assets/infantry/ak12m.glb', import.meta.url).href,
  ar416: new URL('./assets/infantry/ar416.glb', import.meta.url).href,
  p19: new URL('./assets/infantry/p19.glb', import.meta.url).href,
  m50: new URL('./assets/infantry/m50.glb', import.meta.url).href,
};
const animatedParts = {
  ak12: ['Bolt', 'Magazine'],
  ar416: ['Bolt', 'Magazine'],
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
