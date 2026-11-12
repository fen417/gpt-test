import fs from "node:fs";
import * as THREE from "three";
import { SimplifyModifier } from "three/addons/modifiers/SimplifyModifier.js";
const path = new URL("../art-source/lee-perry-smith/head.glb", import.meta.url),
  b = fs.readFileSync(path),
  length = b.readUInt32LE(12);
const gltf = JSON.parse(b.subarray(20, 20 + length)),
  bin = b.subarray(28 + length);
function attribute(n) {
  const a = gltf.accessors[n],
    v = gltf.bufferViews[a.bufferView],
    size = a.type === "VEC3" ? 3 : a.type === "VEC2" ? 2 : 1,
    Type = a.componentType === 5123 ? Uint16Array : Float32Array;
  const bytes = bin.subarray(
    (v.byteOffset || 0) + (a.byteOffset || 0),
    (v.byteOffset || 0) +
      (a.byteOffset || 0) +
      a.count * size * Type.BYTES_PER_ELEMENT,
  );
  return new THREE.BufferAttribute(
    new Type(Uint8Array.from(bytes).buffer),
    size,
  );
}
const raw = new THREE.BufferGeometry();
raw.setAttribute("position", attribute(1));
raw.setAttribute("normal", attribute(2));
raw.setAttribute("uv", attribute(3));
raw.setIndex(attribute(0));
const kept = [],
  used = new Map(),
  p = raw.attributes.position;
for (let i = 0; i < raw.index.count; i += 3) {
  const ids = [raw.index.getX(i), raw.index.getX(i + 1), raw.index.getX(i + 2)];
  if (ids.every((i) => p.getY(i) > -1.3))
    for (const id of ids) {
      if (!used.has(id)) used.set(id, used.size);
      kept.push(used.get(id));
    }
}
const compact = new THREE.BufferGeometry();
for (const [name, a] of Object.entries(raw.attributes)) {
  const out = new Float32Array(used.size * a.itemSize);
  for (const [old, index] of used)
    for (let k = 0; k < a.itemSize; k++)
      out[index * a.itemSize + k] = a.array[old * a.itemSize + k];
  compact.setAttribute(name, new THREE.BufferAttribute(out, a.itemSize));
}
compact.setIndex(kept);
compact.rotateY(Math.PI);
compact.scale(0.054, 0.054, 0.054);
compact.translate(0, 0.145 - 3.9725468158721924 * 0.054, 0.018);
const neck = compact.attributes.position;
for (let i = 0; i < neck.count; i++)
  if (neck.getY(i) < -0.06 && neck.getZ(i) > -0.025) {
    const t = Math.max(0, Math.min(1, (-0.06 - neck.getY(i)) / 0.065));
    neck.setX(i, neck.getX(i) * (1 - 0.4 * t));
    neck.setZ(i, 0.015 + (neck.getZ(i) - 0.015) * (1 - 0.35 * t));
  }
const modifier = new SimplifyModifier(),
  data = {};
for (const [name, target] of [
  ["detail", 1450],
  ["distant", 125],
]) {
  const geo = modifier.modify(
    compact,
    Math.max(0, compact.attributes.position.count - target),
  );
  const p = geo.attributes.position,
    uv = geo.attributes.uv,
    n = geo.attributes.normal;
  const pos = new Int16Array(p.count * 3),
    norm = new Int8Array(n.count * 3),
    tex = new Uint16Array(uv.count * 2);
  for (let i = 0; i < pos.length; i++) pos[i] = Math.round(p.array[i] * 100000);
  for (let i = 0; i < norm.length; i++)
    norm[i] = Math.round(Math.max(-1, Math.min(1, n.array[i])) * 127);
  for (let i = 0; i < tex.length; i++)
    tex[i] = Math.round(Math.max(0, Math.min(1, uv.array[i])) * 65535);
  const faces = geo.index
    ? new Uint16Array(geo.index.array)
    : Uint16Array.from({ length: p.count }, (_, i) => i);
  const encode = (a) => Buffer.from(a.buffer).toString("base64");
  data[name] = {
    position: encode(pos),
    normal: encode(norm),
    uv: encode(tex),
    index: encode(faces),
    triangles: faces.length / 3,
  };
  console.log(name, p.count, faces.length / 3);
}
fs.writeFileSync(
  new URL("../src/soldier-head-data.js", import.meta.url),
  "// Derived from Lee Perry-Smith / Infinite head scan, CC BY 3.0.\n// See art-source/lee-perry-smith/LICENSE.txt. Regenerate with scripts/build-soldier-head.mjs.\nexport const HEAD_DATA = " +
    JSON.stringify(data) +
    ";\n",
);
