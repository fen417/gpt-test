import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { SafeWebGpuKtx2Loader } from './webgpu-ktx2.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { showWeaponUpgrades, weaponModelUrls } from './weapon-models.js';
import {batchInfantryBody} from './model-batching.js';
import {prepareSkinProjection} from './weapon-skins.js';
import { HORIZON_OPTIC_ID, weaponAttachmentsFromFlags } from '../shared/weapon-modules.js';

const weaponNames = {
  ar416: 'ar416', ak12: 'ak12m', mcx9: 'mcx9', vk45: 'vk45',
  mg36: 'mg36', pkp: 'pkp', sv98: 'sv98', dmr12: 'dmr12', p19: 'p19', m50: 'm50',
};
const assetUrls = {
  regular: new URL('./assets/infantry/regular.glb', import.meta.url).href,
  militia: new URL('./assets/infantry/militia.glb', import.meta.url).href,
  'blue-kit': new URL('./assets/infantry/blue-kit.glb', import.meta.url).href,
  'field-kit': new URL('./assets/infantry/field-kit.glb', import.meta.url).href,
  ...Object.fromEntries(Object.entries(weaponNames).map(([id, asset]) => [asset, weaponModelUrls[id]])),
};
const weaponAsset = id => Object.hasOwn(weaponNames, id) ? weaponNames[id] : 'dmr12';
const weaponFit = {
  mg36: { primary: [0, -.138, .077], support: [-.043, -.044, -.440], scale: .72 },
  pkp: { primary: [0, -.138, .077], support: [-.042, -.052, -.435], scale: .73 },
  ak12m: { primary: [0, -.134, .05], support: [-.042, -.043, -.415], muzzle: [0, .015, -.865], scale: .74 },
  ar416: { primary: [0, -.137, .072], support: [-.042, -.045, -.423], muzzle: [0, .015, -.863], scale: .74 },
  mcx9: { primary: [0, -.125, .078], support: [-.044, -.050, -.411], scale: .74 },
  vk45: { primary: [0, -.112, .084], support: [-.045, -.050, -.420], scale: .76 },
  dmr12: { primary: [0, -.132, .074], support: [-.045, -.050, -.452], scale: .72 },
  sv98: { primary: [0, -.132, .075], support: [-.046, -.050, -.460], scale: .74 },
  p19: { primary: [0, -.096, .108], support: [-.033, -.124, .113], muzzle: [0, .012, -.185], scale: .57, pistol: true },
  m50: { primary: [0, -.096, .097], support: [-.036, -.125, .106], muzzle: [0, .012, -.258], scale: .64, pistol: true },
};
const keyOf = name => name.replace(/^mixamorig:?/, '').replace(/_\d+$/, '');
const upperBody = /^(Spine|Neck|Head|Left(?:Arm|Shoulder|ForeArm|Hand)|Right(?:Arm|Shoulder|ForeArm|Hand))/;
const from = array => new THREE.Vector3().fromArray(array);

export const gaitClips = {
  walk: ['mocap_walk_F', 'mocap_walk_R', 'mocap_walk_B', 'mocap_walk_L'],
  run: ['mocap_run_F', 'mocap_walk_R', 'mocap_jog_B', 'mocap_walk_L'],
  sprint: ['mocap_run_F', 'mocap_walk_R', 'mocap_jog_B', 'mocap_walk_L'],
  crouch: ['mocap_crouch_F', 'mocap_crouch_R', 'mocap_crouch_B', 'mocap_crouch_L'],
};
const directions = {
  F: [0, 0, -1], R: [1, 0, 0], B: [0, 0, 1], L: [-1, 0, 0],
};
export const legNames = ['Left', 'Right'];
export function findInfantryBones(root) {
  const result = {};
  root.traverse(node => {
    if (node.isBone && node.name.startsWith('mixamorig')) result[keyOf(node.name)] ??= node;
  });
  return result;
}

