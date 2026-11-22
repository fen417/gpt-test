import * as THREE from 'three';
import { weaponSwitchPose } from '../shared/world.js';
import { cloneInfantry, findInfantryBones, gaitClips, legNames } from './infantry-assets.js';
import { CREW_CONTROLS } from './vehicles.js';
import { LAUNCHER_POSE } from './gadget-poses.js';
import { upgradeMuzzle, showWeaponUpgrades } from './weapon-models.js';
import { weaponAttachmentsFromFlags } from '../shared/weapon-modules.js';

const { clamp, damp, lerp, smoothstep } = THREE.MathUtils;
const turn = (from, target) => Math.atan2(Math.sin(target - from), Math.cos(target - from));
const cycle = phase => ((phase % 1) + 1) % 1;
const TAU = 2 * Math.PI;
const markerGeometry = new THREE.OctahedronGeometry(.059);
const flashGeometry = new THREE.ConeGeometry(.045, .14, 6);
const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
const axis = new THREE.Vector3(), bend = new THREE.Vector3(), joint = new THREE.Vector3();
const desired = new THREE.Vector3(), q = new THREE.Quaternion(), world = new THREE.Quaternion();
const target = new THREE.Vector3();
const flatNormal = new THREE.Vector3(0, 1, 0);
const legPole = new THREE.Vector3(), shoeForward = new THREE.Vector3(), shoeSide = new THREE.Vector3();
const shoeRotation = new THREE.Quaternion(), shoePitch = new THREE.Quaternion();
const rotation = new THREE.Euler(0, 0, 0, 'YXZ');
const deathWeapon = new THREE.Matrix4();
const deathBlendTime = .32;

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
  const foot = bones[side + 'Foot'], toe = bones[side + 'ToeBase'];
  const offset = toe.getWorldPosition(new THREE.Vector3()).sub(foot.getWorldPosition(new THREE.Vector3()));
  return {
    upper: bones[side + 'UpLeg'], knee: bones[side + 'Leg'],
    foot, toe, side: side === 'Left' ? -1 : 1,
    bootRotation: foot.getWorldQuaternion(new THREE.Quaternion()),
    bootYaw: Math.atan2(-offset.x, -offset.z),
    bootPitch: Math.atan2(offset.y, Math.hypot(offset.x, offset.z)),
    ankleHeight: clamp(foot.getWorldPosition(new THREE.Vector3()).y, .08, .16),
    anchor: new THREE.Vector3(), solved: new THREE.Vector3(), weight: 0, locked: false, inContact: false,
  };
}

// The authored knee is unstable as a pole when the leg is nearly straight.
function kneePole(rig, leg) {
  const yaw = rig.group.rotation.y;
  const side = .13 * leg.side;
  return leg.upper.getWorldPosition(legPole).add(shoeForward.set(
    -Math.sin(yaw) + side * Math.cos(yaw), 0, -Math.cos(yaw) - side * Math.sin(yaw),
  ));
}

function bootPitchFor(leg) {
  const offset = leg.toe.getWorldPosition(a).sub(leg.foot.getWorldPosition(b));
  return Math.atan2(offset.y, Math.hypot(offset.x, offset.z));
}

function alignBoot(rig, leg, pitch, weight) {
  const yaw = rig.group.rotation.y - leg.side * .12;
  const tilt = clamp(pitch - leg.bootPitch, -.50, .76);
  shoeSide.set(Math.cos(yaw), 0, -Math.sin(yaw));
  shoeRotation.setFromAxisAngle(flatNormal, yaw - leg.bootYaw).multiply(leg.bootRotation);
  shoeRotation.premultiply(shoePitch.setFromAxisAngle(shoeSide, tilt));
  leg.foot.parent.getWorldQuaternion(q).invert();
  leg.foot.quaternion.slerp(q.multiply(shoeRotation), weight);
  leg.foot.updateWorldMatrix(false, true);
}

const palmUp = new THREE.Vector3(), palmBack = new THREE.Vector3(), palmSide = new THREE.Vector3();
const handFrame = new THREE.Matrix4(), handWorld = new THREE.Quaternion(), rifleWorld = new THREE.Quaternion();
const gripCenter = new THREE.Vector3(), gripWrist = new THREE.Vector3(), elbowPole = new THREE.Vector3();
const shoulderLocal = new THREE.Vector3();
const fingerForward = new THREE.Vector3(), fingerAxis = new THREE.Vector3(), fingerAim = new THREE.Vector3();

function handBasis(forward, indexward, out) {
  palmBack.copy(forward).normalize().negate();
  palmSide.crossVectors(indexward, palmBack).normalize();
  palmUp.crossVectors(palmBack, palmSide);
  return out.setFromRotationMatrix(handFrame.makeBasis(palmSide, palmUp, palmBack));
}

