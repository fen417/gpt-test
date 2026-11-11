import * as THREE from 'three';
import { clonePairedMaterial, makeSign, pairMaterials } from './visuals.js';

function gravelRoads(owner, map) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 2048;
  const ctx = canvas.getContext('2d');
  const scale = canvas.width / map.size, offset = canvas.width / 2;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#fff';
  for (const road of map.roads) {
    const halfLength = (road.d - road.w) * .5;
    const dx = Math.sin(road.yaw) * halfLength, dz = Math.cos(road.yaw) * halfLength;
    ctx.lineWidth = road.w * scale;
    ctx.beginPath();
    ctx.moveTo(offset + (road.x - dx) * scale, offset + (road.z - dz) * scale);
    ctx.lineTo(offset + (road.x + dx) * scale, offset + (road.z + dz) * scale);
    ctx.stroke();
  }

  const mask = new THREE.CanvasTexture(canvas);
  mask.channel = 1;
  mask.anisotropy = owner.surfaces.maps.asphalt.anisotropy;
  const gravel = clonePairedMaterial(owner.surfaces.asphalt, 0xc2b59d);
  for (const material of [gravel, gravel._lowMaterial]) {
    if (!material) continue;
    material.alphaMap = mask;
    material.alphaTest = .45;
  }
  const geometry = new THREE.PlaneGeometry(map.size, map.size);
  const uv = geometry.attributes.uv;
  geometry.setAttribute('uv1', uv.clone());
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * map.size / 8, uv.getY(i) * map.size / 8);
  const road = new THREE.Mesh(geometry, gravel);
  road.rotation.x = -Math.PI / 2;
  road.position.y = .034;
  road.receiveShadow = true;
  owner.scene.add(road);
}

function quarryCliffs(owner, map) {
  const positions = [], colors = [], uvs = [];
  const outline = [[-.5, -.41], [-.41, -.5], [.41, -.5], [.5, -.41], [.5, .41], [.41, .5], [-.41, .5], [-.5, .41]];
  function rock(x, z, w, d, h, color) {
    const [r, g, bColor] = new THREE.Color(color).toArray();
    const profile = [[-.07, 1, .73], [.13, .993, .88], [.43, .98, 1.06], [.55, .98, .84], [.83, .96, .96], [.97, .86, 1.10]];
    const slant = outline.map(() => (owner.random() - .5) * .065);
    const rings = profile.map(([height, scale]) => outline.map(([vx, vz], i) => [
      x + vx * w * scale,
      h * (height + slant[i]),
      z + vz * d * scale,
    ]));
    function triangle(a, b, c, intensity, uAxis, vAxis) {
      positions.push(...a, ...b, ...c);
      for (const vertex of [a, b, c]) {
        colors.push(r * intensity, g * intensity, bColor * intensity);
        uvs.push(vertex[uAxis] / 7, vertex[vAxis] / 4);
      }
    }
    for (let level = 0; level < rings.length - 1; level++) {
      const lower = rings[level], upper = rings[level + 1];
      const tone = (profile[level][2] + profile[level + 1][2]) / 2;
      for (let i = 0; i < lower.length; i++) {
        const j = (i + 1) % lower.length;
        const tint = tone * (.94 + owner.random() * .12);
        const axis = Math.abs(lower[i][0] - lower[j][0]) > Math.abs(lower[i][2] - lower[j][2]) ? 0 : 2;
        triangle(lower[i], upper[i], upper[j], tint, axis, 1);
        triangle(lower[i], upper[j], lower[j], tint, axis, 1);
      }
    }
    const cap = rings.at(-1);
    for (let i = 1; i < cap.length - 1; i++) triangle(cap[0], cap[i + 1], cap[i], 1.15, 0, 2);
  }
  for (const box of map.boxes) {
    if (box.kind === 'rock') rock(box.x, box.z, box.w, box.d, box.h, box.color);
  }
  const limit = map.size / 2;
  const tones = [0x7e7460, 0x948574, 0x8a7963];
  for (const side of [-1, 1]) {
    for (let i = -6; i <= 6; i++) {
      const offset = i * 55 + (owner.random() - .5) * 16;
      const distance = limit + 43 + owner.random() * 22;
      const height = 20 + owner.random() * 22;
      rock(side * distance, offset, 44 + owner.random() * 18, 62, height, tones[(i + 6) % tones.length]);
      if (Math.abs(i) > 1) rock(offset, side * distance, 62, 52, height * .8, tones[(i + 7) % tones.length]);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#eae7df';
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 1700; i++) {
    const x = owner.random() * 128, y = owner.random() * 128;
    ctx.fillStyle = i % 3 === 0 ? '#6e65542c' : '#998b7166';
    ctx.fillRect(x, y, .5 + owner.random() * 7, .5 + owner.random() * 1.6);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = owner.surfaces.maps.asphalt.anisotropy;
  const material = pairMaterials(
    new THREE.MeshStandardMaterial({ map: texture, roughness: 1, vertexColors: true }),
    new THREE.MeshLambertMaterial({ map: texture, vertexColors: true }),
  );
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = mesh.castShadow = true;
  owner.scene.add(mesh);
}

export function addQuarryGround(owner, map, ground) {
  if (ground) ground.material = clonePairedMaterial(owner.surfaces.ground, 0xc4ae87);
  gravelRoads(owner, map);
  quarryCliffs(owner, map);

  for (const pad of map.vehicleSpawns) {
    for (const side of [-1, 1]) {
      owner.box(owner.scene, pad.x + side * 2.6, .052, pad.z, .17, .008, 7.2, owner.materials.marking, false);
    }
    owner.box(owner.scene, pad.x, .053, pad.z + Math.cos(pad.yaw) * 3.5, 5.2, .008, .18, owner.materials.marking, false);
  }
  for (const side of [-1, 1]) {
    const sign = makeSign('ПЕРЕВАЛ', 'ПАРК ТЕХНИКИ', 4);
    sign.position.set(0, 2.35, side * 290.89);
    sign.rotation.y = side === 1 ? Math.PI : 0;
    owner.scene.add(sign);
  }
}
