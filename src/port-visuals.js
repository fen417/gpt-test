import * as THREE from 'three';
import { clonePairedMaterial, makeSign, pairMaterials } from './visuals.js';

function portMaterials(owner) {
  const { surfaces, materials: m } = owner;
  const skylight = pairMaterials(
    new THREE.MeshStandardMaterial({ color: 0xa8c2be, roughness: .36, transparent: true, opacity: .50, depthWrite: false }),
    new THREE.MeshLambertMaterial({ color: 0xa8c2be, transparent: true, opacity: .55, depthWrite: false }),
  );
  return {
    ...m,
    skylight,
    ground: clonePairedMaterial(surfaces.concrete, 0xc1beb0),
    quay: clonePairedMaterial(surfaces.concrete, 0x888c83),
    roof: clonePairedMaterial(surfaces.metal, 0x526368),
    glassRoof: clonePairedMaterial(surfaces.metal, 0xa9c3be, 0x738c83, .16),
    pallet: clonePairedMaterial(surfaces.wood, 0x987a56),
    cardboard: clonePairedMaterial(surfaces.wood, 0xb7a381),
    wrap: clonePairedMaterial(surfaces.metal, 0xd0cfb8),
    yellow: clonePairedMaterial(surfaces.metal, 0xc59a46),
    paint: new Map(),
  };
}

function paint(owner, palette, color) {
  if (!palette.paint.has(color)) palette.paint.set(color, clonePairedMaterial(owner.surfaces.metal, color));
  return palette.paint.get(color);
}

function girder(owner, parent, from, to, width, material, shadow = true) {
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
  const delta = b.clone().sub(a), middle = a.addScaledVector(delta, .5);
  const beam = owner.box(parent, middle.x, middle.y, middle.z, width, delta.length(), width, material, shadow);
  beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
}