const primaryPalm = new THREE.Vector3(.024, .013, .015), supportPalm = new THREE.Vector3();
const launcherSupport = new THREE.Vector3(...LAUNCHER_POSE.remoteSupport);
const launcherShoulder = new THREE.Vector3(...LAUNCHER_POSE.remoteShoulder);
const rightGrip = handBasis(new THREE.Vector3(-.29, -.13, -.95), flatNormal, new THREE.Quaternion());
const leftGrip = handBasis(new THREE.Vector3(.58, .08, -.81), new THREE.Vector3(-.81, 0, -.58), new THREE.Quaternion());
const foregripHold = handBasis(new THREE.Vector3(.12, .25, -.96), new THREE.Vector3(0, .90, -.42), new THREE.Quaternion());
const pistolSupport = handBasis(new THREE.Vector3(.28, .06, -.96), flatNormal, new THREE.Quaternion());
const magazineGrip = handBasis(new THREE.Vector3(.78, -.10, -.62), flatNormal, new THREE.Quaternion());
const supportFrame = new THREE.Quaternion();
const supportShoulder = new THREE.Vector3(), supportShift = new THREE.Vector3();
const primaryShoulder = new THREE.Vector3(), primaryWrist = new THREE.Vector3();


function bindHand(bones, prefix) {
  const wrist = bones[prefix + 'Hand'];
  const middle = wrist.worldToLocal(bones[prefix + 'HandMiddle1'].getWorldPosition(new THREE.Vector3()));
  const across = wrist.worldToLocal(bones[prefix + 'HandIndex1'].getWorldPosition(new THREE.Vector3()))
    .sub(wrist.worldToLocal(bones[prefix + 'HandPinky1'].getWorldPosition(new THREE.Vector3())));
  const hand = {
    wrist, upper: bones[prefix + 'Arm'], forearm: bones[prefix + 'ForeArm'],
    scale: wrist.getWorldScale(new THREE.Vector3()).x,
    forearmLength: wrist.getWorldPosition(new THREE.Vector3())
      .distanceTo(bones[prefix + 'ForeArm'].getWorldPosition(new THREE.Vector3())),
    upperLength: bones[prefix + 'Arm'].getWorldPosition(new THREE.Vector3())
      .distanceTo(bones[prefix + 'ForeArm'].getWorldPosition(new THREE.Vector3())),
    basis: handBasis(middle, across, new THREE.Quaternion()),
    contact: middle.clone().multiplyScalar(.87),
    fingers: ['Index', 'Middle', 'Ring', 'Pinky'].map(name => [1, 2, 3, 4].map(n => bones[prefix + 'Hand' + name + n])),
    thumb: [1, 2, 3].map(n => bones[prefix + 'HandThumb' + n]),
  };
  hand.closed = closedFingers(hand, prefix === 'Right');
  if (prefix === 'Left') hand.wrapped = closedFingers(hand, false, true);
  return hand;
}

function wristTarget(rifle, hand, grip, frame) {
  rifle.getWorldQuaternion(rifleWorld);
  handWorld.copy(hand.basis).invert().premultiply(frame).premultiply(rifleWorld);
  gripWrist.copy(hand.contact).multiplyScalar(hand.scale).applyQuaternion(handWorld);
  rifle.localToWorld(gripCenter.copy(grip)).sub(gripWrist);
}

function bringGripIntoReach(rig, grip, frame, weight, foregrip, stock) {
  const { rifle, group, leftHand, rightHand } = rig;
  if (weight > .005) {
    wristTarget(rifle, leftHand, grip, frame);
    leftHand.upper.getWorldPosition(supportShoulder);
    supportShift.subVectors(supportShoulder, gripCenter);
    const distance = supportShift.length();
    const limit = leftHand.upperLength + leftHand.forearmLength - .021;
    if (distance > limit) {
      supportShift.multiplyScalar(Math.min(.27, distance - limit) * weight / distance);
      rifle.getWorldPosition(gripCenter).add(supportShift);
      rifle.position.copy(group.worldToLocal(gripCenter));
      rifle.updateWorldMatrix(true, false);
    }
  }
  // Keep the trigger wrist clear of the torso when reaching with the support
  // hand, especially as the gun comes up and rolls during a reload.
  wristTarget(rifle, rightHand, primaryPalm, rightGrip);
  group.worldToLocal(gripCenter);
  group.worldToLocal(rightHand.upper.getWorldPosition(primaryShoulder));
  primaryWrist.subVectors(gripCenter, primaryShoulder);
  primaryWrist.x = Math.max(primaryWrist.x, -.18);
  primaryWrist.y = Math.min(primaryWrist.y, -.025);
  primaryWrist.z = Math.min(primaryWrist.z, foregrip ? -.085 : -.11);
  const reachLimit = rightHand.upperLength + rightHand.forearmLength - .012;
  primaryWrist.clampLength(.16, reachLimit);
  rifle.position.add(primaryWrist.add(primaryShoulder).sub(gripCenter));
  rifle.updateWorldMatrix(true, false);
  if (stock) {
    // The butt must stay in front of the shoulder even when the support arm
    // reaches its limit. A hand constraint must never pull it through the vest.
    target.copy(stock);
    group.worldToLocal(rifle.localToWorld(target));
    const penetration = target.z - (primaryShoulder.z - .075);
    if (penetration > 0) rifle.position.z -= penetration;
    rifle.updateWorldMatrix(true, false);
  }
}

