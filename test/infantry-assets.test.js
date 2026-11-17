import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { gaitClips } from '../src/infantry-assets.js';
import { locomotionWeights } from '../src/infantry.js';

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

