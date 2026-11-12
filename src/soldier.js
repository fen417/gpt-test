import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { drawTeamEmblem } from './logos.js';
import { smoothRingSeams, tailoredGeometry } from './character-geometry.js';

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
// Eye line in the ready stance matches the 1.65 m first-person camera.
// Extend the torso above the belt, keeping feet and limb lengths unchanged.
const UPPER_BODY_LIFT = .14;
const THROW_TIME = .78;
const TAU = Math.PI * 2;
const grips = [new THREE.Vector3(-.057, -.033, -.127), new THREE.Vector3(.004, -.057, .105)];
const supportPalm = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI * .37);

// Atlas regions: [u0, u1, roughness, metalness]. Region 0 is woven camouflage.
const ATLAS_W = 1280;
const REGION_PX = [[0, 512, .95, 0], [512, 640, .84, 0], [640, 768, .58, .08], [768, 896, .4, .66], [896, 1024, .2, .35], [1024, 1152, .75, 0], [1152, 1280, .75, 0]];
const REGIONS = REGION_PX.map(([a, b, rough, metal]) => [a / ATLAS_W, b / ATLAS_W, rough, metal]);
const LOGO_COLORS = [['#5bd9e8', '#14262b'], ['#f0a15d', '#2a1c12']];
const DUMMY = new THREE.MeshBasicMaterial();
let shapes = null;
function geometry() {
  shapes ??= {
    box: new THREE.BoxGeometry(1, 1, 1),
    round: new RoundedBoxGeometry(1, 1, 1, 1, .14),
    sphere: new THREE.SphereGeometry(1, 14, 10),
    low: new THREE.SphereGeometry(1, 7, 5),
    cyl: new THREE.CylinderGeometry(1, 1, 1, 8),
    fine: new THREE.CylinderGeometry(1, 1, 1, 12),
    shadow: new THREE.CircleGeometry(.34, 12),
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
    glove: paint(team ? 0x84785d : 0x5f6755),
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
    logo: paint(0xffffff, 5 + (team ? 1 : 0)),
  };
}

