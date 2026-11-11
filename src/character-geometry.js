import * as THREE from 'three';

// UV seams need duplicate vertices, but must not produce a hard lighting seam.
export function smoothRingSeams(geometry, rings, segments) {
  const normal = geometry.getAttribute('normal');
  const n = new THREE.Vector3(), other = new THREE.Vector3();
  for (let ring = 0; ring < rings; ring++) {
    const a = ring * (segments + 1), b = a + segments;
    n.fromBufferAttribute(normal, a).add(other.fromBufferAttribute(normal, b)).normalize();
    normal.setXYZ(a, n.x, n.y, n.z);
    normal.setXYZ(b, n.x, n.y, n.z);
  }
  return geometry;
}

// An asymmetric, tailored cross-section. Front/back depth and the slightly
// flattened chest are independent of width; cloth folds follow the cut.
export function tailoredGeometry(sections, segments = 16, { folds = 0, square = 1, caps = false } = {}) {
  const positions = [], uv = [], indices = [];
  for (const [r, [y, width, depth, offset = 0]] of sections.entries()) {
    const t = r / (sections.length - 1);
    for (let i = 0; i <= segments; i++) {
      const a = i * Math.PI * 2 / segments, c = Math.cos(a), s = Math.sin(a);
      const crease = 1 + folds * Math.sin(Math.PI * t) *
        (Math.sin(a * 3 + t * 16) * .65 + Math.cos(a * 5 - t * 23) * .35);
      positions.push(Math.sign(c) * Math.abs(c) ** square * width * crease, y,
        offset + Math.sign(s) * Math.abs(s) ** square * depth * crease);
      uv.push(i / segments, t);
      if (i < segments && r < sections.length - 1) {
        const v = r * (segments + 1) + i, next = v + segments + 1;
        indices.push(v, next, v + 1, v + 1, next, next + 1);
      }
    }
  }
  if (caps) for (const end of [0, sections.length - 1]) {
    const [y, , , offset = 0] = sections[end], center = positions.length / 3;
    positions.push(0, y, offset); uv.push(.5, end ? 1 : 0);
    for (let i = 0; i < segments; i++) {
      const a = end * (segments + 1) + i;
      if (end) indices.push(center, a + 1, a);
      else indices.push(center, a, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return smoothRingSeams(g, sections.length, segments);
}
