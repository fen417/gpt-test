import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { buildPortProp, buildPortCrane } from './port-props.js';
import { buildSpecialProp, SPECIAL_PROP_KINDS } from './prop-models.js';
import { localAsset, UNIT_SCALE } from './asset-scale.js';
import { affineBox, affineNormal, boxBounds, overlapsAffine, rayAffineBox, rotationMatrix } from './geometry.js';

const cache = new WeakMap();
const unitGeometry = {
  box: new THREE.BoxGeometry(1, 1, 1),
  rounded: new RoundedBoxGeometry(1, 1, 1, 1, .12),
  sphere: new THREE.SphereGeometry(1, 10, 8),
};
const cylinders = new Map();
const meshMaterial = new THREE.MeshBasicMaterial();
const palette = new Proxy({ paintFor: () => meshMaterial }, { get: (target, key) => target[key] ?? meshMaterial });
const portKinds = new Set(['port-forklift', 'port-rack', 'port-railcar', 'port-container']);
const cardinalAxes = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];

function cylinderGeometry(segments) {
  if (!cylinders.has(segments)) cylinders.set(segments, new THREE.CylinderGeometry(1, 1, 1, segments));
  return cylinders.get(segments);
}

function primitive(parent, geometry, x, y, z, sx, sy, sz) {
  const mesh = new THREE.Mesh(geometry, meshMaterial);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  parent.add(mesh);
  return mesh;
}

function projection(vertices, axis) {
  let min = Infinity, max = -Infinity;
  for (const vertex of vertices) {
    const distance = axis.dot(vertex);
    min = Math.min(min, distance);
    max = Math.max(max, distance);
  }
  return { axis, min, max };
}

function addAxis(axes, axis) {
  if (axis.lengthSq() < 1e-12) return;
  axis.normalize();
  if (!axes.some(existing => Math.abs(existing.dot(axis)) > 1 - 1e-7)) axes.push(axis);
}

// These primitives are convex. Their rendered triangles define both the
// clipping planes for bullets and the separating axes for solid collisions.
function convexGeometry(mesh) {
  const geometry = mesh.geometry, positions = geometry.attributes.position, index = geometry.index;
  const vertices = [], planes = [], normals = [], edges = [];
  const count = index?.count ?? positions.count;
  for (let i = 0; i < positions.count; i++) {
    vertices.push(new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld));
  }
  for (let i = 0; i < count; i += 3) {
    const a = vertices[index ? index.getX(i) : i];
    const b = vertices[index ? index.getX(i + 1) : i + 1];
    const c = vertices[index ? index.getX(i + 2) : i + 2];
    const ab = b.clone().sub(a), ac = c.clone().sub(a);
    const normal = ab.clone().cross(ac);
    if (normal.lengthSq() < 1e-16) continue;
    normal.normalize();
    const distance = normal.dot(a);
    if (!planes.some(plane => plane.normal.dot(normal) > 1 - 1e-7 && Math.abs(plane.distance - distance) < 1e-6)) {
      planes.push({ normal, distance });
    }
    addAxis(normals, normal.clone());
    addAxis(edges, ab);
    addAxis(edges, ac);
    addAxis(edges, c.clone().sub(b));
  }
  const axes = normals.slice();
  for (const axis of cardinalAxes) addAxis(axes, axis.clone());
  for (const edge of edges) for (const axis of cardinalAxes) addAxis(axes, edge.clone().cross(axis));
  return { vertices, planes, edges, projections: axes.map(axis => projection(vertices, axis)) };
}

function primitiveCollider(mesh, box) {
  const e = mesh.matrixWorld.elements;
  const matrix = [e[0], e[4], e[8], e[1], e[5], e[9], e[2], e[6], e[10]];
  const obb = affineBox({ x: e[12], y: e[13], z: e[14] }, [.5, .5, .5], matrix);
  // Cylinder and sphere units have diameter two, while box units have width one.
  if (mesh.geometry.type === 'CylinderGeometry') obb.half = [1, .5, 1];
  if (mesh.geometry.type === 'SphereGeometry') obb.half = [1, 1, 1];
  const bounds = boxBounds({ obb });
  const part = {
    id: box.id, kind: box.kind, x: obb.center.x, z: obb.center.z,
    w: bounds.maxX - bounds.minX, d: bounds.maxZ - bounds.minZ,
    baseY: bounds.minY, h: bounds.h - bounds.minY, overhead: true, obb,
  };
  const result = boxBounds(part);
  if (mesh.geometry !== unitGeometry.box) result.convex = convexGeometry(mesh);
  return result;
}

