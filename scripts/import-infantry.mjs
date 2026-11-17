import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { encodeToKTX2 } from 'ktx2-encoder';
import { join as pathJoin } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Canvas, loadImage } from '@napi-rs/canvas';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRTextureBasisu } from '@gltf-transform/extensions';
import { dedup, join, joinPrimitives, meshopt, prune, simplify, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import { Matrix4, Quaternion, Vector3 } from 'three';

const revision = '130ac2a5c856401ec36e7d35afcfefe40c5801f4';
const files = {
  soldier: '6f229176b1ca49ff33605718ebfcca7fcee8f65d6d311ce3c86693df9310d2d7',
  soldier_tac: 'fe02bc307077d7a5a74069d085893988d93751495871c84082256e60bf9bfc9e',
  m4a1: '9a429c5973b2b682847f0fc87550d052683c6c26780329bce7bd8a7d1f7e7677',
  ak47: 'b5ff1d175a7c6d6b3f49c83d4147d7f0830f8f0584231e3e5d30f4e8adde2c64',
  mp5a5: '55a33356f659cc9a6ec68fe3de68a4b3d3c63ddafcc45fe918db1cc9ffbf1bdf',
  m24: 'f057513b5df9b90a43d3129fee7cbfefbfbf3415c85c822b07adb39979650454',
  p226: '579cb38e8f861ecac5b7c7739946c4620046fffaf94ee5e073cb69b913db72fc',
  m1911: '08b5dc8d4abc14b88b6728f2b4eb007284da54adc30d5295dbd703e5551d3c10',
};
const output = fileURLToPath(new URL('../src/assets/infantry/', import.meta.url));
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.encoder': MeshoptEncoder,
});
await Promise.all([MeshoptEncoder.ready, MeshoptSimplifier.ready, mkdir(output, { recursive: true })]);

async function readSource(name) {
  const folder = name.startsWith('soldier') ? 'characters' : 'weapons';
  const url = 'https://raw.githubusercontent.com/cktang88/3d-fps/' + revision +
    '/public/assets/models/' + folder + '/' + name + '.glb';
  const response = await fetch(url);
  if (!response.ok) throw new Error(url + ' returned ' + response.status);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (createHash('sha256').update(bytes).digest('hex') !== files[name]) throw new Error('Source hash mismatch for ' + name);
  return io.readBinary(bytes);
}

const boneKey = name => name.replace(/^mixamorig:/, '').replace(/_\d+$/, '');
const bones = document => new Map(document.getRoot().listSkins()[0].listJoints()
  .filter(node => node.getName().startsWith('mixamorig:')).map(node => [boneKey(node.getName()), node]));
const world = node => new Matrix4().fromArray(node.getWorldMatrix());
const pos = node => new Vector3().setFromMatrixPosition(world(node));
const orientation = matrix => new Quaternion().setFromRotationMatrix(new Matrix4().extractRotation(matrix));

function retarget(source, target) {
  const from = bones(source), to = bones(target);
  for (const key of ['Hips', 'Head', 'Spine2', 'LeftUpLeg', 'RightUpLeg', 'LeftFoot', 'RightFoot', 'LeftHand', 'RightHand']) {
    if (!from.has(key) || !to.has(key)) throw new Error('Missing joint ' + key);
  }
  const parentFrom = world(from.get('Hips').getParentNode());
  const parentTo = world(to.get('Hips').getParentNode()).invert();
  const rotation = orientation(parentTo).multiply(orientation(parentFrom));
  const leg = map => pos(map.get('Hips')).y - pos(map.get('LeftFoot')).y;
  const scale = leg(to) / leg(from);
  if (!(scale > 0.5 && scale < 1.5)) throw new Error('Invalid retarget scale ' + scale);
  const buffer = target.getRoot().listBuffers()[0], value = new Vector3(), q = new Quaternion();
  const timeAccessors = new Map();
  for (const clip of source.getRoot().listAnimations()) {
    const out = target.createAnimation(clip.getName());
    for (const channel of clip.listChannels()) {
      const key = boneKey(channel.getTargetNode().getName()), joint = to.get(key);
      const property = channel.getTargetPath();
      if (!joint || (property !== 'rotation' && !(property === 'translation' && key === 'Hips'))) continue;
      const sampler = channel.getSampler(), input = sampler.getInput(), sourceOutput = sampler.getOutput();
      if (sampler.getInterpolation() === 'CUBICSPLINE') throw new Error('Expected baked sampling');
      if (!timeAccessors.has(input)) {
        timeAccessors.set(input, target.createAccessor().setType('SCALAR').setArray(input.getArray().slice()).setBuffer(buffer));
      }
      const array = sourceOutput.getArray().slice();
      if (key === 'Hips' && property === 'rotation') {
        for (let i = 0; i < array.length; i += 4) q.fromArray(array, i).premultiply(rotation).normalize().toArray(array, i);
      }
      if (property === 'translation') {
        for (let i = 0; i < array.length; i += 3) {
          value.fromArray(array, i).applyMatrix4(parentFrom).multiplyScalar(scale).applyMatrix4(parentTo).toArray(array, i);
        }
      }
      const output = target.createAccessor().setType(sourceOutput.getType()).setArray(array).setBuffer(buffer);
      const copy = target.createAnimationSampler().setInput(timeAccessors.get(input)).setOutput(output)
        .setInterpolation(sampler.getInterpolation());
      out.addSampler(copy).addChannel(target.createAnimationChannel().setSampler(copy).setTargetNode(joint).setTargetPath(property));
    }
  }
}

