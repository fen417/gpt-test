// One shared map and weapon catalogue for the browser and authoritative server.
export const CLASSES = {
  assault: { name: 'Штурмовик', weapon: 'AR-416', mag: 30, reserve: 150, damage: 27, interval: 0.105, spread: 0.012, speed: 6.3, range: 150 },
  medic: { name: 'Медик', weapon: 'MCX-9', mag: 32, reserve: 160, damage: 23, interval: 0.082, spread: 0.016, speed: 6.5, range: 100 },
  support: { name: 'Поддержка', weapon: 'MG-36', mag: 60, reserve: 240, damage: 25, interval: 0.115, spread: 0.021, speed: 5.8, range: 150 },
  recon: { name: 'Разведчик', weapon: 'DMR-12', mag: 12, reserve: 60, damage: 62, interval: 0.5, spread: 0.004, speed: 6.1, range: 230 },
};

const boxes = [];
const add = (x, z, w, d, h, kind = 'building', color = '#8c8678') => boxes.push({ id: `obj-${boxes.length}`, x, z, w, d, h, kind, color });
// Warehouses line a north-south avenue, with cross streets between each block.
add(-53, -65, 45, 20, 13, 'warehouse');
add(50, -65, 48, 20, 16, 'warehouse', '#6c7371');
add(-65, -30, 20, 31, 16);
add(-30, -30, 17, 22, 10, 'warehouse', '#a18d72');
add(36, -31, 36, 26, 18, 'factory', '#737d7b');
add(73, -30, 18, 32, 12);
add(-52, 9, 44, 25, 15, 'factory', '#817a6e');
add(51, 8, 42, 24, 12, 'warehouse', '#9b8d77');
add(-50, 52, 48, 27, 19, 'factory', '#75817e');
add(65, 51, 22, 26, 14);
add(26, 57, 24, 17, 10, 'warehouse', '#9c886c');
// Containers, concrete barriers, and pallets make infantry cover around objectives.
for (const [x, z, w, d, h, kind] of [
  [-44,-39,9,3,2.7,'container'],[-46,-26,3,6,2.3,'container'],
  [-16,-49,4,8,1.2,'barrier'],[13,-44,3,7,1.2,'barrier'],
  [-11,-15,3,7,1.2,'barrier'],[12,14,3,7,1.2,'barrier'],
  [-6,4,5,1.2,1.1,'barrier'],[6,-5,5,1.2,1.1,'barrier'],
  [22,30,9,3,2.7,'container'],[49,35,3,7,2.7,'container'],
  [36,44,6,2,1.1,'barrier'],[-20,27,3,9,1.1,'barrier'],
  [-4,49,5,2,1.1,'barrier'],[9,69,3,8,1.1,'barrier'],
  [-64,30,7,3,2.5,'container'],[74,-6,7,3,2.5,'container'],
  [-17,-70,2,2,1.2,'crate'],[18,-7,2,2,1.2,'crate'],
  [-13,11,2,2,1.2,'crate'],[30,38,2,2,1.2,'crate'],
]) add(x,z,w,d,h,kind,kind==='container'?'#596e6b':'#aaa28d');

export const MAP = {
  size: 200,
  name: 'Промзона «Рубеж»',
  boxes,
  points: [
    { id: 'A', name: 'СКЛАДЫ', x: -43, z: -34 },
    { id: 'B', name: 'ПЕРЕКРЁСТОК', x: 0, z: 0 },
    { id: 'C', name: 'ТЕРМИНАЛ', x: 38, z: 33 },
  ],
  spawns: [{ x: 0, z: 82 }, { x: 0, z: -82 }],
};

export const PLAYER_RADIUS = 0.4;
export const EYE_HEIGHT = 1.65;
export const CAPTURE_RADIUS = 11;
