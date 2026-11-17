import * as THREE from 'three';
import { weaponSwitchPose } from '../shared/world.js';
import { cloneInfantry, findInfantryBones, gaitClips, legNames } from './infantry-assets.js';

const { clamp, damp, lerp, smoothstep } = THREE.MathUtils;
const turn = (from, target) => Math.atan2(Math.sin(target - from), Math.cos(target - from));
const cycle = phase => ((phase % 1) + 1) % 1;
const TAU = 2 * Math.PI;
const markerGeometry = new THREE.OctahedronGeometry(.059);
const flashGeometry = new THREE.ConeGeometry(.045, .14, 6);
const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
const axis = new THREE.Vector3(), bend = new THREE.Vector3(), joint = new THREE.Vector3();
const desired = new THREE.Vector3(), q = new THREE.Quaternion(), world = new THREE.Quaternion();
const target = new THREE.Vector3(), palm = new THREE.Vector3();
const flatNormal = new THREE.Vector3(0, 1, 0);
const rotation = new THREE.Euler(0, 0, 0, 'YXZ');

function aimJoint(bone, from, to) {
  q.setFromUnitVectors(from.normalize(), to.normalize());
  bone.getWorldQuaternion(world).premultiply(q);
  bone.parent.getWorldQuaternion(q).invert();
  bone.quaternion.copy(q.multiply(world));
  bone.updateWorldMatrix(false, true);
}

function reach(upper, lower, end, goal, weight, pole = null) {
  upper.getWorldPosition(a);
  lower.getWorldPosition(b);
  end.getWorldPosition(c);
  const first = a.distanceTo(b), second = b.distanceTo(c);
  axis.copy(c).lerp(goal, weight).sub(a);
  const distance = clamp(axis.length(), Math.abs(first - second) + .001, first + second - .002);
  axis.normalize();
  desired.copy(a).addScaledVector(axis, distance);
  bend.copy(pole ?? b).sub(a);
  bend.addScaledVector(axis, -bend.dot(axis));
  if (bend.lengthSq() < .000001) bend.set(0, 1, 0).addScaledVector(axis, -axis.y);
  const along = (first * first - second * second + distance * distance) / (2 * distance);
  joint.copy(a).addScaledVector(axis, along)
    .addScaledVector(bend.normalize(), Math.sqrt(Math.max(0, first * first - along * along)));
  aimJoint(upper, b.sub(a), c.copy(joint).sub(a));
  lower.getWorldPosition(b);
  end.getWorldPosition(c);
  aimJoint(lower, c.sub(b), desired.sub(b));
}

function newLeg(bones, side) {
  return {
    upper: bones[side + 'UpLeg'], knee: bones[side + 'Leg'],
    foot: bones[side + 'Foot'], toe: bones[side + 'ToeBase'],
    anchor: new THREE.Vector3(), solved: new THREE.Vector3(), weight: 0, locked: false,
  };
}

export function createInfantry({ template, gun }, player) {
  const group = new THREE.Group(), model = cloneInfantry(template);
  const bones = findInfantryBones(model);
  const parts = [];
  let variant = 0;
  for (const letter of String(player.id ?? "")) variant = (Math.imul(variant, 31) + letter.charCodeAt(0)) | 0;
  variant = (variant >>> 0) % 3;
  let optional = 0;
  for (const [name, levels] of template.levels) {
    const base = model.getObjectByName(name);
    if (!base) throw new Error('Cannot bind infantry LOD for ' + name);
    const visible = !base.userData.optionalPouch || optional++ < variant;
    let index = 0;
    base.traverse(mesh => {
      if (!mesh.isMesh) return;
      mesh.visible = visible;
      mesh.frustumCulled = false; // the actor has a single conservative frustum test
      mesh.receiveShadow = true;
      const geometries = [mesh.geometry, ...levels.slice(1).map(level => level[index])];
      if (geometries.length !== 4 || geometries.some(geometry => !geometry)) throw new Error('Incomplete infantry LOD');
      parts.push({ mesh, geometries });
      index++;
    });
  }
  const rifle = new THREE.Group();
  const flash = new THREE.Mesh(flashGeometry, new THREE.MeshBasicMaterial({ color: 0xffdb9c }));
  flash.position.copy(gun.muzzle);
  flash.position.z -= .052;
  flash.rotation.x = -Math.PI / 2;
  flash.visible = false;
  const marker = new THREE.Mesh(markerGeometry, new THREE.MeshBasicMaterial());
  marker.position.y = 1.94;
  group.add(model, rifle, marker);
  rifle.add(flash);
  const head = new THREE.Group();
  bones.Head.add(head);
  head.userData.faceCovered = true;
  const rig = {
    group, model, parts, bones, head, marker, rifle, flash, template,
    mixer: new THREE.AnimationMixer(model), actions: new Map(), activeActions: new Set(),
    team: player.team, classId: player.classId, lod: 0, alive: true,
    motion: { phase: 0, speed: 0, vx: 0, vz: 0, x: 0, z: 0, moving: 0, gait: new Map() },
    legs: legNames.map(side => newLeg(bones, side)), recoil: 0, shotAge: Infinity, hitAge: Infinity,
    actionAge: Infinity, jumpAge: Infinity, landAge: Infinity, slideAge: Infinity,
    lastShot: player.shotSeq, corrections: new Map(),
    support: new THREE.Vector3(), muzzle: new THREE.Vector3(),
  };
  setInfantryWeapon(rig, gun, player.weaponId);
  return rig;
}