// Captures may have unequal endpoints after retargeting. Weld the seam
// over a short window before extracting contacts or creating the body layers.
function closeLoop(clip){
  const duration=clip.duration;
  if(!(duration>.05))return;
  const window=Math.min(.14,duration*.14);
  for(const track of clip.tracks){
    const stride=track.getValueSize(),quat=track.ValueTypeName==='quaternion';
    if(!stride||(!quat&&track.ValueTypeName!=='vector'&&track.ValueTypeName!=='number'))continue;
    const sampler=track.createInterpolant();
    const first=Array.from(sampler.evaluate(0)),last=Array.from(sampler.evaluate(duration));
    const qa=new THREE.Quaternion(),qb=new THREE.Quaternion();
    const mid=quat?qa.fromArray(first).slerp(qb.fromArray(last),.5).normalize().toArray():first.map((v,i)=>(v+last[i])*.5);
    const gap=quat?qa.fromArray(first).angleTo(qb.fromArray(last)):Math.hypot(...first.map((v,i)=>v-last[i]));
    if(gap<1e-5&&track.times[0]===0&&Math.abs(track.times[track.times.length-1]-duration)<1e-6)continue;
    const times=[...new Set([0,window*.5,window,...track.times,duration-window,duration-window*.5,duration])]
      .filter(t=>t>=0&&t<=duration).sort((a,b)=>a-b);
    const values=new Float32Array(times.length*stride);
    for(let i=0;i<times.length;i++){
      const t=times[i],sample=sampler.evaluate(t);
      const weight=1-THREE.MathUtils.smoothstep(Math.min(t,duration-t),0,window);
      if(quat)qa.fromArray(sample).slerp(qb.fromArray(mid),weight).normalize().toArray(values,i*stride);
      else for(let j=0;j<stride;j++)values[i*stride+j]=THREE.MathUtils.lerp(sample[j],mid[j],weight);
    }
    track.times=new Float32Array(times);track.values=values;
  }
}

function split(clip, upper) {
  const tracks = clip.tracks.filter(track => {
    const { nodeName } = THREE.PropertyBinding.parseTrackName(track.name);
    return nodeName.startsWith('mixamorig') && upperBody.test(keyOf(nodeName)) === upper;
  });
  return new THREE.AnimationClip(clip.name + (upper ? ':upper' : ':lower'), clip.duration, tracks);
}