function gripHand(rig, hand, grip, frame, side, weight, attachment = rig.rifle) {
  if (weight < .005) return;
  const { group } = rig;
  wristTarget(attachment, hand, grip, frame);
  group.worldToLocal(hand.upper.getWorldPosition(shoulderLocal));
  if (side === 1) {
    // Prefer the elbow position that continues the grip's wrist axis. Keep
    // the pole outside the shoulder so wide turns cannot fold into the vest.
    elbowPole.copy(gripCenter).addScaledVector(gripWrist.normalize(), -hand.forearmLength);
    group.worldToLocal(elbowPole);
    elbowPole.x = Math.max(shoulderLocal.x + .065, elbowPole.x);
    elbowPole.y = Math.min(shoulderLocal.y + .015, elbowPole.y);
  } else {
    elbowPole.copy(shoulderLocal);
    elbowPole.x -= .36;
    elbowPole.y -= .50;
    elbowPole.z += .05;
  }
  group.localToWorld(elbowPole);
  saveRotation(rig, hand.upper, hand.forearm, hand.wrist);
  reach(hand.upper, hand.forearm, hand.wrist, gripCenter, weight, elbowPole);
  hand.wrist.parent.getWorldQuaternion(q).invert().multiply(handWorld);
  hand.wrist.quaternion.slerp(q, weight);
  hand.wrist.updateWorldMatrix(false, true);
}

function closedFingers(hand, right, foregrip = false) {
  hand.wrist.getWorldQuaternion(handWorld);
  rifleWorld.copy(handWorld).multiply(hand.basis);
  fingerForward.set(0, 0, -1).applyQuaternion(rifleWorld);
  fingerAxis.set(right ? -1 : 1, 0, 0).applyQuaternion(rifleWorld);
  const result = [], original = [];
  for (const [index, chain] of hand.fingers.entries()) {
    const curl = right ? (index === 0 ? [.15, .54, 1.08] : [.62, 1.52, 2.05]) :
      foregrip ? [.27, 1.36, 2.75] : [.55, 1.19, 1.72];
    for (let i = 0; i < 3; i++) {
      const bone = chain[i], next = chain[i + 1];
      if (!bone || !next) continue;
      const from = next.getWorldPosition(b).sub(bone.getWorldPosition(a));
      fingerAim.copy(fingerForward).multiplyScalar(Math.cos(curl[i])).addScaledVector(fingerAxis, Math.sin(curl[i]));
      if (foregrip && index === 3) fingerAim.addScaledVector(palmUp.set(0, 1, 0).applyQuaternion(rifleWorld), .34);
      original.push([bone, bone.quaternion.clone()]);
      aimJoint(bone, from, fingerAim);
      result.push([bone, bone.quaternion.clone()]);
    }
  }
  if (!right) {
    palmUp.set(0, 1, 0).applyQuaternion(rifleWorld);
    for (let i = 0; i < hand.thumb.length - 1; i++) {
      const bone = hand.thumb[i], next = hand.thumb[i + 1];
      if (!bone || !next) continue;
      original.push([bone, bone.quaternion.clone()]);
      const from = next.getWorldPosition(b).sub(bone.getWorldPosition(a));
      fingerAim.copy(fingerForward).addScaledVector(palmUp, foregrip ? (i === 0 ? -.18 : -.53) : (i === 0 ? .45 : .27))
        .addScaledVector(fingerAxis, foregrip ? (i === 0 ? .38 : .86) : (i === 0 ? .30 : .58));
      aimJoint(bone, from, fingerAim);
      result.push([bone, bone.quaternion.clone()]);
    }
  }
  for (const [bone, rotation] of original) bone.quaternion.copy(rotation);
  hand.wrist.updateWorldMatrix(false, true);
  return result;
}

function closeFingers(rig, hand, weight, wrap = 0) {
  if (weight < .01) return;
  for (const [index, [bone, rotation]] of hand.closed.entries()) {
    saveRotation(rig, bone);
    bone.quaternion.slerp(wrap ? q.slerpQuaternions(rotation, hand.wrapped[index][1], wrap) : rotation, weight);
  }
}

const classKit = {
  medic: [['MedicHelmetBadge', 'Head'], ['MedicArmband', 'LeftForeArm']],
  support: [['EngineerProtection', 'Head'], ['EngineerPack', 'Spine2']],
  recon: [['ScoutBoonie', 'Head']],
};

