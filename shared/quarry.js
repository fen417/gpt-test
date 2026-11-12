import { makeTerrain } from './terrain.js';
import { routeRoads } from './map-edits.js';

const size = 896;
const boxes = [];
const structures = [];

function add(x, z, w, d, h, kind, color, options = {}) {
  boxes.push({ id: `quarry-${boxes.length}`, x, z, w, d, h, kind, color, ...options });
}

function hangar(x, z, w, d, h) {
  const first = boxes.length;
  const color = '#8e8774';
  structures.push({ id: 'quarry-hangar', x, z, w, d, h, kind: 'open-warehouse', color, roof: true });
  const gate = 13;
  const section = (w - gate) / 2;
  for (const side of [-1, 1]) {
    add(x + side * w / 2, z, 1.2, d, h, 'wall', color);
    for (const end of [-1, 1]) {
      add(x + side * (gate + section) / 2, z + end * d / 2, section, 1.2, h, 'wall', color);
    }
    add(x + side * 10, z + 6, 3.5, 4, 1.4, 'crate', '#9f8963');
  }
  for (const box of boxes.slice(first)) box.editorParent = 'structure:quarry-hangar';
}

const nodes = Object.entries({
  'north-humvee': [-15, -347], 'north-humvee-2': [-7, -347], 'north-atv': [15, -347], 'north-atv-2': [7, -347],
  'north-humvee-merge': [-15, -319], 'north-atv-merge': [15, -319],
  'north-west-gate': [-15, -219], 'north-east-gate': [15, -219], 'north-junction': [0, -190],
  'north-west-switch': [-110, -190], 'north-east-switch': [112, -190],
  'north-approach': [0, -112], 'north-inlet': [-44, -77], 'north-outlet': [44, -77],
  'west-top': [-174, -145], 'west-depot': [-174, -97], 'west-bend': [-174, -25],
  'west-bottom': [-174, 75], 'crusher': [-151, 119], 'west-south-switch': [-115, 190],
  'east-top': [174, -145], 'relay': [109, -99], 'east-upper-bend': [174, -25],
  'east-lower-bend': [174, 27], 'east-hangar': [174, 106], 'east-bottom': [174, 145],
  'east-south-switch': [110, 190],
  'west-ring-north': [-44, -25], 'pit': [-21, 0], 'west-ring-south': [-44, 28],
  'east-ring-north': [44, -25], 'east-ring-south': [44, 27], 'south-inlet': [-44, 77],
  'south-outlet': [44, 77], 'south-approach': [0, 114], 'south-junction': [0, 190],
  'south-west-gate': [-15, 219], 'south-east-gate': [15, 219],
  'south-atv': [-15, 347], 'south-atv-2': [-7, 347], 'south-humvee': [15, 347], 'south-humvee-2': [7, 347],
  'south-atv-merge': [-15, 319], 'south-humvee-merge': [15, 319],
  'west-cut': [-226, -28], 'west-drain': [-300, -28], 'pump-turn': [-360, -28],
  'pump-parking': [-355, -15], 'west-haul-south': [-353, 210], 'west-haul-return': [-276, 289], 'west-return-gate': [-45, 289],
  'east-cut': [224, -13], 'east-climb': [281, -13], 'terrace-turn': [350, -13],
  'terrace-parking': [355, 3], 'east-haul-north': [352, -203], 'east-haul-return': [269, -286], 'east-return-gate': [45, -286],
  'depot-parking': [-164, -84], 'relay-parking': [122, -92], 'pit-parking': [-12, 10],
  'crusher-parking': [-141, 102], 'hangar-parking': [184, 106],
}).map(([id, [x, z]]) => ({ id, x, z }));
const nodeById = new Map(nodes.map(node => [node.id, node]));

