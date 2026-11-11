// The same geometry drives rendering, navigation, and server collision.
export const PROTOCOL_VERSION=2;
export const WEAPONS = {
  ar416: { id: 'ar416', classId: 'assault', weapon: 'AR-416', type: 'ШТУРМОВАЯ ВИНТОВКА', mag: 30, reserve: 150, damage: 27, interval: .105, spread: .012, recoil: .019, reload: 2, speed: 6.3, range: 150 },
  ak12:  { id: 'ak12',  classId: 'assault', weapon: 'АК-12М', type: 'ТЯЖЁЛЫЙ АВТОМАТ',   mag: 30, reserve: 150, damage: 33, interval: .125, spread: .014, recoil: .024, reload: 2.15, speed: 6.15, range: 165 },
  mcx9:  { id: 'mcx9',  classId: 'medic',   weapon: 'MCX-9',  type: 'КАРАБИН / ПП',      mag: 32, reserve: 160, damage: 23, interval: .082, spread: .016, recoil: .012, reload: 2, speed: 6.5, range: 100 },
  vk45:  { id: 'vk45',  classId: 'medic',   weapon: 'ВК-45 «Шквал»', type: 'ТАКТИЧЕСКИЙ ПП С ПБС', mag: 40, reserve: 160, damage: 20, interval: .066, spread: .014, recoil: .009, reload: 1.85, speed: 6.65, range: 92 },
  mg36:  { id: 'mg36',  classId: 'support', weapon: 'MG-36',  type: 'РУЧНОЙ ПУЛЕМЁТ',    mag: 60, reserve: 240, damage: 25, interval: .115, spread: .021, recoil: .025, reload: 3.1, speed: 5.8, range: 150 },
  pkp:   { id: 'pkp',   classId: 'support', weapon: 'ПКП «Печенег»', type: 'ЕДИНЫЙ ПУЛЕМЁТ', mag: 100, reserve: 200, damage: 31, interval: .132, spread: .023, recoil: .029, reload: 3.6, speed: 5.55, range: 175 },
  dmr12: { id: 'dmr12', classId: 'recon',   weapon: 'DMR-12', type: 'МАРКСМАНСКАЯ ВИНТОВКА', mag: 12, reserve: 60, damage: 62, interval: .5, spread: .004, recoil: .043, reload: 2, semiAuto: true, speed: 6.1, range: 230 },
  sv98:  { id: 'sv98',  classId: 'recon',   weapon: 'СВ-98М', type: 'СНАЙПЕРСКАЯ ВИНТОВКА',  mag: 8, reserve: 40, damage: 92, interval: .88, spread: .002, recoil: .058, reload: 2.45, semiAuto: true, speed: 5.9, range: 280 },
};
export const CLASS_WEAPONS = {
  assault: ['ar416', 'ak12'],
  medic: ['mcx9', 'vk45'],
  support: ['mg36', 'pkp'],
  recon: ['dmr12', 'sv98'],
};
export const CLASSES = {
  assault: { name: 'Штурмовик', weapon: 'AR-416', weaponId: 'ar416', weapons: CLASS_WEAPONS.assault, mag: 30, reserve: 150, damage: 27, interval: .105, spread: .012, recoil: .019, reload: 2, speed: 6.3, range: 150 },
  medic: { name: 'Медик', weapon: 'MCX-9', weaponId: 'mcx9', weapons: CLASS_WEAPONS.medic, mag: 32, reserve: 160, damage: 23, interval: .082, spread: .016, recoil: .012, reload: 2, speed: 6.5, range: 100 },
  support: { name: 'Поддержка', weapon: 'MG-36', weaponId: 'mg36', weapons: CLASS_WEAPONS.support, mag: 60, reserve: 240, damage: 25, interval: .115, spread: .021, recoil: .025, reload: 3.1, speed: 5.8, range: 150 },
  recon: { name: 'Разведчик', weapon: 'DMR-12', weaponId: 'dmr12', weapons: CLASS_WEAPONS.recon, mag: 12, reserve: 60, damage: 62, interval: .5, spread: .004, recoil: .043, reload: 2, semiAuto: true, speed: 6.1, range: 230 },
};
export function defaultWeaponId(classId = 'assault') {
  return CLASS_WEAPONS[classId]?.[0] ?? 'ar416';
}
export function getWeapon(classId = 'assault', weaponId = '') {
  const validClass = Object.hasOwn(CLASSES, classId) ? classId : 'assault';
  if (weaponId && Object.hasOwn(WEAPONS, weaponId) && WEAPONS[weaponId].classId === validClass) {
    return WEAPONS[weaponId];
  }
  return WEAPONS[defaultWeaponId(validClass)] ?? CLASSES[validClass];
}
export const DIFFICULTIES = {
  recruit: { name: 'Новобранец', awareness: 43, reaction: .85, reactionVariance: .35, turnSpeed: 1.8, aimError: .031, burst: .28, pause: .95 },
  regular: { name: 'Обычная', awareness: 55, reaction: .58, reactionVariance: .3, turnSpeed: 2.4, aimError: .021, burst: .38, pause: .72 },
  veteran: { name: 'Ветеран', awareness: 66, reaction: .36, reactionVariance: .18, turnSpeed: 3.2, aimError: .012, burst: .5, pause: .48 },
};
const boxes=[],structures=[];
const add=(x,z,w,d,h,kind='building',color='#8c8678')=>boxes.push({id:`obj-${boxes.length}`,x,z,w,d,h,kind,color});
const warehouse=(id,x,z,w,d,h,color='#8c9188')=>{
  structures.push({id,x,z,w,d,h,kind:'open-warehouse',color,roof:true});
  const door=18,side=(w-door)/2;
  for(const sideZ of [-1,1])for(const sideX of [-1,1])add(x+sideX*(door/2+side/2),z+sideZ*d/2,side,1.2,h,'wall',color);
  for(const sign of [-1,1])add(x+sign*w/2,z,1.2,d,h,'wall',color);
  for(const dx of [-w/2+2,w/2-2])for(const dz of [-d/2+2,d/2-2])add(x+dx,z+dz,.9,.9,h,'pillar','#515c5b');
};
// Base blocks, peripheral streets, and the main north-south avenue.
// Roads: Main avenue x in [-12, 12]; Cross streets z in [-110, -40, 0, 40, 110] (width 15, i.e. z ± 7.5).
// All buildings are placed strictly inside city blocks, leaving streets and intersections clear.
for(const z of [-145,145]){
  add(-82,z,72,26,14,'warehouse','#747e7b');
  add(84,z,72,26,17,'factory','#8f8c7e');
  // Spawn protection command bunkers & side depots near HQ (0, ±150)
  add(-26,z,16,12,6,'building','#7d8581');
  add(26,z,16,12,6,'building','#7d8581');
}
// Outer West & East perimeter industrial blocks (strictly between cross streets)
for(const x of [-146,146]){
  const tone=x<0?'#85816f':'#747f7a';
  add(x,-75,28,36,15,'building',tone);
  add(x,-20,26,16,18,'building',tone);
  add(x,20,26,16,18,'building',tone);
  add(x,75,28,36,15,'building',tone);
}
// Central blocks flanking Plaza C (z in [-32..-9] and [+9..+32], completely clear of z=0 and z=±40 streets)
add(-64,-21,36,18,17,'factory','#8e8677');
add(64,-21,36,18,18,'factory','#7b8985');
add(-64,21,36,18,16,'factory','#868173');
add(64,21,36,18,19,'factory','#778581');
add(-104,21,28,16,11,'warehouse','#9d8b73');
add(104,-21,28,16,12,'warehouse','#9a917d');
add(-104,-21,24,14,10,'warehouse','#888b7f');
add(104,21,24,14,10,'warehouse','#838c86');
// Inner tactical buildings overlooking Central Avenue and Plaza C
add(-27,-21,16,14,12,'building','#85867b');
add(27,21,16,14,12,'building','#78827b');
add(-27,21,14,12,9,'warehouse','#8a8779');
add(27,-21,14,12,9,'warehouse','#7d8882');
// Mid-sector support buildings between Avenue and Warehouses (z = ±75 block)
add(-32,-75,18,28,12,'building','#85867b');
add(30,75,18,28,13,'building','#78827b');
add(-30,75,16,20,9,'warehouse','#898578');
add(28,-75,16,20,9,'warehouse','#7c8782');
// Enterable warehouses in the z = ±75 blocks (completely clear of z = ±40 and z = ±110 streets)
warehouse('rail-hangar',72,-75,56,36,10,'#8d9389');
warehouse('port-depot',-78,75,58,36,10,'#8c897b');
warehouse('repair-bay',86,75,46,34,9,'#738884');
// Container Yard A (-88, -75) — multi-lane shipping container maze inside z in [-98..-52]
for(const [x,z,w,d,c]of [
  [-114,-90,16,4.5,'#5c7c7b'],[-114,-62,16,4.5,'#68827d'],[-62,-90,14,4.5,'#5c7c7b'],[-62,-62,14,4.5,'#68827d'],
  [-104,-75,4.5,11,'#7b6d54'],[-72,-75,4.5,11,'#607d7c'],[-88,-94,11,4.2,'#6b8280'],[-88,-56,11,4.2,'#7b6d54'],
  // Port D (-78, 75) & Repair E (86, 75) outer container stacks (strictly inside z in [52..98])
  [118,62,5,16,'#837656'],[118,88,5,16,'#687f7c'],[54,60,5,12,'#837656'],[54,90,5,12,'#687f7c'],
  [-116,60,5,14,'#837656'],[-116,90,5,14,'#607d7c'],[-44,60,5,12,'#837656'],[-44,90,5,12,'#607d7c'],
  [114,-90,5,14,'#607d7c'],[114,-60,5,14,'#7b6d54'],
  // Roadside & courtyard cargo containers (clear of avenue center and cross-street lanes)
  [-46,-96,12,4.5,'#607d7c'],[46,-96,12,4.5,'#7b6d54'],[-46,96,12,4.5,'#837656'],[46,96,12,4.5,'#607d7c'],
  [-86,-126,14,4.8,'#607d7c'],[86,-126,14,4.8,'#7b6d54'],[-86,126,14,4.8,'#837656'],[86,126,14,4.8,'#607d7c'],
])add(x,z,w,d,2.8,'container',c);
// Interior cover inside enterable warehouses (leaves a wide central navigation lane)
for(const [cx,cz]of [[72,-75],[-78,75],[86,75]])for(const sign of [-1,1]){
  add(cx+sign*14,cz-8,6,3,1.35,'crate','#9c8968');
  add(cx+sign*14,cz+8,6,3,1.35,'crate','#9c8968');
  add(cx+sign*11,cz,2.2,4.5,1.2,'barrier','#a5a38e');
}
// Central Plaza C (0, 0) fortification ring — tactical cover around the flag without blocking roads or nav cells
for(const [x,z,w,d]of [
  [-9,-9,5,1.2],[9,9,5,1.2],[-9,9,5,1.2],[9,-9,5,1.2],
  [-15,-9,1.4,5],[15,9,1.4,5],[-9,15,5,1.4],[9,-15,5,1.4],
  [-20,12,3,6],[20,-12,3,6],[-20,-12,3,6],[20,12,3,6],
])add(x,z,w,d,1.2,'barrier','#aaa38e');

