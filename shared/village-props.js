import * as THREE from 'three';

export const VILLAGE_PROP_KINDS = new Set([
  'village-broken-wall', 'village-broken-roof', 'village-table', 'village-chair',
  'village-bed', 'village-cabinet', 'village-shelf', 'village-rug', 'village-debris',
]);
const fragments = new Map();

function fragmentGeometry(box) {
  const key = JSON.stringify([box.kind, box.w, box.d, box.h, box.outline]);
  if (fragments.has(key)) return fragments.get(key);
  const shape = new THREE.Shape();
  const roof = box.kind === 'village-broken-roof', alongX = box.w >= box.d;
  const width = roof || alongX ? box.w : box.d;
  const height = roof ? box.d : box.h;
  box.outline.forEach(([u, v], index) => {
    if (index) shape.lineTo(u * width, v * height);
    else shape.moveTo(u * width, v * height);
  });
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: roof ? box.h : alongX ? box.d : box.w, bevelEnabled: false, steps: 1,
  });
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const u = positions.getX(i), v = positions.getY(i), depth = positions.getZ(i);
    if (roof) positions.setXYZ(i, u, depth, -v);
    else if (alongX) positions.setXYZ(i, u, v, depth - box.d / 2);
    else positions.setXYZ(i, depth - box.w / 2, v, -u);
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  fragments.set(key, geometry);
  return geometry;
}

export function buildVillageProp(owner, m, box) {
  if (!VILLAGE_PROP_KINDS.has(box.kind)) return false;
  const { scene } = owner, { x, z, w, d, h, baseY = 0, kind } = box;
  const block = (dx, y, dz, sx, sy, sz, mat = m.wood) =>
    owner.box(scene, x + dx, baseY + y, z + dz, sx, sy, sz, mat);
  if (kind === 'village-broken-wall' || kind === 'village-broken-roof') {
    const material = kind === 'village-broken-wall' ? [m.wall ?? m.stucco, m.stone] : m.roof;
    const mesh = new THREE.Mesh(fragmentGeometry(box), material);
    mesh.position.set(x, baseY, z);
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
  } else if (kind === 'village-table') {
    block(0, h - .065, 0, w, .13, d);
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      block(sx * (w / 2 - .14), (h - .13) / 2, sz * (d / 2 - .14), .13, h - .13, .13);
    block(0, h * .38, 0, w - .2, .1, .1);
    block(-w * .23, h + .025, 0, w * .24, .05, d * .42, m.cloth);
    owner.cylinder(scene, x + w * .25, baseY + h + .11, z, .09, .22, m.clay, 10);
  } else if (kind === 'village-chair') {
    block(0, .44, 0, w, .1, d);
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      block(sx * w * .36, .22, sz * d * .36, .07, .44, .07);
    for (const sx of [-1, 1]) block(sx * w * .36, .73, d * .36, .07, .55, .07);
    block(0, .86, d * .36, w, .14, .065);
  } else if (kind === 'village-bed') {
    block(0, .3, 0, w, .16, d);
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      block(sx * w * .42, .17, sz * d * .43, .12, .34, .12);
    block(0, .46, 0, w - .08, .2, d - .1, m.cloth);
    block(0, .58, -d * .33, w * .7, .08, d * .2, m.linen ?? m.cloth);
    block(0, .575, d * .13, w - .06, .035, d * .58, m.rug ?? m.cloth);
    block(0, .51, -d * .47, w, .5, .1);
  } else if (kind === 'village-cabinet') {
    block(0, h / 2, 0, w, h, d);
    for (const sx of [-1, 1]) {
      block(sx * w * .24, h / 2, -d / 2 - .025, w * .46, h - .12, .04, m.roof);
      block(sx * .055, h * .52, -d / 2 - .06, .035, .13, .03, m.stone);
    }
  } else if (kind === 'village-shelf') {
    for (const sx of [-1, 1]) block(sx * (w / 2 - .05), h / 2, 0, .1, h, d);
    for (const y of [.1, h * .48, h - .07]) block(0, y, 0, w, .09, d);
    for (let i = 0; i < 3; i++) {
      block((i - 1) * w * .26, h * .48 + .2, 0, w * .19, .3, d * .65, i % 2 ? m.clay : m.cloth);
    }
  } else if (kind === 'village-rug') {
    block(0, .045, 0, w, .008, d, m.rug ?? m.cloth);
    for (const sx of [-1, 1]) block(sx * w * .43, .051, 0, w * .035, .003, d * .94, m.linen ?? m.cloth);
    for (const sz of [-1, 1]) block(0, .051, sz * d * .43, w * .9, .003, d * .035, m.linen ?? m.cloth);
  } else if (kind === 'village-debris') {
    const piece = block(0, h / 2, 0, w, h, d, box.wood ? m.wood : m.stone);
    piece.rotation.y = box.turn ?? 0;
    piece.rotation.z = box.tilt ?? 0;
  }
  return true;
}