function soldierMaterial(owner) {
  if (owner.soldierAtlas) return owner.soldierAtlas;
  const W = ATLAS_W, H = 512;
  const color = document.createElement('canvas'), surface = document.createElement('canvas');
  color.width = surface.width = W; color.height = surface.height = H;
  const c = color.getContext('2d'), s = surface.getContext('2d');
  const cloth = owner.surfaces?.maps?.cloth?.image;
  c.fillStyle = '#b5b39a'; c.fillRect(0, 0, 512, H);
  if (cloth) c.drawImage(cloth, 0, 0, cloth.width, cloth.height, 0, 0, 512, H);
  let seed = 4111;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 4294967296; };
  for (const [index, [u0, u1, roughness, metalness]] of REGIONS.entries()) {
    const x = u0 * W, w = (u1 - u0) * W;
    s.fillStyle = `rgb(0,${Math.round(roughness * 255)},${Math.round(metalness * 255)})`; s.fillRect(x, 0, w, H);
    if (!index) continue;
    if (index >= 5) {
      // Team emblem decals: drawn square, then stretched to fill the tall atlas strip.
      const team = index - 5, [fg, bg] = LOGO_COLORS[team], tile = document.createElement('canvas');
      tile.width = tile.height = 128;
      const t = tile.getContext('2d');
      t.fillStyle = bg; t.fillRect(0, 0, 128, 128);
      drawTeamEmblem(t, 64, 64, 118, team, fg, '#f3f2ee', bg);
      c.drawImage(tile, 0, 0, 128, 128, x, 0, w, H);
      continue;
    }
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
  const highMat = new THREE.MeshStandardMaterial({ name: 'soldier atlas', map, roughnessMap: rm, metalnessMap: rm, roughness: 1, metalness: 1, vertexColors: true });
  const lowMat = new THREE.MeshLambertMaterial({ name: 'soldier atlas low', map, vertexColors: true });
  highMat._lowMaterial = lowMat;
  lowMat._highMaterial = highMat;
  owner.soldierAtlas = owner.lowQuality ? lowMat : highMat;
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
function volume(parent, look, sections, segments = 14, blend = null, cut = {}) {
  const geo = tailoredGeometry(sections, segments, cut);
  const mesh = shape(parent, geo, look, 0, 0, 0, 1, 1, 1);
  mesh.userData.owned = true;
  if (blend) { mesh.userData.blend = blend; mesh.userData.ring = segments + 1; }
  return mesh;
}

function cord(parent, look, points, radius = .003, segments = 10) {
  const path = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
  const geo = new THREE.TubeGeometry(path, segments, radius, 5, false);
  const mesh = shape(parent, geo, look, 0, 0, 0, 1, 1, 1);
  mesh.userData.owned = true;
  return mesh;
}

// Clipped corners and bevels give hard equipment a manufactured silhouette.
function panel(parent, look, x, y, z, w, h, d, bevel = .008) {
  const outline = new THREE.Shape();
  const points = [[-.5,-.4],[-.4,-.5],[.4,-.5],[.5,-.4],[.5,.27],[.28,.5],[-.28,.5],[-.5,.27]];
  points.forEach(([px, py], i) => i ? outline.lineTo(px * w, py * h) : outline.moveTo(px * w, py * h));
  outline.closePath();
  const geo = new THREE.ExtrudeGeometry(outline, { depth: d, bevelEnabled: true, bevelThickness: bevel,
    bevelSize: bevel, bevelSegments: 2, steps: 1, curveSegments: 1 });
  geo.translate(0, 0, -d / 2);
  const mesh = shape(parent, geo, look, x, y, z, 1, 1, 1);
  mesh.userData.owned = true;
  return mesh;
}

function pouch(parent, c, x, y, z, w, h, d) {
  const body = volume(parent, c.armor, [[-h/2,w*.32,d*.3],[-h*.43,w*.48,d*.46],
    [0,w*.5,d*.5],[h*.35,w*.46,d*.46],[h*.5,w*.36,d*.32]], 12, null, { square: .65, folds: .035, caps: true });
  body.position.set(x, y, z);
  round(parent, c.web, x, y+h*.3, z-d*.48, w*.84, h*.16, .009);
  cord(parent, c.web, [[x-w*.37,y+h*.33,z-d*.5],[x-w*.38,y-h*.32,z-d*.51],
    [x,y-h*.42,z-d*.5],[x+w*.38,y-h*.32,z-d*.51],[x+w*.37,y+h*.33,z-d*.5]], .0018, 10);
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
  volume(head, c.skin, [[-.101,.025,.031,-.04],[-.084,.051,.055,-.026],[-.047,.068,.071,-.015],
    [.003,.08,.082,-.005],[.057,.083,.081,.002],[.1,.072,.069,.004],[.124,.018,.024,.006]], 18, null, { square: .88 });
  ball(head, c.skin, 0, -.008, -.091, .014, .029, .024);
  ball(head, c.skin, 0, -.028, -.103, .019, .012, .014);
  cord(head, c.scarf, [[-.025,-.066,-.08],[0,-.068,-.086],[.025,-.066,-.08]], .002);
  for (const side of [-1, 1]) {
    ball(head, c.skin, side*.049, -.016, -.07, .027, .031, .021);
    cord(head, c.web, [[side*.095,.033,.021],[side*.076,-.055,-.022],[side*.037,-.09,-.06]], .005);
  }
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
    for (const z of [-.036, .001, .038]) block(head, c.polymer, side*.126, .058, z, .01, .012, .018);
  }
  panel(head, c.polymer, 0, .105, -.117, .038, .047, .008, .003);
  round(head, c.web, 0, .11, .116, .07, .043, .025);
  cord(head, c.rubber, [[-.116,-.016,-.005],[-.123,-.043,-.061],[-.072,-.055,-.102]], .0035);
  ball(head, c.rubber, -.065, -.054, -.104, .012, .007, .008);
  if (classId === 'medic') {
    block(head, c.white, 0, .14, -.096, .045, .045, .01, .5);
    block(head, c.red, 0, .141, -.1, .036, .011, .006, .5);
    block(head, c.red, 0, .141, -.1, .011, .036, .006, .5);
  }
}

