import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const weaponNames = {
  ar416: 'm4a1', ak12: 'ak47', mcx9: 'mp5a5', vk45: 'mp5a5',
  mg36: 'm4a1', pkp: 'ak47', sv98: 'm24', dmr12: 'm24', p19: 'p226', m50: 'm1911',
};
const weaponFit = {
  m4a1: { primary: [0, -.17, .215], support: [-.022, -.095, -.55], muzzle: [0, .049, -1.265], scale: .54 },
  ak47: { primary: [0, -.073, -.122], support: [-.022, -.025, -.55], muzzle: [0, .005, -1.135], scale: .72 },
  mp5a5: { primary: [0, -.098, -.103], support: [-.041, .034, -.387], muzzle: [0, .146, -.85], scale: .70 },
  m24: { primary: [-.005, -.08, -.07], support: [-.021, .045, -.56], muzzle: [0, .08, -1.42], scale: .68 },
  p226: { primary: [0, -.03, .237], support: [-.065, -.04, .225], muzzle: [0, .09, -.08], scale: .60, pistol: true },
  m1911: { primary: [-.011, -.03, .245], support: [-.065, -.04, .235], muzzle: [0, .09, -.08], scale: .70, pistol: true },
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

function split(clip, upper) {
  const tracks = clip.tracks.filter(track => {
    const { nodeName } = THREE.PropertyBinding.parseTrackName(track.name);
    return nodeName.startsWith('mixamorig') && upperBody.test(keyOf(nodeName)) === upper;
  });
  return new THREE.AnimationClip(clip.name + (upper ? ':upper' : ':lower'), clip.duration, tracks);
}

function sampleCycle(root, bones, clip, direction, floor) {
  const frameCount = 60;
  const mixer = new THREE.AnimationMixer(root);
  const action = mixer.clipAction(clip).play();
  const ankle = new THREE.Vector3(), toe = new THREE.Vector3();
  const samples = legNames.map(() => []);
  const hipsTrack = clip.tracks.find(track => /Hips(?:_\d+)?\.position$/.test(track.name));
  for (let frame = 0; frame < frameCount; frame++) {
    action.time = clip.duration * frame / frameCount;
    mixer.update(0);
    root.updateMatrixWorld(true);
    for (const [side, name] of legNames.entries()) {
      bones[name + 'Foot'].getWorldPosition(ankle);
      bones[name + 'ToeBase'].getWorldPosition(toe);
      samples[side].push({ height: Math.min(toe.y, ankle.y - .052), across: ankle.dot(direction) });
    }
  }
  mixer.uncacheRoot(root);
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
  const contact = samples.map(foot => foot.map((point, frame) =>
    (1 - THREE.MathUtils.smoothstep(point.height - lowest, .025, .105)) *
    THREE.MathUtils.smoothstep(getSpeed(foot, frame), speed * .15, speed * .6)));
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
  return { distance: speed * clip.duration, duration: clip.duration, contact, offset: strike / frameCount };
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
  return { anchor, clips, levels, gaits };
}

function batchDistantWeapon(model) {
  model.updateMatrixWorld(true);
  const pieces = [], vector = new THREE.Vector3();
  model.traverse(mesh => {
    if (!mesh.isMesh) return;
    const geometry = new THREE.BufferGeometry();
    const { position, normal } = mesh.geometry.attributes;
    for (const [key, attribute] of [['position', position], ['normal', normal]]) {
      const values = new Float32Array(attribute.count * 3);
      for (let i = 0; i < attribute.count; ++i) vector.fromBufferAttribute(attribute, i).toArray(values, i * 3);
      geometry.setAttribute(key, new THREE.BufferAttribute(values, 3));
    }
    const colors = new Float32Array(position.count * 3);
    const color = mesh.material.color.clone();
    if (mesh.material.map) color.multiplyScalar(.23);
    for (let i = 0; i < position.count; ++i) color.toArray(colors, i * 3);
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(mesh.geometry.index);
    pieces.push(geometry.applyMatrix4(mesh.matrixWorld));
  });
  const merged = mergeGeometries(pieces);
  if (!merged) throw new Error('Could not batch the distant weapon');
  return new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ vertexColors: true }));
}

function prepareWeapon(gltf, name) {
  const fit = weaponFit[name];
  const primary = from(fit.primary), scale = fit.scale;
  const model = gltf.scene;
  model.scale.setScalar(scale);
  model.position.copy(primary).multiplyScalar(-scale);
  const magazine = model.getObjectByName('Magazine');
  return {
    model, distantWeapon: batchDistantWeapon(model), pistol: Boolean(fit.pistol),
    support: from(fit.support).sub(primary).multiplyScalar(scale),
    muzzle: from(fit.muzzle).sub(primary).multiplyScalar(scale),
    magazineName: magazine?.name,
  };
}

export class InfantryAssets {
  constructor(renderer) {
    this.loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    this.ktx = new KTX2Loader().setWorkerLimit(2)
      .setTranscoderPath(new URL('basis/', document.baseURI).href).detectSupport(renderer);
    this.loader.setKTX2Loader(this.ktx);
    this.templates = new Map();
    this.pending = new Map();
    this.disposed = false;
  }

  request(name, prepare) {
    if (!this.pending.has(name)) {
      const url = new URL(`./assets/infantry/${name}.glb`, import.meta.url).href;
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
    const name = team ? 'militia' : 'regular', weapon = weaponNames[weaponId] ?? 'm24';
    return Promise.all([this.request(name, prepareBody), this.request(weapon, prepareWeapon)]);
  }

  warm() {
    return Promise.allSettled([
      this.request('regular', prepareBody), this.request('militia', prepareBody),
      ...Object.keys(weaponFit).map(name => this.request(name, prepareWeapon)),
    ]);
  }

  get(team, weaponId) {
    const name = team ? 'militia' : 'regular', weapon = weaponNames[weaponId] ?? 'm24';
    const body = this.templates.get(name), gun = this.templates.get(weapon);
    if (!body || !gun) {
      this.load(team, weaponId).catch(() => {});
      return null;
    }
    return { template: body, gun };
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
