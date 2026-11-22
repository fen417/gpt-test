import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const urls = {
  ak12: new URL('./assets/infantry/ak12m.glb', import.meta.url).href,
  ar416: new URL('./assets/infantry/ar416.glb', import.meta.url).href,
  mcx9: new URL('./assets/infantry/mcx9.glb', import.meta.url).href,
  vk45: new URL('./assets/infantry/vk45.glb', import.meta.url).href,
  mg36: new URL('./assets/infantry/mg36.glb', import.meta.url).href,
  pkp: new URL('./assets/infantry/pkp.glb', import.meta.url).href,
  dmr12: new URL('./assets/infantry/dmr12.glb', import.meta.url).href,
  sv98: new URL('./assets/infantry/sv98.glb', import.meta.url).href,
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
  dmr12: ['Bolt', 'Magazine', 'Optic', 'Scope_Eye', 'Muzzle_Exit'],
  sv98: ['Bolt', 'Magazine', 'Optic', 'Scope_Eye', 'Muzzle_Exit'],
  p19: ['Slide', 'Trigger', 'Magazine'],
  m50: ['Slide', 'Trigger', 'Magazine', 'Hammer'],
};
const moduleSlots = {
  optic: {mount:'Mount_Optic',stock:['Optic','Sights','IronSights','CarrySight','FrontSight','RearSight']},
  barrel: {mount:'Mount_Barrel',stock:['Barrel','MuzzleDevice']},
  magazine: {mount:'Mount_Magazine',stock:['MagazineBody']},
  stock: {mount:'Mount_Stock',stock:['Stock']},
};
const templates = new Map();
const mountedParts = new WeakMap();
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
      if (!Object.values(moduleSlots).every(slot=>scene.getObjectByName(slot.mount))
          || scene.getObjectByName('Mount_Magazine').parent!==scene.getObjectByName('Magazine')
          || scene.getObjectByName('MagazineBody')?.parent!==scene.getObjectByName('Magazine')) {
        throw new Error('Missing weapon module mounts');
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

export function weaponModuleMount(root,slot) {
  if(!root||!Object.hasOwn(moduleSlots,slot))return null;
  return root.getObjectByName(moduleSlots[slot].mount)??null;
}

// A module is authored in the coordinate system of its socket. Magazine
// visuals sit below the existing reload pivot, so it keeps moving even when
// its stock geometry is hidden.
export function setWeaponModule(root,slot,part) {
  const socket=weaponModuleMount(root,slot);
  if(!socket)return false;
  const previous=mountedParts.get(socket);
  if(previous?.part===part)return true;
  if(previous){
    previous.part.removeFromParent();
    for(const [object,visible] of previous.stock)object.visible=visible;
    mountedParts.delete(socket);
  }
  if(part){
    const stock=moduleSlots[slot].stock.map(name=>root.getObjectByName(name))
      .filter(Boolean).map(object=>[object,object.visible]);
    for(const [object] of stock)object.visible=false;
    part.traverse(object=>{object.layers.mask=root.layers.mask;});
    socket.add(part);
    mountedParts.set(socket,{part,stock});
  }
  return true;
}
