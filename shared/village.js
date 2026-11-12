import { makeTerrain } from './terrain.js';

const size = 320;
const boxes = [], structures = [];
const colors = ['#cfb58b', '#bd9b72', '#d3c6a0', '#a98a68', '#d0ab82', '#b5b09a'];

function add(kind, x, z, w, d, h, color, options = {}) {
  const box = { id: 'village-' + boxes.length, kind, x, z, w, d, h, color, ...options };
  boxes.push(box);
  return box;
}

function building(kind, name, x, z, w, d, h, color) {
  const id = 'village-building-' + structures.length;
  const structure = { id, kind, name, x, z, w, d, h, color, roof: kind !== 'village-ruin' };
  structures.push(structure);
  return { structure, part: { editorParent: 'structure:' + id, editorPart: true } };
}

function house(x, z, index) {
  const w = index % 3 === 0 ? 22 : 20, d = index % 4 === 0 ? 22 : 20;
  const ruined = index % 11 === 0;
  const tall = !ruined && index % 5 === 0;
  const h = tall ? 5.8 : 3.6;
  const kind = ruined ? 'village-ruin' : tall ? 'village-house-tall' : 'village-house';
  const name = ruined ? 'Разрушенный глинобитный дом' : tall ? 'Высокий деревенский дом' : 'Глинобитный дом';
  const color = colors[index % colors.length];
  const { part } = building(kind, name, x, z, w, d, h, color);
  const thickness = .55, door = 5.6, doorHeight = 2.65;
  const section = (w - door) / 2;
  for (const side of [-1, 1]) {
    for (const end of [-1, 1]) {
      add('village-wall', x + side * (door + section) / 2, z + end * d / 2,
        section, thickness, ruined && side === end ? 2.2 : h, color, part);
    }
    if (!ruined) add('village-lintel', x, z + side * d / 2, door, thickness, h - doorHeight, color,
      { ...part, baseY: doorHeight, overhead: true });

    const wallX = x + side * w / 2;
    // Waist-high window sills keep side windows useful for firing from cover.
    add('village-wall', wallX, z, thickness, d, 1.15, color, part);
    add('village-wall', wallX, z, thickness, d, ruined ? .65 : h - 2.25, color,
      { ...part, baseY: 2.25, overhead: true });
    const opening = 2.6, windowCenter = d * .24;
    const endLength = d / 2 - windowCenter - opening / 2;
    add('village-wall', wallX, z, thickness, windowCenter * 2 - opening, 1.1, color, { ...part, baseY: 1.15 });
    for (const end of [-1, 1]) add('village-wall', wallX, z + end * (d / 2 - endLength / 2),
      thickness, endLength, 1.1, color, { ...part, baseY: 1.15 });
  }
  const roofWidth = ruined ? w * .32 : w + .8;
  const roofX = ruined ? x - w * .34 : x;
  add('village-roof', roofX, z, roofWidth, d + .8, .25, '#a28d71',
    { ...part, baseY: h, overhead: true });
  if (!ruined) for (const side of [-1, 1]) {
    add('village-wall', x + side * w / 2, z, .42, d, .48, color,
      { ...part, baseY: h + .25, overhead: true });
    add('village-wall', x, z + side * d / 2, w, .42, .48, color,
      { ...part, baseY: h + .25, overhead: true });
  }
}

function stall(x, z, color) {
  const { part } = building('village-stall', 'Рыночный прилавок с навесом', x, z, 6.4, 4.2, 3, color);
  for (const side of [-1, 1]) for (const end of [-1, 1]) {
    add('village-wood', x + side * 3, z + end * 1.8, .2, .2, 2.9, '#806143', part);
  }
  add('village-wood', x, z + .7, 5.7, 1.2, .88, '#8e6c47', part);
  add('village-awning', x, z, 6.6, 4.4, .12, color, { ...part, baseY: 2.9, overhead: true });
}

function well(x, z) {
  const { part } = building('village-well', 'Колодец с деревянным воротом', x, z, 3.8, 3.8, 3.5, '#aa9574');
  for (const side of [-1, 1]) {
    add('village-stone', x + side * 1.25, z, .5, 3, .9, '#aa9574', part);
    add('village-stone', x, z + side * 1.25, 2, .5, .9, '#aa9574', part);
    add('village-wood', x + side * 1.65, z, .18, .18, 3.2, '#75583d', part);
  }
  add('village-wood', x, z, 3.8, .22, .22, '#75583d', { ...part, baseY: 3.15, overhead: true });
}

// Offset blocks turn long alleys into short sightlines with connecting side passages.
const lots = [-108, -76, -44, -12, 20, 52, 84, 116];
const plazas = new Set(['1/1', '1/6', '6/1', '6/6', '3/3', '3/4', '4/3', '4/4']);
for (let row = 0; row < lots.length; row++) for (let col = 0; col < lots.length; col++) {
  if (plazas.has(row + '/' + col)) continue;
  house(lots[col] + (row % 2 ? 4 : -4), lots[row] + (col % 2 ? 4 : 0), row * lots.length + col);
}