function sampleCycle(root, bones, clip, direction, floor) {
  // split() appends ':lower' to the source clip name. Classify the
  // original gait, not the layer suffix, or forward pairing never runs.
  const forward = clip.name.split(':')[0].endsWith('_F');
  const frameCount = 60;
  const mixer = new THREE.AnimationMixer(root);
  const action = mixer.clipAction(clip).play();
  const ankle = new THREE.Vector3(), toe = new THREE.Vector3(), hips = new THREE.Vector3();
  let hipsHeight = 0;
  const samples = legNames.map(() => []);
  const hipsTrack = clip.tracks.find(track => /Hips(?:_\d+)?\.position$/.test(track.name));
  for (let frame = 0; frame < frameCount; frame++) {
    action.time = clip.duration * frame / frameCount;
    mixer.update(0);
    root.updateMatrixWorld(true);
    hipsHeight += bones.Hips.getWorldPosition(hips).y / frameCount;
    for (const [side, name] of legNames.entries()) {
      bones[name + 'Foot'].getWorldPosition(ankle);
      bones[name + 'ToeBase'].getWorldPosition(toe);
      samples[side].push({ height: Math.min(toe.y, ankle.y - .052), across: ankle.dot(direction), position: ankle.toArray() });
    }
  }
  mixer.uncacheRoot(root);
  // Pair opposite steps from the capture to retain its swing while removing
  // unequal retargeted reach and contact timing between the two legs.
  if (forward) {
    const original = samples.map(foot => foot.map(point => ({ ...point, position: [...point.position] })));
    for (let side = 0; side < 2; side++) for (let frame = 0; frame < frameCount; frame++) {
      const point = samples[side][frame], other = original[1 - side][(frame + frameCount / 2) % frameCount];
      point.height = (point.height + other.height) / 2;
      point.across = (point.across + other.across) / 2;
      point.position = point.position.map((value, axis) => (value + other.position[axis] * (axis === 0 ? -1 : 1)) / 2);
    }
  }
  const lowest = Math.min(...samples.flatMap(foot => foot.map(point => point.height)));
  const getSpeed = (foot, frame) => {
    const previous = (frame + frameCount - 1) % frameCount;
    const next = (frame + 1) % frameCount;
    return (foot[previous].across - foot[next].across) * frameCount / (2 * clip.duration);
  };
  const speeds = samples.flatMap(foot => foot
    .map((point, i) => point.height < lowest + .075 ? getSpeed(foot, i) : 0)
    .filter(speed => speed > .12)).sort((a, b) => a - b);
  const speed = speeds[Math.floor(speeds.length * .55)] ?? 0;
  if (!(speed > .15)) throw new Error('No measured gait travel for ' + clip.name);
  const crouch = clip.name.startsWith('mocap_crouch_');
  const contact = samples.map(foot => foot.map((point, frame) =>
    (1 - THREE.MathUtils.smoothstep(point.height - lowest, .025, crouch ? .13 : .105)) *
    THREE.MathUtils.smoothstep(getSpeed(foot, frame), speed * .15, speed * (crouch ? .48 : .6))));
  // Small circular filter avoids contact chatter on a single captured key.
  for(const track of contact){const raw=track.slice();for(let i=0;i<track.length;i++)track[i]=.25*raw[(i+track.length-1)%track.length]+.5*raw[i]+.25*raw[(i+1)%track.length];}
  const left = contact[0];
  let strike = 0, rise = -Infinity;
  for (let i = 0; i < left.length; i++) {
    const diff = left[(i + 2) % left.length] - left[(i + left.length - 2) % left.length];
    if (diff > rise) { rise = diff; strike = i; }
  }
  if (hipsTrack) {
    root.updateMatrixWorld(true);
    const inverse = new THREE.Matrix3().setFromMatrix4(bones.Hips.parent.matrixWorld.clone().invert());
    const offset = new THREE.Vector3(0, floor - lowest, 0).applyMatrix3(inverse);
    for (let i = 0; i < hipsTrack.values.length; i += 3) {
      hipsTrack.values[i] += offset.x;
      hipsTrack.values[i + 1] += offset.y;
      hipsTrack.values[i + 2] += offset.z;
    }
  }
  const paths = samples.map(foot => foot.map(point =>
    [point.position[0], point.position[1] + floor - lowest, point.position[2]]));
  return { distance: speed * clip.duration, duration: clip.duration, contact, paths, offset: strike / frameCount,
    hipsHeight: hipsHeight + (hipsTrack ? floor - lowest : 0) };
}

function prepareBody({ scene, animations }) {
  const levels = new Map(), parts = [];
  scene.traverse(node => {
    const variant = /^(body-\d+)-lod([123])$/.exec(node.name);
    if (!variant) return;
    if (!levels.has(variant[1])) levels.set(variant[1], []);
    const geometries = [];
    node.traverse(part => { if (part.isMesh) geometries.push(part.geometry); });
    levels.get(variant[1])[Number(variant[2])] = geometries;
    parts.push(node);
  });
  for (const node of parts) node.removeFromParent();
  const anchor = new THREE.Group();
  anchor.add(scene);
  scene.rotation.y += Math.PI;
  const box = new THREE.Box3().setFromObject(scene, true);
  const height = box.max.y - box.min.y;
  if (!(height > 1 && height < 3)) throw new Error('Unexpected soldier bind height ' + height);
  anchor.scale.setScalar(1.82 / height);
  anchor.position.y = -box.min.y * anchor.scale.y;
  const bones = findInfantryBones(anchor);
  anchor.updateMatrixWorld(true);
  for (const node of scene.children) node.updateMatrixWorld(true);
  const clips = new Map();
  for (const source of animations) {
    const name = source.name.split('@')[0];
    const clip = source.clone();
    if(name.startsWith('mocap_')||name==='prone_crawl'||name==='ready_sprint')closeLoop(clip);
    // Vendor clips have baked hips curves and no scene-level root track.
    const upper = split(clip, true);
    const far = new THREE.AnimationClip(upper.name + ':far', upper.duration,
      upper.tracks.filter(track => !/Hand(?:Thumb|Index|Middle|Ring|Pinky)/.test(track.name)));
    clips.set(name, { lower: split(clip, false), upper, far });
  }
  const mixer = new THREE.AnimationMixer(anchor);
  const idle = mixer.clipAction(clips.get('ready_idle').lower).play();
  mixer.update(0);
  anchor.updateMatrixWorld(true);
  const floor = Math.min(...legNames.map(side => bones[side + 'ToeBase'].getWorldPosition(new THREE.Vector3()).y));
  idle.stop();
  mixer.uncacheRoot(anchor);
  const gaits = new Map();
  for (const name of new Set(Object.values(gaitClips).flat())) {
    const entry = clips.get(name);
    const direction = directions[name.at(-1)] ?? directions.F;
    gaits.set(name, sampleCycle(anchor, bones, entry.lower, from(direction), floor));
  }
  scene.updateMatrixWorld(true);
  const bodyBatch=batchInfantryBody(scene,levels);
  return { anchor, clips, levels, gaits,bodyBatch };
}

