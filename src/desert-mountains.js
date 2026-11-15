import * as THREE from 'three';
import { pairMaterials } from './visuals.js';

import { desertMountainSurface, MOUNTAIN_COLUMNS, MOUNTAIN_ROWS, mountainHash as hash, mountainNoise as noise } from '../shared/desert-mountain.js';

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
  const nx = MOUNTAIN_COLUMNS, nz = MOUNTAIN_ROWS, positions = [], colors = [], uvs = [], indices = [];
  const { heights, tones } = desertMountainSurface(box, terrain);
  const tint = new THREE.Color(box.color ?? '#bca58a');
  for (let iz = 0; iz <= nz; iz++) for (let ix = 0; ix <= nx; ix++) {
    const x = box.x - box.w / 2 + ix * box.w / nx, z = box.z - box.d / 2 + iz * box.d / nz;
    const index = iz * (nx + 1) + ix, tone = tones[index];
    positions.push(x, heights[index], z);
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
