import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const urls = {
  ak12: new URL('./assets/infantry/ak12m.glb', import.meta.url).href,
  ar416: new URL('./assets/infantry/ar416.glb', import.meta.url).href,
};
const templates = new Map();
let pending;

export function loadRifleModels() {
  if (pending) return pending;
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  pending = Promise.all(Object.entries(urls).map(async ([id, url]) => {
    try {
      const {scene} = await loader.loadAsync(url);
      if (!scene.getObjectByName('Magazine') || !scene.getObjectByName('Bolt')) {
        throw new Error('Missing animated rifle parts');
      }
      templates.set(id, scene);
    } catch (error) {
      console.warn('Rifle model:', id, error);
    }
  }));
  return pending;
}

export function cloneRifleModel(id) {
  return templates.get(id)?.clone(true);
}