// Central Avenue (x in [-12, 12]) anti-sniper sightline blockers:
// Vehicle pileups (trucks & crashed cars), military tents, sandbag positions, checkpoint booths & generators.
// Note: (x=0, z in [5..35]) and (x in [0..5], z in [125..131]) are kept clear in the exact center lane.
for(const [x,z,w,d,h,kind,color]of [
  // North avenue vehicle pileup & military checkpoint (blocks x=0 sightline north of C)
  [0,-19,7.5,3.1,3.2,'truck','#5f7268'],
  [-5.5,-27,2.3,4.6,1.65,'car','#895547'],
  [5.2,-29,4.5,2.2,1.65,'car','#586b73'],
  [0,-52,5.6,7.2,3.2,'tent','#6c785e'],
  [-6.2,-64,3.1,8.2,3.2,'truck','#7a6c55'],
  [5.8,-68,2.3,4.6,1.65,'car','#6c7378'],
  [0,-84,7.4,3.1,3.2,'truck','#54686e'],
  [-5.5,-96,5.2,6.4,3.1,'tent','#737b63'],
  [5.5,-100,2.8,2.8,2.9,'kiosk','#667577'],
  [0,-120,4.6,2.3,1.65,'car','#7e5d4c'],
  [-6,-132,3.1,7.8,3.2,'truck','#63736b'],
  // Mid-south avenue flanking wrecks & tents (z in [12..34] flanks x=0, then z >= 48 blocks x=0)
  [-6.2,18,2.3,4.6,1.65,'car','#7d5649'],
  [6.2,24,3.1,7.8,3.2,'truck','#5b6e72'],
  [0,50,7.6,3.1,3.2,'truck','#6e6957'],
  [-5.6,62,5.4,6.8,3.2,'tent','#69775d'],
  [5.8,64,2.3,4.6,1.65,'car','#4e6168'],
  [0,82,5.6,7.2,3.2,'tent','#767960'],
  [-5.8,94,3.1,8.0,3.2,'truck','#576d6b'],
  [5.6,96,4.5,2.2,1.65,'car','#886652'],
  [0,118,7.4,3.1,3.2,'truck','#627074'],
  [-6.5,128,2.8,2.8,2.9,'kiosk','#667577'],
  [6.5,134,2.3,4.6,1.65,'car','#5c6970'],
  // Cross-street vehicle accidents, military tents, fuel tanks & generators
  [-38,-40,7.5,3.1,3.2,'truck','#68746d'],
  [38,40,7.5,3.1,3.2,'truck','#756b58'],
  [-40,0,5.4,6.6,3.2,'tent','#6b775d'],
  [40,0,5.4,6.6,3.2,'tent','#747961'],
  [-66,-40,4.5,2.2,1.65,'car','#82584b'],
  [66,-40,2.3,4.5,1.65,'car','#586b72'],
  [-66,40,2.3,4.5,1.65,'car','#697176'],
  [66,40,4.5,2.2,1.65,'car','#84644f'],
  [-50,-110,7.2,3.0,3.2,'truck','#5a6d70'],
  [50,110,7.2,3.0,3.2,'truck','#726956'],
  // Industrial fuel tanks, generators & checkpoints in sector courtyards
  [-128,-21,6.4,3.2,3.0,'fueltank','#7d8584'],
  [128,21,6.4,3.2,3.0,'fueltank','#7d8584'],
  [-128,21,3.2,6.4,3.0,'fueltank','#847d72'],
  [128,-21,3.2,6.4,3.0,'fueltank','#847d72'],
  [-48,-75,6.2,3.1,3.0,'fueltank','#7a8482'],
  [48,75,6.2,3.1,3.0,'fueltank','#7a8482'],
  [-18,-58,2.2,3.2,2.4,'generator','#b59449'],
  [18,58,2.2,3.2,2.4,'generator','#b59449'],
  [-18,0,2.2,3.2,2.4,'generator','#b59449'],
  [18,0,2.2,3.2,2.4,'generator','#b59449'],
  [-36,-75,5.6,6.8,3.2,'tent','#6c785e'],
  [36,75,5.6,6.8,3.2,'tent','#757960'],
])add(x,z,w,d,h,kind,color);