export function setInfantryWeapon(rig, template, weaponId) {
  rig.weaponModel?.removeFromParent();
  rig.weaponModel = template.model.clone(true);
  rig.weaponId = weaponId;
  rig.pistol = template.pistol;
  rig.support.copy(template.support);
  rig.muzzle.copy(template.muzzle);
  rig.flash.position.copy(rig.muzzle);
  rig.flash.position.z -= .052;
  rig.rifle.add(rig.weaponModel);
  rig.magazine = rig.weaponModel.getObjectByName(template.magazineName);
  rig.magazineRest = rig.magazine?.position.clone();
}

export function setInfantryLod(rig, level, shadows) {
  rig.lod = level;
  for (const { mesh, geometries } of rig.parts) {
    mesh.geometry = geometries[level];
    mesh.castShadow = shadows;
  }
}

export function disposeInfantry(rig) {
  rig.group.removeFromParent();
  rig.mixer.stopAllAction().uncacheRoot(rig.model);
  const skeletons = new Set();
  rig.model.traverse(node => { if (node.skeleton) skeletons.add(node.skeleton); });
  for (const skeleton of skeletons) skeleton.dispose();
  rig.marker.material.dispose();
  rig.flash.material.dispose();
}

// Direction weights wrap around the four measured cardinal cycles. Adjacent
// cycles share a left-strike phase so a diagonal blend preserves step order.
export function locomotionWeights(out, speed, yaw, vx, vz, crouched, sprinting) {
  out.clear();
  const x = vx * Math.cos(yaw) - vz * Math.sin(yaw);
  const forward = -vx * Math.sin(yaw) - vz * Math.cos(yaw);
  const sector = cycle(Math.atan2(x, forward) / TAU) * 4;
  const index = Math.floor(sector), blend = sector - index;
  const run = smoothstep(speed, 1.85, 4.7);
  const sprint = sprinting ? smoothstep(speed, 5.4, 8.5) : 0;
  for (const [state, weight] of crouched ? [['crouch', 1]] :
    [['walk', (1 - run) * (1 - sprint)], ['run', run * (1 - sprint)], ['sprint', sprint]]) {
    if (!weight) continue;
    const keys = gaitClips[state];
    for (const [name, contribution] of [[keys[index], 1 - blend], [keys[(index + 1) % 4], blend]]) {
      if (contribution) out.set(name, (out.get(name) ?? 0) + contribution * weight);
    }
  }
  return out;
}

function play(rig, active, name, upper, time, weight) {
  if (weight < .003) return;
  const layer = upper ? (rig.lod >= 2 ? 'far' : 'upper') : 'lower';
  const clip = rig.template.clips.get(name)?.[layer];
  if (!clip?.tracks.length) return;
  if (!rig.actions.has(clip)) {
    const action = rig.mixer.clipAction(clip).setLoop(THREE.LoopOnce, 0);
    action.clampWhenFinished = true;
    rig.actions.set(clip, action);
  }
  const action = rig.actions.get(clip);
  if (!rig.activeActions.has(action)) action.reset().play();
  action.time = clamp(time, 0, clip.duration);
  action.setEffectiveWeight(weight);
  active.add(action);
}

