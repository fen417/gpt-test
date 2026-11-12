import * as THREE from 'three';
import { clonePairedMaterial, makeSign, pairMaterials } from './visuals.js';

function shapeQuarrySurface(geometry, map, lift = 0, tint = false) {
  const positions = geometry.attributes.position;
  const colors = tint ? new Float32Array(positions.count * 3) : null;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), z = -positions.getY(i);
    const y = map.terrain.heightAt(x, z);
    positions.setZ(i, y + lift);
    if (!colors) continue;
    const grade = Math.hypot(map.terrain.heightAt(x + 2, z) - map.terrain.heightAt(x - 2, z),
      map.terrain.heightAt(x, z + 2) - map.terrain.heightAt(x, z - 2)) / 4;
    const shale = Math.min(.8, grade * 1.25) * (.82 + .18 * Math.cos(y * 2.4));
    const basin = Math.max(0, -y / 16);
    colors[i * 3] = 1 - shale * .22 - basin * .15;
    colors[i * 3 + 1] = 1 - shale * .33 - basin * .12;
    colors[i * 3 + 2] = 1 - shale * .44 - basin * .035;
  }
  if (colors) geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
}

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
  const segments = map.size / map.terrain.cell;
  const geometry = new THREE.PlaneGeometry(map.size, map.size, segments, segments);
  shapeQuarrySurface(geometry, map, .045);
  const uv = geometry.attributes.uv;
  geometry.setAttribute('uv1', uv.clone());
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * map.size / 8, uv.getY(i) * map.size / 8);
  const road = new THREE.Mesh(geometry, gravel);
  road.rotation.x = -Math.PI / 2;
  road.receiveShadow = true;
  owner.scene.add(road);
}

function quarryCliffs(owner, map, backdrop = true) {
  const positions = [], colors = [], uvs = [];
  const outline = [[-.5, -.41], [-.41, -.5], [.41, -.5], [.5, -.41], [.5, .41], [.41, .5], [-.41, .5], [-.5, .41]];
  function rock(x, z, w, d, h, color, baseY = 0) {
    const [r, g, bColor] = new THREE.Color(color).toArray();
    const profile = [[-.07, 1, .73], [.13, .993, .88], [.43, .98, 1.06], [.55, .98, .84], [.83, .96, .96], [.97, .86, 1.10]];
    const slant = outline.map(() => (owner.random() - .5) * .065);
    const rings = profile.map(([height, scale], level) => outline.map(([vx, vz], i) => {
      const px = x + vx * w * scale, pz = z + vz * d * scale;
      const py = baseY + h * (height + slant[i]);
      return [px, level === 0 ? Math.min(py, map.terrain.heightAt(px, pz) - .12) : py, pz];
    }));
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
    if (box.kind === 'rock') rock(box.x, box.z, box.w, box.d, box.h, box.color, box.baseY);
  }
  const limit = map.size / 2;
  const tones = [0x7e7460, 0x948574, 0x8a7963];
  if (backdrop) for (const side of [-1, 1]) {
    const rows = Math.ceil(limit / 55);
    for (let i = -rows; i <= rows; i++) {
      const offset = i * 55 + (owner.random() - .5) * 16;
      const distance = limit + 43 + owner.random() * 22;
      const height = 20 + owner.random() * 22;
      rock(side * distance, offset, 44 + owner.random() * 18, 62, height, tones[(i + rows) % tones.length]);
      if (Math.abs(i) > 1) rock(offset, side * distance, 62, 52, height * .8, tones[(i + rows + 1) % tones.length]);
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

export function addQuarryAsset(owner, box, map) {
  if (box.kind === 'rock') quarryCliffs(owner, { ...map, boxes: [box] }, false);
  if (box.kind === 'pump-manifold') addPumpManifold(owner, box);
}

function addPumpManifold(owner, box) {
  const { x, z, w, d, baseY } = box;
  const { scene, materials } = owner;
  owner.box(scene, x, baseY + .3, z, w, .6, d, materials.concrete);
  for (const side of [-1, 1]) {
    const end = x + side * (w / 2 - .25);
    owner.box(scene, end, baseY + .91, z, .42, .66, d - .12, materials.darkConcrete);
    owner.box(scene, end, baseY + 1.25, z, .44, .10, d - .08, materials.edge);
  }
  for (const offset of [-.75, 0, .75]) {
    const pipe = owner.cylinder(scene, x, baseY + 1.03, z + offset, .235, w - .38, materials.rust);
    pipe.rotation.z = Math.PI / 2;
    for (const joint of [-2.2, 0, 2.2]) {
      const flange = owner.cylinder(scene, x + joint, baseY + 1.03, z + offset, .285, .14, materials.steel);
      flange.rotation.z = Math.PI / 2;
    }
  }
}

export function addQuarryGround(owner, map, ground, assets = true) {
  ground.material = clonePairedMaterial(owner.surfaces.ground, 0xc4ae87);
  ground.material.vertexColors = true;
  if (ground.material._lowMaterial) ground.material._lowMaterial.vertexColors = true;
  shapeQuarrySurface(ground.geometry, map, 0, true);
  gravelRoads(owner, map);
  quarryCliffs(owner, assets ? map : { ...map, boxes: [] });
  if (assets) {
    for (const box of map.boxes) if (box.kind === 'pump-manifold') addPumpManifold(owner, box);
    addQuarrySigns(owner, map);
  }

  for (const pad of map.vehicleSpawns) {
    const y = map.terrain.heightAt(pad.x, pad.z);
    for (const side of [-1, 1]) {
      owner.box(owner.scene, pad.x + side * 2.6, y + .052, pad.z, .17, .008, 7.2, owner.materials.marking, false);
    }
    owner.box(owner.scene, pad.x, y + .053, pad.z + Math.cos(pad.yaw) * 3.5, 5.2, .008, .18, owner.materials.marking, false);
  }
}

export function addQuarrySigns(owner, map) {
  for (const { x, z, name, note, baseSign, yaw = Math.PI } of map.signs) {
    const y = map.terrain.heightAt(x, z);
    const sign = makeSign(name, note, baseSign ? 4 : 3.3);
    sign.position.set(x, y + (baseSign ? 2.35 : 2.25), z);
    sign.rotation.y = yaw;
    owner.scene.add(sign);
    if (!baseSign) for (const side of [-1, 1]) owner.cylinder(owner.scene, x + side * 1.15, y + 1.05, z, .075, 2.1, owner.materials.steel);
  }
}
