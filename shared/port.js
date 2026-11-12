const size = 360;
const shoreX = -146;
const boxes = [], structures = [];
const add = (kind, x, z, w, d, h, color, options = {}) => {
  boxes.push({ id: "port-" + boxes.length, kind, x, z, w, d, h, color, ...options });
};

const cargoColors = ['#9a5240', '#4b737b', '#827456', '#596951', '#986940', '#748185'];
function stack(x, z, levels = 1, index = 0, alongZ = false, length = 12.2) {
  add('port-container', x, z, alongZ ? 2.6 : length, alongZ ? length : 2.6, levels * 2.66, cargoColors[index % cargoColors.length], { levels });
}

function warehouse({ id, name, x, z, w, d, h, color, stock }) {
  const first = boxes.length;
  const gates = [-w * .27, w * .27];
  const width = 12, sideGate = 12, doorHeight = 5.1;
  structures.push({ id, name, x, z, w, d, h, gates, width, sideGate, doorHeight, color, stock });
  for (const side of [-1, 1]) {
    const wallZ = z + side * d / 2;
    let previous = -w / 2;
    for (const center of gates) {
      const edge = center - width / 2;
      add('port-wall', x + (previous + edge) / 2, wallZ, edge - previous, 1.1, h, color);
      add('port-lintel', x + center, wallZ, width, 1.1, h - doorHeight, color, { overhead: true, baseY: doorHeight });
      previous = center + width / 2;
    }
    add('port-wall', x + (previous + w / 2) / 2, wallZ, w / 2 - previous, 1.1, h, color);
    const wallX = x + side * w / 2;
    for (const end of [-1, 1]) {
      add('port-wall', wallX, z + end * (d + sideGate) / 4, 1.1, (d - sideGate) / 2, h, color);
    }
    add('port-lintel', wallX, z, 1.1, sideGate, h - doorHeight, color, { overhead: true, baseY: doorHeight });
  }
  add('port-roof', x, z, w + 1, d + 1, .34, color, { overhead: true, baseY: h });
  for (const box of boxes.slice(first)) box.editorParent = 'structure:' + id;
}

warehouse({ id: 'rail-freight', name: 'СКЛАД 02 · Ж/Д ГРУЗЫ', x: 55, z: -75, w: 58, d: 47, h: 10, color: '#7c8989', stock: 'racks' });
warehouse({ id: 'cargo-transit', name: 'СКЛАД 04 · ТРАНЗИТ', x: -38, z: 95, w: 48, d: 46, h: 9.2, color: '#958978', stock: 'transit' });
warehouse({ id: 'reefer-depot', name: 'СКЛАД 06 · РЕФРИЖЕРАТОРЫ', x: 77, z: 64, w: 64, d: 54, h: 11, color: '#858f81', stock: 'reefer' });

// The rack rows leave the longitudinal aisles and all side doors open.
for (const side of [-1, 1]) for (const end of [-1, 1]) {
  add('port-rack', 55 + side * 21, -75 + end * 13, 3.1, 8.1, 3.6, '#ad7741');
  add('port-rack', 77 + side * 23, 64 + end * 13, 3.4, 9.6, 4.2, '#64837e');
  add('port-rack', -38 + side * 18, 95 + end * 13, 3.1, 6.8, 2.8, '#ae8251');
}
add('port-forklift', 65, -87, 1.75, 3.6, 2.45, '#b9893e');
add('port-forklift', 67, 48, 1.75, 3.6, 2.45, '#9c7935');
add('port-forklift', -46, 83, 1.75, 3.6, 2.45, '#bd8b44');
add('crate', 47, -88, 4.4, 3.1, 1.35, '#9e8261');
add('crate', 65, -64, 4.5, 3.3, 1.4, '#9e8261');
add('crate', -27, 106, 6, 3.3, 1.35, '#9f8a69');
add('crate', -45, 107, 4.6, 4, 1.5, '#9d8765');
add('crate', 86, 77, 5.2, 4, 1.65, '#958268');
add('barrier', 89, 51, 5.5, 1.15, 1.1, '#a19d88');
for (const box of boxes) {
  const building = structures.find(({ x, z, w, d }) => Math.abs(x - box.x) < w / 2 && Math.abs(z - box.z) < d / 2);
  if (building) box.editorParent ??= 'structure:' + building.id;
}

// Export stacks around the marshalling lanes. Gaps between rows remain passable.
for (const [row, z] of [-107, -92, -76, -44, -29, -14].entries()) {
  for (const [column, x] of [-96, -72, -47, -22].entries()) {
    if ((row === 1 && column === 1) || (row === 3 && column === 2)) continue;
    const levels = 1 + (row * 3 + column * 2) % 5 % 3;
    stack(x, z, levels, row * 2 + column, false, column === 3 && row % 2 ? 6.15 : 12.2);
  }
}
for (const [i, x] of [-101, -82, -8, 14].entries()) {
  stack(x, 119, 1 + i % 3, i + 2);
  stack(x, 137, 2 - i % 2, i + 3, true);
}
for (const [x, z, levels, paint, alongZ] of [
  [-125, -126, 1, 0, true], [-124, -63, 1, 3, false], [-126, 79, 2, 4, true],
  [-113, 34, 1, 1, false], [-101, 88, 2, 0, true], [-74, 32, 2, 1, false],
  [-38, 32, 1, 0, false], [-23, 46, 2, 4, true], [-67, 56, 1, 2, false],
  [26, -120, 2, 3, false], [59, -122, 2, 0, false], [85, -120, 1, 1, false],
  [27, 107, 2, 2, true], [72, 111, 1, 0, false], [115, 102, 2, 3, true],
  [-35, 13, 1, 3, false], [28, 13, 2, 1, true], [25, -26, 1, 0, false],
  [112, -38, 2, 1, true], [111, 25, 1, 5, false],
]) stack(x, z, levels, paint, alongZ);