const tracks = [
  ['north-humvee', 'north-humvee-merge', 'north-west-gate', 'north-junction', 'north-east-gate', 'north-atv-merge', 'north-atv'],
  ['north-humvee-2', 'north-humvee-merge'],
  ['north-atv-2', 'north-atv-merge'],
  ['south-atv', 'south-atv-merge', 'south-west-gate', 'south-junction', 'south-east-gate', 'south-humvee-merge', 'south-humvee'],
  ['south-humvee-2', 'south-humvee-merge'],
  ['south-atv-2', 'south-atv-merge'],
  ['north-junction', 'north-west-switch', 'west-top', 'west-depot', 'west-bend', 'west-bottom', 'crusher', 'west-south-switch', 'south-junction'],
  ['north-junction', 'north-east-switch', 'east-top', 'east-upper-bend', 'east-lower-bend', 'east-hangar', 'east-bottom', 'east-south-switch', 'south-junction'],
  ['north-junction', 'north-approach', 'north-inlet', 'west-ring-north', 'pit', 'west-ring-south', 'south-inlet', 'south-approach', 'south-junction'],
  ['north-approach', 'north-outlet', 'east-ring-north', 'east-ring-south', 'south-outlet', 'south-approach'],
  ['west-bend', 'west-ring-north'], ['east-lower-bend', 'east-ring-south'],
  ['north-outlet', 'relay', 'east-top'], ['south-inlet', 'crusher'],
  ['west-bend', 'west-cut', 'west-drain', 'pump-turn', 'west-haul-south', 'west-haul-return', 'west-return-gate', 'south-west-gate'],
  ['east-upper-bend', 'east-cut', 'east-climb', 'terrace-turn', 'east-haul-north', 'east-haul-return', 'east-return-gate', 'north-east-gate'],
  ['pump-turn', 'pump-parking'], ['terrace-turn', 'terrace-parking'],
  ['west-depot', 'depot-parking'], ['relay', 'relay-parking'], ['pit', 'pit-parking'],
  ['crusher', 'crusher-parking'], ['east-hangar', 'hangar-parking'],
];
const edges = tracks.flatMap(track => track.slice(1).map((id, i) => [track[i], id]));
const roads = routeRoads(nodes, edges);

const points = [
  { id: 'A', name: 'СТАРЫЙ СКЛАД', x: -155, z: -97 },
  { id: 'B', name: 'РЕТРАНСЛЯТОР', x: 111, z: -79 },
  { id: 'C', name: 'ВЫРАБОТКА', x: 0, z: 0 },
  { id: 'D', name: 'ДРОБИЛКА', x: -128, z: 119 },
  { id: 'E', name: 'АНГАР', x: 151, z: 106 },
];

const vehicleSpawns = [];
for (const team of [0, 1]) {
  const sign = team === 0 ? 1 : -1;
  const end = team === 0 ? 'south' : 'north';
  for (const [suffix, type] of [['atv', 'atv'], ['atv-2', 'atv'], ['humvee', 'humvee'], ['humvee-2', 'humvee']]) {
    const id = `${end}-${suffix}`;
    const { x, z } = nodeById.get(id);
    vehicleSpawns.push({ id, type, team, x, z, yaw: team === 0 ? 0 : Math.PI });
  }
  add(0, sign * 372, 52, 2.1, 3.1, 'wall', '#aaa08a');
  add(-33, sign * 342, 18, 25, 8, 'warehouse', '#837b68');
  add(33, sign * 342, 18, 25, 8, 'warehouse', '#837b68');
  add(37, sign * 335, 9, 3.2, 2.9, 'truck', '#6f775d');
  add(37, sign * 306, 8, 5.6, 3, 'tent', '#777756');
  for (const side of [-1, 1]) {
    add(side * 31, sign * 317, 11, 1.3, 1.15, 'sandbags', '#a29675');
    add(side * 45, sign * 328, 2.3, 3.2, 2.2, 'generator', '#a78a4e');
    add(side * 38, sign * 298, 3, 5, 2.8, 'kiosk', '#798481');
  }
}

// The capture areas stay close to the haul road but leave its driving lane open.
add(-135, -115, 27, 15, 9, 'warehouse', '#837966');
add(-142, -84, 13, 5, 2.8, 'container', '#87694d');
add(-125, -92, 5, 7, 1.35, 'crate', '#a38b64');
add(-154, -109, 4.5, 1.5, 1.16, 'sandbags', '#a29676');
add(-153, -84, 4.5, 1.5, 1.16, 'sandbags', '#a29676');
add(106, -61, 22, 13, 9, 'building', '#928970');
add(130, -75, 5.5, 4, 2.3, 'generator', '#a18a50');
add(97, -78, 1.6, 7, 1.2, 'barrier', '#b6a486');
add(124, -75, 4.5, 1.5, 1.16, 'sandbags', '#a29676');
add(22, 1, 9, 6.4, 3.2, 'truck', '#746c50');
add(-9, -18, 11, 4, 2.8, 'container', '#966d53');
add(-9, 22, 13, 4, 2.8, 'container', '#6d7b70');
add(3, -12, 5.4, 1.5, 1.15, 'barrier', '#b6a486');
add(3, 13, 4.8, 1.5, 1.15, 'sandbags', '#a29676');
add(22, 16, 5, 5, 2.5, 'generator', '#a18a50');
add(-103, 134, 32, 19, 16, 'factory', '#92816d');
add(-127, 136, 5, 4.3, 1.3, 'crate', '#a38b64');
add(-126, 129, 5.3, 2.4, 1.2, 'barrier', '#b3a08a');
add(-110, 119, 6.6, 3.3, 2.8, 'fueltank', '#8b8b79');
hangar(151, 106, 24, 31, 8);
add(131, 113, 8, 3.7, 2.8, 'container', '#806a56');
add(156, 135, 7.5, 1.5, 1.15, 'sandbags', '#a29676');

