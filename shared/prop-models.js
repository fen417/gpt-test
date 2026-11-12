import * as THREE from 'three';

export const SPECIAL_PROP_KINDS = new Set(['truck', 'car', 'tent', 'tree', 'sandbags', 'fueltank', 'generator', 'kiosk']);

export function buildSpecialProp(parent, b, mat) {
  if (!SPECIAL_PROP_KINDS.has(b.kind)) return false;
  const { w = 4, d = 4, h = 3 } = b;
  if (b.kind === 'tree') {
    // Concrete planter box, soil bed, textured trunk, branches, and multi-layered foliage canopy
    this.box(parent, b.x, 0.28, b.z, w, 0.56, d, this.materials.edge);
    this.box(parent, b.x, 0.58, b.z, w + 0.12, 0.08, d + 0.12, this.materials.darkConcrete);
    this.box(parent, b.x, 0.59, b.z, w - 0.22, 0.08, d - 0.22, this.materials.rust, false);
    this.cylinder(parent, b.x, 2.0, b.z, 0.24, 3.0, this.materials.rust, 8);
    for (const side of [-1, 1]) {
      const branch = this.cylinder(parent, b.x + side * 0.38, 2.9, b.z + side * 0.18, 0.09, 1.1, this.materials.rust, 6);
      branch.rotation.z = -side * 0.55;
    }
    const crownPositions = [
      [0, 3.65, 0, 1.45, 1.25, 1.45, this.materials.foliage],
      [-0.65, 3.25, 0.45, 1.1, 0.95, 1.1, this.materials.foliageDark],
      [0.68, 3.3, -0.42, 1.15, 0.98, 1.12, this.materials.foliageDark],
      [0.15, 4.35, -0.2, 1.05, 0.9, 1.05, this.materials.foliage],
    ];
    for (const [ox, oy, oz, sx, sy, sz, fmat] of crownPositions) {
      const canopy = new THREE.Mesh(this.geo.sphere, fmat);
      canopy.position.set(b.x + ox, oy, b.z + oz);
      canopy.scale.set(sx, sy, sz);
      canopy.castShadow = true; canopy.receiveShadow = true;
      parent.add(canopy);
    }
  } else if (b.kind === 'truck') {
    const alongX = w > d;
    const len = Math.max(w, d), wid = Math.min(w, d);
    const dir = ((Math.round(b.x + b.z) & 1) === 0) ? 1 : -1;
    const cabLen = len * 0.28, cargoLen = len * 0.68;
    const cabOffset = dir * (len / 2 - cabLen / 2 - 0.1);
    const cargoOffset = -dir * (len / 2 - cargoLen / 2 - 0.05);
    // Chassis & undercarriage
    this.box(parent, b.x, 0.58, b.z, alongX ? len * 0.94 : wid * 0.82, 0.36, alongX ? wid * 0.82 : len * 0.94, this.materials.darkConcrete);
    // Cargo box body + roof trim + side ribs
    const cx = alongX ? b.x + cargoOffset : b.x;
    const cz = alongX ? b.z : b.z + cargoOffset;
    this.rounded(parent, cx, 1.92, cz, alongX ? cargoLen : wid * 0.96, 2.35, alongX ? wid * 0.96 : cargoLen, mat);
    this.box(parent, cx, 3.12, cz, alongX ? cargoLen + 0.08 : wid, 0.08, alongX ? wid : cargoLen + 0.08, this.materials.edge);
    // Truck cab + windshield + grille + bumper
    const kx = alongX ? b.x + cabOffset : b.x;
    const kz = alongX ? b.z : b.z + cabOffset;
    this.rounded(parent, kx, 1.55, kz, alongX ? cabLen : wid * 0.9, 1.75, alongX ? wid * 0.9 : cabLen, this.materials.steel);
    this.box(parent, kx, 1.82, kz, alongX ? cabLen * 0.65 : wid * 0.93, 0.58, alongX ? wid * 0.93 : cabLen * 0.65, this.materials.glass);
    const frontX = alongX ? b.x + dir * (len / 2 - 0.06) : b.x;
    const frontZ = alongX ? b.z : b.z + dir * (len / 2 - 0.06);
    this.box(parent, frontX, 0.55, frontZ, alongX ? 0.18 : wid * 0.96, 0.34, alongX ? wid * 0.96 : 0.18, this.materials.darkConcrete);
    this.box(parent, frontX, 1.15, frontZ, alongX ? 0.14 : wid * 0.62, 0.55, alongX ? wid * 0.62 : 0.14, this.materials.edge);
    // 6 Wheels
    for (const axle of [-len * 0.36, -len * 0.12, len * 0.32]) {
      for (const side of [-1, 1]) {
        const wx = alongX ? b.x + axle : b.x + side * (wid * 0.46);
        const wz = alongX ? b.z + side * (wid * 0.46) : b.z + axle;
        const wheel = this.cylinder(parent, wx, 0.48, wz, 0.48, 0.34, this.materials.tire, 12);
        if (alongX) wheel.rotation.x = Math.PI / 2; else wheel.rotation.z = Math.PI / 2;
      }
    }
  } else if (b.kind === 'car') {
    const alongX = w > d;
    const len = Math.max(w, d), wid = Math.min(w, d);
    // Lower body hull
    this.rounded(parent, b.x, 0.68, b.z, alongX ? len * 0.96 : wid * 0.94, 0.68, alongX ? wid * 0.94 : len * 0.96, mat);
    // Cabin greenhouse + windows
    this.rounded(parent, b.x, 1.28, b.z, alongX ? len * 0.54 : wid * 0.84, 0.62, alongX ? wid * 0.84 : len * 0.54, mat);
    this.box(parent, b.x, 1.28, b.z, alongX ? len * 0.56 : wid * 0.87, 0.44, alongX ? wid * 0.87 : len * 0.56, this.materials.glass);
    // Bumpers & lights
    for (const end of [-1, 1]) {
      const ex = alongX ? b.x + end * (len * 0.48) : b.x;
      const ez = alongX ? b.z : b.z + end * (len * 0.48);
      this.box(parent, ex, 0.44, ez, alongX ? 0.16 : wid * 0.96, 0.24, alongX ? wid * 0.96 : 0.16, this.materials.darkConcrete);
      this.box(parent, ex, 0.74, ez, alongX ? 0.12 : wid * 0.76, 0.14, alongX ? wid * 0.76 : 0.12, end > 0 ? this.materials.glow : this.materials.tailLight, false);
    }
    // 4 Wheels
    for (const axle of [-len * 0.3, len * 0.3]) {
      for (const side of [-1, 1]) {
        const wx = alongX ? b.x + axle : b.x + side * (wid * 0.45);
        const wz = alongX ? b.z + side * (wid * 0.45) : b.z + axle;
        const wheel = this.cylinder(parent, wx, 0.34, wz, 0.34, 0.26, this.materials.tire, 10);
        if (alongX) wheel.rotation.x = Math.PI / 2; else wheel.rotation.z = Math.PI / 2;
      }
    }
  } else if (b.kind === 'tent') {
    const wallH = h * 0.62, rise = h * 0.42;
    const alongX = w > d;
    const span = alongX ? d : w, length = alongX ? w : d;
    this.box(parent, b.x, wallH / 2, b.z, w * 0.94, wallH, d * 0.94, mat);
    const half = span / 2, slope = Math.atan2(rise, half), panelW = Math.hypot(half, rise) + 0.25;
    for (const side of [-1, 1]) {
      const rx = alongX ? b.x : b.x + side * (half / 2);
      const rz = alongX ? b.z + side * (half / 2) : b.z;
      const roof = this.box(parent, rx, wallH + rise / 2, rz, alongX ? length + 0.3 : panelW, 0.12, alongX ? panelW : length + 0.3, mat);
      if (alongX) roof.rotation.x = side * slope; else roof.rotation.z = -side * slope;
    }
    // External support ribs & sandbag skirt
    for (let offset = -length * 0.38; offset <= length * 0.39; offset += length * 0.38) {
      this.box(parent, alongX ? b.x + offset : b.x, wallH / 2, alongX ? b.z : b.z + offset, alongX ? 0.12 : w * 0.98, wallH + 0.05, alongX ? d * 0.98 : 0.12, this.materials.steel);
    }
    for (const side of [-1, 1]) {
      this.rounded(parent, alongX ? b.x : b.x + side * (w * 0.48), 0.26, alongX ? b.z + side * (d * 0.48) : b.z, alongX ? w * 0.88 : 0.45, 0.5, alongX ? 0.45 : d * 0.88, this.materials.sand);
    }
  } else if (b.kind === 'sandbags') {
    const alongX = w > d;
    const length = Math.max(w, d), thick = Math.min(w, d);
    const cols = Math.max(2, Math.round(length / 1.1));
    const bagLen = length / cols;
    for (let row = 0; row < 3; row++) {
      const y = 0.22 + row * 0.38;
      for (let c = 0; c < cols; c++) {
        const shift = (row % 2 === 1 && c === cols - 1) ? 0 : (row % 2) * (bagLen * 0.22);
        const offset = -length / 2 + (c + 0.5) * bagLen + shift * (c < cols - 1 ? 1 : -1);
        const bx = alongX ? b.x + offset : b.x;
        const bz = alongX ? b.z : b.z + offset;
        this.rounded(parent, bx, y, bz, alongX ? bagLen * 0.92 : thick * (0.95 - row * 0.08), 0.38, alongX ? thick * (0.95 - row * 0.08) : bagLen * 0.92, this.materials.sand);
      }
    }
    this.box(parent, b.x, h - 0.04, b.z, w * 0.92, 0.08, d * 0.92, this.surfaces.wood);
  } else if (b.kind === 'fueltank') {
    const alongX = w > d;
    const len = Math.max(w, d), rad = Math.min(w, d) * 0.46;
    for (const s of [-len * 0.28, len * 0.28]) {
      this.box(parent, alongX ? b.x + s : b.x, 0.45, alongX ? b.z : b.z + s, alongX ? 0.65 : rad * 1.9, 0.9, alongX ? rad * 1.9 : 0.65, this.materials.darkConcrete);
    }
    const tank = this.cylinder(parent, b.x, 0.85 + rad, b.z, rad, len * 0.92, mat, 14);
    if (alongX) tank.rotation.z = Math.PI / 2; else tank.rotation.x = Math.PI / 2;
    const stripe = this.cylinder(parent, b.x, 0.85 + rad, b.z, rad + 0.02, len * 0.18, this.materials.stripe, 14);
    if (alongX) stripe.rotation.z = Math.PI / 2; else stripe.rotation.x = Math.PI / 2;
    this.cylinder(parent, b.x, 0.85 + rad * 2 + 0.2, b.z, 0.28, 0.4, this.materials.steel, 8);
  } else if (b.kind === 'generator') {
    this.box(parent, b.x, 0.28, b.z, w + 0.16, 0.26, d + 0.16, this.materials.darkConcrete);
    this.rounded(parent, b.x, 1.25, b.z, w * 0.92, 1.75, d * 0.88, mat);
    this.box(parent, b.x, 1.35, b.z, w * 0.96, 0.75, d * 0.55, this.materials.darkConcrete);
    this.cylinder(parent, b.x + w * 0.3, 2.45, b.z - d * 0.28, 0.11, 0.95, this.materials.rust, 8);
    // Telescopic floodlight mast
    this.cylinder(parent, b.x - w * 0.25, 3.9, b.z + d * 0.25, 0.07, 4.2, this.materials.pole, 8);
    this.box(parent, b.x - w * 0.25, 6.0, b.z + d * 0.25, 1.3, 0.18, 0.28, this.materials.steel, false);
    this.box(parent, b.x - w * 0.25, 5.95, b.z + d * 0.25, 1.15, 0.14, 0.34, this.materials.glow, false);
  } else if (b.kind === 'kiosk') {
    this.box(parent, b.x, 0.65, b.z, w, 1.3, d, mat);
    this.box(parent, b.x, 1.22, b.z, w + 0.04, 0.16, d + 0.04, this.materials.stripe);
    this.box(parent, b.x, 1.95, b.z, w * 0.92, 1.3, d * 0.92, this.materials.glass);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      this.box(parent, b.x + sx * (w * 0.45), 1.95, b.z + sz * (d * 0.45), 0.14, 1.35, 0.14, this.materials.steel);
    }
    this.box(parent, b.x, h - 0.12, b.z, w + 0.36, 0.24, d + 0.36, this.materials.edge);

  }
  return true;
}