export function createInfantry({ template, gun, kit }, player) {
  const group = new THREE.Group(), model = cloneInfantry(template);
  const bones = findInfantryBones(model);
  const parts = [];
  let variant = 0;
  for (const letter of String(player.id ?? "")) variant = (Math.imul(variant, 31) + letter.charCodeAt(0)) | 0;
  variant = (variant >>> 0) % 3;
  let optional = 0;
  const replacedHeadgear = kit && player.classId === 'recon'
    ? (player.team ? 'GreenCap' : 'helmet') : null;
  for (const [name, levels] of template.levels) {
    const base = model.getObjectByName(name);
    if (!base) throw new Error('Cannot bind infantry LOD for ' + name);
    const visible = !base.userData.optionalPouch || optional++ < variant;
    let index = 0;
    base.traverse(mesh => {
      if (!mesh.isMesh) return;
      mesh.visible = visible && mesh.material.name !== replacedHeadgear;
      mesh.frustumCulled = false; // the actor has a single conservative frustum test
      mesh.receiveShadow = true;
      const geometries = [mesh.geometry, ...levels.slice(1).map(level => level[index])];
      if (geometries.length !== 4 || geometries.some(geometry => !geometry)) throw new Error('Incomplete infantry LOD');
      parts.push({ mesh, geometries });
      index++;
    });
  }
  const details = [];
  if (kit) {
    model.updateMatrixWorld(true);
    for (const [name, joint] of classKit[player.classId] ?? []) {
      const detail = kit.getObjectByName(name).clone(true);
      // The equipment was fitted on the neutral pose in normalized model space.
      bones[joint].attach(detail);
      detail.traverse(mesh => {
        if (!mesh.isMesh) return;
        mesh.frustumCulled = false;
        mesh.receiveShadow = true;
        details.push(mesh);
      });
    }
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
    group, model, parts, details, bones, head, marker, rifle, flash, template,
    mixer: new THREE.AnimationMixer(model), actions: new Map(), activeActions: new Set(),
    team: player.team, classId: player.classId, lod: 0, alive: true,
    motion: { phase: 0, speed: 0, vx: 0, vz: 0, x: 0, z: 0, moving: 0, gait: new Map() },
    legs: legNames.map(side => newLeg(bones, side)), recoil: 0, shotAge: Infinity, hitAge: Infinity,
    actionAge: Infinity, jumpAge: Infinity, landAge: Infinity, slideAge: Infinity,
    lastShot: player.shotSeq, corrections: new Map(),
    support: new THREE.Vector3(), muzzle: new THREE.Vector3(),
    rightHand: bindHand(bones, 'Right'), leftHand: bindHand(bones, 'Left'),
  };
  setInfantryWeapon(rig, gun, player.weaponId);
  return rig;
}

export function setInfantryWeapon(rig, template, weaponId) {
  rig.weaponModel?.removeFromParent();
  rig.distantWeapon?.removeFromParent();
  rig.weaponModel = template.model.clone(true);
  rig.distantWeapon = template.distantWeapon.clone();
  rig.weaponTemplate = template;
  rig.attachmentFlags = 0;
  rig.weaponId = weaponId;
  rig.pistol = template.pistol;
  rig.support.copy(template.support);
  rig.foregrip = template.foregrip;
  rig.stock = template.stock;
  rig.muzzle.copy(template.muzzle);
  rig.flash.position.copy(rig.muzzle);
  rig.flash.position.z -= .052;
  rig.rifle.add(rig.weaponModel, rig.distantWeapon);
  rig.weaponModel.visible = rig.lod < 2;
  rig.distantWeapon.visible = rig.lod >= 2;
  rig.magazine = rig.weaponModel.getObjectByName(template.magazineName);
  rig.magazineRest = rig.magazine?.position.clone();
  rig.magazineContact = template.magazineContact;
  rig.feedCover = rig.weaponModel.getObjectByName('FeedCover');
}

function updateInfantryUpgrades(rig, flags) {
  if (flags === rig.attachmentFlags) return;
  const model = rig.weaponModel;
  showWeaponUpgrades(model, rig.weaponId, weaponAttachmentsFromFlags(flags));
  rig.attachmentFlags = flags;
  const template = rig.weaponTemplate;
  const distant = flags ? template.getDistantUpgrade(rig.weaponId, flags) : template.distantWeapon;
  rig.distantWeapon.geometry = distant.geometry;
  rig.distantWeapon.material = distant.material;
  if (upgradeMuzzle(model, rig.flash.position))
    rig.flash.position.applyMatrix4(model.matrix);
  else rig.flash.position.copy(template.muzzle);
  rig.flash.position.z -= .052;
}

