import { makeTerrain } from './terrain.js';

const size = 384;
const boxes = [], structures = [];
const colors = ['#ece4cd', '#dac47e', '#d6b18a', '#d5b5a9', '#bbaa87', '#e6dfbd', '#b5c2bc'];
const floorHeight = 3.1;

function add(kind, x, z, w, d, h, color, options = {}) {
  const box = { id: 'village-' + boxes.length, kind, x, z, w, d, h, color, ...options };
  boxes.push(box);
  return box;
}

function building(kind, name, x, z, w, d, h, color) {
  const id = 'village-building-' + structures.length;
  const structure = { id, kind, name, x, z, w, d, h, color, roof: kind !== 'village-ruin', terrainPad: true };
  structures.push(structure);
  return { structure, part: { editorParent: 'structure:' + id, editorPart: true } };
}

function house(x, z, w, d, floors, plan, index) {
  const ruined = plan === 'ruin', rotated = index % 3 === 1;
  const h = floorHeight * floors + .35;
  const kind = ruined ? 'village-ruin' : floors === 3 ? 'village-house-three' : floors === 2 ? 'village-house-tall' : 'village-house';
  const plans = { hall: 'Проходной дом', rooms: 'Дом с двумя комнатами', courtyard: 'Дом с двориком', corner: 'Угловой дом', ruin: 'Разрушенный дом' };
  const name = plans[plan] + ' · ' + floors + ' эт.';
  const color = colors[index % colors.length];
  const { structure, part } = building(kind, name, x, z, w, d, h, color);
  Object.assign(structure, { floors, plan, doorAxis: rotated ? 'x' : 'z' });
  const first = boxes.length;
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
    const opening = 2.6, windowCenter = d * .24;
    const endLength = d / 2 - windowCenter - opening / 2;
    for (let level = 0; level < floors; level++) {
      const base = level * floorHeight;
      add('village-wall', wallX, z, thickness, d, 1.15, color, { ...part, baseY: base });
      add('village-wall', wallX, z, thickness, d, floorHeight - 2.25, color,
        { ...part, baseY: base + 2.25, overhead: true });
      add('village-wall', wallX, z, thickness, windowCenter * 2 - opening, 1.1, color, { ...part, baseY: base + 1.15 });
      for (const end of [-1, 1]) add('village-wall', wallX, z + end * (d / 2 - endLength / 2),
        thickness, endLength, 1.1, color, { ...part, baseY: base + 1.15 });
    }
    add('village-wall', wallX, z, thickness, d, .35, color, { ...part, baseY: floorHeight * floors, overhead: true });
  }
  if (plan === 'rooms' || plan === 'corner') {
    for (const side of [-1, 1]) {
      if (floors > 1 && side === -1) continue;
      add('village-wall', x + side * (w + door) / 4, z, (w - door) / 2, .35, 2.5, color, part);
    }
  }
  if (plan === 'corner') {
    add('village-wall', x + w / 2 - 3.3, z - d * .21, .35, d * .4, 2.5, color, part);
  }
  if (plan === 'courtyard') {
    for (const side of [-1, 1]) add('village-wall', x + side * (w / 2 - 2.3), z + d * .15,
      .35, d * .35, 2.1, color, part);
  }
  for (let level = 1; level < floors; level++) {
    const base = floorHeight * level;
    add('village-floor', x + 1.3, z, w - 3.1, d - .5, .18, '#b9a58b',
      { ...part, baseY: base - .18, overhead: true });
    for (let step = 1; step <= 12; step++) add('village-stair', x - w / 2 + 1.45, z - d / 2 + .9 + step * .8,
      2.1, .8, .16, '#ac997a',
      { ...part, baseY: (level - 1) * floorHeight + step * floorHeight / 12 - .16, overhead: true });
    add('village-floor', x - w / 2 + 1.45, z + 4.925, 2.3, d - 10.35, .18, '#b9a58b',
      { ...part, baseY: base - .18, overhead: true });
  }
  const roofWidth = ruined ? w * .32 : plan === 'courtyard' ? w * .6 : w + .8;
  const roofX = ruined ? x - w * .34 : plan === 'courtyard' ? x + w * .18 : x;
  add('village-roof', roofX, z, roofWidth, d + .8, .25, '#a28d71',
    { ...part, baseY: h, overhead: true });
  if (!ruined) for (const side of [-1, 1]) {
    add('village-wall', x + side * w / 2, z, .42, d, .48, color,
      { ...part, baseY: h + .25, overhead: true });
    add('village-wall', x, z + side * d / 2, w, .42, .48, color,
      { ...part, baseY: h + .25, overhead: true });
  }
  if (rotated) {
    for (const box of boxes.slice(first)) {
      const dx = box.x - x, dz = box.z - z;
      Object.assign(box, { x: x + dz, z: z - dx, w: box.d, d: box.w });
    }
    Object.assign(structure, { w: d, d: w });
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

// Hand-placed neighbourhoods follow the winding road, with a ravine along the west flank.
const homes = [
  [-24,-147,13,12,1,'rooms'], [-31,-120,15,14,2,'hall'], [-29,-93,12,16,1,'corner'],
  [-56,-151,14,11,1,'courtyard'], [-58,-123,14,18,2,'rooms'], [-55,-92,17,12,1,'ruin'],
  [26,-150,14,16,2,'hall'], [22,-123,13,12,1,'rooms'], [25,-91,16,14,2,'courtyard'],
  [57,-143,15,13,1,'corner'], [54,-114,14,16,3,'hall'], [58,-84,12,14,1,'ruin'],
  [-30,-63,17,12,2,'corner'], [-17,-35,12,16,1,'rooms'], [-58,-58,13,14,1,'hall'],
  [-54,-29,16,12,2,'courtyard'], [-57,-5,13,16,1,'ruin'], [39,-66,18,12,1,'rooms'],
  [44,-15,13,17,2,'hall'], [65,-52,12,13,1,'corner'], [66,-24,12,12,1,'rooms'], [59,4,16,13,2,'hall'],
  [-32,13,14,16,1,'courtyard'], [-34,70,14,13,2,'rooms'], [-58,21,12,13,1,'corner'],
  [-60,54,14,18,2,'hall'], [-56,81,12,12,1,'rooms'], [17,13,15,14,2,'rooms'],
  [39,39,16,15,1,'ruin'], [39,70,15,12,1,'courtyard'], [65,21,12,12,1,'hall'],
  [64,54,12,13,3,'corner'], [65,84,12,14,1,'rooms'],
  [-24,103,14,14,2,'hall'], [-30,133,13,17,1,'corner'], [-24,156,14,10,1,'rooms'],
  [-56,109,15,12,1,'courtyard'], [-58,143,12,17,2,'hall'], [19,97,16,12,1,'ruin'],
  [31,145,15,16,2,'rooms'], [62,111,12,16,1,'corner'], [58,144,16,14,1,'hall'], [37,119,12,12,2,'rooms'],
];
homes.forEach(([x, z, w, d, floors, plan], index) => house(x, z, w, d, floors, plan, index));

for (const [x, z, color] of [
  [29,-46,'#b4915d'], [29,-33,'#d9d0ab'], [10,-60,'#8c9a91'],
  [-4,-17,'#b67758'], [-27,48,'#c5b878'], [20,126,'#c3cbb4'],
]) stall(x, z, color);
well(-26, 42);
well(6, -110);

for (const [x, z, w, d, h] of [
  [-8,-139,6,.65,1.5], [4,-97,7,.65,1.6], [-17,-78,.65,9,1.65],
  [7,-42,.65,7,1.3], [22,-27,6,.65,1.4], [-13,1,8,.65,1.6],
  [-9,26,.65,7,1.4], [-6,55,7,.65,1.55], [15,77,.65,8,1.6],
  [-12,111,6,.65,1.5], [9,137,7,.65,1.65], [-41,44,7,.65,1.5],
  [-73,-70,.7,10,1.5], [-72,82,.7,10,1.5], [74,-3,.7,10,1.5],
]) add('village-barricade', x, z, w, d, h, '#ceb98b');

for (const [i, x, z] of [
  [0,-17,-131], [1,11,-137], [2,-16,-106], [3,13,-82], [4,-18,-54], [5,37,-40],
  [6,-6,-13], [7,26,2], [8,-15,35], [9,8,55], [10,-9,87], [11,23,111], [12,-15,145],
]) {
  add('crate', x, z, 2.4, 2, 1.3, '#9c7d53');
  add('village-pottery', x + (i % 2 ? 3.3 : -3.3), z + 1.7, 1.8, 1.6, 1.15, '#ad7750');
}
for (const [x, z] of [[-48,-83],[41,-76],[-47,-3],[25,38],[-45,88],[12,103]])
  add('village-rubble', x, z, 3.2, 2.4, .85, '#b4a080');
for (const [x, z] of [[-16,-117],[30,-56],[52,13],[-45,38],[24,137],[-73,8]])
  add('village-barrels', x, z, 2.1, 1.6, 1.35, '#798479');
for (const [x, z] of [[-12,-158],[41,-109],[-42,-42],[37,-32],[-42,29],[13,63],[49,97],[3,149]])
  add('village-palm', x, z, .65, .65, 7.6, '#71664a');

for (const side of [-1, 1]) {
  add('village-barricade', -24, side * 165, 12, .8, 2.2, '#d5c49d');
  add('village-barricade', 25, side * 164, 12, .8, 2.2, '#d5c49d');
  add('sandbags', -9, side * 156, 5, 1.3, 1.15, '#afa17b');
  add('crate', 39, side * 165, 3.5, 3, 1.5, '#947651');
}

function road(points, width) {
  return points.slice(1).map(([x, z], index) => {
    const [ax, az] = points[index], dx = x - ax, dz = z - az;
    return { x: (x + ax) / 2, z: (z + az) / 2, w: width, d: Math.hypot(dx, dz) + width, yaw: Math.atan2(dx, dz) };
  });
}
const roads = [
  ...road([[0,-168],[4,-139],[-9,-106],[-2,-78],[15,-51],[6,-20],[-12,8],[-3,35],[17,67],[8,96],[-9,124],[2,153],[0,168]], 8),
  ...road([[-73,-162],[-77,-111],[-69,-66],[-76,-13],[-68,38],[-75,91],[-70,157]], 4.5),
  ...road([[76,-158],[77,-101],[73,-46],[78,12],[74,69],[77,119],[72,162]], 4.5),
  ...road([[-73,-78],[-36,-78],[-2,-78],[26,-70],[76,-71]], 5),
  ...road([[-75,43],[-42,43],[-17,43],[9,51],[40,52],[76,44]], 5),
];
const points = [
  { id: 'A', name: 'СЕВЕРНЫЙ КВАРТАЛ', x: -9, z: -113 },
  { id: 'B', name: 'ВЕРХНИЙ РЫНОК', x: 16, z: -40 },
  { id: 'C', name: 'ДВОР У КОЛОДЦА', x: -17, z: 43 },
  { id: 'D', name: 'ЮЖНЫЙ КВАРТАЛ', x: 7, z: 119 },
];
const landmarks = [
  { name: 'ЗАПАДНЫЙ ОВРАГ', x: -74, z: 5 },
  { name: 'КОРАБЛЬ НА МЕЛИ', x: 105, z: 2 },
];
const landforms = [
  { x:0, z:0, rx:100, rz:180, height:-5, flat:.16 },
  { x:-12, z:-119, rx:92, rz:86, height:10, flat:.32 },
  { x:12, z:120, rx:95, rz:85, height:13, flat:.30 },
  { x:-59, z:6, rx:26, rz:119, height:-4, flat:.30 },
  { x:62, z:-18, rx:44, rz:103, height:5, flat:.25 },
  { x:-145, z:-122, rx:78, rz:92, height:58, flat:.15 },
  { x:-147, z:-12, rx:73, rz:89, height:69, flat:.13 },
  { x:-143, z:111, rx:75, rz:92, height:61, flat:.14 },
  { x:147, z:-118, rx:77, rz:89, height:61, flat:.13 },
  { x:151, z:0, rx:71, rz:98, height:57, flat:.16 },
  { x:146, z:117, rx:73, rz:92, height:68, flat:.13 },
  { x:0, z:-203, rx:150, rz:42, height:45, flat:.12 },
  { x:0, z:204, rx:149, rz:42, height:49, flat:.12 },
];
const relief = makeTerrain(size, landforms, 2);
for (const structure of structures) structure.baseY = relief.heightAt(structure.x, structure.z);
const terrainPads = structures.map(({ x, z, w, d, baseY }) => ({ x, z, w: w + 8, d: d + 8, height: baseY, blend: 4 }));
const terrain = makeTerrain(size, landforms, 2, terrainPads);
const parents = new Map(structures.map(structure => ['structure:' + structure.id, structure]));
for (const box of boxes) box.baseY = (parents.get(box.editorParent)?.baseY ?? terrain.heightAt(box.x, box.z)) + (box.baseY ?? 0);
for (const point of points) point.y = terrain.heightAt(point.x, point.z);

// Foreground cliffs stand beyond the playable valley and close the mountain skyline.
for (const side of [-1, 1]) for (const [i, z] of [-155,-88,-15,61,139].entries()) {
  add('village-rock', side * (128 + i % 2 * 12), z, 62, 79, 48 + i % 3 * 9, '#aa957b', { baseY: 8 });
}
for (const side of [-1, 1]) for (const x of [-94,-31,37,103]) {
  add('village-rock', x, side * 211, 74, 52, 39 + Math.abs(x) * .09, '#ac9475', { baseY: 3 });
}

export const VILLAGE_MAP = {
  id: 'village', name: 'Деревня «Сухой ветер»', theme: 'desert-village', layoutVersion: 2, size,
  fogDensity: .0034, fogColor: '#d0bea1', sunColor: '#ffe4b4', navigationCell: 2, stepHeight: .3,
  playArea: { minX: -82, maxX: 82, minZ: -173, maxZ: 173 },
  terrain, landforms, terrainPads, boxes, structures, roads, points, landmarks, districts: [...points, ...landmarks],
  ship: { x: 109, z: 0, w: 23, d: 126, baseY: terrain.heightAt(109, 0) + 1.2, beached: true },
  spawns: [{ x: 0, z: 166 }, { x: 0, z: -166 }], vehicleSpawns: [], signs: [],
};