function makeGlove(wrist, c, support) {
  // Build the fingers around the weapon in rifle coordinates, then attach
  // the whole glove to the wrist so it follows the same IK in every pose.
  const glove = new THREE.Group();
  if (support) glove.quaternion.copy(supportPalm).invert();
  glove.position.copy(grips[support ? 0 : 1]).negate().applyQuaternion(glove.quaternion);
  wrist.add(glove);
  const finger = (points, radius) => {
    const path = new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...point)));
    const segments = 12, sides = 8;
    const geometry = new THREE.TubeGeometry(path, segments, radius, sides);
    const positions = geometry.attributes.position;
    const vertex = new THREE.Vector3();
    for (let ring = 0; ring <= segments; ring++) {
      const t = ring / segments;
      const center = path.getPointAt(t);
      const taper = lerp(1, .74, t) * Math.sqrt(1 - smoothstep(t, .83, 1) * .999);
      for (let side = 0; side <= sides; side++) {
        const index = ring * (sides + 1) + side;
        vertex.fromBufferAttribute(positions, index).sub(center).multiplyScalar(taper).add(center);
        positions.setXYZ(index, vertex.x, vertex.y, vertex.z);
      }
    }
    geometry.computeVertexNormals();
    smoothRingSeams(geometry, segments + 1, sides);
    shape(glove, geometry, c.glove, 0, 0, 0, 1, 1, 1).userData.owned = true;
  };
  if (support) {
    const palm = volume(glove, c.glove, [[0,.023,.019],[.028,.028,.018],[.06,.033,.016],
      [.092,.035,.014],[.117,.026,.012],[.127,.017,.009]], 14, null, { caps: true, square: .82 });
    palm.position.set(-.062, -.049, -.136);
    palm.rotation.set(-Math.PI / 2, 0, -.43);
    for (const [index, z] of [-.257, -.24, -.223, -.207].entries()) {
      const short = index === 3 ? .009 : index === 0 ? .004 : 0;
      finger([[-.02,-.049,z],[.016,-.045,z-.004],[.04,-.03,z-.006],
        [.044-short,-.006-short,z-.005],[.032,.009-short,z-.003]], .009-index*.0005);
      ball(glove, c.rubber, .017, -.049, z-.004, .011, .004, .006);
    }
    ball(glove, c.glove, -.052, -.045, -.231, .017, .02, .028);
    finger([[-.062,-.055,-.224],[-.058,-.024,-.245],[-.044,-.001,-.267],
      [-.034,.01,-.278]], .011);
  } else {
    const palm = volume(glove, c.glove, [[-.036,.008,.014],[-.023,.014,.027],[0,.019,.035],
      [.024,.017,.028],[.036,.011,.018]], 14, null, { caps: true, square: .82 });
    palm.position.set(.032, -.087, .125);
    palm.rotation.z = -.15;
    panel(glove, c.rubber, .049, -.088, .125, .036, .045, .004, .003).rotation.y = Math.PI / 2;
    for (const [index, y] of [-.073, -.09, -.107].entries()) {
      const z = .076 + index*.005;
      finger([[.039,y,.106],[.029,y,z+.01],[.011,y-.001,z],[-.016,y,z+.003],
        [-.024,y+.004,z+.017]], .009-index*.00065);
    }
    finger([[.041,-.062,.118],[.035,-.052,.085],[.029,-.051,.058],
      [.017,-.057,.047],[.006,-.063,.047]], .008);
    ball(glove, c.glove, .021, -.059, .139, .018, .016, .018);
    finger([[.026,-.062,.147],[.004,-.055,.151],[-.019,-.06,.14],
      [-.026,-.072,.12]], .011);
  }
}

function makeArm(spine, c, side, classId) {
  const arm = bone(side < 0 ? 'arm.L' : 'arm.R', side * .207, 1.39, 0);
  const elbow = bone('elbow', 0, -UPPER_ARM, 0), wrist = bone('wrist', 0, -FOREARM, 0);
  spine.add(arm); arm.add(elbow); elbow.add(wrist);
  volume(arm, c.uniform, [[-.297,.048,.05],[-.255,.055,.058],[-.21,.057,.062],[-.16,.065,.07],
    [-.1,.073,.077],[-.03,.075,.074],[.027,.055,.054],[.05,.026,.026]], 16, [0,0,0,0,0,.2,.6,.85], {folds:.07});
  pouch(arm,c,side*.061,-.105,.014,.035,.097,.092);
  round(arm, c.patch, side * .067, -.115, 0, .018, .081, .082);
  block(arm, c.logo, side * .0785, -.115, 0, .004, .066, .066);
  if (classId === 'medic') {
    shape(arm, geometry().cyl, c.white, 0, -.07, 0, .077, .045, .08);
    block(arm, c.red, side * .078, -.07, 0, .006, .03, .01);
    block(arm, c.red, side * .078, -.07, 0, .006, .01, .03);
  } else shape(arm, geometry().cyl, c.web, 0, -.2, 0, .066, .022, .072);
  volume(elbow, c.uniform, [[-.264,.032,.035],[-.235,.037,.039],[-.21,.044,.046],[-.17,.049,.054],
    [-.13,.053,.059],[-.075,.055,.061],[-.04,.054,.06],[.025,.05,.052]], 16, [0,0,0,0,0,.12,.25,.55], {folds:.085});
  panel(elbow, c.armor, 0, -.037, .052, .075, .1, .022, .006);
  shape(elbow, geometry().cyl, c.glove, 0, -.215, 0, .046, .07, .05);
  if (side < 0) {
    tube(elbow, c.rubber, 0, -.215, 0, .044, .019);
    panel(elbow, c.steel, 0, -.215, .047, .03, .027, .008, .003);
    block(elbow, c.visor, 0, -.215, .054, .022, .02, .003);
  }
  makeGlove(wrist, c, side < 0);
  return { arm, elbow, wrist };
}

