import * as THREE from "three";
import { smoothRingSeams } from "./character-geometry.js";

// Cross sections are [height, half width, front depth, back depth, depth offset].
// Anterior/posterior contours and landmark relief are authored independently.
export function anatomicalGeometry(
  sections,
  sides = 20,
  { anatomy, folds = 0, square = 0.92, caps = true } = {},
) {
  const positions = [],
    uv = [],
    indices = [];
  for (let row = 0; row < sections.length; row++) {
    const [y, width, front, back, offset = 0] = sections[row];
    const t = row / (sections.length - 1);
    for (let col = 0; col <= sides; col++) {
      const a = (col / sides) * Math.PI * 2,
        c = Math.cos(a),
        s = Math.sin(a);
      const anterior = Math.max(0, -s),
        posterior = Math.max(0, s);
      let relief = 0;
      if (anatomy === "torso") {
        // Paired pectorals, central sternum groove and scapular planes.
        const chest = Math.exp(-(((y - 1.3) / 0.105) ** 2));
        relief =
          chest * (0.004 * Math.cos(c * 6) * anterior + 0.003 * posterior);
      } else if (anatomy === "thigh") {
        relief =
          0.004 *
          Math.sin(Math.PI * t) *
          (anterior * Math.cos(a * 3) + posterior * 0.5);
      } else if (anatomy === "calf") {
        relief = 0.004 * Math.sin(Math.PI * t) * posterior * Math.cos(c * 4);
      } else if (anatomy === "upperArm") {
        relief = 0.003 * Math.sin(Math.PI * t) * (anterior - posterior * 0.4);
      }
      const crease =
        folds *
        Math.sin(Math.PI * t) *
        (Math.sin(a * 3 + t * 17) * 0.65 + Math.cos(a * 5 - t * 13) * 0.35);
      positions.push(
        Math.sign(c) * Math.abs(c) ** square * width * (1 + crease),
        y,
        offset +
          Math.sign(s) *
            Math.abs(s) ** square *
            ((s < 0 ? front : back) * (1 + crease) + relief),
      );
      uv.push(col / sides, t);
      if (row < sections.length - 1 && col < sides) {
        const i = row * (sides + 1) + col,
          next = i + sides + 1;
        indices.push(i, next, i + 1, i + 1, next, next + 1);
      }
    }
  }
  if (caps)
    for (const row of [0, sections.length - 1]) {
      const center = positions.length / 3;
      positions.push(0, sections[row][0], sections[row][4] || 0);
      uv.push(0.5, row ? 1 : 0);
      for (let col = 0; col < sides; col++) {
        const i = row * (sides + 1) + col;
        if (row) indices.push(center, i + 1, i);
        else indices.push(center, i, i + 1);
      }
    }
  const result = new THREE.BufferGeometry();
  result.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  result.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  result.setIndex(indices);
  result.computeVertexNormals();
  result.userData.anatomy = anatomy;
  return smoothRingSeams(result, sections.length, sides);
}

// Template-time vertex clustering preserves atlas boundaries, colour, joint
// ownership and weights. Never merge points belonging to different bones.
export function reduceSoldierGeometry(source, cell) {
  const attrs = source.attributes,
    buckets = new Map(),
    remap = [],
    rows = [];
  for (let i = 0; i < attrs.position.count; i++) {
    const p = attrs.position,
      color = attrs.color,
      uv = attrs.uv;
    const bones = Array.from(
      { length: 4 },
      (_, k) => attrs.skinIndex.array[i * 4 + k],
    );
    const weights = Array.from(
      { length: 4 },
      (_, k) => attrs.skinWeight.array[i * 4 + k],
    );
    const key = [
      Math.round(p.getX(i) / cell),
      Math.round(p.getY(i) / cell),
      Math.round(p.getZ(i) / cell),
      ...bones,
      ...weights.map((w) => Math.round(w * 16)),
      Math.round(color.getX(i) * 255),
      Math.round(color.getY(i) * 255),
      Math.round(color.getZ(i) * 255),
      Math.floor(uv.getX(i) * 10),
    ].join(":");
    let index = buckets.get(key);
    if (index === undefined) {
      index = rows.length;
      buckets.set(key, index);
      rows.push({ i, n: 0, x: 0, y: 0, z: 0 });
    }
    const row = rows[index];
    row.x += p.getX(i);
    row.y += p.getY(i);
    row.z += p.getZ(i);
    row.n++;
    remap[i] = index;
  }
  const result = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(attrs)) {
    const array = new attr.array.constructor(rows.length * attr.itemSize);
    rows.forEach((row, index) => {
      for (let k = 0; k < attr.itemSize; k++)
        array[index * attr.itemSize + k] =
          attr.array[row.i * attr.itemSize + k];
      if (name === "position")
        array.set([row.x / row.n, row.y / row.n, row.z / row.n], index * 3);
    });
    result.setAttribute(
      name,
      new THREE.BufferAttribute(array, attr.itemSize, attr.normalized),
    );
  }
  const indices = [],
    seen = new Set(),
    input = source.index.array;
  for (let i = 0; i < input.length; i += 3) {
    const tri = [remap[input[i]], remap[input[i + 1]], remap[input[i + 2]]];
    if (new Set(tri).size < 3) continue;
    const key = [...tri].sort((a, b) => a - b).join(":");
    if (!seen.has(key)) {
      seen.add(key);
      indices.push(...tri);
    }
  }
  result.setIndex(indices);
  result.computeVertexNormals();
  result.computeBoundingSphere();
  result.userData.actorOwned = true;
  return result;
}