function evalPose(rig, active) {
  for (const [bone, rest] of rig.corrections) bone.quaternion.copy(rest);
  rig.corrections.clear();
  for (const action of rig.activeActions) if (!active.has(action)) action.stop();
  rig.activeActions = active;
  if (rig.hipsRest) {
    rig.bones.Hips.position.copy(rig.hipsRest);
    rig.hipsRest = null;
  }
  rig.mixer.update(0);
  rig.group.updateWorldMatrix(true, true);
}

function saveRotation(rig, ...bones) {
  for (const bone of bones) if (!rig.corrections.has(bone)) rig.corrections.set(bone, bone.quaternion.clone());
}

function applyContacts(rig, dt, confidence, terrain) {
  const { group } = rig;
  for (const [side, leg] of rig.legs.entries()) {
    leg.foot.getWorldPosition(leg.solved);
    if (confidence[side] > .52 && !leg.locked) {
      leg.anchor.copy(leg.solved);
      leg.locked = true;
    }
    leg.upper.getWorldPosition(a);
    const reachLimit = a.distanceTo(leg.knee.getWorldPosition(b)) + b.distanceTo(leg.solved);
    if (confidence[side] < .22 || leg.anchor.distanceToSquared(leg.solved) > .24 ** 2 ||
      leg.anchor.distanceToSquared(a) > (reachLimit + .025) ** 2) leg.locked = false;
    leg.weight = damp(leg.weight, leg.locked ? 1 : 0, leg.locked ? 95 : 29, dt);
    if (leg.weight < .01 || rig.lod > 1) continue;
    target.copy(leg.anchor);
    const slope = terrain?.heightAt?.(target.x, target.z);
    if (Number.isFinite(slope) && Math.abs(slope - group.position.y) < .23) {
      const atRoot = terrain.heightAt(group.position.x, group.position.z);
      target.y += clamp(slope - atRoot, -.14, .14);
    }
    saveRotation(rig, leg.upper, leg.knee, leg.foot);
    leg.foot.getWorldQuaternion(leg.orientation ??= new THREE.Quaternion());
    reach(leg.upper, leg.knee, leg.foot, target, leg.weight);
    leg.foot.parent.getWorldQuaternion(q).invert();
    leg.foot.quaternion.copy(q.multiply(leg.orientation));
    leg.foot.updateWorldMatrix(false, true);
  }
}

function settleStance(rig, terrain, weight, crouch) {
  if (weight < .015 || rig.lod >= 2) return;
  const ankleHeight = rig.team ? .096 : .112;
  for (const [index, leg] of rig.legs.entries()) {
    const side = index === 0 ? -1 : 1;
    target.set(side * lerp(.135, .185, crouch), ankleHeight, side * .145);
    rig.group.localToWorld(target);
    const height = terrain?.heightAt?.(target.x, target.z);
    if (Number.isFinite(height) && Math.abs(height + ankleHeight - target.y) < .22) target.y = height + ankleHeight;
    saveRotation(rig, leg.upper, leg.knee, leg.foot);
    const orientation = leg.foot.getWorldQuaternion(leg.orientation ??= new THREE.Quaternion());
    const from = leg.toe.getWorldPosition(a).sub(leg.foot.getWorldPosition(b)).normalize();
    const heading = rig.group.rotation.y + side * .12;
    const to = c.set(-Math.sin(heading), -.42, -Math.cos(heading)).normalize();
    const rotation = q.setFromUnitVectors(from, to);
    world.copy(orientation).premultiply(rotation);
    orientation.slerp(world, weight);
    reach(leg.upper, leg.knee, leg.foot, target, weight);
    leg.foot.parent.getWorldQuaternion(q).invert();
    leg.foot.quaternion.copy(q.multiply(orientation));
    leg.foot.updateWorldMatrix(false, true);
  }
}