// Dock aprons, transfer lanes and rail sidings use one shared set of footprints.
for (const [kind, x, z, w, d, h, color] of [
  ['truck', -123, 10, 3.2, 10.4, 3.2, '#657577'],
  ['truck', -99, 67, 8.8, 3.2, 3.2, '#806c55'],
  ['truck', 14, -15, 8.9, 3.2, 3.2, '#657b75'],
  ['truck', -2, 62, 3.2, 9.1, 3.2, '#827057'],
  ['truck', 101, -105, 3.2, 8.4, 3.2, '#737e67'],
  ['truck', 33, 94, 3.2, 9, 3.2, '#567274'],
  ['barrier', -10, -12, 5.4, 1.2, 1.15, '#a19d88'],
  ['barrier', -12, 12, 4.8, 1.2, 1.15, '#a19d88'],
  ['barrier', 14, 8, 1.1, 5.4, 1.15, '#a19d88'],
  ['barrier', -106, 47, 1.1, 6.2, 1.15, '#a19d88'],
  ['barrier', -121, 65, 5.4, 1.15, 1.15, '#a19d88'],
  ['crate', -63, -63, 4.4, 3.4, 1.35, '#9d8262'],
  ['crate', -46, -54, 3.7, 3.2, 1.35, '#9d8262'],
  ['crate', -6, 15, 3, 2.8, 1.4, '#a0896b'],
  ['crate', -122, 48, 3.5, 4, 1.45, '#9a8365'],
  ['port-forklift', -27, -63, 1.75, 3.6, 2.45, '#b78540'],
  ['port-forklift', -114, 69, 1.75, 3.6, 2.45, '#b78540'],
]) add(kind, x, z, w, d, h, color);

const cranes = [
  { x: -126, z: -104, height: 28, color: '#a96735' },
  { x: -126, z: -21, height: 31, color: '#ad703a' },
  { x: -126, z: 111, height: 27, color: '#a47042' },
];
for (const [i, crane] of cranes.entries()) for (const side of [-1, 1]) for (const end of [-1, 1]) {
  add('port-crane-leg', crane.x + side * 8, crane.z + end * 7, 2.2, 2.2, crane.height, crane.color, { editorParent: 'crane:' + i });
}

const railTracks = [138, 158, -134, -118].map((x, i) => ({ x, z: 0, quayTrack: i >= 2 }));
for (const [x, z, length, paint, type] of [
  [138, -113, 19, '#7a7567', 'box'], [138, -91, 20, '#687981', 'box'],
  [138, -67, 22, '#956f56', 'flat'], [138, 64, 22, '#837259', 'box'],
  [158, -29, 23, '#607672', 'flat'], [158, -5, 20, '#777c77', 'box'],
  [158, 102, 23, '#6c786a', 'flat'], [158, 126, 20, '#8a705f', 'box'],
]) add('port-railcar', x, z, 3.5, length, type === 'box' ? 4.1 : 3.9, paint, { carType: type, editorParent: 'rail:' + (x === 138 ? 0 : 1) });

for (const side of [-1, 1]) {
  const z = side * 151;
  add('port-wall', 82, z + side * 16, 47, 1.1, 4.4, '#828986');
  add('port-wall', 109, z, 1.1, 28, 4.4, '#828986');
  stack(58, z, 2, 4, true);
  stack(74, z - side * 13, 2, 1);
  add('kiosk', 96, z - side * 14, 3.8, 4.2, 2.8, '#758381');
  add('barrier', 90, z - side * 16, 5.2, 1.2, 1.1, '#999788');
}

const roads = [
  { x: -109, z: 0, w: 12, d: 352 },
  { x: 7, z: 0, w: 13, d: 350 },
  { x: 118, z: 0, w: 12, d: 350 },
  { x: -4.5, z: -38, w: 257, d: 11 },
  { x: -2, z: 21, w: 252, d: 13 },
  { x: 4, z: -121, w: 240, d: 12 },
  { x: 3, z: 127, w: 242, d: 11 },
];
const points = [
  { id: 'A', name: 'КОНТЕЙНЕРНЫЙ ТЕРМИНАЛ', x: -57, z: -59 },
  { id: 'B', name: 'Ж/Д СКЛАД', x: 55, z: -75 },
  { id: 'C', name: 'ПЕРЕГРУЗОЧНАЯ ПЛОЩАДКА', x: 0, z: 0 },
  { id: 'D', name: 'ГРУЗОВОЙ ПРИЧАЛ', x: -117, z: 55 },
  { id: 'E', name: 'РЕФРИЖЕРАТОРНЫЙ СКЛАД', x: 77, z: 64 },
];
const landmarks = [
  { name: 'ТРАНЗИТНЫЙ СКЛАД', x: -38, z: 95 },
  { name: 'ГРУЗОВЫЕ ПУТИ', x: 150, z: 20 },
];
export const PORT_MAP = {
  id: 'port', size, name: 'Порт «Рубеж»', fogDensity: .0031, shoreX,
  boxes, structures, roads, cranes, railTracks, points, landmarks,
  ship: { x: -170, z: 36, w: 23, d: 126 },
  signs: [{ x: -142.3, z: 59, name: 'ПРИЧАЛ 03' }],
  districts: [...points, ...landmarks],
  spawns: [{ x: 82, z: 151 }, { x: 82, z: -151 }],
};
