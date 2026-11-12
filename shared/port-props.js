import * as THREE from 'three';

export function container(owner, parent, m, color, length, d = 2.6, h = 2.66) {
  const enamel = m.paintFor(color), rib = .055;
  owner.box(parent, 0, h / 2, 0, length - .08, h - .06, d - .10, enamel);
  for (const side of [-1, 1]) {
    for (let x = -length / 2 + .45; x < length / 2 - .25; x += .60) {
      owner.box(parent, x, h / 2, side * (d / 2 - rib / 2), .082, h - .23, rib, enamel, false);
    }
    for (const y of [.095, h - .095]) {
      owner.box(parent, 0, y, side * (d / 2 - .055), length, .11, .095, m.steel, false);
    }
    for (const end of [-1, 1]) for (const y of [.095, h - .095]) {
      owner.box(parent, end * (length / 2 - .11), y, side * (d / 2 - .095), .21, .18, .17, m.edge, false);
    }
  }
  const doors = length / 2 - .028;
  for (const side of [-1, 1]) {
    owner.box(parent, doors, h / 2, side * d * .245, .038, h - .23, d * .463, enamel);
    owner.box(parent, doors + .024, h / 2, side * d * .20, .035, h - .28, .052, m.edge, false);
    owner.box(parent, doors + .043, h * .43, side * d * .16, .042, .08, .20, m.steel, false);
  }
}

export function stack(owner, parent, m, box, base = 0) {
  const longZ = box.d > box.w, length = Math.max(box.w, box.d), width = Math.min(box.w, box.d);
  const h = box.h / box.levels;
  for (let level = 0; level < box.levels; level++) {
    const layer = new THREE.Group();
    layer.position.set(box.x, base + level * h, box.z);
    layer.rotation.y = longZ ? -Math.PI / 2 : 0;
    parent.add(layer);
    container(owner, layer, m, box.color, length, width, h);
  }
}

function rack(owner, m, box) {
  const { x, z, w, d, h } = box, { scene } = owner;
  const frame = m.paintFor(box.color);
  for (const side of [-1, 1]) for (const end of [-1, 1]) {
    owner.box(scene, x + side * (w / 2 - .065), h / 2, z + end * (d / 2 - .07), .13, h, .14, frame);
  }
  for (const shelf of [.17, h * .41, h * .70]) {
    owner.box(scene, x, shelf, z, w, .11, d, frame);
    for (const dz of [-d * .32, 0, d * .32]) {
      const tall = Math.min(h - shelf - .065, shelf > h * .5 ? 1.03 : 1.18);
      const packed = Math.abs(z + dz) % 3.4 > 1.55 ? m.wrap : m.cardboard;
      owner.box(scene, x, shelf + .11, z + dz, w - .24, .12, d * .257, m.pallet);
      owner.box(scene, x, shelf + .17 + tall * .43, z + dz, w - .33, tall * .83, d * .244, packed);
      for (const band of [-.32, .32]) {
        owner.box(scene, x, shelf + .17 + tall * .43, z + dz + d * .244 * band, w - .31, tall * .83 + .012, .035, m.steel, false);
      }
    }
  }
}

function forklift(owner, m, { x, z, color }) {
  const { scene } = owner, body = m.paintFor(color);
  owner.rounded(scene, x, .60, z + .43, 1.65, .8, 2.10, body);
  owner.box(scene, x, 1.05, z + .58, .78, .11, .49, m.tire);
  for (const side of [-1, 1]) {
    for (const dz of [-.63, .9]) {
      const wheel = owner.cylinder(scene, x + side * .68, .32, z + dz, .32, .34, m.tire);
      wheel.rotation.z = Math.PI / 2;
    }
    owner.box(scene, x + side * .64, 1.57, z + .83, .095, 1.56, .13, m.steel);
    owner.box(scene, x + side * .57, 1.18, z - .88, .14, 2.27, .18, m.steel);
    owner.box(scene, x + side * .34, .16, z - 1.37, .12, .10, .85, m.steel);
  }
  owner.box(scene, x, 2.35, z + .14, 1.42, .13, 1.66, m.steel);
}