function applyWeapon(rig, player, dt, reload, actionWeight, controls = false) {
  const { bones, group, rifle } = rig;
  const afterSwitch = weaponSwitchPose(player.equipTime).lowered;
  const bodyAim = clamp(turn(group.rotation.y, player.yaw ?? group.rotation.y), -.67, .67);
  const pitch = clamp(player.pitch ?? 0, -.9, .9);
  const sprint = player.sprint && rig.motion.speed > 5;
  const carrying = player.aim ? 0 : .10;
  const aimWeight = (1 - actionWeight) * (1 - reload * .72);
  if (aimWeight > .01) {
    saveRotation(rig, bones.Spine1, bones.Spine2, bones.Head);
    bones.Spine1.quaternion.premultiply(q.setFromAxisAngle(b.set(0, 0, 1), -pitch * .12 * aimWeight));
    bones.Spine2.rotateY(bodyAim * .22 * aimWeight);
    bones.Head.rotateY(bodyAim * .22 * aimWeight);
    bones.Spine1.updateWorldMatrix(false, true);
  }
  const right = bones.RightHand, middle = bones.RightHandMiddle1;
  right.getWorldPosition(palm).lerp(middle.getWorldPosition(target), .55);
  group.worldToLocal(palm);
  rifle.position.copy(palm);
  rifle.position.z += rig.recoil * .015;
  rifle.quaternion.setFromEuler(rotation.set(
    lerp(pitch, -.42, (sprint ? .7 : carrying)) - reload * .28 - afterSwitch * .62 + rig.recoil * .06,
    bodyAim + reload * .12 + afterSwitch * .15,
    reload * -.25 - afterSwitch * .19));
  rifle.visible = !controls && actionWeight < .9;
  rifle.updateWorldMatrix(true, true);
  if (!controls && actionWeight < .8 && rig.lod < 2) {
    target.copy(rig.support);
    rifle.localToWorld(target);
    const left = bones.LeftHand;
    left.getWorldPosition(a);
    bones.LeftHandMiddle1.getWorldPosition(b);
    target.addScaledVector(b.sub(a), -.55);
    saveRotation(rig, bones.LeftArm, bones.LeftForeArm, left);
    reach(bones.LeftArm, bones.LeftForeArm, left, target, (1 - reload) * (1 - actionWeight));
  }
  if (rig.magazine) {
    rig.magazine.position.copy(rig.magazineRest);
    rig.magazine.position.y -= .20 * reload * (1 - smoothstep(player.reloadProgress ?? 0, .55, .8));
  }
  rig.flash.visible = rifle.visible && rig.shotAge < .042 && rig.lod < 2;
  rig.recoil *= Math.exp(-18 * dt);
}

