import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';

// Every soldier is ONE skinned mesh (one draw call + one shadow call) driven by
// a small bone hierarchy. Parts are painted with vertex colours over a shared
// atlas, so both teams and all classes share a single shader program.
const down = new THREE.Vector3(0, -1, 0);
const { clamp, lerp, smoothstep } = THREE.MathUtils;
const UPPER_ARM = .285;
const FOREARM = .265;
const THIGH = .402;
const SHIN = .365;
const ANKLE_HEIGHT = .109;
const WAIST = .98;
const THROW_TIME = .78;
const TAU = Math.PI * 2;

// Atlas regions: [u0, u1, roughness, metalness]. Region 0 is woven camouflage.
const REGIONS = [[0, .5, .95, 0], [.5, .625, .84, 0], [.625, .75, .58, .08], [.75, .875, .4, .66], [.875, 1, .2, .35]];
const DUMMY = new THREE.MeshBasicMaterial();
let shapes = null;
function geometry() {
  shapes ??= {
    box: new THREE.BoxGeometry(1, 1, 1),
    round: new RoundedBoxGeometry(1, 1, 1, 1, .14),
    sphere: new THREE.SphereGeometry(1, 12, 9),
    low: new THREE.SphereGeometry(1, 8, 6),
    cyl: new THREE.CylinderGeometry(1, 1, 1, 10),
    fine: new THREE.CylinderGeometry(1, 1, 1, 16),
  };
  return shapes;
}

const paint = (hex, region = 1) => ({ color: new THREE.Color(hex), region });
function palette(team) {
  return {
    uniform: paint(team ? 0xc1ab85 : 0x849783, 0),
    armor: paint(team ? 0x827252 : 0x46574b),
    web: paint(team ? 0x524b37 : 0x303d34),
    shell: paint(team ? 0x796c51 : 0x48594c, 2),
    rubber: paint(0x232928),
    glove: paint(team ? 0x5d5242 : 0x2f3631),
    boot: paint(team ? 0x6b5a43 : 0x2c2d29),
    sole: paint(0x1d1f1e),
    steel: paint(0x30383a, 3),
    polymer: paint(0x24282a, 2),
    visor: paint(0x2f4a4c, 4),
    accent: paint(0x89836e, 2),
    patch: paint(team ? 0xad7950 : 0x668e8d),
    skin: paint(team ? 0xb48667 : 0xc69d80),
    scarf: paint(team ? 0x9a8762 : 0x4f5b48),
    white: paint(0xe4e2d6),
    red: paint(0xb3352c),
  };
}

function soldierMaterial(owner) {
  if (owner.soldierAtlas) return owner.soldierAtlas;
  const W = 1024, H = 512;
  const color = document.createElement('canvas'), surface = document.createElement('canvas');
  color.width = surface.width = W; color.height = surface.height = H;
  const c = color.getContext('2d'), s = surface.getContext('2d');
  const cloth = owner.surfaces?.maps?.cloth?.image;
  c.fillStyle = '#b5b39a'; c.fillRect(0, 0, W / 2, H);
  if (cloth) c.drawImage(cloth, 0, 0, cloth.width, cloth.height, 0, 0, W / 2, H);
  let seed = 4111;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 4294967296; };
  for (const [index, [u0, u1, roughness, metalness]] of REGIONS.entries()) {
    const x = u0 * W, w = (u1 - u0) * W;
    s.fillStyle = `rgb(0,${Math.round(roughness * 255)},${Math.round(metalness * 255)})`; s.fillRect(x, 0, w, H);
    if (!index) continue;
    c.fillStyle = '#f3f2ee'; c.fillRect(x, 0, w, H);
    // A faint weave/grain keeps flat-painted gear from looking like plastic.
    for (let n = 0; n < 2600; n++) {
      const shade = 200 + Math.floor(random() * 55);
      c.fillStyle = `rgba(${shade},${shade},${shade},.35)`;
      c.fillRect(x + random() * w, random() * H, 1 + random() * 2, 1 + random() * 2);
    }
  }
  const map = new THREE.CanvasTexture(color); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
  const rm = new THREE.CanvasTexture(surface);
  owner.soldierAtlas = new THREE.MeshStandardMaterial({ name: 'soldier atlas', map, roughnessMap: rm, metalnessMap: rm, roughness: 1, metalness: 1, vertexColors: true });
  return owner.soldierAtlas;
}

function shape(parent, geo, look, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) {
  const mesh = new THREE.Mesh(geo, DUMMY);
  mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); mesh.rotation.set(rx, ry, rz);
  mesh.userData.paint = look;
  parent.add(mesh);
  return mesh;
}
const round = (p, look, x, y, z, w, h, d, rx, ry, rz) => shape(p, geometry().round, look, x, y, z, w, h, d, rx, ry, rz);
const block = (p, look, x, y, z, w, h, d, rx, ry, rz) => shape(p, geometry().box, look, x, y, z, w, h, d, rx, ry, rz);
const ball = (p, look, x, y, z, w, h, d, rx, ry, rz) => shape(p, geometry().sphere, look, x, y, z, w, h, d, rx, ry, rz);
const tube = (p, look, x, y, z, radius, height, rx = 0, ry = 0, rz = 0, fine = false) =>
  shape(p, fine ? geometry().fine : geometry().cyl, look, x, y, z, radius, height, radius, rx, ry, rz);
const along = (p, look, x, y, z, radius, length, fine) => tube(p, look, x, y, z, radius, length, Math.PI / 2, 0, 0, fine);