// Fortified sandbag positions along avenue medians, intersections and capture approaches
for(const [x,z,w,d]of [
  [-10.5,-132,2.4,5.2],[10.5,-116,2.4,5.2],[-10.5,-76,2.4,5.2],[10.5,-48,2.4,5.2],
  [-10.5,-16,2.4,4.8],[10.5,-16,2.4,4.8],[-10.5,16,2.4,4.8],[10.5,16,2.4,4.8],
  [-10.5,48,2.4,5.2],[10.5,76,2.4,5.2],[-10.5,116,2.4,5.2],[10.5,132,2.4,5.2],
  [-4.2,-38,4.4,1.5],[4.2,38,4.4,1.5],[-4.2,-106,4.4,1.5],[4.2,106,4.4,1.5],
  [-48,-62,4.2,1.5],[-48,-88,4.2,1.5],[62,-64,4.2,1.5],[82,-86,4.2,1.5],
  [-88,64,4.2,1.5],[-68,86,4.2,1.5],[76,64,4.2,1.5],[96,86,4.2,1.5],
])add(x,z,w,d,1.2,'sandbags','#9d9276');

// Urban trees in concrete planters along the main avenue, Plaza C, cross streets and sector courtyards
for(const [x,z]of [
  [-11.2,-104],[11.2,-104],[-11.2,-88],[11.2,-88],[-11.2,-58],[11.2,-58],[-11.2,-32],[11.2,-32],
  [-11.2,32],[11.2,32],[-11.2,58],[11.2,58],[-11.2,88],[11.2,88],[-11.2,104],[11.2,104],
  [-18,-18],[18,-18],[-18,18],[18,18],
  [-34,-32],[34,-32],[-34,32],[34,32],[-76,-32],[76,-32],[-76,32],[76,32],
  [-58,-92],[58,-92],[-58,92],[58,92],[-102,-48],[102,-48],[-102,48],[102,48],
  [-36,-118],[36,-118],[-36,118],[36,118],[-72,-118],[72,-118],[-72,118],[72,118],
])add(x,z,1.8,1.8,4.6,'tree','#586e4c');