// Pump house at the bottom of the western cut, and the loading yard on the high bench.
add(-319, 12, 17, 14, 7, 'building', '#888274');
add(-340, 18, 8, 4.6, 2.9, 'fueltank', '#746d5c');
add(-321, -4, 8, 3, 1.2, 'barrier', '#ad9c7e');
add(-337, 30, 10, 4, 2.8, 'container', '#6c7c73');
add(350, 39, 24, 14, 8.2, 'warehouse', '#9b866e');
add(325, 29, 9, 4, 2.8, 'container', '#8f654e');
add(328, 8, 1.5, 8, 1.2, 'barrier', '#b6a486');
add(363, 18, 4, 5, 2.5, 'generator', '#a89453');

// Low cover between the pump room and the gravel lane.
add(-334, -10, 8, 2.8, 1.32, 'pump-manifold', '#8b7356');
add(-331, 4, 1.2, 6.2, 1.35, 'barrier', '#ac9a7c');
add(-351, 14, 4, 1.4, 1.1, 'sandbags', '#9c8c70');

// The unloading canopy leaves a central passage between two low concrete bays.
const loadingCanopy = { id: 'quarry-loading-canopy', x: 342, z: 19, w: 12, d: 10, h: 4.2, roof: true };
structures.push(loadingCanopy);
const canopyPart = { editorParent: 'structure:quarry-loading-canopy' };
for (const side of [-1, 1]) {
  const x = loadingCanopy.x + side * loadingCanopy.w / 2;
  for (const end of [-1, 1]) {
    add(x, loadingCanopy.z + end * loadingCanopy.d / 2, .32, .32, loadingCanopy.h, 'pillar', '#65645c', canopyPart);
  }
  add(x, loadingCanopy.z, .7, 6.8, 1.12, 'barrier', '#b2a189', canopyPart);
}
add(340, 6, 3.2, 2.2, 1.25, 'crate', '#997b55');

const landmarks = [
  { name: 'ВОДООТЛИВ', x: -343, z: -4 },
  { name: 'ВЕРХНЯЯ ТЕРРАСА', x: 341, z: 19 },
  { name: 'НАБЛЮДАТЕЛЬНЫЙ ГРЕБЕНЬ', x: -124, z: -318 },
  { name: 'ГРЯДА ОТВАЛОВ', x: 135, z: 322 },
  { name: 'СТАРАЯ ВЕСОВАЯ', x: -302, z: 196 },
  { name: 'КАРЬЕРНЫЙ УСТУП', x: 307, z: 212 },
];
add(-129, -327, 5, 4.8, 3.4, 'kiosk', '#7b827b');
add(-121, -310, 10, 1.6, 1.1, 'sandbags', '#9b8e73');
add(134, 326, 9, 3, 2.8, 'container', '#987859');
add(149, 313, 7, 2.1, 1.1, 'barrier', '#aa9677');
add(-296, 206, 10, 7, 3.7, 'building', '#8d806a');
add(-319, 191, 10, 3, 3.1, 'truck', '#776c51');
add(307, 221, 12, 5, 2.8, 'container', '#79765f');
add(316, 207, 4.5, 5, 2.1, 'generator', '#a38b52');

// Large shelves break the sight lines between the extraction yards. Smaller boulders are infantry cover.
const rockColors = ['#756c59', '#867962', '#938068', '#a18e70'];
for (const [x, z, w, d, h] of [
  [-235, -217, 51, 38, 16], [-218, -175, 32, 41, 11], [-257, -145, 59, 40, 19],
  [-231, -70, 46, 34, 13], [-243, 11, 40, 55, 16], [-236, 87, 45, 35, 12],
  [-264, 151, 43, 47, 17], [-210, 189, 45, 37, 13], [-236, 237, 58, 44, 20],
  [236, -217, 56, 39, 18], [225, -162, 43, 34, 12], [261, -111, 42, 45, 18],
  [228, -47, 42, 48, 14], [256, 18, 47, 40, 19], [222, 75, 33, 29, 9],
  [250, 132, 56, 55, 20], [219, 182, 45, 37, 13], [239, 235, 49, 46, 18],
  [-65, -149, 43, 24, 10], [67, -153, 46, 28, 12], [57, -120, 19, 13, 5],
  [-105, -65, 36, 28, 9], [-124, 26, 39, 30, 11], [-79, 33, 30, 25, 7],
  [89, -30, 31, 36, 12], [130, -33, 27, 21, 8], [106, 57, 38, 28, 10],
  [-55, 155, 46, 28, 11], [65, 151, 41, 25, 10], [-110, 232, 37, 20, 8],
  [104, 239, 41, 22, 9], [-104, -236, 45, 23, 9], [110, -231, 38, 23, 7],
]) {
  add(x, z, w, d, h, 'rock', rockColors[boxes.length % rockColors.length]);
}