function railcar(owner, m, box) {
  const { scene } = owner, { x, z, w, d, h, color, carType } = box;
  const enamel = m.paintFor(color);
  owner.box(scene, x, .94, z, w, .32, d, m.steel);
  for (const dz of [-d * .34, d * .34]) for (const side of [-1, 1]) for (const axle of [-.8, .8]) {
    const wheel = owner.cylinder(scene, x + side * .78, .55, z + dz + axle, .41, .18, m.tire);
    wheel.rotation.z = Math.PI / 2;
  }
  if (carType === 'flat') {
    for (const offset of [-d * .24, d * .24]) stack(owner, scene, m, {
      x, z: z + offset, w: 2.6, d: d * .43, h: 2.66, levels: 1, color,
    }, 1.12);
    return;
  }
  owner.box(scene, x, (h + 1.10) / 2, z, w - .10, h - 1.10, d - .28, enamel);
  owner.rounded(scene, x, h - .16, z, w, .31, d, m.roof);
  for (const side of [-1, 1]) {
    for (let dz = -d / 2 + .60; dz < d / 2; dz += 1.15) {
      owner.box(scene, x + side * (w / 2 - .035), 2.45, z + dz, .065, 2.45, .075, m.steel, false);
    }
    owner.box(scene, x + side * (w / 2 - .018), 2.52, z, .06, 2.56, 3.6, enamel);
    owner.box(scene, x + side * (w / 2 + .012), 2.51, z - .32, .05, .09, .48, m.edge, false);
  }
}

export function buildPortProp(owner, palette, box) {
  switch (box.kind) {
    case 'port-container': stack(owner, owner.scene, palette, box); break;
    case 'port-rack': rack(owner, palette, box); break;
    case 'port-forklift': forklift(owner, palette, box); break;
    case 'port-railcar': railcar(owner, palette, box); break;
    default: return false;
  }
  return true;
}

export function girder(owner, parent, from, to, width, material, shadow = true) {
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
  const delta = b.clone().sub(a), middle = a.addScaledVector(delta, .5);
  const beam = owner.box(parent, middle.x, middle.y, middle.z, width, delta.length(), width, material, shadow);
  beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
}

export function buildPortCrane(owner, m, crane) {
  const root = new THREE.Group(), { x, z, height, color } = crane, steel = m.paintFor(color);
  root.position.set(x, 0, z);
  owner.scene.add(root);
  for (const side of [-1, 1]) {
    for (const end of [-1, 1]) {
      const px = side * 8, pz = end * 7;
      owner.box(root, px, height / 2, pz, 1.85, height, 1.85, steel);
      owner.box(root, px, .38, pz, 2.2, .76, 2.2, m.steel);
      girder(owner, root, [px, 10.5, pz], [px, height - 2, -pz], .48, steel);
    }
    owner.box(root, side * 8, 10.6, 0, .8, .75, 15, steel);
    owner.box(root, side * 8, height - 1.4, 0, 1.1, 1.2, 16, steel);
  }
  for (const end of [-1, 1]) {
    const pz = end * 1.3;
    owner.box(root, -14.5, height, pz, 55, 1.1, .6, steel);
    owner.box(root, -14.5, height + 2.7, pz, 55, .42, .46, steel);
    for (let i = -40; i < 10; i += 4.5) girder(owner, root,
      [i, height + .47, pz], [i + 4.3, height + 2.52, pz], .20, steel, false);
    girder(owner, root, [-5, height + 10, pz], [-40, height + 2.7, pz], .10, m.steel, false);
    girder(owner, root, [-5, height + 10, pz], [12, height + 2.7, pz], .10, m.steel, false);
    girder(owner, root, [-13, height + 1.6, pz], [-5, height + 10, pz], .54, steel);
    girder(owner, root, [4, height + 1.6, pz], [-5, height + 10, pz], .54, steel);
  }
  owner.box(root, -23, height - 1.0, 0, 4.2, 1.7, 3.8, m.steel);
  owner.box(root, -22.5, height - 2.35, 1.45, 2.4, 1.5, 1.8, m.roof);
  owner.box(root, -22.5, height - 2.32, 2.37, 1.75, .91, .06, m.glassRoof, false);
  for (const end of [-1, 1]) owner.box(root, -24 + end * 1.5, height - 7.9, 0, .035, 12.5, .035, m.steel, false);
  owner.box(root, -24, height - 14.2, 0, 6.2, .32, 2.2, m.yellow);
  for (const side of [-1, 1]) owner.box(root, -24 + side * 2.8, height - 14.6, 0, .48, .7, 2, m.steel);
}