// Cross-street tactical barriers & checkpoints along z = -110, -40, 0, 40, 110
for(const [x,z]of [
  [-24,-40],[24,-40],[-52,-40],[52,-40],[-84,-40],[84,-40],[-118,-40],[118,-40],
  [-24,40],[24,40],[-52,40],[52,40],[-84,40],[84,40],[-118,40],[118,40],
  [-26,0],[26,0],[-54,0],[54,0],[-84,0],[84,0],[-116,0],[116,0],
  [-30,-110],[30,-110],[-68,-110],[68,-110],[-98,-110],[98,-110],
  [-30,110],[30,110],[-68,110],[68,110],[-98,110],[98,110],
])add(x,z+(x%4===0?4.2:-4.2),6.5,1.2,1.15,'barrier','#a7a28f');

// Sidewalk & alley cover crates, barriers, and industrial equipment across all sectors
for(const [x,z,w,d,h,kind]of [
  [-88,-68,2.8,2.4,1.4,'crate'],[-88,-82,2.8,2.4,1.4,'crate'],
  [-50,-52,3.2,3.2,1.4,'crate'],[50,-52,3.2,3.2,1.4,'crate'],[-50,52,3.2,3.2,1.4,'crate'],[50,52,3.2,3.2,1.4,'crate'],
  [-44,-21,3,5,1.25,'barrier'],[44,-21,3,5,1.25,'barrier'],[-44,21,3,5,1.25,'barrier'],[44,21,3,5,1.25,'barrier'],
  [-84,-21,3.4,3.4,1.45,'crate'],[84,-21,3.4,3.4,1.45,'crate'],[-84,21,3.4,3.4,1.45,'crate'],[84,21,3.4,3.4,1.45,'crate'],
  [-124,-52,3.2,3.2,1.4,'crate'],[124,-52,3.2,3.2,1.4,'crate'],[-124,52,3.2,3.2,1.4,'crate'],[124,52,3.2,3.2,1.4,'crate'],
  [-16,136,6,1.4,1.2,'barrier'],[16,136,6,1.4,1.2,'barrier'],[-16,-136,6,1.4,1.2,'barrier'],[16,-136,6,1.4,1.2,'barrier'],
  [-42,-126,3.5,3.5,1.4,'crate'],[42,-126,3.5,3.5,1.4,'crate'],[-42,126,3.5,3.5,1.4,'crate'],[42,126,3.5,3.5,1.4,'crate'],
  [-118,-126,12,9,4.5,'warehouse'],[118,126,12,9,4.5,'warehouse'],[-118,126,12,9,4.5,'warehouse'],[118,-126,12,9,4.5,'warehouse'],
])add(x,z,w,d,h,kind,kind==='crate'?'#9f8a67':kind==='barrier'?'#a6a18e':'#8a9387');
export const MAP={
  size:360,name:'Портовый район «Рубеж»',boxes,structures,
  districts:[
    {id:'yard',name:'КОНТЕЙНЕРНЫЙ ДВОР',x:-88,z:-75},
    {id:'rail',name:'ЖЕЛЕЗНОДОРОЖНЫЙ СКЛАД',x:72,z:-75},
    {id:'plaza',name:'ПРОМЫШЛЕННАЯ ПЛОЩАДЬ',x:0,z:0},
    {id:'port',name:'ПОРТОВЫЙ ТЕРМИНАЛ',x:-78,z:75},
    {id:'repair',name:'РЕМОНТНОЕ ДЕПО',x:86,z:75},
  ],
  points:[
    {id:'A',name:'КОНТЕЙНЕРЫ',x:-88,z:-75},
    {id:'B',name:'Ж/Д СКЛАД',x:72,z:-75},
    {id:'C',name:'ПЛОЩАДЬ',x:0,z:0},
    {id:'D',name:'ПОРТ',x:-78,z:75},
    {id:'E',name:'ДЕПО',x:86,z:75},
  ],
  spawns:[{x:0,z:150},{x:0,z:-150}],
};
export const PLAYER_RADIUS=.4;
export const EYE_HEIGHT=1.65;
export const CAPTURE_RADIUS=12;