// Place smaller cover only beyond the shoulder, capture circles and spawn approaches.
function closeToRoad(x, z, margin) {
  return roads.some(road => {
    const dx = x - road.x, dz = z - road.z;
    const sin = Math.sin(road.yaw), cos = Math.cos(road.yaw);
    return Math.abs(dx * cos - dz * sin) < road.w / 2 + margin &&
      Math.abs(dx * sin + dz * cos) < road.d / 2 + margin;
  });
}
let seed = 45119;
function random() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 0x100000000;
}
const firstNaturalCover = boxes.length;
for (let i = 0, placed = 0; i < 570 && placed < 145; i++) {
  const x = Math.round((random() - .5) * 793), z = Math.round((random() - .5) * 792);
  const w = 2.6 + random() * 4.4, d = 2.4 + random() * 4.3;
  const margin = Math.hypot(w, d) / 2 + 3;
  if (Math.abs(x) < 53 && Math.abs(z) > 207) continue;
  if ([...points, ...landmarks].some(p => Math.hypot(p.x - x, p.z - z) < 17 + margin) || closeToRoad(x, z, margin)) continue;
  if (boxes.some(b => Math.abs(x - b.x) < (w + b.w) / 2 + 5 && Math.abs(z - b.z) < (d + b.d) / 2 + 5)) continue;
  placed++;
  if (i % 9 === 0 && Math.abs(x) > 53) add(x, z, 2.2, 2.2, 4.6, 'tree', '#647051');
  else add(x, z, w, d, 1.1 + random() * 2, 'rock', rockColors[i % rockColors.length]);
}

const lastNaturalCover = boxes.length;

// Open bays shelter the capture circle from the rim. The west entrance faces
// the parking spur, and the center stays clear for capture and respawns.
add(1.5, 0, 18.2, 16, .34, 'roof', '#777f73', { overhead: true, baseY: 3.7 });
add(-7, -3.75, 1.1, 7.5, 3.7, 'wall', '#a0957e');
add(10, 3.75, 1.1, 7.5, 3.7, 'wall', '#a0957e');
add(6.5, -7, 7, 1.1, 3.7, 'wall', '#a0957e');
add(-3.5, 7, 7, 1.1, 3.7, 'wall', '#a0957e');

// Put cover on alternate sides of the approaches so a single position
// cannot see the full route. Keep the gravel lanes and parking spurs open.
for (const [x, z, w, d, h, kind, color] of [
  [-23, -168, 13, 3.4, 2.8, 'container', '#87765d'],
  [-30, -178, 4.2, 3.4, 1.35, 'crate', '#a08a69'],
  [24, -128, 16, 1.25, 3.2, 'wall', '#a59b85'],
  [30, -135, 8.6, 3.5, 3.2, 'truck', '#6e725d'],
  [-91, -106, 3.4, 11.5, 2.8, 'container', '#777d69'],
  [76, -59, 12, 3.4, 2.8, 'container', '#887965'],
  [69, -62, 3.2, 2.6, 1.4, 'crate', '#a28d6c'],
  [-18, -42, 12, 1.2, 3.2, 'wall', '#a79a82'],
  [17, -29, 11.5, 3.2, 2.8, 'container', '#8e7259'],
  [29, -16, 2.4, 3.5, 1.4, 'crate', '#a08a69'],
  [-20, 39, 12, 3.3, 2.8, 'container', '#767c69'],
  [21, 45, 13, 1.25, 3.2, 'wall', '#a59b85'],
  [13, 49, 4.5, 2.1, 1.15, 'sandbags', '#a29676'],
  [-22, 133, 11, 1.25, 3.1, 'wall', '#a39782'],
  [-28, 128, 4.3, 3.4, 1.4, 'crate', '#a08a69'],
  [23, 166, 13, 3.4, 2.8, 'container', '#87715c'],
  [29, 176, 9, 3.5, 3.2, 'truck', '#6e745f'],
  [-151, -54, 3.4, 12, 2.8, 'container', '#847762'],
  [-197, 31, 9.2, 3.5, 3.2, 'truck', '#727660'],
  [-145, 57, 11, 1.25, 3.1, 'wall', '#a69a84'],
  [-138, 63, 3.7, 3.4, 1.4, 'crate', '#a48a63'],
  [152, -8, 3.4, 12, 2.8, 'container', '#806a56'],
  [196, 52, 12, 1.25, 3.1, 'wall', '#a59a81'],
  [203, 46, 5.5, 3.7, 2.3, 'generator', '#a28c57'],
  [144, 73, 11, 3.4, 2.8, 'container', '#747d70'],
  [-316, 66, 14, 6, 3.4, 'building', '#8e826d'],
  [-306, 75, 4.5, 3.3, 1.4, 'crate', '#a18b66'],
  [-314, 131, 3.4, 12, 2.8, 'container', '#7e7563'],
  [321, -74, 13, 6, 3.4, 'building', '#958570'],
  [315, -86, 3.4, 12, 2.8, 'container', '#82735e'],
  [-62, -276, 13, 3.4, 2.8, 'container', '#8c775d'],
  [72, 278, 15, 1.25, 3.3, 'wall', '#a29782'],
  [81, 271, 9, 3.6, 3.2, 'truck', '#6e745e'],
]) {
  add(x, z, w, d, h, kind, color);
}