function batchDistantWeapon(model) {
  model.updateMatrixWorld(true);
  const pieces = [], vector = new THREE.Vector3();
  model.traverseVisible(mesh => {
    if (!mesh.isMesh) return;
    const geometry = new THREE.BufferGeometry();
    const { position, normal, color: vertexColor } = mesh.geometry.attributes;
    for (const [key, attribute] of [['position', position], ['normal', normal]]) {
      const values = new Float32Array(attribute.count * 3);
      for (let i = 0; i < attribute.count; ++i) vector.fromBufferAttribute(attribute, i).toArray(values, i * 3);
      geometry.setAttribute(key, new THREE.BufferAttribute(values, 3));
    }
    const colors = new Float32Array(position.count * 3);
    const color = mesh.material.color.clone();
    if (mesh.material.map) color.multiplyScalar(.23);
    const tint = new THREE.Vector3(color.r, color.g, color.b);
    for (let i = 0; i < position.count; ++i) {
      if (vertexColor) vector.fromBufferAttribute(vertexColor, i).multiply(tint).toArray(colors, i * 3);
      else color.toArray(colors, i * 3);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(mesh.geometry.index);
    pieces.push(geometry.applyMatrix4(mesh.matrixWorld));
  });
  const merged = mergeGeometries(pieces);
  pieces.forEach(g=>g.dispose());
  if (!merged) throw new Error('Could not batch the distant weapon');
  return new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ vertexColors: true }));
}

function prepareWeapon(gltf, name) {
  const fit = weaponFit[name];
  const primary = from(fit.primary), scale = fit.scale;
  const model = gltf.scene;
  const muzzle = model.getObjectByName('Muzzle_Exit')?.position.clone() ?? from(fit.muzzle);
  if (fit.foregrip) {
    const grip = model.getObjectByName('ForegripGeometryMesh');
    if (!grip) throw new Error('Missing adjustable foregrip on ' + name);
    grip.position.z += .20;
  }
  model.scale.setScalar(scale);
  model.position.copy(primary).multiplyScalar(-scale);
  prepareSkinProjection(model,name);
  model.updateMatrixWorld(true);
  const weaponBounds = new THREE.Box3().setFromObject(model, true);
  const magazine = model.getObjectByName('Magazine');
  let magazineContact;
  if (magazine) {
    const box = new THREE.Box3().setFromObject(magazine, true);
    if (!box.isEmpty()) {
      magazineContact = box.getCenter(new THREE.Vector3());
      magazineContact.x = box.min.x - .006;
      magazineContact.y = THREE.MathUtils.lerp(box.min.y, box.max.y, .64);
      magazine.worldToLocal(magazineContact);
    }
  }
  const distantUpgrades = new Map();
  return {
    model, distantWeapon: batchDistantWeapon(model), pistol: Boolean(fit.pistol), foregrip: Boolean(fit.foregrip),
    distantUpgrades,
    getDistantUpgrade(weaponId, flags, lowDetail) {
      const slots=weaponAttachmentsFromFlags(flags);
      const low=lowDetail&&slots?.optic===HORIZON_OPTIC_ID;
      const key=low?'low:'+flags:flags;
      if (!distantUpgrades.has(key)) {
        const upgraded = model.clone(true);
        if (!showWeaponUpgrades(upgraded,weaponId,slots,low)) return this.distantWeapon;
        distantUpgrades.set(key,batchDistantWeapon(upgraded));
      }
      return distantUpgrades.get(key);
    },
    stock: new THREE.Vector3(0, .07, weaponBounds.max.z),
    support: from(fit.support).sub(primary).multiplyScalar(scale),
    muzzle: muzzle.sub(primary).multiplyScalar(scale),
    magazineName: magazine?.name, magazineContact,
  };
}