for (const [x, z, color] of [
  [-16, -17, '#9b704a'], [20, -17, '#666f60'], [-16, 25, '#8e9d92'], [20, 25, '#aa6b48'],
  [-86, 88, '#8e9d92'], [99, -82, '#aa6b48'],
]) stall(x, z, color);
well(16, 4);
well(-88, -84);

// Chicanes and garden walls interrupt the remaining narrow, straight sightlines.
for (const [x, z, w, d, h] of [
  [1, -58, 8, .7, 2.1], [1, 70, 8, .7, 2.1],
  [-95, -27, 9, .65, 1.65], [-63, 37, 9, .65, 1.65],
  [65, -27, 9, .65, 1.65], [97, 37, 9, .65, 1.65],
  [-86, 75, 8, .65, 1.6], [-69, 91, .65, 9, 1.6],
  [75, 88, .65, 10, 1.6], [87, 75, 9, .65, 1.6],
  [-88, -92, 8, .65, 1.6], [-69, -78, .65, 8, 1.6],
  [75, -88, .65, 10, 1.6], [90, -71, 8, .65, 1.6],
  [-6, 7, 7, .75, 1.45], [10, -4, .75, 7, 1.45],
]) add('village-barricade', x, z, w, d, h, '#b6a17c');

for (const [i, x, z] of [
  [0, -103, -32], [1, -67, 32], [2, -35, -65], [3, 33, 65], [4, 99, -32], [5, 131, 32],
  [6, -90, 93], [7, 87, 93], [8, -84, -68], [9, 85, -69], [10, -23, 6], [11, 34, 7],
]) {
  add('crate', x, z, 2.8, 2.4, 1.35, '#9c7d53');
  add('village-pottery', x + (i % 2 ? 3.4 : -3.4), z, 1.8, 1.6, 1.15, '#ad7750');
}
for (const [x, z] of [[-92, 84], [96, -80], [-19, -7], [29, 13], [-130, -4], [136, 70]]) {
  add('village-rubble', x, z, 3.2, 2.4, .85, '#b4a080');
}
for (const [x, z] of [[-92, -72], [98, 83], [-28, 24], [34, -16], [-128, 53], [132, -62]]) {
  add('village-barrels', x, z, 2.1, 1.6, 1.35, '#707c72');
}
for (const [x, z] of [[-86, -70], [95, 95], [-30, -31], [36, 38], [-141, 10], [142, -10]]) {
  add('village-palm', x, z, .65, .65, 7.6, '#71664a');
}

for (const side of [-1, 1]) {
  // Two protected staging areas, each with a central exit and both flanks.
  add('village-barricade', -23, side * 140, 12, .8, 2.2, '#b6a17c');
  add('village-barricade', 25, side * 140, 12, .8, 2.2, '#b6a17c');
  add('sandbags', -8, side * 134, 5, 1.3, 1.15, '#a79b79');
  add('sandbags', 9, side * 130, 5, 1.3, 1.15, '#a79b79');
  add('crate', -37, side * 145, 3.5, 3, 1.5, '#947651');
  add('generator', 40, side * 145, 2.6, 3.6, 2.8, '#9a8b63');
}

const points = [
  { id: 'A', name: 'ГЛИНЯНЫЙ ДВОР', x: -80, z: 88 },
  { id: 'B', name: 'СТАРЫЙ КОЛОДЕЦ', x: -80, z: -80 },
  { id: 'C', name: 'РЫНОЧНАЯ ПЛОЩАДЬ', x: 4, z: 4 },
  { id: 'D', name: 'КВАРТАЛ РЕМЕСЛЕННИКОВ', x: 88, z: -80 },
  { id: 'E', name: 'ЮЖНЫЕ САДЫ', x: 88, z: 88 },
];
const landmarks = [
  { name: 'ЗАПАДНЫЙ ПЕРЕУЛОК', x: -132, z: 20 },
  { name: 'ВОСТОЧНАЯ УЛИЦА', x: 136, z: -16 },
];
const roads = [
  { x: 4, z: 4, w: 10, d: 308 }, { x: -60, z: 4, w: 8, d: 300 }, { x: 100, z: 4, w: 8, d: 300 },
  { x: 4, z: -28, w: 292, d: 8 }, { x: 4, z: 36, w: 292, d: 8 },
  { x: 4, z: 4, w: 66, d: 56 },
];

export const VILLAGE_MAP = {
  id: 'village', name: 'Деревня «Сухой ветер»', theme: 'desert-village', size,
  fogDensity: .0035, fogColor: '#cbb79b', sunColor: '#ffe1ab', navigationCell: 2,
  terrain: makeTerrain(size, []), landforms: [],
  boxes, structures, roads, points, landmarks, districts: [...points, ...landmarks],
  spawns: [{ x: 0, z: 147 }, { x: 0, z: -147 }], vehicleSpawns: [], signs: [],
};
