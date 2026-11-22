import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { encodeToKTX2 } from 'ktx2-encoder';
import { join as pathJoin } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Canvas, loadImage } from '@napi-rs/canvas';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRTextureBasisu } from '@gltf-transform/extensions';
import { dedup, joinPrimitives, meshopt, prune, simplify } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { paintRegularUniform } from './infantry-camouflage.mjs';

const revision = '130ac2a5c856401ec36e7d35afcfefe40c5801f4';
const files = {
  soldier: '6f229176b1ca49ff33605718ebfcca7fcee8f65d6d311ce3c86693df9310d2d7',
  soldier_tac: 'fe02bc307077d7a5a74069d085893988d93751495871c84082256e60bf9bfc9e',
};
const operatorSource = {
  url: 'https://huggingface.co/datasets/allenai/objaverse/resolve/main/glbs/000-132/9e82fabf26194896b5ad4a364d864eab.glb',
  sha256: 'd33e1bb64ccf35ded1da1f46d3fe6545a38df3e45578105ef3d522b44ad478dc',
};
const output = fileURLToPath(new URL('../src/assets/infantry/', import.meta.url));
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.encoder': MeshoptEncoder,
});
await Promise.all([MeshoptEncoder.ready, MeshoptSimplifier.ready, mkdir(output, { recursive: true })]);

async function readSource(name) {
  const url = name === 'operator' ? operatorSource.url :
    'https://raw.githubusercontent.com/cktang88/3d-fps/' + revision + '/public/assets/models/characters/' + name + '.glb';
  const response = await fetch(url);
  if (!response.ok) throw new Error(url + ' returned ' + response.status);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (createHash('sha256').update(bytes).digest('hex') !== (name === 'operator' ? operatorSource.sha256 : files[name])) throw new Error('Source hash mismatch for ' + name);
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

async function encodeTextures(document, operator = false) {
  const root = document.getRoot();
  const colors = new Set(root.listMaterials().map(material => material.getBaseColorTexture()));
  const normals = new Set(root.listMaterials().map(material => material.getNormalTexture()));
  const textures = root.listTextures();
  const uniforms = new Set(root.listMaterials().filter(material => material.getName() === 'uniform')
    .flatMap(material => [material.getBaseColorTexture(), material.getNormalTexture()]));
  const uniformColor = operator && root.listMaterials().find(material => material.getName() === 'uniform')?.getBaseColorTexture();
  const palette = new Map();
  const rough = new Set();
  const clothing = {
    uniform: null, helmet: [65, 56, 32], pouch: [78, 61, 37],
    boots: [31, 23, 13], gloves: [25, 20, 11],
  };
  if (operator) for (const material of root.listMaterials()) {
    const name = material.getName();
    if (!Object.hasOwn(clothing, name)) continue;
    if (clothing[name]) palette.set(material.getBaseColorTexture(), clothing[name]);
    rough.add(material.getMetallicRoughnessTexture());
  }
  if (!textures.length) return;
  for (const texture of textures) {
    const image = await loadImage(Buffer.from(texture.getImage()));
    const limit = operator && !uniforms.has(texture) ? 512 : 1024;
    const scale = Math.min(1, limit / Math.max(image.width, image.height));
    const canvas = new Canvas(Math.round(image.width * scale), Math.round(image.height * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    const rgba = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    if (texture === uniformColor) paintRegularUniform(rgba, (r, g, b) => .2126 * r + .7152 * g + .0722 * b);
    const tint = palette.get(texture);
    for (let i = 0; i < rgba.data.length && (tint || rough.has(texture)); i += 4) {
      if (tint) {
        const light = (.2126 * rgba.data[i] + .7152 * rgba.data[i + 1] + .0722 * rgba.data[i + 2]) * .78;
        for (let c = 0; c < 3; c++) rgba.data[i + c] = light + tint[c];
      } else {
        rgba.data[i + 1] = 166 + rgba.data[i + 1] * .34;
        rgba.data[i + 2] = 0;
      }
    }
    const srgb = colors.has(texture), normal = normals.has(texture);
    const ktx = await encodeToKTX2(Uint8Array.of(0), {
      isUASTC: normal, isNormalMap: normal, qualityLevel: 160, generateMipmap: true,
      needSupercompression: normal, enableRDO: operator && normal, rdoQualityLevel: 1.5,
      isPerceptual: srgb, isSetKTX2SRGBTransferFunc: srgb,
      imageDecoder: async () => ({ width: canvas.width, height: canvas.height, data: new Uint8Array(rgba.data) }),
    });
    texture.setImage(ktx).setMimeType('image/ktx2');
  }
  for (const ext of root.listExtensionsUsed()) if (ext.extensionName === 'EXT_texture_webp') ext.dispose();
  document.createExtension(KHRTextureBasisu).setRequired(true);
}

function dressRegular(document) {
  const nodes = document.getRoot().listNodes().filter(node => node.getMesh());
  const grouped = new Map();
  for (const node of nodes) {
    const mesh = node.getMesh();
    // The source includes a display carbine and separate police insignia.
    // Weapons in the game already have their own fitted animation sockets.
    if (!node.getSkin()) { node.dispose(); continue; }
    for (const prim of mesh.listPrimitives()) {
      const material = prim.getMaterial();
      if (material.getName() === 'night_vis_goggles') {
        mesh.removePrimitive(prim);
        prim.dispose();
        continue;
      }
      const key = [material.getName(), node.getParentNode().getName(), node.getMatrix(),
        prim.listSemantics().sort()].join('|');
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push({ node, prim });
    }
    if (!mesh.listPrimitives().length) node.dispose();
  }
  for (const list of grouped.values()) {
    if (list.length < 2) continue;
    const [first] = list;
    const mesh = first.node.getMesh();
    mesh.addPrimitive(joinPrimitives(list.map(({ prim }) => prim)));
    mesh.removePrimitive(first.prim);
    first.prim.dispose();
    for (const { node } of list.slice(1)) node.dispose();
  }
  const root = document.getRoot();
  for (const ext of root.listExtensionsUsed()) if (ext.extensionName === 'KHR_materials_transmission') ext.dispose();
  for (const material of root.listMaterials()) {
    if (/^(uniform|helmet|pouch|boots|gloves)$/.test(material.getName())) {
      material.setBaseColorFactor([1, 1, 1, 1]).setMetallicFactor(0).setRoughnessFactor(1);
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
  if (name === 'regular') await document.transform(simplify({
    simplifier: MeshoptSimplifier, ratio: .55, error: .016,
  }));
  makeLods(document);
  await encodeTextures(document, name === 'regular');
  // LOD swaps share a bind pose and dequantization transform with LOD0.
  await document.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium', quantizationVolume: 'scene' }));
  await io.write(pathJoin(output, name + '.glb'), document);
}

const [motionSource, regular, militia] = await Promise.all([
  readSource('soldier'), readSource('operator'), readSource('soldier_tac'),
]);
for (const clip of regular.getRoot().listAnimations()) clip.dispose();
retarget(motionSource, regular);
retarget(motionSource, militia);
await bakeBody(regular, 'regular');
if (!process.argv.includes('--regular-only')) {
  await bakeBody(militia, 'militia');
}