export function setInfantryLod(rig, level, shadows) {
  rig.lod = level;
  rig.weaponModel.visible = level < 2;
  rig.distantWeapon.visible = level >= 2;
  for (const { mesh, geometries } of rig.parts) {
    mesh.geometry = geometries[level];
    mesh.castShadow = shadows;
  }
  for (const mesh of rig.details) mesh.castShadow = shadows;
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

function shiftHips(rig, worldDelta) {
  const { Hips } = rig.bones;
  const shift = worldDelta / Hips.parent.getWorldScale(b).y;
  rig.hipsRest = Hips.position.clone();
  b.copy(flatNormal).applyQuaternion(Hips.parent.getWorldQuaternion(q).invert());
  Hips.position.addScaledVector(b, shift);
  Hips.updateWorldMatrix(false, true);
}

function applyContacts(rig, dt, confidence, terrain, stance, crouchDepth, crouchStride) {
  const { group, motion } = rig;
  const planarSpeed = crouchStride > 0 ? Math.hypot(motion.vx, motion.vz) : 0;
  const stretch = planarSpeed > .05;
  const forwardX = stretch ? motion.vx / planarSpeed : 0;
  const forwardZ = stretch ? motion.vz / planarSpeed : 0;
  for (const leg of rig.legs) {
    leg.foot.getWorldPosition(leg.solved);
    if (leg.pathWeight > .001) {
      target.copy(leg.path).multiplyScalar(1 / leg.pathWeight);
      group.localToWorld(target);
      leg.solved.lerp(target, leg.pathWeight);
    }
    leg.pitch = bootPitchFor(leg);
    if (stretch) {
      const travel = (leg.solved.x - group.position.x) * forwardX + (leg.solved.z - group.position.z) * forwardZ;
      const extension = clamp(travel * crouchStride, -.16, .16);
      leg.solved.x += extension * forwardX;
      leg.solved.z += extension * forwardZ;
    }
  }
  const lowered = crouchDepth > .001;
  if (lowered) shiftHips(rig, -crouchDepth);
  const crouch = rig.crouchBlend;
  for (const [index, leg] of rig.legs.entries()) {
    if (confidence[index] > lerp(.50, .36, crouch) && !leg.inContact) {
      leg.inContact = true;
      leg.anchor.copy(leg.solved);
      const ground = terrain?.heightAt?.(leg.anchor.x, leg.anchor.z);
      const y = Number.isFinite(ground) && Math.abs(ground - group.position.y) < .23 ? ground : group.position.y;
      leg.anchor.y = y + leg.ankleHeight;
      leg.locked = true;
    }
    if (confidence[index] < lerp(.24, .15, crouch)) {
      leg.inContact = false;
      leg.locked = false;
    }
    leg.upper.getWorldPosition(a);
    const reachLimit = a.distanceTo(leg.knee.getWorldPosition(b)) + b.distanceTo(leg.foot.getWorldPosition(c));
    if (leg.anchor.distanceToSquared(leg.solved) > lerp(.24, .40, crouch) ** 2 ||
      leg.anchor.distanceToSquared(a) > (reachLimit + .065) ** 2) leg.locked = false;
    leg.weight = damp(leg.weight, leg.locked ? 1 : 0, leg.locked ? 48 : 22, dt);
    if (rig.lod > 1 && !lowered && !leg.pathWeight) continue;
    saveRotation(rig, leg.upper, leg.knee, leg.foot);
    if (lowered || leg.pathWeight > .001) {
      // Lower the torso without lowering the boot paths through the ground.
      target.copy(leg.solved).lerp(leg.anchor, leg.weight);
      reach(leg.upper, leg.knee, leg.foot, target, 1, kneePole(rig, leg));
    } else if (leg.weight > .01) {
      reach(leg.upper, leg.knee, leg.foot, leg.anchor, leg.weight, kneePole(rig, leg));
    }
    const blend = stance * (1 - leg.weight);
    if (blend > .015) {
      target.set(leg.side * lerp(.147, .178, rig.crouchBlend), leg.ankleHeight, leg.side * .105);
      group.localToWorld(target);
      const ground = terrain?.heightAt?.(target.x, target.z);
      if (Number.isFinite(ground) && Math.abs(ground - group.position.y) < .23) target.y = ground + leg.ankleHeight;
      reach(leg.upper, leg.knee, leg.foot, target, blend, kneePole(rig, leg));
    }
    // Keep the authored heel lift within the shoe's sagittal plane. A raw
    // toe track can roll the shoe sideways or point it back during swing.
    const support = Math.max(stance, leg.weight);
    const nextPitch = lerp(clamp(leg.pitch, -.95, .33), leg.bootPitch, support);
    alignBoot(rig, leg, nextPitch, 1);
  }
}

function applyWeapon(rig, player, dt, reload, actionWeight) {
  const { bones, group, rifle } = rig;
  const launcher = (player.heldGadget ?? player.gadgetAction) === 'launcher';
  const pistol = rig.pistol && !launcher, foregrip = rig.foregrip && !launcher;
  const afterSwitch = weaponSwitchPose(player.equipTime).lowered;
  const bodyAim = clamp(turn(group.rotation.y, player.yaw ?? group.rotation.y), -.67, .67);
  const pitch = clamp(player.pitch ?? 0, -.9, .9);
  const sprint = player.sprint ? smoothstep(rig.motion.speed, 4.6, 6.1) : 0;
  const wantsAim = Number(Boolean(player.aim));
  const aimed = rig.gripAim = damp(rig.gripAim ?? wantsAim, wantsAim, 16, dt);
  const carrying = .10 * (1 - aimed);
  const aimWeight = (1 - actionWeight) * (1 - reload * .72);
  const reloadProgress = player.reloading ? player.reloadProgress ?? 0 : 0;
  const magazineWeight = !launcher && rig.magazineContact ?
    smoothstep(reloadProgress, .06, .20) * (1 - smoothstep(reloadProgress, .79, .94)) : 0;
  if (aimWeight > .01) {
    saveRotation(rig, bones.Spine1, bones.Spine2, bones.Head);
    if (!pistol) {
      // Bring the support shoulder forward and leave space behind the stock.
      bones.Spine1.parent.getWorldQuaternion(q).invert();
      b.copy(flatNormal).applyQuaternion(q);
      const shoulderTurn = .28 + .04 * magazineWeight + .06 * sprint;
      bones.Spine1.quaternion.premultiply(q.setFromAxisAngle(b, -shoulderTurn * (1 - actionWeight)));
      if (foregrip && pitch < 0) {
        const yaw = group.rotation.y;
        b.set(Math.cos(yaw), 0, -Math.sin(yaw)).applyQuaternion(bones.Spine1.parent.getWorldQuaternion(q).invert());
        bones.Spine1.quaternion.premultiply(q.setFromAxisAngle(b, pitch * .44 * aimWeight));
      }
    }
    bones.Spine1.quaternion.premultiply(q.setFromAxisAngle(b.set(0, 0, 1), -pitch * .12 * aimWeight));
    bones.Spine2.rotateY(bodyAim * .22 * aimWeight);
    bones.Head.rotateY(bodyAim * .22 * aimWeight);
    bones.Spine1.updateWorldMatrix(false, true);
  }
  const shoulder = group.worldToLocal(rig.rightHand.upper.getWorldPosition(target));
  const shoulderOffset = pistol ? .10 : .057;
  const armExtension = .252 + Math.max(0, rig.rightHand.upperLength - .20) * .92;
  const reachDepth = armExtension + (pistol ? .060 : .018) + aimed * .040;

  rifle.position.set(
    clamp(shoulder.x - shoulderOffset, .045, .205) + reload * .025,
    shoulder.y - lerp(.225, .105 - pitch * .14, aimed) + reload * .10,
    Math.min(-.15, shoulder.z - reachDepth) + rig.recoil * .015);
  rifle.quaternion.setFromEuler(rotation.set(
    lerp(pitch, -.42, lerp(carrying, .7, sprint)) - reload * .28 + magazineWeight * .35 - afterSwitch * .62 + rig.recoil * .06,
    bodyAim + reload * .12 + magazineWeight * (pistol ? .12 : .53) + afterSwitch * .15 + sprint * (pistol ? 0 : .19),
    reload * -.25 - afterSwitch * .19));
  rifle.visible = actionWeight < .9;
  rifle.updateWorldMatrix(true, true);
  if (rig.magazine) {
    rig.magazine.position.copy(rig.magazineRest);
    const travel = smoothstep(reloadProgress, .20, .37) * (1 - smoothstep(reloadProgress, .58, .79));
    rig.magazine.position.y -= .14 * travel;
  }
  if (rig.feedCover) {
    rig.feedCover.rotation.x = -1.07 * smoothstep(reloadProgress,.04,.19) * (1-smoothstep(reloadProgress,.73,.90));
  }
  if (rifle.visible) {
    const supportWeight = 1 - actionWeight;
    supportPalm.copy(launcher ? launcherSupport : rig.support);
    supportFrame.copy(pistol ? pistolSupport : foregrip ? foregripHold : leftGrip);
    if (magazineWeight) {
      target.copy(rig.magazineContact);
      rig.magazine.localToWorld(target);
      supportPalm.lerp(rifle.worldToLocal(target), magazineWeight);
      supportFrame.slerp(magazineGrip, magazineWeight);
    }
    bringGripIntoReach(rig, supportPalm, supportFrame, supportWeight, foregrip,
      launcher ? launcherShoulder : pistol ? null : rig.stock);
    gripHand(rig, rig.rightHand, primaryPalm, rightGrip, 1, 1);
    gripHand(rig, rig.leftHand, supportPalm, supportFrame, -1, supportWeight);
    if (rig.lod < 2) {
      closeFingers(rig, rig.rightHand, 1);
      const transition = magazineWeight * (1 - magazineWeight);
      closeFingers(rig, rig.leftHand, supportWeight * (1 - 1.5 * transition), foregrip ? 1 - magazineWeight : 0);
    }
  }
  rig.flash.visible = rifle.visible && rig.shotAge < .042 && rig.lod < 2;
  rig.recoil *= Math.exp(-18 * dt);
}

export function infantryTurnTolerance(rig, aiming, sliding) {
  if (sliding) return 0;
  return rig.foregrip && aiming ? .16 : .30;
}

export function updateInfantry(rig, player, dt, reset = false, terrain = null) {
  const { group, motion } = rig;
  if (player.weaponId === rig.weaponId) updateInfantryUpgrades(rig, player.attachmentFlags ?? 0);
  rig.deathPose = null;
  dt = Math.max(dt, .001);
  if (reset) {
    Object.assign(motion, { x: group.position.x, z: group.position.z, speed: 0, vx: 0, vz: 0, moving: 0, phase: 0 });
    motion.gait.clear();
    rig.upperWeights?.clear();
    rig.crouchBlend = Number(Boolean(player.crouch || player.crouching));
    for (const leg of rig.legs) { leg.locked = false; leg.inContact = false; leg.weight = 0; }
    Object.assign(rig, { lastShot: player.shotSeq, shotAge: Infinity, hitAge: Infinity, recoil: 0,
      airborne: player.grounded === false, sliding: Boolean(player.sliding), jumpAge: Infinity,
      landAge: Infinity, slideAge: Infinity, actionAge: Infinity, slideExit: Infinity, gripAim: Number(Boolean(player.aim)) });
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
  let stride = 0, weightSum = 0, crouchDepth = 0, crouchWeight = 0;
  for (const [name, weight] of motion.gait) {
    const gait = rig.template.gaits.get(name);
    stride += weight * gait.distance;
    if (name.startsWith('mocap_crouch_')) {
      crouchDepth += weight * Math.max(0, gait.hipsHeight - .695);
      crouchWeight += weight;
    }
    weightSum += weight;
  }
  // Increase distance per cycle when the game outruns a captured gait.
  // Resolve the remaining discrepancy where the boot touches the ground.
  const maxCyclesPerSecond = crouched ? lerp(1.6, 2.1, smoothstep(motion.speed, .55, 3.15)) :
    lerp(1.95, 2.40, smoothstep(motion.speed, 2.6, 6.4));
  const measured = weightSum ? stride / weightSum : 1;
  const cycleDistance = Math.max(measured, motion.speed / maxCyclesPerSecond);
  motion.cycleDistance = cycleDistance;
  // Smooth packet-sized changes in travel over the same short window used
  // for the blend. Its integral still tracks rendered travel at steady pace.
  if (weightSum && motion.speed > .035) motion.phase = cycle(motion.phase + motion.speed * dt / cycleDistance);

  const active = new Set();
  const contacts = [0, 0];
  for (const leg of rig.legs) {
    (leg.path ??= new THREE.Vector3()).set(0, 0, 0);
    leg.pathWeight = 0;
  }
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
        if (gait.paths) {
          const path = gait.paths[i], leg = rig.legs[i];
          a.fromArray(path[index]).lerp(b.fromArray(path[(index + 1) % path.length]), sample - index);
          leg.path.addScaledVector(a, w);
          leg.pathWeight += w;
        }
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
  // Bots keep their aiming pose through a burst. Weapon recoil and hand IK
  // still animate each shot without restarting the captured neck motion.
  const shoot = !player.bot && !prone && rig.shotAge < .18 ? .47 * (1 - rig.shotAge / .18) : 0;
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
  const kneeling = action === 'revive_kneel' && actionWeight > .01;
  if (kneeling) {
    for (const action of active) if (action.getClip().name.endsWith(':lower')) {
      action.setEffectiveWeight(action.getEffectiveWeight() * (1 - actionWeight));
    }
    play(rig, active, 'revive_kneel', false, rig.actionAge, actionWeight);
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
      shiftHips(rig, Math.min(.33, floor - lowest));
    }
  }
  if (lowerAction || kneeling) {
    for (const leg of rig.legs) { leg.locked = false; leg.inContact = false; leg.weight = 0; }
  } else {
    const movingWeight = weightSum ? motion.moving / weightSum : 0;
    const drop = crouchDepth * movingWeight;
    const stretch = clamp(cycleDistance / measured - 1, 0, .85) * crouchWeight * movingWeight;
    applyContacts(rig, dt, contacts, terrain, 1 - smoothstep(motion.moving, 0, .52), drop, stretch);
  }
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
  const { bones, group, rifle } = rig;
  const { Hips, RightHand } = bones;
  if (!rig.deathPose) {
    group.worldToLocal(Hips.getWorldPosition(target));
    const blend = rig.activeActions.size > 0 && target.y >= 0;
    rifle.updateWorldMatrix(true, false);
    RightHand.updateWorldMatrix(true, false);
    rig.deathPose = {
      hips: blend ? Hips.position.clone() : null,
      rotations: blend ? Object.values(bones).map(bone => [bone, bone.quaternion.clone()]) : null,
      down: blend && target.y < .32,
      weapon: rifle.visible ? RightHand.matrixWorld.clone().invert().multiply(rifle.matrixWorld) : null,
    };
  }
  const death = rig.deathPose;
  const active = new Set(), duration = rig.template.clips.get('death').lower.duration;
  // The source winds the wrists and elbows sharply during the first .17 s.
  // Blend the rendered pose into the stable part of the upper-body track.
  const time = age + (death.down ? 1.45 : 0);
  play(rig, active, 'death', false, time, 1);
  play(rig, active, 'death', true, Math.max(deathBlendTime, time), 1);
  evalPose(rig, active);
  if (death.rotations && age < deathBlendTime) {
    const weight = smoothstep(age, 0, deathBlendTime);
    rig.hipsRest = Hips.position.clone();
    Hips.position.lerp(death.hips, 1 - weight);
    for (const [bone, from] of death.rotations) {
      saveRotation(rig, bone);
      bone.quaternion.slerp(from, 1 - weight);
    }
    Hips.updateWorldMatrix(false, true);
  } else {
    death.rotations = death.hips = null;
  }
  rifle.visible = Boolean(death.weapon && time < duration * .55);
  if (rifle.visible) {
    deathWeapon.copy(group.matrixWorld).invert().multiply(RightHand.matrixWorld).multiply(death.weapon);
    deathWeapon.decompose(rifle.position, rifle.quaternion, rifle.scale);
    rifle.updateWorldMatrix(false, true);
  }
  rig.flash.visible = false;
  rig.marker.visible = false;
}

// The review can inspect the original tracks with the same mixer that runs in play.
export function sampleInfantryClip(rig, name, time) {
  const active = new Set();
  play(rig, active, name, false, time, 1);
  play(rig, active, name, true, time, 1);
  evalPose(rig, active);
  rig.rifle.visible = false;
  rig.flash.visible = false;
}

// Heights are measured from the vehicle origin, on the cushion, deck or floor.
// The ankle targets include clearance for the soles of the remastered boots.
const ridingPose = {
  tankSide: { hips: 1.59, ankle: [.15, 1.09, -.46] },
  tankRear: { hips: 1.42, ankle: [.15, .92, -.46] },
  atvDriver: { hips: 1.04, ankle: [.35, .64, .13] },
  atvPassenger: { hips: 1.07, ankle: [.38, .64, -.14] },
  humveeCabin: { hips: 1.02, ankle: [.18, .86, -.44] },
  humveeGunner: { hips: 1.61, ankle: [.16, .86, .06] },
};
const neutralControl = new THREE.Object3D();
const controlGrip = new THREE.Vector3();
const controlFrames = [-1, 1].map(side => ({
  atv: handBasis(new THREE.Vector3(0, -.42, -1), new THREE.Vector3(-side, 0, 0), new THREE.Quaternion()),
  driver: handBasis(new THREE.Vector3(-side * .45, 0, -.89), flatNormal, new THREE.Quaternion()),
  gunner: handBasis(new THREE.Vector3(0, -.12, -1), flatNormal, new THREE.Quaternion()),
}));

function poseVehicleHands(rig, control, kind, seat) {
  const { origin, grip } = CREW_CONTROLS[kind];
  // The standalone animation viewer previews the same controls at rest.
  if (!control) {
    neutralControl.position.set(origin[0] - seat.x, origin[1] - seat.height, origin[2] - seat.z);
    rig.group.add(neutralControl);
    control = neutralControl;
  }
  for (const side of [-1, 1]) {
    const hand = side < 0 ? rig.leftHand : rig.rightHand;
    controlGrip.set(side * grip[0], grip[1], grip[2]);
    gripHand(rig, hand, controlGrip, controlFrames[(side + 1) / 2][kind], side, 1, control);
    if (rig.lod < 2) closeFingers(rig, hand, 1);
  }
  neutralControl.removeFromParent();
}

export function infantrySeat(rig, { vehicle, seat, index, control, relativeYaw, pitch, aim, shotSeq, dt }) {
  const { group, bones } = rig;
  rig.deathPose = null;
  const active = new Set(), atv = vehicle.type === 'atv', driving = seat.role === 'driver';
  const gunner = seat.role === 'gunner', controls = driving || gunner;
  const pose = vehicle.type === 'tank' ? (index === 4 ? ridingPose.tankRear : ridingPose.tankSide) :
    atv ? (driving ? ridingPose.atvDriver : ridingPose.atvPassenger) :
    gunner ? ridingPose.humveeGunner : ridingPose.humveeCabin;
  play(rig, active, 'ready_idle', false, .2, 1);
  play(rig, active, controls ? 'interact' : 'ready_idle', true, .22, 1);
  evalPose(rig, active);
  const { Hips, Spine } = bones;
  rig.hipsRest = Hips.position.clone();
  target.set(0, pose.hips - seat.height, 0);
  Hips.position.copy(Hips.parent.worldToLocal(group.localToWorld(target)));
  Hips.updateWorldMatrix(false, true);
  if (driving) {
    // Lean toward the controls while keeping the pelvis against the seat.
    saveRotation(rig, Spine);
    target.set(1, 0, 0).applyQuaternion(group.getWorldQuaternion(shoeRotation));
    target.applyQuaternion(Spine.parent.getWorldQuaternion(q).invert());
    Spine.quaternion.premultiply(q.setFromAxisAngle(target, atv ? -.56 : -.24));
    Spine.updateWorldMatrix(false, true);
  }
  for (const leg of rig.legs) {
    const [width, height, depth] = pose.ankle;
    group.localToWorld(target.set(leg.side * width, height - seat.height, depth));
    group.worldToLocal(leg.upper.getWorldPosition(legPole));
    legPole.x += leg.side * (atv ? .46 : .12);
    legPole.z -= 1;
    group.localToWorld(legPole);
    saveRotation(rig, leg.upper, leg.knee, leg.foot);
    reach(leg.upper, leg.knee, leg.foot, target, 1, legPole);
    // Align the soles with the vehicle, including its suspension pitch and roll.
    group.getWorldQuaternion(shoeRotation).multiply(shoePitch.setFromAxisAngle(flatNormal,
      -leg.bootYaw - leg.side * .12)).multiply(leg.bootRotation);
    leg.foot.parent.getWorldQuaternion(q).invert();
    leg.foot.quaternion.copy(q.multiply(shoeRotation));
    leg.foot.updateWorldMatrix(false, true);
  }
  if (shotSeq !== rig.lastShot) {
    rig.lastShot = shotSeq;
    rig.shotAge = 0;
    rig.recoil = 1;
  } else rig.shotAge += dt;
  if (controls) {
    poseVehicleHands(rig, control, gunner ? 'gunner' : atv ? 'atv' : 'driver', seat);
    rig.rifle.visible = rig.flash.visible = false;
  } else {
    // On the tandem seat, carry the rifle to the side of the driver until aiming.
    const carrying = atv && !aim ? smoothstep(rig.shotAge, .06, .23) : 0;
    const yaw = lerp(clamp(relativeYaw, -.67, .67), .67, carrying);
    applyWeapon(rig, { yaw: group.rotation.y + yaw, pitch: lerp(pitch ?? 0, -.26, carrying), aim }, dt, 0, 0);
  }
  rig.marker.visible = false;
  rig.initialized = false;
  rig.alive = true;
}
