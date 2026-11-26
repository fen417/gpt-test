import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { LONG_BARREL_ID, WEAPON_MODULES } from '../shared/weapon-modules.js';
import {prepareSkinProjection,setWeaponSkin,unpaintedMaterial,updateStockSkin} from './weapon-skins.js';

export const weaponModelUrls = {
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
const detailUrls = { ar416: new URL('./assets/infantry/ar416-high.glb', import.meta.url).href };
const detailTemplates = new Map(), detailLoads = new Map(), detailInstances = new WeakMap();
const mountedParts = new WeakMap();
const upgradeTemplates = new Map();
const upgradeInstances = new WeakMap();
const housingVariants = new WeakMap();
let pending;

function prepareTemplate(scene, id) {
  if (!animatedParts[id].every(part => scene.getObjectByName(part))) {
    throw new Error('Missing animated weapon parts');
  }
  if (!Object.values(moduleSlots).every(slot=>scene.getObjectByName(slot.mount))
      || scene.getObjectByName('Mount_Magazine').parent!==scene.getObjectByName('Magazine')
      || scene.getObjectByName('MagazineBody')?.parent!==scene.getObjectByName('Magazine')) {
    throw new Error('Missing weapon module mounts');
  }
  prepareSkinProjection(scene,id);
  return scene;
}

export function loadWeaponModels() {
  if (pending) return pending;
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const baseModels = Object.entries(weaponModelUrls).map(async ([id, url]) => {
    try {
      const {scene} = await loader.loadAsync(url);
      templates.set(id, prepareTemplate(scene,id));
    } catch (error) {
      console.warn('Weapon model:', id, error);
    }
  });
  const loadUpgrades = (url, entries, prefix) => loader.loadAsync(url).then(({scene}) => {
    for (const [id, part] of entries) {
      for (const weaponId of part.weapons) {
        const name = prefix ? id + '_' + weaponId : weaponId;
        const model = scene.getObjectByName(name) ?? scene.getObjectByName(id + '_Shared');
        if (model) upgradeTemplates.set(id + '/' + weaponId, model);
        else console.warn('Missing weapon upgrade:', id, weaponId);
      }
    }
  }).catch(error => console.warn('Weapon upgrades:', error));
  const barrels = loadUpgrades(new URL('./assets/infantry/long-barrels.glb', import.meta.url).href,
    [[LONG_BARREL_ID, WEAPON_MODULES[LONG_BARREL_ID]]], false);
  const upgrades = loadUpgrades(new URL('./assets/infantry/weapon-upgrades.glb', import.meta.url).href,
    Object.entries(WEAPON_MODULES).filter(([id, part]) => id !== LONG_BARREL_ID && (part.modifiers || part.zooms)), true);
  pending = Promise.all([...baseModels, barrels, upgrades]);
  return pending;
}

export function loadWeaponDetail(id) {
  if (!Object.hasOwn(detailUrls,id)) return;
  if (!detailLoads.has(id)) {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    detailLoads.set(id, loader.loadAsync(detailUrls[id]).then(({scene}) => {
      const surfaces = new Map();
      prepareTemplate(scene,id).traverse(mesh => {
        if (mesh.isMesh) surfaces.set(mesh.name,mesh);
      });
      detailTemplates.set(id,{scene,surfaces});
    }).catch(error=>console.warn('Detailed weapon model:',id,error)));
  }
  return detailLoads.get(id);
}

export function cloneWeaponModel(id, detailed=false) {
  return ((detailed ? detailTemplates.get(id)?.scene : null) ?? templates.get(id))?.clone(true);
}

// Both exports use the same named slots, origins and animation pivots.
// Keep the active hierarchy and switch the geometry on those meshes.
export function setWeaponDetail(root, id, detailed) {
  if (!root || !Object.hasOwn(detailUrls,id)) return false;
  const template = detailTemplates.get(id);
  if (detailed && !template) {
    if (!detailLoads.has(id)) void loadWeaponDetail(id);
    return false;
  }
  let instance = detailInstances.get(root);
  if ((instance?.detailed ?? false) === detailed) return false;
  void setWeaponSkin(root,id,null);
  if (!instance) {
    const pairs = [];
    for (const [name, high] of template.surfaces) {
      const mesh = root.getObjectByName(name);
      if (mesh?.isMesh) pairs.push({mesh, high, low:{geometry:mesh.geometry,material:mesh.material}});
    }
    instance = {pairs,detailed:false};
    detailInstances.set(root,instance);
  }
  for (const {mesh,low,high} of instance.pairs) {
    const source = detailed ? high : low;
    mesh.geometry = source.geometry;
    mesh.material = source.material;
  }
  instance.detailed = detailed;
  return true;
}

export function weaponModuleMount(root,slot) {
  if(!root||!Object.hasOwn(moduleSlots,slot))return null;
  return root.getObjectByName(moduleSlots[slot].mount)??null;
}

function setHousingDetail(part, lowDetail) {
  const variant=housingVariants.get(part);
  if(!variant||variant.low.visible===lowDetail&&variant.high.visible===!lowDetail)return false;
  variant.low.visible=lowDetail;
  variant.high.visible=!lowDetail;
  return true;
}

export function showWeaponUpgrades(root, weaponId, slots, lowDetail=false) {
  if (!root) return false;
  let changed = false;
  for (const slot of ['barrel', 'magazine', 'stock', 'optic']) {
    const socket = weaponModuleMount(root, slot);
    if (!socket) continue;
    const id = slots?.[slot], template = upgradeTemplates.get(id + '/' + weaponId);
    if (slot === 'optic' && id === 'collimator-15') continue;
    const mounted=mountedParts.get(socket)?.part;
    if ((mounted?.name ?? null) === (template?.name ?? null)) {
      if (setHousingDetail(mounted,lowDetail)) changed = true;
      continue;
    }
    let part = null;
    if (template) {
      let instances = upgradeInstances.get(socket);
      if (!instances) upgradeInstances.set(socket, instances = new Map());
      part = instances.get(id);
      if (!part) {
        part = template.clone(true);
        const low=part.getObjectByName(part.name+'_HousingLow');
        const high=low&&part.getObjectByName(part.name+'_Housing');
        if(high)housingVariants.set(part,{low,high});
        for (const name of moduleSlots[slot].stock) {
          const replacement = part.getObjectByName(template.name + '_' + name);
          const stock = root.getObjectByName(name);
          if (replacement?.isMesh && stock?.isMesh) replacement.material = unpaintedMaterial(stock.material);
        }
        instances.set(id, part);
      }
      setHousingDetail(part,lowDetail);
    }
    if (setWeaponModule(root, slot, part)) changed = true;
  }
  return changed;
}

export function upgradeMuzzle(root, target) {
  const socket = weaponModuleMount(root, 'barrel');
  const part = socket && mountedParts.get(socket)?.part;
  const muzzle = part?.getObjectByName(part.name + '_Muzzle');
  if (!muzzle) return false;
  socket.updateMatrix();
  target.copy(muzzle.position).applyMatrix4(socket.matrix);
  return true;
}

export function upgradeOpticEye(root, target) {
  const socket = weaponModuleMount(root, 'optic');
  const part = socket && mountedParts.get(socket)?.part;
  const eye = part?.getObjectByName(part.name + '_Eye');
  if (!eye) return false;
  socket.updateMatrix();
  target.copy(eye.position).applyMatrix4(socket.matrix);
  return true;
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
  if(slot==='stock')updateStockSkin(root,previous?.part,part);
  return true;
}
