import * as THREE from 'three';
import { pairMaterials } from './visuals.js';

const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
const hash = (x, z, seed) => {
  let n = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ seed;
  n = Math.imul(n ^ n >>> 13, 1274126177);
  return ((n ^ n >>> 16) >>> 0) / 4294967295;
};
function noise(x, z, seed) {
  const ix = Math.floor(x), iz = Math.floor(z), u = smooth(x - ix), v = smooth(z - iz);
  const a = hash(ix, iz, seed), b = hash(ix + 1, iz, seed);
  const c = hash(ix, iz + 1, seed), d = hash(ix + 1, iz + 1, seed);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}
function seedOf(value) {
  let seed = 2166136261;
  for (const character of String(value)) seed = Math.imul(seed ^ character.charCodeAt(0), 16777619);
  return seed;
}

export function desertRockMaterial() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d'), pixels = ctx.createImageData(512, 512);
  for (let z = 0; z < 512; z++) for (let x = 0; x < 512; x++) {
    const layers = Math.sin(z * .17 + noise(x / 73, z / 96, 91) * 4);
    const grain = hash(x, z, 1789), pits = grain < .045 ? -32 : 0;
    const tone = 173 + noise(x / 28, z / 38, 93) * 35 + layers * 8 + grain * 21 + pits;
    const index = (z * 512 + x) * 4;
    pixels.data.set([tone, tone * .94, tone * .84, 255], index);
  }
  ctx.putImageData(pixels, 0, 0);
  ctx.strokeStyle = '#50483a55'; ctx.lineWidth = 1;
  for (let i = 0; i < 24; i++) {
    let x = hash(i, 0, 135) * 512, y = hash(i, 1, 135) * 512;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let n = 0; n < 6; n++) {
      x += hash(i, n, 288) * 20 - 10; y += 5 + hash(i, n, 717) * 16;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping; map.anisotropy = 4;
  return pairMaterials(
    new THREE.MeshStandardMaterial({ map, bumpMap: map, bumpScale: .15, roughness: 1, vertexColors: true }),
    new THREE.MeshLambertMaterial({ map, vertexColors: true }),
  );
}

export function desertMountain(owner, material, box, terrain) {
  const nx = 48, nz = 56, positions = [], colors = [], uvs = [], indices = [];
  const seed = seedOf(box.modelSeed ?? box.assetTemplate ?? box.id ?? 'desert-ridge');
  const peaks = Array.from({ length: 5 }, (_, i) => ({
    x: (hash(i, 0, seed) - .5) * .85, z: (hash(i, 1, seed) - .5) * 1.1,
    height: .62 + hash(i, 2, seed) * .36, width: .48 + hash(i, 3, seed) * .24,
  }));
  const tint = new THREE.Color(box.color ?? '#bca58a');
  for (let iz = 0; iz <= nz; iz++) for (let ix = 0; ix <= nx; ix++) {
    const u = ix / nx * 2 - 1, v = iz / nz * 2 - 1;
    const x = box.x + u * box.w / 2, z = box.z + v * box.d / 2;
    const edge = 1 - smooth((Math.max(Math.abs(u), Math.abs(v)) - .67) / .33);
    let profile = 0;
    for (const peak of peaks) {
      const distance = Math.hypot((u - peak.x) / peak.width, (v - peak.z) / (peak.width * 1.15));
      profile = Math.max(profile, peak.height * Math.pow(Math.max(0, 1 - distance), .8));
    }
    const ridge = 1 - Math.abs(noise(u * 8 + 20, v * 8 + 20, seed) * 2 - 1);
    const fine = noise(u * 25 + 50, v * 25 + 50, seed ^ 713);
    profile = Math.min(1, (profile + ridge * .16 + fine * .045) * edge);
    const floor = terrain?.heightAt(x, z) ?? box.baseY ?? 0;
    // The perimeter must meet the terrain even when the authored ridge origin
    // is several metres above it. Keep the silhouette in the interior.
    const peak = Math.max(floor - .3, (box.baseY ?? 0) + box.h * profile - .6);
    const y = floor - .3 + (peak - (floor - .3)) * edge;
    positions.push(x, y, z);
    const bedding = Math.sin(y * 1.1 + noise(u * 3 + 10, v * 3 + 10, seed) * 3);
    const tone = .83 + ridge * .1 + fine * .1 + bedding * .045;
    colors.push(tint.r * tone, tint.g * tone, tint.b * tone);
    uvs.push((x - box.x) / 5, (z - box.z) / 5);
    if (ix < nx && iz < nz) {
      const a = iz * (nx + 1) + ix, b = a + nx + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.userData.owned = true;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = mesh.receiveShadow = true;
  owner.scene.add(mesh);
}