function assetCollider(box, map, crane) {
  if (!crane && !portKinds.has(box.kind) && !SPECIAL_PROP_KINDS.has(box.kind)) return boxBounds(box);
  const value = crane ?? box, scale = value.modelScale ?? UNIT_SCALE;
  const anchor = { x: value.x, z: value.z, baseY: value.baseY ?? map.terrain?.heightAt(value.x, value.z) ?? 0 };
  const root = new THREE.Group();
  const local = localAsset(value, anchor, scale);
  const owner = {
    scene: root, materials: palette, surfaces: palette, geo: unitGeometry,
    box: (parent, x, y, z, w, h, d) => primitive(parent, unitGeometry.box, x, y, z, w, h, d),
    rounded: (parent, x, y, z, w, h, d) => primitive(parent, unitGeometry.rounded, x, y, z, w, h, d),
    cylinder: (parent, x, y, z, radius, height, material, segments = 10) =>
      primitive(parent, cylinderGeometry(segments), x, y, z, radius, height, radius),
  };
  if (crane) buildPortCrane(owner, palette, local);
  else if (!buildPortProp(owner, palette, local)) buildSpecialProp.call(owner, root, local, meshMaterial);
  const pose = value.editorPose ?? { x: value.x, y: anchor.baseY, z: value.z };
  root.position.set(pose.x, pose.y, pose.z);
  root.scale.set(scale.x, scale.y, scale.z);
  const m = value.modelBasis ?? rotationMatrix(value.modelRotation);
  root.quaternion.setFromRotationMatrix(new THREE.Matrix4().set(
    m[0], m[1], m[2], 0, m[3], m[4], m[5], 0, m[6], m[7], m[8], 0, 0, 0, 0, 1,
  ));
  root.updateMatrixWorld(true);
  const parts = [];
  root.traverse(mesh => { if (mesh.isMesh) parts.push(primitiveCollider(mesh, box)); });
  const minX = Math.min(...parts.map(part => part.minX)), maxX = Math.max(...parts.map(part => part.maxX));
  const minZ = Math.min(...parts.map(part => part.minZ)), maxZ = Math.max(...parts.map(part => part.maxZ));
  const minY = Math.min(...parts.map(part => part.minY)), top = Math.max(...parts.map(part => part.h));
  return { ...box, obb: undefined, parts, minX, maxX, minZ, maxZ, minY, h: top,
    x: (minX + maxX) / 2, z: (minZ + maxZ) / 2, w: maxX - minX, d: maxZ - minZ };
}

export function getAssetColliders(map) {
  if (!cache.has(map)) {
    const cranes = new Map((map.cranes ?? []).map((crane, index) => [crane.editorKey ?? 'crane:' + (crane.id ?? index), crane]));
    const built = new Set(), colliders = [];
    for (const box of map.boxes) {
      const crane = box.kind === 'port-crane-leg' ? cranes.get(box.editorParent) : undefined;
      if (crane && built.has(crane)) continue;
      if (crane) built.add(crane);
      colliders.push(assetCollider(box, map, crane));
    }
    cache.set(map, colliders);
  }
  return cache.get(map);
}

function rayBounds(origin, direction, box, maximum) {
  let near = 0, far = maximum;
  if (Math.abs(direction.x) < 1e-9) {
    if (origin.x < box.minX || origin.x > box.maxX) return Infinity;
  } else {
    const a = (box.minX - origin.x) / direction.x, b = (box.maxX - origin.x) / direction.x;
    near = Math.max(near, Math.min(a, b));
    far = Math.min(far, Math.max(a, b));
    if (near > far) return Infinity;
  }
  if (Math.abs(direction.z) < 1e-9) {
    if (origin.z < box.minZ || origin.z > box.maxZ) return Infinity;
  } else {
    const a = (box.minZ - origin.z) / direction.z, b = (box.maxZ - origin.z) / direction.z;
    near = Math.max(near, Math.min(a, b));
    far = Math.min(far, Math.max(a, b));
    if (near > far) return Infinity;
  }
  const minY = box.minY ?? 0;
  if (Math.abs(direction.y) < 1e-9) return origin.y < minY || origin.y > box.h ? Infinity : near;
  const a = (minY - origin.y) / direction.y, b = (box.h - origin.y) / direction.y;
  near = Math.max(near, Math.min(a, b));
  far = Math.min(far, Math.max(a, b));
  return near <= far ? near : Infinity;
}

