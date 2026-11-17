import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { VEHICLE_TYPES } from '../shared/vehicles.js';
import { gaitClips, InfantryAssets } from '../src/infantry-assets.js';
import { createInfantry, infantryDeath, infantrySeat, locomotionWeights, updateInfantry } from '../src/infantry.js';

const gltf = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).register(() => ({
  name: 'KHR_texture_basisu',
  loadTexture: () => Promise.resolve(new THREE.Texture()),
}));
const assets = Object.assign(Object.create(InfantryAssets.prototype), {
  templates: new Map(), pending: new Map(), loader: { async loadAsync(url) {
    const bytes = await readFile(new URL(url));
    return gltf.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  } },
});

const bodies = ['regular', 'militia'];
const layouts = [];
for (const faction of bodies) {
  test(faction + ' has an independent skinned body with four ordered LODs and packed textures', async () => {
    const file = await readFile(new URL('../src/assets/infantry/' + faction + '.glb', import.meta.url));
    assert.equal(file.toString('ascii', 0, 4), 'glTF');
    const gltf = JSON.parse(file.toString('utf8', 20, 20 + file.readUInt32LE(12)));
    assert.ok(gltf.extensionsRequired.includes('KHR_texture_basisu'));
    assert.ok(gltf.images.every(image => image.mimeType === 'image/ktx2'));
    assert.ok(gltf.materials.some(material => material.normalTexture &&
      material.pbrMetallicRoughness.baseColorTexture && material.pbrMetallicRoughness.metallicRoughnessTexture));
    assert.ok(gltf.skins.some(skin => skin.joints.length > 50));
    const base = gltf.nodes.filter(node => /^body-\d+$/.test(node.name) && node.mesh !== undefined);
    assert.ok(base.some(node => node.skin !== undefined));
    const triangleCount = mesh => mesh.primitives.reduce((total, prim) => total + gltf.accessors[prim.indices].count / 3, 0);
    for (const part of base) {
      let triangles = triangleCount(gltf.meshes[part.mesh]);
      for (let level = 1; level <= 3; level++) {
        const node = gltf.nodes.find(node => node.name === part.name + '-lod' + level);
        assert.ok(node, part.name);
        assert.deepEqual(gltf.skins[node.skin]?.joints, gltf.skins[part.skin]?.joints, node.name);
        assert.deepEqual([node.translation, node.rotation, node.scale], [part.translation, part.rotation, part.scale], node.name);
        assert.equal(gltf.skins[node.skin]?.inverseBindMatrices, gltf.skins[part.skin]?.inverseBindMatrices, node.name);
        const next = triangleCount(gltf.meshes[node.mesh]);
        assert.ok(next > 0 && next <= triangles, node.name);
        triangles = next;
      }
    }
    const animations = gltf.animations.map(clip => clip.name.split('@')[0]);
    for (const name of [...new Set(Object.values(gaitClips).flat()), 'ready_idle', 'aim_idle', 'shoot', 'reload',
      'throw', 'hit', 'death', 'jump_start', 'jump_loop', 'jump_land', 'slide_start', 'slide_loop', 'slide_exit']) {
      assert.ok(animations.includes(name), name);
    }
    layouts.push(base.map(node => triangleCount(gltf.meshes[node.mesh])));
    if (layouts.length === 2) assert.notDeepEqual(...layouts);
  });
}

test('the lower blend handles lateral, backward and diagonal movement relative to body yaw', () => {
  const weights = new Map();
  const choose = (vx, vz, { yaw = 0, crouch = false } = {}) =>
    [...locomotionWeights(weights, 1.4, yaw, vx, vz, crouch, false)];
  assert.deepEqual(choose(0, -1), [['mocap_walk_F', 1]]);
  assert.deepEqual(choose(1, 0), [['mocap_walk_R', 1]]);
  assert.deepEqual(choose(0, 1), [['mocap_walk_B', 1]]);
  assert.deepEqual(choose(-1, 0, { crouch: true }), [['mocap_crouch_L', 1]]);
  assert.deepEqual(choose(1, -1), [['mocap_walk_F', .5], ['mocap_walk_R', .5]]);
  assert.deepEqual(choose(-1, 0, { yaw: Math.PI / 2 }), [['mocap_walk_F', 1]]);
});

test('remastered tank riders keep their hips above the deck and their feet outside the hull', async () => {
  for (const team of [0, 1]) {
    const player = { team, weaponId: 'ar416' };
    await assets.load(team, player.weaponId);
    const rig = createInfantry(assets.get(team, player.weaponId), player);
    const hull = new THREE.Group();
    hull.position.set(4, 2, -6);
    hull.rotation.set(.18, .9, -.13, 'YXZ');
    hull.add(rig.group);
    for (const [index, yaw] of [[2, Math.PI / 2], [3, -Math.PI / 2], [4, Math.PI]]) {
      const seat = VEHICLE_TYPES.tank.seats[index];
      rig.group.position.set(seat.x, seat.height, seat.z);
      rig.group.rotation.y = yaw;
      infantrySeat(rig, { vehicle: { type: 'tank' }, seat, index, relativeYaw: 0, pitch: 0, dt: 1 / 60 });
      const hips = hull.worldToLocal(rig.bones.Hips.getWorldPosition(new THREE.Vector3()));
      assert.ok(hips.y > (index === 4 ? 1.30 : 1.47));
      for (const leg of rig.legs) {
        const knee = hull.worldToLocal(leg.knee.getWorldPosition(new THREE.Vector3()));
        const foot = hull.worldToLocal(leg.foot.getWorldPosition(new THREE.Vector3()));
        assert.ok(knee.y - foot.y > .30);
        assert.ok(index === 4 ? foot.z > 3.5 : Math.abs(foot.x) > 1.8);
      }
    }
  }
});

test('death blends from the rendered skeleton without the source clip’s startup twist', async () => {
  for (const team of [0, 1]) {
    const player = { team, weaponId: 'ar416', grounded: true, crouch: true, aim: true, yaw: .4 };
    await assets.load(team, player.weaponId);
    const rig = createInfantry(assets.get(team, player.weaponId), player);
    updateInfantry(rig, player, 1 / 60, true);
    const joints = ['Hips', 'Spine2', 'Head', 'LeftForeArm', 'RightForeArm', 'LeftHand', 'RightHand'];
    const before = joints.map(name => rig.bones[name].quaternion.clone());
    infantryDeath(rig, 0);
    for (const [i, name] of joints.entries()) assert.ok(before[i].angleTo(rig.bones[name].quaternion) < .001);
    for (let frame = 1; frame <= 24; frame++) {
      infantryDeath(rig, frame / 60);
      for (const [i, name] of joints.entries()) {
        const rotation = rig.bones[name].quaternion;
        assert.ok(before[i].angleTo(rotation) < .4, name + ' at frame ' + frame);
        before[i].copy(rotation);
      }
    }
    infantryDeath(rig, 2.4);
    assert.ok(rig.bones.Head.getWorldPosition(new THREE.Vector3()).y < .3);
    assert.equal(rig.rifle.visible, false);
    updateInfantry(rig, player, 1 / 60, true);
    assert.equal(rig.rifle.visible, true);
  }
});