async function encodeTextures(document) {
  const root = document.getRoot();
  const colors = new Set(root.listMaterials().map(material => material.getBaseColorTexture()));
  const normals = new Set(root.listMaterials().map(material => material.getNormalTexture()));
  const textures = root.listTextures();
  if (!textures.length) return;
  for (const texture of textures) {
    const image = await loadImage(Buffer.from(texture.getImage()));
    const scale = Math.min(1, 1024 / Math.max(image.width, image.height));
    const canvas = new Canvas(Math.round(image.width * scale), Math.round(image.height * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    const rgba = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    const srgb = colors.has(texture), normal = normals.has(texture);
    const ktx = await encodeToKTX2(Uint8Array.of(0), {
      isUASTC: normal, isNormalMap: normal, qualityLevel: 160, generateMipmap: true,
      needSupercompression: normal, isPerceptual: srgb, isSetKTX2SRGBTransferFunc: srgb,
      imageDecoder: async () => ({ width: canvas.width, height: canvas.height, data: new Uint8Array(rgba.data) }),
    });
    texture.setImage(ktx).setMimeType('image/ktx2');
  }
  for (const ext of root.listExtensionsUsed()) if (ext.extensionName === 'EXT_texture_webp') ext.dispose();
  document.createExtension(KHRTextureBasisu).setRequired(true);
}

function textile(document, channel) {
  const size = 128, canvas = new Canvas(size, size), context = canvas.getContext('2d');
  const image = context.createImageData(size, size);
  const height = (x, y) => Math.sin((x + y) * Math.PI / 2) * .35 + Math.cos(x * Math.PI / 2) * .2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const at = (y * size + x) * 4;
    const pattern = Math.sin(x * .0491 + 4 * Math.sin(y * .0982)) + Math.sin(y * .1473 - x * .0982);
    const grain = ((Math.imul(x + 13, 0x9e3779b1) ^ Math.imul(y + 16, 0x4ab9c223)) >>> 27) - 16;
    if (channel === 'normal') {
      image.data[at] = 128 + 14 * (height(x - 1, y) - height(x + 1, y));
      image.data[at + 1] = 128 + 14 * (height(x, y - 1) - height(x, y + 1));
      image.data[at + 2] = 254;
    } else if (channel === 'roughness') {
      image.data[at] = 255;
      image.data[at + 1] = 226 + pattern * 10 + grain * .25;
    } else {
      const shade = pattern < -.60 ? 148 : pattern > .77 ? 226 : 188;
      image.data[at] = shade + grain * .55;
      image.data[at + 1] = shade + grain * .58;
      image.data[at + 2] = shade + grain * .65;
    }
    image.data[at + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  return document.createTexture('Baked textile ' + channel).setMimeType('image/png').setImage(canvas.toBuffer('image/png'));
}

function dressRegular(document) {
  const colors = {
    Soldier_Clothes: [.18, .21, .12], Soldier_Fabric: [.30, .25, .15], Soldier_Armor: [.34, .28, .17],
    Soldier_Elements: [.085, .098, .070], Soldier_Boots: [.065, .054, .039], Soldier_Shoes: [.032, .031, .026],
  };
  const buffer = document.getRoot().listBuffers()[0];
  const fabric = document.createMaterial('Uniform and webbing').setMetallicFactor(0).setRoughnessFactor(.98);
  fabric.setBaseColorTexture(textile(document, 'base color')).setNormalTexture(textile(document, 'normal'))
    .setNormalScale(.48).setMetallicRoughnessTexture(textile(document, 'roughness'));
  const armor = document.createMaterial('Hard surfaces').setMetallicFactor(.13).setRoughnessFactor(.67);
  for (const mesh of document.getRoot().listMeshes()) {
    const grouped = new Map([[fabric, []], [armor, []]]);
    for (const prim of mesh.listPrimitives()) {
      const source = prim.getMaterial(), name = source.getName();
      const material = /Clothes|Fabric|Skin|Boots|Shoes/.test(name) ? fabric : armor;
      const color = colors[name] ?? source.getBaseColorFactor();
      const count = prim.getAttribute('POSITION').getCount();
      const values = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) values.set(color.slice(0, 3), i * 3);
      prim.setAttribute('TEXCOORD_1', null).setAttribute('COLOR_0',
        document.createAccessor().setType('VEC3').setArray(values).setBuffer(buffer));
      prim.setMaterial(material);
      grouped.get(material).push(prim);
    }
    for (const primitives of grouped.values()) {
      if (primitives.length < 2) continue;
      mesh.addPrimitive(joinPrimitives(primitives));
      for (const prim of primitives) { mesh.removePrimitive(prim); prim.dispose(); }
    }
  }
}

function makeLods(document) {
  const nodes = document.getRoot().listNodes().filter(node => node.getMesh());
  const buffer = document.getRoot().listBuffers()[0];
  for (const [index, node] of nodes.entries()) {
    const mesh = node.getMesh();
    const sourceName = mesh.getName();
    const trim = /Puches\.00[12]/.test(sourceName);
    node.setName('body-' + index).setExtras({ optionalPouch: trim });
    mesh.setName('body-' + index);
    for (const [level, ratio] of [.58, .26, .10].entries()) {
      const reduced = document.createMesh(mesh.getName() + '-lod' + (level + 1));
      for (const source of mesh.listPrimitives()) {
        const prim = source.clone();
        const attr = source.getAttribute('POSITION');
        const indices = Uint32Array.from(source.getIndices().getArray());
        const limit = Math.max(36, Math.floor(indices.length * ratio / 3) * 3);
        // Keep the original indexed vertices and their exact skin weights.
        const skin = source.getAttribute('JOINTS_0');
        const weights = source.getAttribute('WEIGHTS_0');
        const uv = source.getAttribute('TEXCOORD_0');
        const attrs = new Float32Array(attr.getCount() * 10);
        for (let i = 0; i < attr.getCount(); i++) {
          for (let j = 0; j < 4 && skin; j++) {
            attrs[i * 10 + j] = skin.getArray()[i * 4 + j] / 64;
            attrs[i * 10 + 4 + j] = weights.getArray()[i * 4 + j];
          }
          if (uv) attrs.set(uv.getArray().subarray(i * 2, i * 2 + 2), i * 10 + 8);
        }
        const [result] = MeshoptSimplifier.simplifyWithAttributes(indices, attr.getArray(), 3, attrs, 10,
          [.35, .35, .35, .35, .5, .5, .5, .5, .15, .15], null, limit, [.036, .078, .155][level], ['Permissive']);
        prim.setIndices(document.createAccessor().setType('SCALAR').setArray(Uint32Array.from(result)).setBuffer(buffer));
        reduced.addPrimitive(prim);
      }
      // glTFLoader reads the variant once and actors swap the shared geometry.
      const variant = document.createNode(reduced.getName()).setMesh(reduced).setSkin(node.getSkin()).setMatrix(node.getMatrix());
      const parent = node.getParentNode();
      if (parent) parent.addChild(variant);
      else document.getRoot().listScenes()[0].addChild(variant);
    }
  }
}

async function bakeBody(document, name) {
  if (name === 'regular') dressRegular(document);
  else for (const material of document.getRoot().listMaterials()) {
    if (!/Head$/.test(material.getName())) {
      const [r, g, b, alpha] = material.getBaseColorFactor();
      material.setBaseColorFactor([r * .8, g * .79, b * .75, alpha]);
    }
  }
  // The author's alternate headphones float above the cap in the supplied rig.
  for (const node of document.getRoot().listNodes()) {
    if (node.getMesh()?.listPrimitives().some(p => /Headphones/.test(p.getMaterial()?.getName()))) node.dispose();
  }
  await document.transform(dedup(), prune({ keepAttributes: true, keepLeaves: true }));
  makeLods(document);
  await encodeTextures(document);
  // LOD swaps share a bind pose and dequantization transform with LOD0.
  await document.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium', quantizationVolume: 'scene' }));
  await io.write(pathJoin(output, name + '.glb'), document);
}

async function bakeWeapon(document, name) {
  for (const node of document.getRoot().listNodes()) if (/^SpareMagazine/.test(node.getName())) node.dispose();
  const root = document.getRoot(), scene = root.listScenes()[0];
  const nodes = root.listNodes().slice();
  const magazine = nodes.find(node => node.getName() === 'Magazine');
  const magazineMatrix = magazine && world(magazine);
  const weapon = document.createNode('Weapon');
  const mag = magazine && document.createNode('Magazine').setMatrix(magazineMatrix.toArray());
  if (mag) weapon.addChild(mag);
  scene.addChild(weapon);
  for (const node of nodes) {
    if (!node.getMesh()) continue;
    let parent = node;
    while (parent && parent !== magazine) parent = parent.getParentNode();
    const separate = Boolean(parent);
    const matrix = world(node);
    if (separate) matrix.premultiply(magazineMatrix.clone().invert());
    (separate ? mag : weapon).addChild(document.createNode().setMesh(node.getMesh()).setMatrix(matrix.toArray()));
  }
  for (const node of nodes) node.dispose();
  await document.transform(dedup(), weld(), simplify({
    simplifier: MeshoptSimplifier, ratio: name === 'ak47' ? .026 : .40, error: .035,
  }), join(), prune());
  await encodeTextures(document);
  await document.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(pathJoin(output, name + '.glb'), document);
}

const [regular, militia] = await Promise.all([readSource('soldier'), readSource('soldier_tac')]);
retarget(regular, militia);
await bakeBody(regular, 'regular');
await bakeBody(militia, 'militia');
for (const name of Object.keys(files).filter(name => !name.startsWith('soldier'))) {
  await bakeWeapon(await readSource(name), name);
}