const kitNames = { regular: 'blue-kit', militia: 'field-kit' };
const prepareKit = ({ scene }) => ({ model: scene });

export class InfantryAssets {
  constructor(renderer) {
    this.loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const KtxLoader=renderer.isWebGPURenderer ? SafeWebGpuKtx2Loader : KTX2Loader;
    this.ktx = new KtxLoader().setWorkerLimit(2)
      .setTranscoderPath(new URL('basis/', document.baseURI).href).detectSupport(renderer);
    this.loader.setKTX2Loader(this.ktx);
    this.templates = new Map();
    this.pending = new Map();
    this.disposed = false;
  }

  request(name, prepare) {
    if (!this.pending.has(name)) {
      const url = assetUrls[name];
      const load = this.loader.loadAsync(url).then(gltf => {
        const data = prepare(gltf, name);
        if (this.disposed) this.disposeTemplate(data);
        else this.templates.set(name, data);
        return data;
      });
      // Retain the rejection for callers such as the review. A background
      // request from the match must not produce an unhandled rejection.
      load.catch(error => console.error('Infantry asset ' + name, error));
      this.pending.set(name, load);
    }
    return this.pending.get(name);
  }

  load(team, weaponId) {
    const name = team ? 'militia' : 'regular', weapon = weaponAsset(weaponId);
    return Promise.all([
      this.request(name, prepareBody), this.request(weapon, prepareWeapon),
      this.request(kitNames[name], prepareKit),
    ]);
  }

  warm() {
    return Promise.allSettled([
      this.request('regular', prepareBody), this.request('militia', prepareBody),
      ...Object.values(kitNames).map(name => this.request(name, prepareKit)),
      ...Object.keys(weaponFit).map(name => this.request(name, prepareWeapon)),
    ]);
  }

  get(team, weaponId) {
    const name = team ? 'militia' : 'regular', weapon = weaponAsset(weaponId);
    const body = this.templates.get(name), gun = this.templates.get(weapon);
    const kit = this.templates.get(kitNames[name]);
    if (!body || !gun || !kit) {
      this.load(team, weaponId).catch(() => {});
      return null;
    }
    return { template: body, gun, kit: kit.model };
  }

  disposeTemplate(template) {
    const geometry = new Set(), materials = new Set(), textures = new Set(), skeletons = new Set();
    const collect = node => {
      if (node.geometry) geometry.add(node.geometry);
      if (node.material) materials.add(node.material);
      if (node.skeleton) skeletons.add(node.skeleton);
    };
    (template.anchor ?? template.model).traverse(collect);
    if (template.distantWeapon) collect(template.distantWeapon);
    for (const variant of template.distantUpgrades?.values() ?? []) collect(variant);
    for(const g of template.bodyBatch?.replaced??[])geometry.add(g);
    for(const lods of template.bodyBatch?.mergedLods.values()??[])for(const g of lods)geometry.add(g);
    for (const values of template.levels?.values() ?? []) for (const level of values) for (const value of level ?? []) geometry.add(value);
    for (const material of materials) {
      for (const item of Object.values(material)) if (item?.isTexture) textures.add(item);
      material.dispose();
    }
    for (const item of [...geometry, ...textures, ...skeletons]) item.dispose();
  }

  dispose() {
    this.disposed = true;
    for (const template of this.templates.values()) this.disposeTemplate(template);
    this.templates.clear();
    Promise.allSettled(this.pending.values()).then(() => this.ktx.dispose());
  }
}

export function cloneInfantry(template) {
  const model = clone(template.anchor), sources = [];
  template.anchor.traverse(node => { if (node.isSkinnedMesh) sources.push(node.skeleton); });
  const instances = new Map();
  let index = 0;
  model.traverse(node => {
    if (!node.isSkinnedMesh) return;
    const source = sources[index++];
    const reused = instances.get(source);
    if (reused) node.skeleton = reused;
    else instances.set(source, node.skeleton);
  });
  return model;
}
