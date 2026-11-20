import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

let template;
let pending;

export function loadAk12Model() {
  return pending ??= new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
    .loadAsync(new URL('./assets/infantry/ak12m.glb', import.meta.url).href)
    .then(({scene}) => { template = scene; })
    .catch(error => {
      console.warn('АК-12М model:', error);
    });
}

export function cloneAk12Model() {
  return template?.clone(true);
}
