import * as THREE from 'three';
import { clonePairedMaterial } from './visuals.js';

// Join matching segment endpoints into paths before drawing. A single mask unions
// intersections, so neither overlapping end caps nor independent terrain grids remain.
function paths(roads) {
  const nodes = new Map(), edges = [];
  const node = (x, z, width) => {
    const key = [Math.round(x * 100), Math.round(z * 100), Math.round(width * 100)].join('/');
    if (!nodes.has(key)) nodes.set(key, { x, z, edges: [] });
    return nodes.get(key);
  };
  for (const road of roads) {
    const scale = road.modelScale ?? { x: 1, y: 1, z: 1 };
    const width = road.w / scale.x, length = Math.max(0, road.d / scale.z - width);
    const dx = Math.sin(road.yaw ?? 0) * length * scale.x / 2;
    const dz = Math.cos(road.yaw ?? 0) * length * scale.z / 2;
    const effectiveWidth = width * Math.hypot(Math.cos(road.yaw ?? 0) * scale.x, Math.sin(road.yaw ?? 0) * scale.z);
    const a = node(road.x - dx, road.z - dz, effectiveWidth);
    const b = node(road.x + dx, road.z + dz, effectiveWidth);
    const edge = { a, b, width: effectiveWidth };
    a.edges.push(edge); b.edges.push(edge); edges.push(edge);
  }
  const visited = new Set(), result = [];
  function follow(start, first) {
    const points = [start];
    let current = start, edge = first;
    while (edge && !visited.has(edge)) {
      visited.add(edge);
      current = edge.a === current ? edge.b : edge.a;
      points.push(current);
      edge = current.edges.length === 2 ? current.edges.find(candidate => !visited.has(candidate)) : null;
    }
    result.push({ points, width: first.width });
  }
  for (const start of nodes.values()) if (start.edges.length !== 2)
    for (const edge of start.edges) if (!visited.has(edge)) follow(start, edge);
  for (const edge of edges) if (!visited.has(edge)) follow(edge.a, edge);
  return result;
}

function drawPath(ctx, points) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].z);
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1], b = points[i], c = points[i + 1];
    const before = Math.hypot(b.x - a.x, b.z - a.z), after = Math.hypot(c.x - b.x, c.z - b.z);
    const radius = Math.min(6, before * .28, after * .28);
    if (before < .001 || after < .001) continue;
    ctx.lineTo(b.x + (a.x - b.x) * radius / before, b.z + (a.z - b.z) * radius / before);
    ctx.quadraticCurveTo(b.x, b.z, b.x + (c.x - b.x) * radius / after, b.z + (c.z - b.z) * radius / after);
  }
  ctx.lineTo(points.at(-1).x, points.at(-1).z);
  ctx.stroke();
}

export function terrainRoads(owner, ground, span, roads, source, color) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 4096;
  const ctx = canvas.getContext('2d');
  const mask = new THREE.CanvasTexture(canvas);
  mask.channel = 1;
  mask.anisotropy = source.map?.anisotropy ?? 4;
  mask.generateMipmaps = true;
  const uv = ground.geometry.attributes.uv;
  const uv1 = new Float32Array(uv.count * 2);
  const positions = ground.geometry.attributes.position;
  for (let i = 0; i < uv.count; i++) {
    uv1[i * 2] = positions.getX(i) / span + .5;
    uv1[i * 2 + 1] = positions.getY(i) / span + .5;
  }
  ground.geometry.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2));
  const material = clonePairedMaterial(source, color);
  for (const m of [material, material._lowMaterial]) if (m) {
    m.alphaMap = mask;
    m.transparent = true;
    m.depthWrite = false;
    m.alphaTest = .015;
    m.polygonOffset = true;
    m.polygonOffsetFactor = -1;
    m.polygonOffsetUnits = -2;
  }
  const overlay = new THREE.Mesh(ground.geometry, material);
  overlay.rotation.copy(ground.rotation);
  overlay.position.copy(ground.position);
  overlay.receiveShadow = true;
  overlay.userData.noBatch = true;
  overlay.renderOrder = 1;
  owner.scene.add(overlay);
  const update = nextRoads => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const pixels = canvas.width / span;
    ctx.setTransform(pixels, 0, 0, pixels, canvas.width / 2, canvas.height / 2);
    ctx.lineCap = ctx.lineJoin = 'round';
    // Feathered shoulders soften the join with sand without seams at crossroads.
    const lanes = paths(nextRoads);
    for (const [extra, tone] of [[1.1, '#262626'], [.65, '#777777'], [.25, '#bbbbbb'], [0, '#ffffff']]) {
      ctx.strokeStyle = tone;
      for (const path of lanes) { ctx.lineWidth = path.width + extra; drawPath(ctx, path.points); }
    }
    mask.needsUpdate = true;
  };
  update(roads);
  return { update };
}