// Tapered elliptical sections with continuous normals for fabric and armour.
// `blend` gives each ring a weight toward the parent bone for soft joints.
function volume(parent, look, sections, segments = 14, blend = null) {
  const positions = [], uv = [], indices = [];
  for (const [ring, [y, width, depth, offset = 0]] of sections.entries()) {
    for (let i = 0; i <= segments; i++) {
      const angle = i * TAU / segments;
      positions.push(Math.cos(angle) * width, y, offset + Math.sin(angle) * depth);
      uv.push(i / segments, ring / (sections.length - 1));
      if (i < segments && ring < sections.length - 1) {
        const a = ring * (segments + 1) + i, b = a + segments + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mesh = shape(parent, geo, look, 0, 0, 0, 1, 1, 1);
  mesh.userData.owned = true;
  if (blend) { mesh.userData.blend = blend; mesh.userData.ring = segments + 1; }
  return mesh;
}

function bone(name, x = 0, y = 0, z = 0) {
  const result = new THREE.Bone(); result.name = name; result.position.set(x, y, z); return result;
}

// Collapse every painted part into one geometry, skinned rigidly to its bone
// (or softly across joints for blended fabric).
function bake(root, bones) {
  root.updateMatrixWorld(true);
  const index = new Map(bones?.map((b, i) => [b, i]) ?? []);
  const pieces = [], parts = [];
  root.traverse(object => { if (object.isMesh && object.userData.paint) parts.push(object); });
  for (const part of parts) {
    let owner = part.parent;
    while (bones && owner && !index.has(owner)) owner = owner.parent;
    const boneIndex = bones ? index.get(owner) : 0;
    const parentIndex = bones && index.has(owner.parent) ? index.get(owner.parent) : boneIndex;
    const geo = part.geometry.clone().applyMatrix4(part.matrixWorld);
    for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
    const count = geo.attributes.position.count;
    if (!geo.index) geo.setIndex([...Array(count).keys()]);
    const { color, region } = part.userData.paint, [u0, u1] = REGIONS[region];
    const inset = (u1 - u0) * .04, uv = geo.attributes.uv;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      colors[i * 3] = color.r; colors[i * 3 + 1] = color.g; colors[i * 3 + 2] = color.b;
      uv.setXY(i, u0 + inset + clamp(uv.getX(i), 0, 1) * (u1 - u0 - inset * 2), .03 + clamp(uv.getY(i), 0, 1) * .94);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    if (bones) {
      const skinIndex = new Uint16Array(count * 4), skinWeight = new Float32Array(count * 4);
      const { blend, ring } = part.userData;
      for (let i = 0; i < count; i++) {
        const weight = blend ? blend[Math.floor(i / ring)] ?? 0 : 0;
        skinIndex[i * 4] = boneIndex; skinIndex[i * 4 + 1] = parentIndex;
        skinWeight[i * 4] = 1 - weight; skinWeight[i * 4 + 1] = weight;
      }
      geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
      geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
    }
    pieces.push(geo);
    part.removeFromParent();
    if (part.userData.owned) part.geometry.dispose();
  }
  const merged = mergeGeometries(pieces, false);
  pieces.forEach(piece => piece.dispose());
  merged.userData.actorOwned = true;
  merged.computeBoundingSphere();
  return merged;
}

function makeHead(head, c, classId, team) {
  // Neck and face, softly attached to the chest.
  volume(head, c.skin, [[-.14, .052, .05], [-.09, .05, .05], [-.04, .052, .054], [-.01, .055, .058]], 10, [.85, .35, 0, 0]);
  ball(head, c.skin, 0, .004, -.008, .088, .118, .094);
  ball(head, c.skin, 0, -.058, -.042, .07, .052, .064);
  round(head, c.skin, 0, -.004, -.1, .022, .042, .03, -.25);
  round(head, c.skin, 0, .036, -.088, .13, .02, .024);
  for (const side of [-1, 1]) ball(head, c.skin, side * .088, -.004, .008, .016, .03, .022);
  if (team) {
    // Shemagh wrapped over the lower face.
    ball(head, c.scarf, 0, -.062, -.046, .086, .06, .074);
    volume(head, c.scarf, [[-.13, .07, .066], [-.09, .074, .072], [-.05, .08, .078]], 12);
  } else volume(head, c.scarf, [[-.135, .066, .062], [-.1, .068, .066], [-.07, .066, .066]], 12);
  for (const side of [-1, 1]) {
    round(head, c.rubber, side * .044, .021, -.094, .082, .044, .046, 0, -side * .17);
    round(head, c.visor, side * .044, .022, -.118, .072, .035, .012, 0, -side * .17);
    ball(head, c.rubber, side * .106, .002, .01, .03, .052, .046);
  }
  round(head, c.rubber, 0, .022, -.112, .03, .014, .02);
  if (classId === 'recon') {
    // Boonie hat in the team camouflage.
    volume(head, c.uniform, [[.03, .114, .11, .004], [.09, .114, .11, .006], [.15, .102, .1, .008], [.178, .072, .072, .008], [.188, .002, .002, .008]], 14);
    shape(head, geometry().fine, c.uniform, 0, .04, .004, .19, .012, .186);
    tube(head, c.web, 0, .065, .005, .117, .022);
    return;
  }
  volume(head, c.shell, [[.028, .113, .102, .004], [.065, .123, .115, .009], [.117, .116, .112, .012], [.166, .085, .086, .011], [.196, .032, .036, .009], [.201, .002, .002, .009]], 18);
  round(head, c.shell, 0, .069, -.109, .208, .034, .05);
  shape(head, geometry().fine, c.web, 0, .1, .008, .124, .02, .118);
  round(head, c.accent, 0, .085, -.124, .062, .039, .024);
  round(head, c.web, 0, .1, .112, .1, .055, .04);
  for (const side of [-1, 1]) {
    round(head, c.accent, side * .116, .06, .012, .016, .026, .14);
    round(head, c.web, side * .1, .14, .0, .016, .07, .03, 0, 0, side * .5);
  }
  if (classId === 'medic') {
    block(head, c.white, 0, .14, -.096, .045, .045, .01, .5);
    block(head, c.red, 0, .141, -.1, .036, .011, .006, .5);
    block(head, c.red, 0, .141, -.1, .011, .036, .006, .5);
  }
}

function makeArm(spine, c, side, classId) {
  const arm = bone(side < 0 ? 'arm.L' : 'arm.R', side * .207, 1.39, 0);
  const elbow = bone('elbow', 0, -UPPER_ARM, 0), wrist = bone('wrist', 0, -FOREARM, 0);
  spine.add(arm); arm.add(elbow); elbow.add(wrist);
  volume(arm, c.uniform, [[-.297, .054, .054], [-.22, .061, .066], [-.1, .074, .077], [-.03, .072, .07], [.027, .052, .05], [.05, .026, .026]], 12, [0, 0, 0, .2, .6, .85]);
  round(arm, c.patch, side * .067, -.115, 0, .018, .081, .082);
  if (classId === 'medic') {
    shape(arm, geometry().cyl, c.white, 0, -.07, 0, .077, .045, .08);
    block(arm, c.red, side * .078, -.07, 0, .006, .03, .01);
    block(arm, c.red, side * .078, -.07, 0, .006, .01, .03);
  } else shape(arm, geometry().cyl, c.web, 0, -.2, 0, .066, .022, .072);
  volume(elbow, c.uniform, [[-.253, .039, .041], [-.21, .046, .048], [-.13, .053, .059], [-.04, .056, .063], [.025, .05, .052]], 12, [0, 0, 0, .25, .55]);
  round(elbow, c.armor, 0, -.037, .052, .095, .13, .043);
  shape(elbow, geometry().cyl, c.glove, 0, -.215, 0, .046, .07, .05);
  if (side < 0) round(elbow, c.rubber, 0, -.17, 0, .1, .022, .104);
  // Gloved hand gripping along the weapon.
  ball(wrist, c.glove, 0, -.004, -.008, .043, .058, .044);
  round(wrist, c.rubber, side * .028, .0, -.01, .022, .062, .055);
  ball(wrist, c.glove, side * .03, .004, -.042, .021, .036, .02);
  for (let n = 0; n < 4; n++) round(wrist, c.glove, (n - 1.5) * .018, -.02, -.045, .017, .046, .018);
  return { arm, elbow, wrist };
}

function makeLeg(pose, c, side) {
  const leg = bone(side < 0 ? 'leg.L' : 'leg.R', side * .097, .92, 0);
  const knee = bone('knee', 0, -THIGH, 0), ankle = bone('ankle', 0, -SHIN, 0);
  pose.add(leg); leg.add(knee); knee.add(ankle);
  volume(leg, c.uniform, [[-.411, .066, .072], [-.32, .073, .081], [-.18, .094, .103], [-.08, .096, .111], [.014, .083, .09]], 12, [0, 0, 0, .15, .55]);
  round(leg, c.uniform, side * .092, -.2, .004, .045, .15, .12);
  round(leg, c.web, side * .101, -.128, .004, .028, .036, .126);
  if (side > 0) {
    round(leg, c.polymer, side * .108, -.1, .04, .045, .15, .075, -.1);
    shape(leg, geometry().cyl, c.web, 0, -.2, .0, .1, .024, .108);
  } else round(leg, c.armor, side * .1, -.07, .045, .04, .09, .085);
  volume(knee, c.uniform, [[-.37, .043, .052], [-.29, .052, .061], [-.2, .066, .076], [-.09, .064, .075], [.042, .06, .071]], 12, [0, 0, 0, .2, .5]);
  ball(knee, c.shell, 0, -.04, -.074, .066, .082, .028);
  round(knee, c.web, 0, -.044, .022, .132, .03, .116);
  // Boot: shaft, foot, toe cap, heel and sole.
  volume(ankle, c.boot, [[-.07, .058, .068, .005], [-.01, .055, .062], [.05, .053, .058], [.09, .056, .061]], 10);
  ball(ankle, c.boot, 0, -.046, -.06, .066, .058, .14);
  ball(ankle, c.boot, 0, -.064, -.17, .058, .042, .046);
  round(ankle, c.sole, 0, -.094, -.062, .142, .03, .296);
  round(ankle, c.sole, 0, -.084, .06, .12, .036, .07);
  for (let n = 0; n < 3; n++) block(ankle, c.accent, 0, -.004 - n * .011, -.054 - n * .022, .072, .008, .01);
  return { leg, knee, ankle };
}

function makeRifle(spine, c, classId) {
  const rifle = bone('rifle', .125, 1.24 - WAIST, -.32);
  spine.add(rifle);
  const magazine = bone('magazine', 0, -.087, -.076);
  rifle.add(magazine);
  const recon = classId === 'recon', medic = classId === 'medic', support = classId === 'support';
  const muzzle = recon ? -.8 : medic ? -.46 : support ? -.7 : -.6;
  // Receiver, rail, trigger group and stock.
  round(rifle, c.steel, 0, 0, -.055, .066, .095, .36);
  round(rifle, c.steel, 0, .056, -.08, .04, .018, .32);
  round(rifle, c.steel, 0, -.06, -.075, .055, .04, .09);
  round(rifle, c.polymer, 0, -.065, .1, .042, .11, .058, .35);
  round(rifle, c.steel, 0, -.06, .035, .012, .012, .07);
  along(rifle, c.steel, 0, .0, .19, .02, .12);
  round(rifle, c.polymer, 0, -.012, .26, medic ? .036 : .058, .09, .16);
  round(rifle, c.rubber, 0, -.018, .345, .062, .12, .022);
  if (recon) round(rifle, c.polymer, 0, .048, .25, .04, .03, .12);
  // Handguard and barrel per class.
  const guardLength = medic ? .2 : recon ? .34 : support ? .34 : .27;
  round(rifle, c.polymer, 0, .008, -.17 - guardLength / 2, .068, .07, guardLength);
  round(rifle, c.steel, 0, .046, -.17 - guardLength / 2, .03, .012, guardLength * .92);
  const barrelStart = -.17 - guardLength;
  along(rifle, c.steel, 0, .013, (barrelStart + muzzle) / 2, support ? .017 : .013, Math.abs(muzzle - barrelStart) + .02);
  if (recon) along(rifle, c.polymer, 0, .013, muzzle + .02, .022, .17, true);
  else along(rifle, c.steel, 0, .013, muzzle + .02, .018, .055);
  if (!recon) round(rifle, c.steel, 0, .068, barrelStart + .03, .014, .04, .02);
  if (classId === 'assault') round(rifle, c.polymer, 0, -.06, -.3, .034, .075, .04);
  if (support || recon) for (const side of [-1, 1]) along(rifle, c.steel, side * .022, -.035, barrelStart + .12, .007, .24);
  if (support) round(rifle, c.steel, 0, .1, -.06, .028, .02, .16);
  // Optics.
  if (recon) {
    along(rifle, c.polymer, 0, .108, -.1, .026, .2, true);
    along(rifle, c.polymer, 0, .108, -.215, .034, .05, true);
    along(rifle, c.polymer, 0, .108, .02, .031, .045, true);
    for (const z of [-.16, -.04]) round(rifle, c.steel, 0, .078, z, .022, .04, .022);
    along(rifle, c.visor, 0, .108, -.242, .028, .006, true);
  } else if (support) {
    round(rifle, c.steel, 0, .085, .02, .02, .03, .02);
  } else {
    round(rifle, c.polymer, 0, .086, -.11, .045, .048, medic ? .045 : .06);
    round(rifle, c.visor, 0, .092, -.143, .034, .028, .006);
  }
  // Magazine on its own bone so reloads can pull it out.
  if (support) {
    round(magazine, c.armor, 0, -.03, .0, .118, .13, .12);
    round(magazine, c.web, 0, -.03, -.061, .1, .1, .006);
  } else if (medic) round(magazine, c.polymer, 0, -.05, 0, .04, .15, .05, .06);
  else {
    round(magazine, c.polymer, 0, -.02, 0, .05, .09, .08, .08);
    round(magazine, c.polymer, 0, -.095, -.014, .05, recon ? .05 : .08, .078, .26);
  }
  const flash = new THREE.Mesh(new THREE.ConeGeometry(.06, .18, 6), new THREE.MeshBasicMaterial({ name: 'muzzle flash', color: 0xffd997, transparent: true, opacity: .9, depthWrite: false }));
  flash.geometry.userData.actorOwned = true;
  flash.rotation.x = -Math.PI / 2;
  flash.position.set(0, .013, muzzle - .1);
  flash.visible = false;
  flash.castShadow = false;
  rifle.add(flash);
  return { rifle, flash, magazine };
}

function makeTorso(pose, spine, c, classId) {
  volume(spine, c.uniform, [[.84, .123, .085], [.93, .178, .121], [1.06, .159, .108], [1.21, .176, .123], [1.34, .217, .128], [1.42, .182, .102], [1.465, .088, .064]], 14, [1, .9, .3, 0, 0, 0, 0]);
  volume(spine, c.armor, [[1.01, .155, .104, -.037], [1.09, .181, .141, -.032], [1.29, .183, .146, -.026], [1.383, .135, .11, -.032], [1.405, .09, .069, -.014]], 14, [.3, 0, 0, 0, 0]);
  round(pose, c.web, 0, .966, 0, .339, .052, .238);
  round(pose, c.accent, 0, .965, -.131, .075, .045, .025);
  round(pose, c.web, .1, .925, .128, .11, .11, .065);
  tube(pose, c.armor, -.17, .93, -.05, .034, .09);
  for (const side of [-1, 1]) {
    round(spine, c.web, side * .111, 1.362, -.008, .047, .091, .272, 0, 0, side * .11);
    round(spine, c.armor, side * .175, 1.078, .027, .058, .139, .112);
  }
  for (let n = 0; n < 3; n++) {
    const x = (n - 1) * .092;
    round(spine, c.armor, x, 1.14, -.168, .084, .145, .079);
    round(spine, c.web, x, 1.19, -.208, .081, .045, .015);
    block(spine, c.accent, x, 1.171, -.218, .027, .038, .013);
  }
  for (let n = 0; n < 4; n++) block(spine, c.web, 0, 1.246 + n * .025, -.171, .244 - n * .012, .011, .014);
  round(spine, c.patch, .118, 1.322, -.145, .065, .027, .014);
  round(spine, c.rubber, -.147, 1.238, -.157, .047, .115, .054);
  tube(spine, c.rubber, -.149, 1.371, -.16, .007, .17);
  // Class-specific load.
  const depth = classId === 'support' ? .19 : classId === 'medic' ? .16 : classId === 'recon' ? .09 : .116;
  const height = classId === 'support' ? .38 : .335;
  round(spine, c.armor, 0, 1.205, .159 + depth / 2 - .058, .258, height, depth);
  round(spine, c.web, 0, 1.145, .159 + depth - .058 + .02, .207, .138, .039);
  for (const x of [-.074, .074]) block(spine, c.web, x, 1.217, .183 + depth - .058 + .02, .026, .248, .018);
  if (classId === 'medic') {
    const z = .159 + depth - .058 + .042;
    block(spine, c.white, 0, 1.3, z, .11, .11, .008);
    block(spine, c.red, 0, 1.3, z + .005, .08, .024, .006);
    block(spine, c.red, 0, 1.3, z + .005, .024, .08, .006);
  } else if (classId === 'support') {
    round(spine, c.steel, .15, 1.06, .19, .07, .11, .14);
    tube(spine, c.web, -.03, 1.43, .2, .05, .26, 0, 0, Math.PI / 2);
  } else if (classId === 'recon') {
    tube(spine, c.uniform, 0, 1.41, .17, .058, .3, 0, 0, Math.PI / 2);
    tube(spine, c.rubber, .1, 1.5, .14, .006, .3, .2);
  }
}

function makeDistant(group, c) {
  const distant = new THREE.Group(); group.add(distant);
  const low = geometry().low;
  shape(distant, low, c.armor, 0, 1.19, 0, .213, .326, .151);
  shape(distant, low, c.skin, 0, 1.56, -.01, .09, .11, .09);
  shape(distant, low, c.shell, 0, 1.64, 0, .126, .1, .124);
  for (const side of [-1, 1]) {
    shape(distant, low, c.uniform, side * .103, .525, 0, .095, .424, .104);
    shape(distant, low, c.boot, side * .103, .086, -.059, .068, .082, .141);
    shape(distant, low, c.uniform, side * .192, 1.193, -.128, .075, .196, .083, .96);
  }
  round(distant, c.steel, .125, 1.232, -.357, .07, .083, .6);
  const mesh = new THREE.Mesh(bake(distant), null);
  mesh.castShadow = mesh.receiveShadow = true;
  distant.add(mesh);
  distant.visible = false;
  return { distant, mesh };
}

export function createSoldierRig(owner, player) {
  const team = player.team ? 1 : 0, classId = player.classId;
  const c = palette(team), material = soldierMaterial(owner);
  const group = new THREE.Group();
  const pose = bone('pelvis'); group.add(pose);
  const spine = bone('spine'); pose.add(spine);
  pose.rotation.order = 'YXZ';
  makeTorso(pose, spine, c, classId);
  const head = bone('head', 0, 1.566, 0); spine.add(head);
  makeHead(head, c, classId, team);
  const arms = [], elbows = [], wrists = [], legs = [], knees = [], ankles = [];
  for (const side of [-1, 1]) {
    const { arm, elbow, wrist } = makeArm(spine, c, side, classId);
    const { leg, knee, ankle } = makeLeg(pose, c, side);
    arms.push(arm); elbows.push(elbow); wrists.push(wrist);
    legs.push(leg); knees.push(knee); ankles.push(ankle);
  }
  const { rifle, flash, magazine } = makeRifle(spine, c, classId);
  // The chest pivots at the waist: re-express its children relative to it.
  spine.position.y = WAIST;
  for (const child of spine.children) child.position.y -= WAIST;

  const bones = [];
  pose.traverse(node => { if (node.isBone) bones.push(node); });
  const body = new THREE.SkinnedMesh(bake(group, bones), material);
  body.name = 'soldier body';
  body.castShadow = body.receiveShadow = true;
  // The renderer culls whole soldiers itself; posed bounds would go stale.
  body.frustumCulled = false;
  group.add(body);
  group.updateMatrixWorld(true);
  body.bind(new THREE.Skeleton(bones));
  const { distant, mesh: distantMesh } = makeDistant(group, c);
  distantMesh.material = material;

  const marker = new THREE.Mesh(new THREE.OctahedronGeometry(.059), new THREE.MeshBasicMaterial({ color: 0x5bd9e8 }));
  marker.geometry.userData.actorOwned = true;
  marker.position.y = 1.95;
  marker.castShadow = false;
  group.add(marker);
  const rig = {
    group, pose, spine, body, distant, head, legs, arms, knees, elbows, ankles, wrists, rifle, magazine, marker, flash,
    team: player.team, classId, lastX: player.x, lastZ: player.z, initialized: false, deathAge: 0, alive: true,
    recoil: 0, flinch: 0, flinchSide: 0, lastShot: player.shotSeq, seed: 0,
  };
  updateSoldierArms(rig);
  return rig;
}

const RIG_NODES = ['pose', 'spine', 'body', 'distant', 'head', 'rifle', 'magazine', 'marker', 'flash'];
const RIG_LISTS = ['legs', 'arms', 'knees', 'elbows', 'ankles', 'wrists'];
let cloneSeed = 1;
export function cloneSoldierRig(template, player) {
  const group = cloneSkeleton(template.group);
  const nodes = new Map();
  (function pair(source, copy) {
    nodes.set(source, copy);
    source.children.forEach((child, index) => pair(child, copy.children[index]));
  })(template.group, group);
  const rig = { ...template, group, lastX: player.x, lastZ: player.z, lastShot: player.shotSeq, motion: null, death: null, seed: (cloneSeed++ * 2.39996) % TAU };
  for (const key of RIG_NODES) rig[key] = nodes.get(template[key]);
  for (const key of RIG_LISTS) rig[key] = template[key].map(node => nodes.get(node));
  rig.marker.material = rig.marker.material.clone();
  rig.flash.material = rig.flash.material.clone();
  return rig;
}

const grips = [new THREE.Vector3(-.057, -.033, -.127), new THREE.Vector3(.004, -.057, .105)];
const target = new THREE.Vector3(), axis = new THREE.Vector3(), bend = new THREE.Vector3();
const middle = new THREE.Vector3(), upper = new THREE.Vector3(), lower = new THREE.Vector3();
const inverse = new THREE.Quaternion();
const up = new THREE.Vector3(0, 1, 0);
const supportPalm = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI * .37);
const poseInverse = new THREE.Matrix4();
const stockOffset = new THREE.Vector3(0, -.008, .295);
const stockScratch = new THREE.Vector3();
const handTarget = new THREE.Vector3();
const pouchTarget = new THREE.Vector3(-.098, 1.14 - WAIST, -.225);
const throwBack = new THREE.Vector3(-.17, 1.67 - WAIST, .13);
const throwFront = new THREE.Vector3(-.1, 1.52 - WAIST, -.5);
const throwPoint = new THREE.Vector3();
const handMagazine = new THREE.Vector3();
const nominal = new THREE.Vector3();
const hipScratch = new THREE.Vector3();
const euler = new THREE.Euler();
const quaternion = new THREE.Quaternion();

function solveLimb(upperJoint, lowerJoint, goal, upperLength, lowerLength, bendX, bendY, bendZ) {
  axis.subVectors(goal, upperJoint.position);
  const reach = axis.length();
  const distance = clamp(reach, Math.abs(upperLength - lowerLength) + .02, upperLength + lowerLength - .003);
  if (reach > 1e-6) axis.multiplyScalar(1 / reach);
  else axis.copy(down);
  bend.set(bendX, bendY, bendZ);
  bend.addScaledVector(axis, -bend.dot(axis));
  if (bend.lengthSq() < 1e-6) bend.set(1, 0, 0).addScaledVector(axis, -axis.x);
  bend.normalize();
  const alongAxis = (upperLength ** 2 + distance ** 2 - lowerLength ** 2) / (2 * distance);
  const sideways = Math.sqrt(Math.max(0, upperLength ** 2 - alongAxis ** 2));
  middle.copy(upperJoint.position).addScaledVector(axis, alongAxis).addScaledVector(bend, sideways);
  upper.subVectors(middle, upperJoint.position).normalize();
  upperJoint.quaternion.setFromUnitVectors(down, upper);
  lower.copy(upperJoint.position).addScaledVector(axis, distance).sub(middle).normalize();
  lower.applyQuaternion(inverse.copy(upperJoint.quaternion).invert());
  lowerJoint.quaternion.setFromUnitVectors(down, lower);
}

// Aim both elbows toward the weapon grips while keeping upper and lower arm lengths fixed.
export function updateSoldierArms(rig, supportTarget = null) {
  rig.rifle.updateMatrix();
  for (let i = 0; i < 2; i++) {
    const arm = rig.arms[i], elbow = rig.elbows[i];
    if (i === 0 && supportTarget) target.copy(supportTarget);
    else target.copy(grips[i]).applyMatrix4(rig.rifle.matrix);
    solveLimb(arm, elbow, target, UPPER_ARM, FOREARM, i === 0 ? -.46 : .66, -.95, .12);
    const wrist = rig.wrists?.[i];
    if (!wrist) continue;
    wrist.quaternion.copy(arm.quaternion).multiply(elbow.quaternion).invert().multiply(rig.rifle.quaternion);
    if (i === 0) wrist.quaternion.multiply(supportPalm);
  }
}

function newFoot() {
  return {
    planted: new THREE.Vector3(), start: new THREE.Vector3(), end: new THREE.Vector3(),
    local: new THREE.Vector3(), yaw: 0, startYaw: 0, endYaw: 0,
    lift: 0, startLift: 0, swinging: false, settle: 1,
  };
}

function nearestAngle(from, to) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function restingFoot(out, position, yaw, side, crouch) {
  const lateral = side * (.106 + .018 * crouch);
  const fore = side === -1 ? .075 : -.065;
  const cos = Math.cos(yaw), sin = Math.sin(yaw);
  return out.set(position.x + lateral * cos + fore * sin, 0, position.z - lateral * sin + fore * cos);
}

function startStep(foot, end, yaw) {
  foot.start.copy(foot.planted);
  foot.end.copy(end);
  foot.startYaw = foot.yaw;
  foot.endYaw = foot.yaw + nearestAngle(foot.yaw, yaw);
  foot.startLift = foot.lift;
}

function moveStep(foot, fraction, lift) {
  const t = clamp(fraction, 0, 1);
  const travel = smoothstep(t, 0, 1);
  foot.planted.lerpVectors(foot.start, foot.end, travel);
  foot.yaw = lerp(foot.startYaw, foot.endYaw, travel);
  foot.lift = foot.startLift * (1 - travel) + Math.sin(t * Math.PI) * lift;
}

function resetLocomotion(rig, position, yaw, crouched) {
  const motion = rig.motion ?? { feet: [newFoot(), newFoot()] };
  Object.assign(motion, {
    x: position.x, z: position.z, phase: .05, time: 0,
    speed: 0, vx: 0, vz: 0, crouch: Number(crouched), sprint: 0, aim: .6,
    air: 0, land: 0, hipYaw: 0, lean: 0, reloadTime: 0, reloadBlend: 0,
  });
  for (let i = 0; i < 2; i++) {
    const foot = motion.feet[i], side = i === 0 ? -1 : 1;
    restingFoot(foot.planted, position, yaw, side, motion.crouch);
    foot.yaw = yaw - side * .08;
    foot.lift = 0;
    foot.swinging = false;
    foot.settle = 1;
  }
  rig.motion = motion;
  rig.recoil = 0;
  rig.flinch = 0;
  rig.throwAge = undefined;
  return motion;
}

function animateFeet(motion, position, yaw, dt, distance) {
  const moving = motion.speed > .22;
  const { feet, sprint, crouch, air } = motion;
  // Feet follow the hips, which turn toward the direction of travel.
  const legYaw = yaw + motion.hipYaw;
  const jog = smoothstep(motion.speed, .3, 5.8);
  const standingStride = lerp(lerp(.6, 2.55, jog), 3.9, sprint);
  const crouchedStride = lerp(.55, 1.48, smoothstep(motion.speed, .25, 3));
  const stride = lerp(standingStride, crouchedStride, crouch);
  const stance = lerp(lerp(lerp(.66, .39, jog), .27, sprint), .59, crouch);
  const lift = lerp(lerp(.11, .19, sprint), .078, crouch);
  const speed = Math.hypot(motion.vx, motion.vz);
  const directionX = speed > .001 ? motion.vx / speed : -Math.sin(yaw);
  const directionZ = speed > .001 ? motion.vz / speed : -Math.cos(yaw);
  if (moving && air < .5) motion.phase = (motion.phase + distance / stride) % 1;
  const cos = Math.cos(yaw), sin = Math.sin(yaw);
  for (let i = 0; i < feet.length; i++) {
    const foot = feet[i], side = i === 0 ? -1 : 1;
    const toeYaw = legYaw - side * .08;
    restingFoot(nominal, position, legYaw, side, crouch);
    const phase = (motion.phase + i * .5) % 1;
    if (air > .5) {
      const tuck = i === 0 ? .105 : .18;
      foot.planted.lerp(nominal, 1 - Math.exp(-dt * 17));
      foot.yaw += nearestAngle(foot.yaw, toeYaw) * (1 - Math.exp(-dt * 12));
      foot.lift = lerp(foot.lift, tuck, 1 - Math.exp(-dt * 14));
      foot.swinging = false;
      foot.settle = 1;
    } else if (moving) {
      const swinging = phase >= stance;
      if (swinging && !foot.swinging) {
        // This location stays fixed in world space through the next stance.
        const lead = stride * (1 - phase + stance * .48);
        nominal.x += directionX * lead;
        nominal.z += directionZ * lead;
        startStep(foot, nominal, toeYaw);
      }
      if (swinging) moveStep(foot, (phase - stance) / (1 - stance), lift);
      else if (foot.swinging) moveStep(foot, 1, lift);
      else foot.lift = lerp(foot.lift, 0, 1 - Math.exp(-dt * 22));
      foot.swinging = swinging;
      foot.settle = 1;
    } else {
      const outOfPlace = foot.planted.distanceToSquared(nominal) > .019;
      const turning = Math.abs(nearestAngle(foot.yaw, toeYaw)) > .38;
      if (foot.swinging || (foot.settle >= 1 && feet[1 - i].settle >= 1 && (outOfPlace || turning))) {
        startStep(foot, nominal, toeYaw);
        foot.settle = 0;
      }
      foot.swinging = false;
      if (foot.settle < 1) {
        foot.settle = Math.min(1, foot.settle + dt / .22);
        moveStep(foot, foot.settle, .068);
      } else foot.lift = lerp(foot.lift, 0, 1 - Math.exp(-dt * 18));
    }
    const dx = foot.planted.x - position.x, dz = foot.planted.z - position.z;
    foot.local.set(cos * dx - sin * dz, ANKLE_HEIGHT + foot.lift, sin * dx + cos * dz);
  }
}

function constrainFootReach(rig, feet) {
  let pelvisCeiling = .1;
  for (let i = 0; i < feet.length; i++) {
    const foot = feet[i];
    const hip = hipScratch.copy(rig.legs[i].position).applyQuaternion(rig.pose.quaternion);
    const lateral = foot.local.x - hip.x;
    const forward = foot.local.z - hip.z;
    const reach = Math.hypot(lateral, forward);
    if (reach > .53) {
      foot.local.x = hip.x + lateral * .53 / reach;
      foot.local.z = hip.z + forward * .53 / reach;
    }
    const usable = THIGH + SHIN - .013;
    const height = Math.sqrt(Math.max(.11, usable ** 2 - Math.min(reach, .53) ** 2));
    pelvisCeiling = Math.min(pelvisCeiling, foot.local.y + height - hip.y);
  }
  return pelvisCeiling;
}

function animateUpperBody(rig, motion, player, dt, reset, strideTwist) {
  const { sprint, crouch, speed, phase } = motion;
  const look = clamp(Number(player.pitch) || 0, -1.15, 1.15);
  const requestedAim = player.aim === undefined ? .7 : player.aim ? 1 : .3;
  motion.aim = lerp(motion.aim, requestedAim * (1 - sprint), 1 - Math.exp(-dt * 13));
  if (reset) rig.lastShot = player.shotSeq;
  if (player.shotSeq !== undefined && player.shotSeq !== rig.lastShot) {
    rig.recoil = 1;
    rig.lastShot = player.shotSeq;
  }
  rig.recoil *= Math.exp(-dt * 15);
  rig.flinch *= Math.exp(-dt * 6.5);
  rig.flash.visible = rig.recoil > .58;
  motion.reloadTime = player.reloading ? motion.reloadTime + dt : 0;
  motion.reloadBlend = lerp(motion.reloadBlend, Number(Boolean(player.reloading)), 1 - Math.exp(-dt * 12));
  const duration = rig.classId === 'support' ? 3.1 : 2;
  const reloadPhase = clamp(player.reloadProgress ?? motion.reloadTime / duration, 0, 1);
  const reload = Math.sin(reloadPhase * Math.PI) * motion.reloadBlend;
  // Grenade throw with the support hand.
  let throwWeight = 0, throwPhase = 1;
  if (rig.throwAge !== undefined && rig.throwAge < THROW_TIME) {
    rig.throwAge += dt;
    throwPhase = clamp(rig.throwAge / THROW_TIME, 0, 1);
    throwWeight = smoothstep(throwPhase, 0, .2) * (1 - smoothstep(throwPhase, .72, 1)) * (1 - motion.reloadBlend);
  }
  const throwSwing = smoothstep(throwPhase, .34, .56);
  const idle = (1 - smoothstep(speed, .15, 1.2)) * (1 - smoothstep(motion.aim, .35, .85)) * (1 - motion.reloadBlend) * (1 - rig.recoil);
  const t = motion.time + rig.seed * 4;

  // Chest: shares the aim pitch, breathes, absorbs recoil and hits, and
  // counter-rotates the hips so shoulders stay square to the target.
  const spineX = look * .3 + Math.sin(motion.time * 2.4) * .012 + rig.recoil * .05 + rig.flinch * .22
    - motion.land * .14 + crouch * .05 + (smoothstep(throwPhase, 0, .3) * .2 - throwSwing * .38) * throwWeight;
  const spineY = -motion.hipYaw - strideTwist * 1.6 + idle * Math.sin(t * .37) * .09 + (.32 - throwSwing * .6) * throwWeight;
  const spineZ = -rig.pose.rotation.z * .55 + rig.flinch * rig.flinchSide * .14;
  rig.spine.rotation.set(spineX, spineY, spineZ);
  const bodyPitch = rig.pose.rotation.x + spineX;

  const strideSway = Math.sin(phase * TAU) * Math.min(speed * .014, .09);
  const readyPitch = lerp(-.14, .025, motion.aim);
  const riflePitch = clamp(look * .82 + readyPitch - sprint * .47 - reload * .33 - throwWeight * .55 - bodyPitch * .92, -.9, 1);
  rig.rifle.rotation.set(riflePitch + rig.recoil * .085, -.025 + sprint * .19 + reload * .24 + throwWeight * .3, strideSway * sprint - reload * .18 + throwWeight * .35, 'YXZ');
  // Rotate the rifle around the stock so both grips travel with the weapon.
  stockScratch.copy(stockOffset).applyQuaternion(rig.rifle.quaternion);
  rig.rifle.position.set(.126, 1.277 - WAIST + motion.aim * .052 - sprint * .075 - throwWeight * .07, -.012 + rig.recoil * .027).sub(stockScratch);
  rig.head.rotation.set(
    clamp(look * .8 - bodyPitch * .85 - reload * .3 + rig.flinch * .3 + idle * Math.sin(t * .23) * .07, -.9, .95),
    idle * Math.sin(t * .37 + 1.1) * .38 + lerp(0, .045, sprint) - crouch * .025 - spineY * .25,
    -rig.pose.rotation.z * .65 - rig.flinch * rig.flinchSide * .12,
  );

  let leftHand = null;
  rig.magazine.visible = true;
  rig.magazine.position.y = -.087;
  if (player.reloading) {
    const pull = smoothstep(reloadPhase, .13, .33);
    const seat = smoothstep(reloadPhase, .57, .79);
    rig.magazine.position.y -= .14 * pull * (1 - seat);
    rig.rifle.updateMatrix();
    handTarget.copy(grips[0]).applyMatrix4(rig.rifle.matrix);
    handMagazine.copy(rig.magazine.position).addScaledVector(down, .045).applyMatrix4(rig.rifle.matrix);
    const releaseGrip = smoothstep(reloadPhase, .03, .18) * (1 - smoothstep(reloadPhase, .79, .97));
    const reachPouch = smoothstep(reloadPhase, .28, .43) * (1 - smoothstep(reloadPhase, .47, .67));
    handMagazine.lerp(pouchTarget, reachPouch);
    handTarget.lerp(handMagazine, releaseGrip);
    leftHand = handTarget;
  } else if (throwWeight > 0) {
    rig.rifle.updateMatrix();
    handTarget.copy(grips[0]).applyMatrix4(rig.rifle.matrix);
    throwPoint.lerpVectors(throwBack, throwFront, throwSwing);
    handTarget.lerp(throwPoint, throwWeight);
    leftHand = handTarget;
  }
  updateSoldierArms(rig, leftHand);
}

// The renderer sets the interpolated root position/yaw first. Foot contacts
// use that same motion, so server snapshot cadence does not reset the stride.
export function animateSoldier(rig, { dt, player, reset = false }) {
  dt = clamp(Number(dt) || 1 / 60, .001, .1);
  const { position } = rig.group, yaw = rig.group.rotation.y;
  const crouched = Boolean(player.crouch || player.crouching);
  const existing = rig.motion;
  const teleported = !existing || Math.hypot(position.x - existing.x, position.z - existing.z) > 4;
  const fresh = reset || teleported;
  const motion = fresh ? resetLocomotion(rig, position, yaw, crouched) : existing;
  const dx = position.x - motion.x, dz = position.z - motion.z;
  const distance = Math.hypot(dx, dz);
  const response = 1 - Math.exp(-dt * 12);
  motion.x = position.x;
  motion.z = position.z;
  motion.time += dt;
  motion.speed = lerp(motion.speed, Math.min(12, distance / dt), response);
  motion.vx = lerp(motion.vx, dx / dt, response);
  motion.vz = lerp(motion.vz, dz / dt, response);
  motion.crouch = lerp(motion.crouch, Number(crouched), response);
  motion.sprint = lerp(motion.sprint, player.sprint ? smoothstep(motion.speed, 2.0, 5.2) : 0, response);
  const airborne = player.grounded === undefined ? position.y > .075 : !player.grounded;
  const wasAirborne = motion.air;
  motion.air = lerp(motion.air, Number(airborne), response);
  if (wasAirborne >= .5 && motion.air < .5) motion.land = 1;
  motion.land *= Math.exp(-dt * 7);
  const gaitWeight = smoothstep(motion.speed, .18, 3.8);
  // Strafing and backpedalling turn the hips toward travel; the chest keeps aiming.
  const cos = Math.cos(yaw), sin = Math.sin(yaw);
  const forwardSpeed = -motion.vx * sin - motion.vz * cos;
  const lateralSpeed = motion.vx * cos - motion.vz * sin;
  let heading = 0;
  if (motion.speed > .6) {
    heading = Math.atan2(lateralSpeed, forwardSpeed);
    if (heading > Math.PI / 2) heading -= Math.PI;
    else if (heading < -Math.PI / 2) heading += Math.PI;
  }
  const hipTarget = clamp(-heading, -.62, .62) * gaitWeight * (1 - motion.crouch * .35);
  motion.hipYaw = fresh ? hipTarget : lerp(motion.hipYaw, hipTarget, 1 - Math.exp(-dt * 7));
  motion.lean = lerp(motion.lean, clamp(-lateralSpeed * .012, -.07, .07) * (1 - motion.crouch * .5), 1 - Math.exp(-dt * 6));
  animateFeet(motion, position, yaw, dt, distance);
  const stridePhase = motion.phase * TAU;
  const strideTwist = Math.sin(stridePhase) * (.05 + motion.sprint * .05) * gaitWeight * (1 - motion.crouch * .5);
  const breathing = Math.sin(motion.time * 2.4) * .004;
  const bodyHeight = lerp(-.075 - motion.sprint * .06, -.435, motion.crouch);
  const bodyBob = Math.cos(stridePhase * 2) * .018 * gaitWeight + breathing - motion.land * .09;
  rig.pose.rotation.set(
    -.02 - motion.sprint * .11 - motion.crouch * .12 - motion.land * .06,
    motion.hipYaw + strideTwist,
    Math.sin(stridePhase) * .028 * gaitWeight + motion.lean,
    'YXZ',
  );
  const pelvisCeiling = constrainFootReach(rig, motion.feet);
  const desiredHeight = Math.min(bodyHeight + bodyBob, pelvisCeiling);
  rig.pose.position.set(0, Math.min(lerp(rig.pose.position.y, desiredHeight, fresh ? 1 : response), pelvisCeiling), 0);
  rig.pose.updateMatrix();
  poseInverse.copy(rig.pose.matrix).invert();
  for (let i = 0; i < 2; i++) {
    const foot = motion.feet[i], leg = rig.legs[i], knee = rig.knees[i], ankle = rig.ankles[i];
    target.copy(foot.local).applyMatrix4(poseInverse);
    solveLimb(leg, knee, target, THIGH, SHIN, i === 0 ? -.07 : .07, 0, -1);
    // Counter-rotate the boot so the sole remains parallel to the ground in stance.
    inverse.setFromAxisAngle(up, nearestAngle(yaw, foot.yaw));
    ankle.quaternion.copy(rig.pose.quaternion).multiply(leg.quaternion).multiply(knee.quaternion).invert().multiply(inverse);
    ankle.rotateX(-foot.lift * 1.8);
  }
  animateUpperBody(rig, motion, player, dt, fresh, strideTwist);
}

// A hit makes the chest and head snap away from the shooter.
export function soldierHit(rig, fromX, fromZ) {
  if (!rig?.group) return;
  const yaw = rig.group.rotation.y, dx = fromX - rig.group.position.x, dz = fromZ - rig.group.position.z;
  const length = Math.hypot(dx, dz) || 1;
  const right = (dx * Math.cos(yaw) - dz * Math.sin(yaw)) / length;
  const front = (-dx * Math.sin(yaw) - dz * Math.cos(yaw)) / length;
  rig.flinch = 1;
  rig.flinchSide = right;
  rig.hitFront = front;
  rig.hitRight = right;
}

export function soldierThrow(rig) {
  if (rig) rig.throwAge = 0;
}

function storeQuaternions(nodes) { return nodes.map(node => node.quaternion.clone()); }

// Crumple at the knees, then topple away from the last shooter while the rifle drops.
export function beginDeath(rig, groundY = 0) {
  const front = rig.hitFront ?? 1, right = rig.hitRight ?? 0;
  rig.death = {
    direction: front >= -.2 ? 1 : -1,
    roll: clamp(-right * .45, -.45, .45) + (rig.seed - Math.PI) * .03,
    twist: (rig.seed - Math.PI) * .12,
    ground: groundY,
    pelvis: rig.pose.position.y,
    arms: storeQuaternions(rig.arms), elbows: storeQuaternions(rig.elbows),
    rifle: rig.rifle.position.clone(), rifleRotation: rig.rifle.quaternion.clone(),
  };
  rig.flash.visible = false;
  rig.marker.visible = false;
  rig.motion = null;
}

const droppedRifle = new THREE.Vector3(.28, -.42, -.22);
export function animateDeath(rig, { age }) {
  if (!rig.death) beginDeath(rig, rig.group.position.y);
  const d = rig.death, direction = d.direction;
  const buckle = smoothstep(age, 0, .38);
  const drop = clamp((age - .16) / .62, 0, 1);
  const fall = drop * drop;
  const bounce = Math.sin(clamp((age - .78) / .3, 0, 1) * Math.PI) * .05 * (1 - smoothstep(age, 1, 1.2));
  const limp = smoothstep(age, .05, .55);
  rig.flash.visible = false;
  rig.group.rotation.x = direction * (1.47 * fall - bounce);
  rig.group.rotation.z = d.roll * fall;
  rig.group.position.y = d.ground + .1 * fall - Math.max(0, age - 2.7) * .4;
  rig.pose.position.set(0, lerp(d.pelvis, -.3, buckle) * (1 - fall * .45), 0);
  rig.pose.rotation.set(-.22 * buckle * (1 - fall), d.twist * fall, 0, 'YXZ');
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? -1 : 1;
    rig.legs[i].rotation.set((1.0 + i * .18) * buckle * (1 - fall * .7) + (direction > 0 ? .15 : -.08) * fall, 0, side * .07 * fall);
    rig.knees[i].rotation.set(-(1.85 - i * .2) * buckle * (1 - fall * .55), 0, 0);
    rig.ankles[i].rotation.set(.45 * buckle * (1 - fall), 0, 0);
    // Arms go limp and fling with the fall.
    euler.set(direction > 0 ? 2.1 : 1.35, side * -.15, side * (.25 + .35 * fall));
    rig.arms[i].quaternion.slerpQuaternions(d.arms[i], quaternion.setFromEuler(euler), limp);
    euler.set(.35 + .25 * i, 0, 0);
    rig.elbows[i].quaternion.slerpQuaternions(d.elbows[i], quaternion.setFromEuler(euler), limp);
  }
  rig.spine.rotation.set(-.35 * buckle * (1 - fall) + direction * .22 * fall, d.twist * .5 * fall, d.roll * .4 * fall);
  rig.head.rotation.set(-.45 * buckle + direction * .55 * fall, d.twist * fall, d.roll * .7 * fall);
  const rifleDrop = smoothstep(age, .1, .7);
  rig.rifle.position.lerpVectors(d.rifle, droppedRifle, rifleDrop);
  euler.set(-1.15, .5, 1.45);
  rig.rifle.quaternion.slerpQuaternions(d.rifleRotation, quaternion.setFromEuler(euler), rifleDrop);
}