function container(owner, parent, m, color, length, d = 2.6, h = 2.66) {
  const enamel = paint(owner, m, color), rib = .055;
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

function stack(owner, parent, m, box, base = 0) {
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
  const frame = paint(owner, m, box.color);
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
  const { scene } = owner, body = paint(owner, m, color);
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
  const enamel = paint(owner, m, color);
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

function cargoCrane(owner, m, crane) {
  const root = new THREE.Group(), { x, z, height, color } = crane, steel = paint(owner, m, color);
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

function warehouseInterior(owner, m, s) {
  const { scene } = owner, { x, z, w, d, h, gates, width, sideGate, doorHeight, name, stock } = s;
  const segments = 7, panel = w / segments;
  for (let bay = 0; bay < segments; bay++) {
    const sx = x - w / 2 + (bay + .5) * panel;
    const daylight = bay === 2 || bay === 4;
    if (daylight) {
      for (const side of [-1, 1]) owner.box(scene, sx, h + .16, z + side * d * .32, panel + .04, .29, d * .375, m.roof);
      owner.box(scene, sx, h + .13, z, panel + .04, .15, d * .278, m.skylight, false);
      for (const side of [-1, 1]) owner.box(scene, sx + side * panel * .46, h + .27, z, .11, .12, d * .28, m.steel, false);
    } else owner.box(scene, sx, h + .16, z, panel + .04, .29, d + .8, m.roof);
  }
  for (const dz of [-d * .35, -d * .17, 0, d * .17, d * .35]) {
    owner.box(scene, x, h - .58, z + dz, w, .23, .24, m.steel);
    for (const side of [-1, 1]) {
      girder(owner, scene, [x, h - .51, z + dz], [x + side * w / 2, h - .08, z + dz], .16, m.steel, false);
      owner.box(scene, x + side * w * .26, h - .95, z + dz, 3.1, .15, .34, m.steel, false);
      owner.box(scene, x + side * w * .26, h - 1.04, z + dz, 2.75, .036, .25, m.glow, false);
    }
  }
  for (const sign of [-1, 1]) {
    const doorZ = z + sign * (d / 2 + .58);
    for (const dx of gates) {
      owner.box(scene, x + dx, doorHeight - .02, doorZ, width + .5, .30, .20, m.steel);
      for (const edge of [-1, 1]) {
        owner.box(scene, x + dx + edge * width / 2, doorHeight / 2, doorZ, .16, doorHeight, .17, m.edge);
        owner.cylinder(scene, x + dx + edge * (width / 2 - .2), .47, doorZ + sign * .7, .08, .94, m.yellow);
      }
    }
    const label = makeSign(name, stock === 'reefer' ? 'COLD CHAIN' : 'FREIGHT HANDLING', Math.min(w * .18, 9));
    label.position.set(x, h - 1.8, doorZ - sign * .015);
    label.rotation.y = sign > 0 ? 0 : Math.PI;
    scene.add(label);
    const sideX = x + sign * (w / 2 + .60);
    owner.box(scene, sideX, doorHeight, z, .22, .28, sideGate + .44, m.steel);
    for (const edge of [-1, 1]) owner.box(scene, sideX, doorHeight / 2, z + edge * sideGate / 2, .18, doorHeight, .16, m.edge);
  }
  for (const side of [-1, 1]) {
    owner.box(scene, x + side * 5.6, .013, z, .10, .012, d - 3.5, m.stripe, false);
    for (const end of [-1, 1]) owner.box(scene, x + side * w * .33, .014, z + end * d * .33, w * .21, .014, .085, m.marking, false);
  }
}

function sea(owner, map) {
  const size = 192, canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d'), pixels = ctx.createImageData(size, size);
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
    const u = x / size * Math.PI * 2, v = z / size * Math.PI * 2;
    const ripple = Math.sin(u * 3 + v * 4 + .9 * Math.sin(v * 3))
      + .54 * Math.sin(u * 8 - v * 5 + .8 * Math.sin(u * 2 + v))
      + .24 * Math.sin(u * 11 + v * 9);
    const i = (z * size + x) * 4, crest = Math.max(0, ripple - .88);
    pixels.data.set([34 + ripple * 7 + crest * 10, 67 + ripple * 9 + crest * 12, 76 + ripple * 9 + crest * 14, 255], i);
  }
  ctx.putImageData(pixels, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(8, 10);
  texture.anisotropy = owner.surfaces.maps.metal.anisotropy;
  const material = pairMaterials(
    new THREE.MeshStandardMaterial({ color: 0xdde5e2, map: texture, bumpMap: texture, bumpScale: .25, roughness: .30, metalness: .16 }),
    new THREE.MeshLambertMaterial({ color: 0xdde5e2, map: texture }),
  );
  const width = 1200;
  const water = new THREE.Mesh(new THREE.PlaneGeometry(width, 1600), material);
  water.rotation.x = -Math.PI / 2;
  water.position.set(map.shoreX - width / 2, -1.6, 0);
  water.receiveShadow = true;
  owner.scene.add(water);
  owner.portWater = texture;
}

function shipHull(owner, parent, profile, depth, y, color) {
  const outline = new THREE.Shape();
  profile.forEach(([x, z], i) => i ? outline.lineTo(x, -z) : outline.moveTo(x, -z));
  outline.closePath();
  const geometry = new THREE.ExtrudeGeometry(outline, { depth, bevelEnabled: false });
  geometry.rotateX(-Math.PI / 2);
  const material = clonePairedMaterial(owner.surfaces.metal, color);
  const hull = new THREE.Mesh(geometry, material);
  hull.position.y = y;
  hull.castShadow = hull.receiveShadow = true;
  parent.add(hull);
}

function containerShip(owner, m, ship) {
  const root = new THREE.Group();
  root.position.set(ship.x, ship.baseY ?? 0, ship.z);
  if (ship.beached) root.rotation.z = -.045;
  owner.scene.add(root);
  const w = ship.w / 2, l = ship.d / 2;
  const profile = [[0, -l], [w * .87, -l + 12], [w, -l + 29], [w, l - 9], [w * .73, l], [-w * .73, l], [-w, l - 9], [-w, -l + 29], [-w * .87, -l + 12]];
  shipHull(owner, root, profile, 2.7, -2.7, 0x703d36);
  shipHull(owner, root, profile, 4.7, 0, 0x344550);
  shipHull(owner, root, profile, .16, 4.71, 0x89908a);
  const house = paint(owner, m, '#b0b0a0');
  owner.box(root, 0, 8.6, l - 18, 15, 7.6, 15, house);
  owner.box(root, 0, 13.25, l - 19, 18.7, 2.35, 11.9, house);
  owner.box(root, 0, 14.45, l - 19, 19, .24, 12.3, m.steel);
  for (let x = -7.6; x <= 7.6; x += 1.54) owner.box(root, x, 13.35, l - 25, 1.25, .85, .06, m.window, false);
  owner.box(root, 0, 15.4, l - 14, 3.9, 3.2, 3.1, m.rust);
  owner.box(root, 0, 17.06, l - 14, 4.03, .29, 3.25, m.tire);
  girder(owner, root, [-2, 14.54, l - 20], [-2, 21, l - 20], .13, m.steel, false);
  owner.box(root, -2, 20.12, l - 20, 5.1, .12, .24, m.edge, false);
  for (const side of [-1, 1]) for (let z = -l + 27; z < l - 27; z += 4) {
    owner.cylinder(root, side * (w - .25), 5.30, z, .035, 1.11, m.edge, 8);
  }
  for (const side of [-1, 1]) owner.box(root, side * (w - .25), 5.82, 0, .045, .055, ship.d - 51, m.edge, false);
  const colors = ['#a06444', '#597b80', '#aa865e', '#6a7366'];
  for (let row = 0; row < 5; row++) for (const side of [-1, 1]) {
    const levels = 1 + (row + (side === 1 ? 1 : 2)) % 3;
    stack(owner, root, m, { x: side * 4.7, z: -l + 33 + row * 12.8,
      w: 2.60, d: 12.2, h: levels * 2.66, levels, color: colors[(row + (side + 1)) % colors.length] }, 4.88);
  }
}

function addServiceRoads(owner, map, m) {
  const { scene } = owner;
  const transverse = map.roads.filter(road => road.w > road.d);
  const pavement = (x, z, w, d) => {
    const road = owner.box(scene, x, .017, z, w, .025, d, m.asphalt, false);
    road.receiveShadow = true;
  };
  for (const road of map.roads) {
    const longX = road.w > road.d;
    const crosses = longX ? [] : transverse.filter(cross =>
      Math.abs(cross.x - road.x) < (cross.w + road.w) / 2).sort((a, b) => a.z - b.z);
    if (longX) pavement(road.x, road.z, road.w, road.d);
    else {
      let from = road.z - road.d / 2;
      const end = road.z + road.d / 2;
      for (const cross of crosses) {
        const to = Math.min(end, cross.z - cross.d / 2);
        if (to > from) pavement(road.x, (from + to) / 2, road.w, to - from);
        from = Math.max(from, cross.z + cross.d / 2);
      }
      if (end > from) pavement(road.x, (from + end) / 2, road.w, end - from);
    }
    for (let n = -Math.max(road.w, road.d) / 2 + 6; n < Math.max(road.w, road.d) / 2 - 4; n += 8) {
      if (crosses.some(cross => Math.abs(road.z + n - cross.z) < cross.d / 2 + 2.2)) continue;
      owner.box(scene, road.x + (longX ? n : 0), .035, road.z + (longX ? 0 : n), longX ? 3.9 : .11, .010, longX ? .11 : 3.9, m.marking, false);
    }
  }
}

function portBackdrop(owner, m) {
  const { scene } = owner;
  for (const [z, levels, color] of [[-132, 3, '#637474'], [-101, 2, '#775e50'], [82, 3, '#69736c'], [122, 2, '#927654']]) {
    for (const x of [192, 207, 222]) stack(owner, scene, m, { x, z, w: 12.2, d: 2.6, h: levels * 2.66, levels, color });
  }
  for (const z of [-43, -14, 15, 44]) {
    owner.cylinder(scene, 231, 6, z, 8.1, 12, m.quay, 28);
    owner.cylinder(scene, 231, 12.13, z, 8.24, .27, m.roof, 28);
    owner.cylinder(scene, 231, .16, z, 8.33, .32, m.steel, 28);
    owner.box(scene, 223, 6.0, z, .18, 11.6, .35, m.steel, false);
  }
  owner.box(scene, 231, 12.35, 0, .85, .20, 94, m.steel, false);
}

export function addPortGround(owner, map, assets = true) {
  const { scene } = owner, m = portMaterials(owner);
  const dryEdge = map.size / 2 + 142, width = dryEdge - map.shoreX;
  const geometry = new THREE.PlaneGeometry(width, map.size + 280,
    map.terrain ? Math.ceil(width / map.terrain.cell) : 1, map.terrain ? Math.ceil((map.size + 280) / map.terrain.cell) : 1);
  if (map.terrain) {
    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i++) position.setZ(i,
      map.terrain.heightAt(position.getX(i) + map.shoreX + width / 2, -position.getY(i)));
    geometry.computeVertexNormals();
  }
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * width / 12, uv.getY(i) * (map.size + 280) / 12);
  const land = new THREE.Mesh(geometry, m.ground);
  land.rotation.x = -Math.PI / 2;
  land.position.x = map.shoreX + width / 2;
  land.receiveShadow = true;
  scene.add(land);
  sea(owner, map);
  owner.box(scene, map.shoreX + .6, -.99, 0, 1.25, 1.98, map.size + 265, m.quay);
  owner.box(scene, map.shoreX + .34, .045, 0, .69, .09, map.size + 265, m.edge);
  owner.box(scene, map.shoreX + 1.35, .028, 0, .15, .016, map.size + 120, m.marking, false);
  for (let z = -map.size / 2 + 7; z < map.size / 2; z += 9.3) {
    owner.box(scene, map.shoreX - .065, -.83, z, .16, .92, .86, m.tire);
    owner.cylinder(scene, map.shoreX + .65, .32, z, .13, .62, m.steel);
    owner.rounded(scene, map.shoreX + .65, .62, z, .48, .12, .25, m.steel);
  }
  if (assets) addPortModels(owner, map, m);
  portBackdrop(owner, m);
  if (assets) addPortSigns(owner, map.signs);
}

export function createPortModelBuilder(owner) {
  const palette = portMaterials(owner);
  return map => {
    addPortModels(owner, map, palette);
    addPortSigns(owner, map.signs);
  };
}

function addPortModels(owner, map, m) {
  const { scene } = owner;
  if (map.roads?.length) addServiceRoads(owner, map, m);
  for (const { x, z, quayTrack } of map.railTracks ?? []) {
    const span = quayTrack ? 355 : 445;
    const gauge = quayTrack ? .54 : 1.43;
    for (const side of [-1, 1]) owner.box(scene, x + side * gauge / 2, .071, z, .07, .11, span, m.steel, false);
    if (!quayTrack) for (let offset = -span / 2 + 1; offset < span / 2; offset += 2.1) owner.box(scene, x, .024, z + offset, 2.47, .05, .29, m.pallet, false);
  }
  for (const box of map.boxes ?? []) {
    switch (box.kind) {
      case 'port-container': stack(owner, scene, m, box); break;
      case 'port-rack': rack(owner, m, box); break;
      case 'port-forklift': forklift(owner, m, box); break;
      case 'port-railcar': railcar(owner, m, box); break;
      case 'port-wall':
      case 'port-lintel': {
        const { x, z, w, d, h, baseY = 0 } = box;
        owner.box(scene, x, baseY + h / 2, z, w, h, d, paint(owner, m, box.color));
        if (box.kind === 'port-wall') {
          owner.box(scene, x, .38, z, w + .06, .76, d + .06, m.quay);
          owner.box(scene, x, h - .32, z, w + .07, .13, d + .07, m.steel, false);
        }
        break;
      }
    }
  }
  for (const crane of map.cranes ?? []) cargoCrane(owner, m, crane);
  for (const building of map.structures ?? []) warehouseInterior(owner, m, building);
  if (map.ship) containerShip(owner, m, map.ship);
}

function addPortSigns(owner, signs = []) {
  const { scene, materials: { steel } } = owner;
  for (const site of signs) {
    const berth = makeSign(site.name, 'КОНТЕЙНЕРНЫЙ ТЕРМИНАЛ', 4.3);
    berth.position.set(site.x, 2.2, site.z);
    berth.rotation.y = Math.PI / 2;
    scene.add(berth);
    for (const dz of [-1.55, 1.55]) owner.cylinder(scene, site.x, 1.0, site.z + dz, .074, 2, steel);
  }
}