function makeLeg(pose, c, side) {
  const leg = bone(side < 0 ? 'leg.L' : 'leg.R', side * .097, .92, 0);
  const knee = bone('knee', 0, -THIGH, 0), ankle = bone('ankle', 0, -SHIN, 0);
  pose.add(leg); leg.add(knee); knee.add(ankle);
  volume(leg,c.uniform,[[-.411,.058,.068],[-.36,.062,.074],[-.3,.074,.082],[-.22,.083,.094],
    [-.13,.089,.103],[-.06,.091,.104],[.014,.083,.09]],16,[0,0,0,0,0,.15,.55],{folds:.055});
  pouch(leg,c,side*.086,-.2,.004,.047,.15,.12);
  round(leg, c.web, side * .101, -.128, .004, .028, .036, .126);
  if (side > 0) {
    round(leg, c.polymer, side * .108, -.1, .04, .045, .15, .075, -.1);
    shape(leg, geometry().cyl, c.web, 0, -.2, .0, .1, .024, .108);
  } else round(leg, c.armor, side * .1, -.07, .045, .04, .09, .085);
  volume(knee,c.uniform,[[-.37,.041,.049],[-.32,.047,.054],[-.27,.051,.059],[-.2,.06,.069],
    [-.14,.063,.074],[-.09,.06,.07],[-.025,.057,.066],[.042,.058,.068]],16,[0,0,0,0,0,.1,.3,.5],{folds:.075});
  panel(knee,c.rubber,0,-.04,-.068,.105,.132,.014,.007);
  panel(knee,c.shell,0,-.04,-.084,.081,.105,.012,.006);
  for(const y of [-.065,-.035]) round(knee,c.web,0,y,-.096,.055,.004,.004);
  round(knee, c.web, 0, -.044, .022, .132, .03, .116);
  // Boot: shaft, foot, toe cap, heel and sole.
  volume(ankle, c.boot, [[-.07, .058, .068, .005], [-.01, .055, .062], [.05, .053, .058], [.09, .056, .061]], 10);
  ball(ankle, c.boot, 0, -.046, -.06, .066, .058, .14);
  ball(ankle, c.boot, 0, -.064, -.17, .058, .042, .046);
  round(ankle, c.sole, 0, -.094, -.062, .142, .03, .296);
  round(ankle, c.sole, 0, -.084, .06, .12, .036, .07);
  for(let n=0;n<5;n++){
    const y=.04-n*.018,z=-.058-n*.012;
    cord(ankle,c.web,[[-.028,y,z],[.028,y-.013,z-.008]],.0025,3);
    cord(ankle,c.web,[[.028,y,z],[-.028,y-.013,z-.008]],.0025,3);
  }
  for(const x of [-.057,.057])for(const z of [-.17,-.12,-.07,.02])block(ankle,c.boot,x,-.099,z,.018,.014,.023);
  return { leg, knee, ankle };
}