export function updateInfantry(rig, player, dt, reset = false, terrain = null) {
  const { group, motion } = rig;
  dt = Math.max(dt, .001);
  if (reset) {
    Object.assign(motion, { x: group.position.x, z: group.position.z, speed: 0, vx: 0, vz: 0, moving: 0, phase: 0 });
    motion.gait.clear();
    rig.upperWeights?.clear();
    rig.crouchBlend = Number(Boolean(player.crouch || player.crouching));
    for (const leg of rig.legs) { leg.locked = false; leg.weight = 0; }
    Object.assign(rig, { lastShot: player.shotSeq, shotAge: Infinity, hitAge: Infinity, recoil: 0,
      airborne: player.grounded === false, sliding: Boolean(player.sliding), jumpAge: Infinity,
      landAge: Infinity, slideAge: Infinity, actionAge: Infinity, slideExit: Infinity });
  }
  const dx = group.position.x - motion.x, dz = group.position.z - motion.z;
  const distance = Math.hypot(dx, dz);
  motion.x = group.position.x;
  motion.z = group.position.z;
  motion.vx = damp(motion.vx, dx / dt, 17, dt);
  motion.vz = damp(motion.vz, dz / dt, 17, dt);
  motion.speed = damp(motion.speed, distance / dt, 14, dt);
  motion.moving = damp(motion.moving, smoothstep(motion.speed, .06, .60), 14, dt);
  const crouched = Boolean(player.crouch || player.crouching);
  const prone = Boolean(player.prone || player.downed);
  const requested = locomotionWeights(rig.requested ??= new Map(), motion.speed, group.rotation.y,
    motion.vx, motion.vz, crouched, player.sprint);
  for (const name of new Set([...motion.gait.keys(), ...requested.keys()])) {
    const weight = damp(motion.gait.get(name) ?? 0, requested.get(name) ?? 0, reset ? 1000 : 15, dt);
    if (weight < .004) motion.gait.delete(name);
    else motion.gait.set(name, weight);
  }
  let stride = 0, weightSum = 0;
  for (const [name, weight] of motion.gait) {
    stride += weight * rig.template.gaits.get(name).distance;
    weightSum += weight;
  }
  // Increase distance per cycle when the game outruns a captured gait.
  // Resolve the remaining discrepancy where the boot touches the ground.
  const maxCyclesPerSecond = crouched ? 2.1 : lerp(1.95, 2.40, smoothstep(motion.speed, 2.6, 6.4));
  const measured = weightSum ? stride / weightSum : 1;
  const cycleDistance = Math.max(measured, motion.speed / maxCyclesPerSecond);
  motion.cycleDistance = cycleDistance;
  if (weightSum && distance > .00015) motion.phase = cycle(motion.phase + distance / cycleDistance);

  const active = new Set();
  const contacts = [0, 0];
  const air = player.grounded === false;
  if (air && !rig.airborne) rig.jumpAge = 0;
  if (!air && rig.airborne) rig.landAge = 0;
  if (player.sliding && !rig.sliding) rig.slideAge = 0;
  if (!player.sliding && rig.sliding) rig.slideExit = 0;
  rig.airborne = air;
  rig.sliding = Boolean(player.sliding);
  rig.jumpAge += dt;
  rig.landAge += dt;
  rig.slideAge += dt;
  rig.slideExit += dt;
  const lowerAction = prone ? (motion.speed > .16 && !player.downed ? 'prone_crawl' : 'prone_idle') :
    air ? (rig.jumpAge < .19 ? 'jump_start' : 'jump_loop') :
      player.sliding ? (rig.slideAge < .23 ? 'slide_start' : 'slide_loop') :
        rig.slideExit < .23 ? 'slide_exit' : rig.landAge < .24 ? 'jump_land' : null;
  if (lowerAction) {
    const time = air ? (lowerAction === 'jump_loop' ? rig.jumpAge - .19 : rig.jumpAge) :
      player.sliding ? (lowerAction === 'slide_loop' ? rig.slideAge - .23 : rig.slideAge) :
      prone ? (rig.poseTime ?? 0) : lowerAction === 'slide_exit' ? rig.slideExit : rig.landAge;
    play(rig, active, lowerAction, false, time, 1);
  } else {
    const moving = motion.moving;
    const crouchBlend = rig.crouchBlend = damp(rig.crouchBlend ?? Number(crouched), Number(crouched), 13, dt);
    play(rig, active, 'ready_idle', false, (rig.poseTime ?? 0) % 1, (1 - moving) * (1 - crouchBlend));
    play(rig, active, 'crouch_idle', false, (rig.poseTime ?? 0) % 1, (1 - moving) * crouchBlend);
    for (const [name, weight] of motion.gait) {
      const gait = rig.template.gaits.get(name);
      const phase = cycle(motion.phase + gait.offset), w = weight / weightSum * moving;
      play(rig, active, name, false, phase * gait.duration, w);
      for (const [i, track] of gait.contact.entries()) {
        const sample = phase * track.length, index = Math.floor(sample);
        const confidence = lerp(track[index], track[(index + 1) % track.length], sample - index);
        const stretch = clamp(gait.distance / cycleDistance, .4, 1);
        contacts[i] += smoothstep(confidence, lerp(.55, .1, stretch), 1) * w;
      }
    }
  }
  rig.poseTime = (rig.poseTime ?? 0) + dt;
  const upper = prone || lowerAction?.startsWith('slide') ? lowerAction : crouched ? (player.aim ? 'aim_crouch_idle' : 'ready_crouch_idle') :
    player.sprint && motion.speed > 5 ? 'ready_sprint' : player.aim ? 'aim_idle' : 'ready_idle';
  if (player.shotSeq !== undefined && player.shotSeq !== rig.lastShot) {
    rig.shotAge = 0;
    rig.recoil = 1;
    rig.lastShot = player.shotSeq;
  } else rig.shotAge += dt;
  rig.hitAge += dt;
  if (player.gadgetAction === 'defib' && rig.action !== 'revive_kneel') infantryAction(rig, 'revive_kneel');
  rig.actionAge += dt;
  const reload = player.reloading ? clamp(player.reloadProgress ?? 0, 0, 1) : 0;
  const reloadWeight = player.reloading ? smoothstep(reload, 0, .13) * (1 - smoothstep(reload, .8, 1)) : 0;
  const action = !prone && rig.actionAge < .90 ? rig.action : null;
  const actionWeight = action ? smoothstep(rig.actionAge, 0, .10) * (1 - smoothstep(rig.actionAge, .69, .9)) : 0;
  const hit = !prone && rig.hitAge < .28 ? .55 * (1 - rig.hitAge / .28) : 0;
  const shoot = !prone && rig.shotAge < .18 ? .47 * (1 - rig.shotAge / .18) : 0;
  const overlay = Math.max(actionWeight, reloadWeight, hit, shoot);
  rig.upperWeights ??= new Map();
  if (!rig.upperWeights.has(upper)) rig.upperWeights.set(upper, rig.upperWeights.size ? 0 : 1);
  for (const [name, currentWeight] of rig.upperWeights) {
    const weight = damp(currentWeight, Number(name === upper), 15, dt);
    if (weight < .003 && name !== upper) {
      rig.upperWeights.delete(name);
      continue;
    }
    rig.upperWeights.set(name, weight);
    const duration = rig.template.clips.get(name)?.upper.duration ?? 1;
    play(rig, active, name, true, rig.poseTime % duration, weight * (1 - overlay));
  }
  if (overlay > 0) {
    if (overlay === actionWeight) play(rig, active, action, true, rig.actionAge, overlay);
    else if (overlay === reloadWeight) play(rig, active, 'reload', true, reload * rig.template.clips.get('reload').upper.duration, overlay);
    else if (overlay === hit) play(rig, active, 'hit', true, rig.hitAge, overlay);
    else play(rig, active, 'shoot', true, rig.shotAge, overlay);
  }
  evalPose(rig, active);
  if (!air && (player.sliding || lowerAction === 'slide_exit' || lowerAction === 'jump_land')) {
    // Transitions came from a different actor. Keep the boots above the
    // simulation's floor while preserving their animated bend and swing.
    group.getWorldPosition(a);
    const floor = a.y + .025;
    let lowest = floor;
    for (const leg of rig.legs) lowest = Math.min(lowest, leg.toe.getWorldPosition(b).y, leg.foot.getWorldPosition(c).y - .06);
    if (lowest < floor) {
      const { Hips } = rig.bones;
      const shift = Math.min(.33, floor - lowest) / Hips.parent.getWorldScale(b).y;
      rig.hipsRest = Hips.position.clone();
      b.copy(flatNormal).applyQuaternion(Hips.parent.getWorldQuaternion(q).invert());
      Hips.position.addScaledVector(b, shift);
      Hips.updateWorldMatrix(false, true);
    }
  }
  applyContacts(rig, dt, contacts, terrain);
  if (!lowerAction) settleStance(rig, terrain, 1 - smoothstep(motion.moving, 0, .52), rig.crouchBlend);
  applyWeapon(rig, player, dt, reloadWeight, actionWeight);
}