// Leave clearance between the new cover and existing procedural scenery.
const newCover = boxes.slice(lastNaturalCover);
for (let i = lastNaturalCover - 1; i >= firstNaturalCover; i--) {
  const box = boxes[i];
  if (newCover.some(cover => Math.abs(box.x - cover.x) < (box.w + cover.w) / 2 + 4 &&
      Math.abs(box.z - cover.z) < (box.d + cover.d) / 2 + 4)) boxes.splice(i, 1);
}

const landforms = [
  { x: 0, z: 0, rx: 94, rz: 104, height: -15, flat: .44 },
  { x: -344, z: -8, rx: 102, rz: 103, height: -12, flat: .29 },
  { x: 341, z: 13, rx: 111, rz: 114, height: 24, flat: .33 },
  { x: -122, z: -320, rx: 95, rz: 61, height: 16, flat: .25, angle: .28 },
  { x: -305, z: 198, rx: 72, rz: 84, height: 6, flat: .24 },
  { x: 309, z: 216, rx: 94, rz: 108, height: 20, flat: .33, angle: -.30 },
  { x: 137, z: 321, rx: 90, rz: 63, height: 10, flat: .20, angle: .42 },
  { x: 213, z: 343, rx: 67, rz: 43, height: 5, flat: .12, angle: -.51 },
  { x: 101, z: 367, rx: 48, rz: 45, height: 4, flat: .10 },
];
const terrain = makeTerrain(size, landforms);

for (const box of boxes) box.baseY = terrain.heightAt(box.x, box.z) + (box.baseY ?? 0);
loadingCanopy.baseY = terrain.heightAt(loadingCanopy.x, loadingCanopy.z);
for (const point of points) point.y = terrain.heightAt(point.x, point.z);

export const QUARRY_MAP = {
  id: 'quarry', name: 'Карьер «Перевал»', size, fogDensity: .00195, terrain, landforms,
  boxes, structures, roads, points,
  signs: [
    { x: -344, z: 4, name: 'ВОДООТЛИВ', note: 'НАСОСНАЯ СТАНЦИЯ' },
    { x: 342, z: 31, name: 'ТЕРРАСА', note: 'ВЕРХНИЙ ГОРИЗОНТ' },
    { x: -299, z: 201, name: 'ВЕСОВАЯ', note: 'КОНТРОЛЬ ГРУЗА' },
    { x: 0, z: -370.89, name: 'ПЕРЕВАЛ', note: 'ПАРК ТЕХНИКИ', baseSign: true, yaw: 0 },
    { x: 0, z: 370.89, name: 'ПЕРЕВАЛ', note: 'ПАРК ТЕХНИКИ', baseSign: true, yaw: Math.PI },
  ],
  districts: [...points, ...landmarks], landmarks,
  spawns: [{ x: 0, z: 358 }, { x: 0, z: -358 }],
  vehicleSpawns,
  vehicleRoutes: {
    nodes, edges,
    stops: { 'ВОДООТЛИВ': 'pump-parking', 'ВЕРХНЯЯ ТЕРРАСА': 'terrace-parking' },
    objectives: { A: 'depot-parking', B: 'relay-parking', C: 'pit-parking', D: 'crusher-parking', E: 'hangar-parking' },
  },
};