function makeRifle(spine, c, classId, weaponId = '') {
  const rifle = bone('rifle', .125, 1.24 - WAIST, -.32);
  spine.add(rifle);
  const magazine = bone('magazine', 0, -.087, -.076);
  rifle.add(magazine);
  const recon = classId === 'recon', medic = classId === 'medic', support = classId === 'support';
  const isAk = weaponId === 'ak12', isVk = weaponId === 'vk45', isPkp = weaponId === 'pkp', isSv = weaponId === 'sv98';
  const muzzle = isSv ? -.88 : recon ? -.8 : isVk ? -.52 : medic ? -.46 : isPkp ? -.76 : support ? -.7 : -.6;
  // Receiver, rail, trigger group and stock.
  round(rifle, c.steel, 0, 0, -.055, .066, .095, .36);
  round(rifle, c.steel, 0, .056, -.08, .04, .018, .32);
  round(rifle, c.steel, 0, -.06, -.075, .055, .04, .09);
  if (isVk) {
    // KRISS Super V vertical recoil vector housing in front of trigger
    round(rifle, c.polymer, 0, -.09, -.095, .062, .145, .095, .15);
  }
  round(rifle, c.polymer, 0, -.065, .1, .042, .11, .058, .35);
  round(rifle, c.steel, 0, -.06, .035, .012, .012, .07);
  along(rifle, c.steel, 0, .0, .19, .02, .12);
  round(rifle, c.polymer, 0, -.012, .26, medic ? .036 : .058, .09, .16);
  round(rifle, c.rubber, 0, -.018, .345, .062, .12, .022);
  if (recon) round(rifle, c.polymer, 0, .048, .25, .04, .03, .12);
  // Handguard and barrel per class & weapon variant.
  const guardLength = medic ? .2 : recon ? .34 : support ? .34 : .27;
  round(rifle, c.polymer, 0, .008, -.17 - guardLength / 2, .068, .07, guardLength);
  round(rifle, c.steel, 0, .046, -.17 - guardLength / 2, .03, .012, guardLength * .92);
  if (isAk) {
    // Upper AK gas tube and slanted gas block
    along(rifle, c.steel, 0, .052, -.17 - guardLength * .55, .013, guardLength * .95);
    round(rifle, c.steel, 0, .035, -.17 - guardLength - .02, .026, .055, .035, -.35);
  }
  const barrelStart = -.17 - guardLength;
  along(rifle, c.steel, 0, .013, (barrelStart + muzzle) / 2, isPkp ? .024 : support ? .017 : .013, Math.abs(muzzle - barrelStart) + .02);
  if (isSv) {
    // Rectangular multi-chamber sniper muzzle brake
    round(rifle, c.steel, 0, .013, muzzle + .02, .036, .034, .085);
  } else if (recon || isVk) {
    along(rifle, c.polymer, 0, .013, muzzle + .02, .022, .17, true);
  } else if (isAk) {
    along(rifle, c.steel, 0, .013, muzzle + .02, .021, .078);
  } else {
    along(rifle, c.steel, 0, .013, muzzle + .02, .018, .055);
  }
  if (!recon) round(rifle, c.steel, 0, .068, barrelStart + .03, .014, .04, .02);
  if (classId === 'assault') round(rifle, c.polymer, 0, -.06, -.3, .034, .075, .04);
  if (support || recon) for (const side of [-1, 1]) along(rifle, c.steel, side * .022, -.035, barrelStart + .12, .007, .24);
  if (support) {
    round(rifle, c.steel, 0, .1, -.06, .028, .02, .16);
    if (isPkp) round(rifle, c.steel, 0, .095, -.28, .035, .045, .14);
  }
  // Optics.
  if (recon) {
    along(rifle, c.polymer, 0, .108, -.1, .026, isSv ? .26 : .2, true);
    along(rifle, c.polymer, 0, .108, isSv ? -.245 : -.215, .034, .05, true);
    along(rifle, c.polymer, 0, .108, .02, .031, .045, true);
    for (const z of [-.16, -.04]) round(rifle, c.steel, 0, .078, z, .022, .04, .022);
    along(rifle, c.visor, 0, .108, isSv ? -.272 : -.242, .028, .006, true);
  } else if (support) {
    round(rifle, c.steel, 0, .085, .02, .02, .03, .02);
  } else {
    round(rifle, c.polymer, 0, .086, -.11, .045, .048, medic ? .045 : .06);
    round(rifle, c.visor, 0, .092, -.143, .034, .028, .006);
  }
  // Magazine on its own bone so reloads can pull it out.
  if (support) {
    round(magazine, c.armor, 0, -.03, .0, isPkp ? .132 : .118, isPkp ? .145 : .13, .12);
    round(magazine, c.web, 0, -.03, -.061, .1, .1, .006);
  } else if (medic) {
    round(magazine, c.polymer, 0, isVk ? -.075 : -.05, 0, .04, isVk ? .21 : .15, .05, isVk ? .22 : .06);
  } else {
    round(magazine, c.polymer, 0, -.02, 0, .05, .09, .08, .08);
    round(magazine, isAk ? c.accent : c.polymer, 0, -.095, -.014, .05, recon ? .05 : isAk ? .095 : .08, .078, isAk ? .34 : .26);
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
  volume(spine,c.uniform,[[.84,.117,.082],[.9,.155,.105],[.96,.164,.113],[1.035,.148,.104],
    [1.12,.151,.108],[1.24,.177,.118],[1.34,.205,.119],[1.4,.187,.098],[1.44,.126,.074],[1.465,.067,.056]],
    20,[1,.95,.75,.35,.1,0,0,0,0,0],{folds:.035,square:.9});
  // Independent front/back SAPI bags, rather than an oval armoured barrel.
  volume(spine,c.web,[[1.04,.156,.114],[1.075,.166,.124],[1.18,.177,.128],[1.22,.176,.125]],16,null,{square:.78});
  panel(spine,c.armor,0,1.235,-.121,.265,.302,.048,.013);
  panel(spine,c.armor,0,1.25,.114,.256,.29,.036,.012);
  volume(pose,c.web,[[.939,.161,.115],[.981,.162,.116]],20,null,{square:.82});
  panel(pose,c.accent,0,.961,-.123,.048,.03,.013,.003);
  pouch(pose,c,.1,.915,.128,.10,.12,.065);
  tube(pose, c.armor, -.17, .93, -.05, .034, .09);
  for (const side of [-1, 1]) {
    cord(spine,c.web,[[side*.094,1.32,-.139],[side*.135,1.405,-.084],
      [side*.137,1.424,.021],[side*.104,1.34,.127]],.018,14);
    panel(spine,c.polymer,side*.106,1.36,-.115,.031,.038,.015,.004);
    pouch(spine,c,side*.17,1.078,.027,.058,.139,.112);
    for(let row=0;row<3;row++){
      cord(spine,c.armor,[[side*.13,1.085+row*.031,-.088],[side*.176,1.085+row*.031,-.025],
        [side*.168,1.085+row*.031,.067]],.005,7);
    }
  }
  for (let n = 0; n < 3; n++) {
    const x = (n - 1) * .092;
    pouch(spine,c,x,1.14,-.181,.078,.14,.064);
    round(spine,c.polymer,x,1.21,-.181,.057,.022,.043);
    cord(spine,c.web,[[x-.025,1.17,-.213],[x,1.228,-.186],[x+.025,1.17,-.213]],.003,8);
  }
  for(let row=0;row<3;row++)for(let col=0;col<5;col++)
    block(spine,c.web,(col-2)*.042,1.254+row*.026,-.161,.032,.009,.006);
  round(spine,c.patch,.077,1.335,-.153,.056,.021,.007);
  block(spine,c.logo,-.073,1.32,-.158,.054,.054,.004);
  pouch(spine,c,-.17,1.235,-.123,.052,.108,.061);
  round(spine,c.rubber,-.17,1.29,-.123,.035,.026,.041);
  tube(spine,c.rubber,-.179,1.374,-.12,.004,.16);
  cord(spine,c.rubber,[[-.16,1.291,-.143],[-.178,1.335,-.133],[-.142,1.396,-.08],[-.115,1.421,.017]],.003,12);
  panel(spine,c.rubber,-.112,1.355,-.134,.027,.041,.013,.004);
  // Class-specific load.
  const depth = classId === 'support' ? .19 : classId === 'medic' ? .16 : classId === 'recon' ? .09 : .116;
  const height = classId === 'support' ? .38 : .335;
  const pack=volume(spine,c.armor,[[1.205-height*.5,.08,depth*.28],[1.205-height*.42,.119,depth*.46],
    [1.205,.129,depth*.5],[1.205+height*.36,.113,depth*.46],[1.205+height*.5,.072,depth*.26]],16,null,{square:.72,folds:.025,caps:true});
  pack.position.z=.101+depth/2;
  pouch(spine,c,0,1.145,.121+depth,.207,.138,.039);
  cord(spine,c.web,[[-.055,1.205+height*.43,.16],[0,1.205+height*.55,.17],[.055,1.205+height*.43,.16]],.009,8);
  cord(spine,c.rubber,[[.075,1.37,.18],[.144,1.43,.05],[.134,1.37,-.103],[.145,1.25,-.13]],.004,12);
  for (const x of [-.074, .074]) block(spine, c.web, x, 1.217, .183 + depth - .058 + .02, .026, .248, .018);
  block(spine, c.logo, 0, 1.145, .121 + depth + .0195 + .003, .105, .105, .006);
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

function makeDistant(group, c, classId) {
  const distant = new THREE.Group(); group.add(distant);
  const low = geometry().low;
  volume(distant,c.uniform,[[.86,.13,.09],[1.03,.15,.11],[1.31,.203,.123],[1.44,.126,.075]],8);
  panel(distant,c.armor,0,1.235,-.119,.265,.302,.048,.006);
  round(distant,c.armor,0,1.2,.18,.23,classId==='support'?.38:.32,classId==='support'?.19:.13);
  round(distant,c.web,0,1.13,-.174,.26,.135,.073);
  shape(distant, low, c.skin, 0, 1.56, -.01, .09, .11, .09);
  shape(distant, low, classId==='recon'?c.uniform:c.shell, 0, 1.64, 0, .126, .1, .124);
  if(classId==='recon')shape(distant,geometry().cyl,c.uniform,0,1.61,0,.18,.01,.18);
  for (const side of [-1, 1]) {
    const trouser=volume(distant,c.uniform,[[.15,.047,.053],[.37,.06,.07],[.57,.066,.074],[.82,.09,.1],[.94,.079,.09]],8);
    trouser.position.x=side*.103;
    shape(distant, low, c.boot, side * .103, .086, -.059, .068, .082, .141);
    shape(distant, low, c.uniform, side * .192, 1.193, -.128, .075, .196, .083, .96);
  }
  round(distant, c.steel, .125, 1.232, -.357, .07, .083, .6);
  const mesh = new THREE.Mesh(bake(distant), null);
  // Distant mesh has no crouched-ready pelvis offset; match its silhouette
  // to the standing animated model instead of changing height at the LOD cut.
  const distantPositions = mesh.geometry.attributes.position;
  for (let i = 0; i < distantPositions.count; i++) {
    const y = distantPositions.getY(i);
    distantPositions.setY(i, y + (UPPER_BODY_LIFT - .075) * smoothstep(y, .96, 1.21));
  }
  mesh.geometry.computeVertexNormals();
  mesh.geometry.computeBoundingSphere();
  mesh.castShadow = mesh.receiveShadow = true;
  distant.add(mesh);
  distant.visible = false;
  return { distant, mesh };
}

export function createSoldierRig(owner, player) {
  const team = player.team ? 1 : 0, classId = player.classId, weaponId = player.weaponId || '';
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
  const { rifle, flash, magazine } = makeRifle(spine, c, classId, weaponId);
  for (const child of spine.children) {
    if (child.isBone) child.position.y += UPPER_BODY_LIFT;
    else if (child.isMesh) {
      // These are torso/gear parts. Clone shared primitives before shaping.
      const source = child.geometry;
      child.updateMatrix();
      const geo = source.clone().applyMatrix4(child.matrix);
      const positions = geo.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        const y = positions.getY(i);
        positions.setY(i, y + UPPER_BODY_LIFT * smoothstep(y, .96, 1.21));
      }
      geo.computeVertexNormals();
      child.geometry = geo;
      if (child.userData.owned) source.dispose();
      child.userData.owned = true;
      child.position.set(0,0,0); child.rotation.set(0,0,0); child.scale.set(1,1,1);
    }
  }
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
  const { distant, mesh: distantMesh } = makeDistant(group, c, classId);
  distantMesh.material = material;

  const marker = new THREE.Mesh(new THREE.OctahedronGeometry(.059), new THREE.MeshBasicMaterial({ color: 0x5bd9e8 }));
  marker.geometry.userData.actorOwned = true;
  marker.position.y = 1.95;
  marker.castShadow = false;
  group.add(marker);
  owner.contactShadowMat ??= new THREE.MeshBasicMaterial({ color: 0x0b1012, transparent: true, opacity: .32, depthWrite: false });
  const contactShadow = new THREE.Mesh(geometry().shadow, owner.contactShadowMat);
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = .02;
  contactShadow.castShadow = false;
  group.add(contactShadow);
  const rig = {
    group, pose, spine, body, distant, head, legs, arms, knees, elbows, ankles, wrists, rifle, magazine, marker, flash,
    team: player.team, classId, weaponId, lastX: player.x, lastZ: player.z, initialized: false, deathAge: 0, alive: true,
    recoil: 0, flinch: 0, flinchSide: 0, lastShot: player.shotSeq, seed: 0, stepIndex: 0,
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
  const rig = { ...template, group, lastX: player.x, lastZ: player.z, lastShot: player.shotSeq, motion: null, death: null, stepIndex: cloneSeed, seed: (cloneSeed++ * 2.39996) % TAU };
  for (const key of RIG_NODES) rig[key] = nodes.get(template[key]);
  for (const key of RIG_LISTS) rig[key] = template[key].map(node => nodes.get(node));
  rig.marker.material = rig.marker.material.clone();
  rig.flash.material = rig.flash.material.clone();
  return rig;
}

const target = new THREE.Vector3(), axis = new THREE.Vector3(), bend = new THREE.Vector3();
const middle = new THREE.Vector3(), upper = new THREE.Vector3(), lower = new THREE.Vector3();
const inverse = new THREE.Quaternion();
const up = new THREE.Vector3(0, 1, 0);
const poseInverse = new THREE.Matrix4();
const stockOffset = new THREE.Vector3(0, -.008, .295);
const stockScratch = new THREE.Vector3();
const handTarget = new THREE.Vector3();
const pouchTarget = new THREE.Vector3(-.098, 1.14 + UPPER_BODY_LIFT - WAIST, -.225);
const throwBack = new THREE.Vector3(-.17, 1.67 + UPPER_BODY_LIFT - WAIST, .13);
const throwFront = new THREE.Vector3(-.1, 1.52 + UPPER_BODY_LIFT - WAIST, -.5);
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
  const { feet, sprint, crouch, air } = motion;
  const legYaw = yaw + motion.hipYaw;
  const cos = Math.cos(yaw), sin = Math.sin(yaw);
  const forwardSpeed = -motion.vx * sin - motion.vz * cos;
  const lateralSpeed = motion.vx * cos - motion.vz * sin;
  const speed = Math.hypot(forwardSpeed, lateralSpeed);
  const moving = speed > .16;
  const jog = smoothstep(speed, .2, 5.8);
  const standingStride = lerp(lerp(.9, 2.25, jog), 3.1, sprint);
  const crouchedStride = lerp(.72, 1.45, smoothstep(speed, .2, 3));
  const stride = lerp(standingStride, crouchedStride, crouch);
  if (moving && air < .5) motion.phase = (motion.phase + distance / stride) % 1;
  const moveBlend = smoothstep(speed, .12, 2.1);
  const dirX = speed > .05 ? lateralSpeed / speed : 0;
  const dirZ = speed > .05 ? -forwardSpeed / speed : 0;
  const maxLift = lerp(lerp(.11, .19, sprint), .075, crouch);
  const ampZ = lerp(.21, .31, sprint) * (1 - crouch * .32) * moveBlend;
  const ampX = lerp(.135, .175, sprint) * (1 - crouch * .28) * moveBlend;
  const footResp = 1 - Math.exp(-dt * 26);

  for (let i = 0; i < feet.length; i++) {
    const foot = feet[i], side = i === 0 ? -1 : 1;
    const toeYaw = legYaw - side * .08;
    const phase = (motion.phase + i * .5) % 1;
    const angle = phase * TAU;
    const baseX = side * (.104 + .016 * crouch);
    const baseZ = side * -.024;
    const swing = -Math.cos(angle);
    const offsetZ = dirZ * swing * ampZ;
    let offsetX = dirX * swing * ampX;
    // Prevent legs from crossing over the centerline during fast strafing
    if (side < 0 && offsetX > .052) offsetX = .052;
    if (side > 0 && offsetX < -.052) offsetX = -.052;

    const targetLift = air > .5
      ? (i === 0 ? .105 : .18)
      : Math.max(0, Math.sin(angle)) * maxLift * moveBlend;
    foot.lift = lerp(foot.lift, targetLift, 1 - Math.exp(-dt * 24));
    foot.swinging = moving && Math.sin(angle) > 0;
    foot.settle = 1;
    foot.yaw = toeYaw;

    const targetLocalX = baseX + offsetX;
    const targetLocalZ = baseZ + offsetZ;
    foot.local.set(
      lerp(foot.local.x || baseX, targetLocalX, footResp),
      ANKLE_HEIGHT + foot.lift,
      lerp(foot.local.z || baseZ, targetLocalZ, footResp),
    );
    foot.planted.set(
      position.x + foot.local.x * cos + foot.local.z * sin,
      0,
      position.z - foot.local.x * sin + foot.local.z * cos,
    );
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
  rig.rifle.position.set(.126, 1.277 + UPPER_BODY_LIFT - WAIST + motion.aim * .052 - sprint * .075 - throwWeight * .07, -.012 + rig.recoil * .027).sub(stockScratch);
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
  const response = 1 - Math.exp(-dt * 22);
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
  if (motion.speed > .35) {
    heading = Math.atan2(lateralSpeed, forwardSpeed);
    if (heading > Math.PI / 2) heading -= Math.PI;
    else if (heading < -Math.PI / 2) heading += Math.PI;
  }
  const hipTarget = clamp(-heading, -.45, .45) * gaitWeight * (1 - motion.crouch * .35);
  motion.hipYaw = fresh ? hipTarget : lerp(motion.hipYaw, hipTarget, 1 - Math.exp(-dt * 16));
  motion.lean = lerp(motion.lean, clamp(-lateralSpeed * .01, -.055, .055) * (1 - motion.crouch * .5), 1 - Math.exp(-dt * 14));
  animateFeet(motion, position, yaw, dt, distance);
  const stridePhase = motion.phase * TAU;
  const strideTwist = Math.sin(stridePhase) * (.05 + motion.sprint * .05) * gaitWeight * (1 - motion.crouch * .5);
  const breathing = Math.sin(motion.time * 2.4) * .004;
  const bodyHeight = lerp(-.075 - motion.sprint * .06, -.675, motion.crouch);
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
