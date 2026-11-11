const boxes = [];
const structures = [];

function add(x, z, w, d, h, kind, color) {
  boxes.push({ id: `quarry-${boxes.length}`, x, z, w, d, h, kind, color });
}

function hangar(x, z, w, d, h) {
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
}

const nodes = Object.entries({
  'north-humvee': [-15, -267], 'north-atv': [15, -267],
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
  'south-atv': [-15, 267], 'south-humvee': [15, 267],
  'depot-parking': [-164, -84], 'relay-parking': [122, -92], 'pit-parking': [-12, 10],
  'crusher-parking': [-141, 102], 'hangar-parking': [184, 106],
}).map(([id, [x, z]]) => ({ id, x, z }));
const nodeById = new Map(nodes.map(node => [node.id, node]));

const tracks = [
  ['north-humvee', 'north-west-gate', 'north-junction', 'north-east-gate', 'north-atv'],
  ['south-atv', 'south-west-gate', 'south-junction', 'south-east-gate', 'south-humvee'],
  ['north-junction', 'north-west-switch', 'west-top', 'west-depot', 'west-bend', 'west-bottom', 'crusher', 'west-south-switch', 'south-junction'],
  ['north-junction', 'north-east-switch', 'east-top', 'east-upper-bend', 'east-lower-bend', 'east-hangar', 'east-bottom', 'east-south-switch', 'south-junction'],
  ['north-junction', 'north-approach', 'north-inlet', 'west-ring-north', 'pit', 'west-ring-south', 'south-inlet', 'south-approach', 'south-junction'],
  ['north-approach', 'north-outlet', 'east-ring-north', 'east-ring-south', 'south-outlet', 'south-approach'],
  ['west-bend', 'west-ring-north'], ['east-lower-bend', 'east-ring-south'],
  ['north-outlet', 'relay', 'east-top'], ['south-inlet', 'crusher'],
  ['west-depot', 'depot-parking'], ['relay', 'relay-parking'], ['pit', 'pit-parking'],
  ['crusher', 'crusher-parking'], ['east-hangar', 'hangar-parking'],
];
const edges = tracks.flatMap(track => track.slice(1).map((id, i) => [track[i], id]));
const roads = edges.map(([from, to]) => {
  const a = nodeById.get(from), b = nodeById.get(to);
  const dx = b.x - a.x, dz = b.z - a.z;
  const w = to.endsWith('-parking') ? 9 : 14;
  return { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, w, d: Math.hypot(dx, dz) + w, yaw: Math.atan2(dx, dz) };
});

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
  for (const type of ['atv', 'humvee']) {
    const id = `${end}-${type}`;
    const { x, z } = nodeById.get(id);
    vehicleSpawns.push({ id, type, team, x, z, yaw: team === 0 ? 0 : Math.PI });
  }
  add(0, sign * 292, 52, 2.1, 3.1, 'wall', '#aaa08a');
  add(-33, sign * 262, 18, 25, 8, 'warehouse', '#837b68');
  add(33, sign * 262, 18, 25, 8, 'warehouse', '#837b68');
  add(0, sign * 255, 9, 3.2, 2.9, 'truck', '#6f775d');
  add(0, sign * 234, 8, 5.6, 3, 'tent', '#777756');
  for (const side of [-1, 1]) {
    add(side * 31, sign * 237, 11, 1.3, 1.15, 'sandbags', '#a29675');
    add(side * 45, sign * 248, 2.3, 3.2, 2.2, 'generator', '#a78a4e');
    add(side * 38, sign * 218, 3, 5, 2.8, 'kiosk', '#798481');
  }
}

// The five capture areas stay close to the haul road but leave its driving lane open.
add(-135, -115, 27, 15, 9, 'warehouse', '#837966');
add(-142, -84, 13, 5, 2.8, 'container', '#87694d');
add(-125, -92, 5, 7, 1.35, 'crate', '#a38b64');
add(-154, -109, 4.5, 1.5, 1.16, 'sandbags', '#a29676');
add(-153, -84, 4.5, 1.5, 1.16, 'sandbags', '#a29676');
add(106, -61, 22, 13, 9, 'building', '#928970');
add(130, -75, 5.5, 4, 2.3, 'generator', '#a18a50');
add(97, -78, 1.6, 7, 1.2, 'barrier', '#b6a486');
add(124, -75, 4.5, 1.5, 1.16, 'sandbags', '#a29676');
add(14, 1, 9, 6.4, 3.2, 'truck', '#746c50');
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
for (let i = 0, placed = 0; i < 360 && placed < 94; i++) {
  const x = Math.round((random() - .5) * 545), z = Math.round((random() - .5) * 524);
  const w = 2.6 + random() * 4.4, d = 2.4 + random() * 4.3;
  const margin = Math.hypot(w, d) / 2 + 3;
  if (Math.abs(x) < 53 && Math.abs(z) > 207) continue;
  if (points.some(p => Math.hypot(p.x - x, p.z - z) < 17 + margin) || closeToRoad(x, z, margin)) continue;
  if (boxes.some(b => Math.abs(x - b.x) < (w + b.w) / 2 + 5 && Math.abs(z - b.z) < (d + b.d) / 2 + 5)) continue;
  placed++;
  if (i % 9 === 0 && Math.abs(x) > 53) add(x, z, 2.2, 2.2, 4.6, 'tree', '#647051');
  else add(x, z, w, d, 1.1 + random() * 2, 'rock', rockColors[i % rockColors.length]);
}

export const QUARRY_MAP = {
  id: 'quarry', name: 'Карьер «Перевал»', size: 640, fogDensity: .0024,
  boxes, structures, roads, points,
  districts: points.map(({ id, name, x, z }) => ({ id, name, x, z })),
  spawns: [{ x: 0, z: 278 }, { x: 0, z: -278 }],
  vehicleSpawns,
  vehicleRoutes: {
    nodes, edges,
    objectives: { A: 'depot-parking', B: 'relay-parking', C: 'pit-parking', D: 'crusher-parking', E: 'hangar-parking' },
  },
};