export function rayCollider(origin, direction, box, maximum) {
  const broad = rayBounds(origin, direction, box, maximum);
  if (!Number.isFinite(broad)) return Infinity;
  if (box.parts) {
    let closest = maximum, found = false;
    for (const part of box.parts) {
      const distance = rayCollider(origin, direction, part, closest);
      if (distance <= closest) { closest = distance; found = true; }
    }
    return found ? closest : Infinity;
  }
  if (box.convex) {
    let near = 0, far = maximum;
    for (const { normal, distance } of box.convex.planes) {
      const offset = distance + (box.padding ?? 0) - (normal.x * origin.x + normal.y * origin.y + normal.z * origin.z);
      const slope = normal.x * direction.x + normal.y * direction.y + normal.z * direction.z;
      if (Math.abs(slope) < 1e-9) { if (offset < -1e-7) return Infinity; continue; }
      if (slope < 0) near = Math.max(near, offset / slope);
      else far = Math.min(far, offset / slope);
      if (near > far + 1e-7) return Infinity;
    }
    return near;
  }
  if (!box.obb) return broad;
  return rayAffineBox(origin, direction, box.obb, maximum);
}

function boundedShape(box) {
  return box.obb ?? affineBox(
    { x: box.x, y: (box.minY + box.h) / 2, z: box.z },
    [box.w / 2, (box.h - box.minY) / 2, box.d / 2],
  );
}

function separated(shape, { axis, min, max }) {
  const m = shape.matrix, half = shape.half, center = shape.center;
  const middle = axis.x * center.x + axis.y * center.y + axis.z * center.z;
  const radius = Math.abs(axis.x * m[0] + axis.y * m[3] + axis.z * m[6]) * half[0] +
    Math.abs(axis.x * m[1] + axis.y * m[4] + axis.z * m[7]) * half[1] +
    Math.abs(axis.x * m[2] + axis.y * m[5] + axis.z * m[8]) * half[2];
  return middle + radius <= min + 1e-7 || middle - radius >= max - 1e-7;
}

export function overlapsCollider(shape, box, bounds = boxBounds({ obb: shape })) {
  if (bounds.maxX <= box.minX || bounds.minX >= box.maxX || bounds.maxZ <= box.minZ || bounds.minZ >= box.maxZ ||
      bounds.h <= box.minY || bounds.minY >= box.h) return false;
  if (box.parts) return box.parts.some(part => overlapsCollider(shape, part, bounds));
  if (!box.convex) return overlapsAffine(shape, boundedShape(box));
  if (box.convex.projections.some(axis => separated(shape, axis))) return false;
  const m = shape.matrix;
  if (m[1] === 0 && m[2] === 0 && m[3] === 0 && m[5] === 0 && m[6] === 0 && m[7] === 0) return true;
  const edges = [
    new THREE.Vector3(m[0], m[3], m[6]), new THREE.Vector3(m[1], m[4], m[7]), new THREE.Vector3(m[2], m[5], m[8]),
  ];
  const axes = [];
  for (let i = 0; i < 3; i++) addAxis(axes, edges[i].clone().cross(edges[(i + 1) % 3]));
  for (const edge of edges) for (const other of box.convex.edges) addAxis(axes, edge.clone().cross(other));
  return !axes.some(axis => separated(shape, projection(box.convex.vertices, axis)));
}

export function colliderNormal(box, point) {
  if (!box.convex) return affineNormal(boundedShape(box), point);
  let closest = Infinity, result;
  for (const { normal, distance } of box.convex.planes) {
    const gap = Math.abs(normal.x * point.x + normal.y * point.y + normal.z * point.z - distance - (box.padding ?? 0));
    if (gap < closest) { closest = gap; result = normal; }
  }
  return result;
}

export function expandCollider(box, padding) {
  if (box.parts) return { ...box, minX: box.minX - padding, maxX: box.maxX + padding,
    minZ: box.minZ - padding, maxZ: box.maxZ + padding, minY: box.minY - padding, h: box.h + padding,
    parts: box.parts.map(part => expandCollider(part, padding)) };
  if (box.convex) return { ...box, minX: box.minX - padding, maxX: box.maxX + padding,
    minZ: box.minZ - padding, maxZ: box.maxZ + padding, minY: box.minY - padding, h: box.h + padding, padding };
  if (box.obb) {
    const m = box.obb.matrix;
    const lengths = [Math.hypot(m[0], m[3], m[6]), Math.hypot(m[1], m[4], m[7]), Math.hypot(m[2], m[5], m[8])];
    return boxBounds({ ...box, obb: { ...box.obb, half: box.obb.half.map((half, i) => half + padding / lengths[i]) } });
  }
  return { ...box, minX: box.minX - padding, maxX: box.maxX + padding,
    minZ: box.minZ - padding, maxZ: box.maxZ + padding, minY: box.minY - padding, h: box.h + padding };
}
