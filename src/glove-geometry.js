import * as THREE from 'three';
import { smoothRingSeams } from './character-geometry.js';

// A sewn glove has flattened faces and independent width/depth at each joint.
// Surface patches use this same skin, so reinforcement cannot float above it.
export function gloveSurface(points, widths, depths, {
  across = [0, 0, 1], segments = 32, radial = 20, square = .72,
} = {}) {
  const path = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
  const reference = new THREE.Vector3(...across).normalize();
  const interpolate = (values, t) => {
    const u = t * (values.length - 1), i = Math.min(values.length - 2, Math.floor(u));
    return THREE.MathUtils.lerp(values[i], values[i + 1], u - i);
  };
  function point(t, angle, lift = 0) {
    const tangent = path.getTangent(t).normalize();
    const side = reference.clone().addScaledVector(tangent, -reference.dot(tangent));
    if (side.lengthSq() < .0001) {
      side.set(Math.abs(tangent.x) < .8 ? 1 : 0, Math.abs(tangent.x) < .8 ? 0 : 1, 0);
      side.addScaledVector(tangent, -side.dot(tangent));
    }
    side.normalize();
    const back = new THREE.Vector3().crossVectors(tangent, side).normalize();
    const c = Math.cos(angle), s = Math.sin(angle);
    return path.getPoint(t)
      .addScaledVector(side, Math.sign(c) * Math.abs(c) ** square * (interpolate(widths, t) + lift))
      .addScaledVector(back, Math.sign(s) * Math.abs(s) ** square * (interpolate(depths, t) + lift));
  }
  function skin(t0, t1, a0, a1, lift, rows, columns, closed) {
    const positions = [], uv = [], indices = [];
    for (let row = 0; row <= rows; row++) for (let col = 0; col <= columns; col++) {
      const t = THREE.MathUtils.lerp(t0, t1, row / rows);
      const a = THREE.MathUtils.lerp(a0, a1, col / columns);
      positions.push(...point(t, a, lift).toArray());
      uv.push(a / (2 * Math.PI), t * 2);
      if (row < rows && col < columns) {
        const i = row * (columns + 1) + col, next = i + columns + 1;
        indices.push(i, i + 1, next, next, i + 1, next + 1);
      }
    }
    if (closed) for (const end of [0, rows]) {
      const center = positions.length / 3;
      positions.push(...path.getPoint(end ? t1 : t0).toArray()); uv.push(.5, end ? 1 : 0);
      for (let col = 0; col < columns; col++) {
        const i = end * (columns + 1) + col;
        if (end) indices.push(center, i, i + 1);
        else indices.push(center, i + 1, i);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    if (closed) smoothRingSeams(geometry, rows + 1, columns);
    return geometry;
  }
  return {
    geometry: skin(0, 1, 0, Math.PI * 2, 0, segments, radial, true),
    point,
    // Matching subdivisions keep the thin overlay on the curved base surface.
    patch: (t0, t1, a0, a1, lift = .00065) =>
      skin(t0, t1, a0, a1, lift, Math.max(8, Math.ceil((t1 - t0) * segments)), 12, false),
  };
}