export function infantryHit(rig) {
  if (rig) rig.hitAge = 0;
}

export function infantryAction(rig, action = 'throw') {
  if (!rig) return;
  rig.action = action;
  rig.actionAge = 0;
}

export function infantryDeath(rig, age) {
  const active = new Set(), duration = rig.template.clips.get('death').lower.duration;
  play(rig, active, 'death', false, age, 1);
  play(rig, active, 'death', true, age, 1);
  evalPose(rig, active);
  rig.flash.visible = false;
  rig.marker.visible = false;
  rig.rifle.visible = age < duration * .55;
}

export function infantrySeat(rig, { vehicle, seat, index, relativeYaw, pitch, shotSeq, dt }) {
  const active = new Set(), driving = seat.role === 'driver', controls = driving || seat.role === 'gunner';
  const exposed = vehicle.type === 'tank' && index > 1;
  const standing = vehicle.type === 'humvee' && seat.role === 'gunner';
  play(rig, active, standing ? 'ready_idle' : 'crouch_idle', false, .2, 1);
  play(rig, active, controls ? 'interact' : 'ready_crouch_idle', true, .22, 1);
  evalPose(rig, active);
  rig.legs.forEach((leg, i) => {
    if (standing) return;
    const side = i === 0 ? 1 : -1, atv = vehicle.type === 'atv';
    target.set(side * (atv ? .33 : .14), exposed ? .53 : 1.65 - seat.height + .65, exposed ? -.43 : atv ? .20 : -.29);
    rig.group.localToWorld(target);
    saveRotation(rig, leg.upper, leg.knee);
    reach(leg.upper, leg.knee, leg.foot, target, 1);
  });
  if (shotSeq !== rig.lastShot) {
    rig.lastShot = shotSeq;
    rig.shotAge = 0;
  } else rig.shotAge += dt;
  applyWeapon(rig, { yaw: rig.group.rotation.y + relativeYaw, pitch }, dt, 0, 0, controls);
  rig.marker.visible = false;
  rig.initialized = false;
  rig.alive = true;
}
