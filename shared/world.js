// The same geometry drives rendering, navigation, and server collision.
export const PROTOCOL_VERSION=2;
export const CLASSES = {
  assault: { name: 'Штурмовик', weapon: 'AR-416', mag: 30, reserve: 150, damage: 27, interval: 0.105, spread: 0.012, speed: 6.3, range: 150 },
  medic: { name: 'Медик', weapon: 'MCX-9', mag: 32, reserve: 160, damage: 23, interval: 0.082, spread: 0.016, speed: 6.5, range: 100 },
  support: { name: 'Поддержка', weapon: 'MG-36', mag: 60, reserve: 240, damage: 25, interval: 0.115, spread: 0.021, speed: 5.8, range: 150 },
  recon: { name: 'Разведчик', weapon: 'DMR-12', mag: 12, reserve: 60, damage: 62, interval: 0.5, spread: 0.004, speed: 6.1, range: 230 },
};
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
for(const z of [-145,145]){
  add(-82,z,76,28,14,'warehouse','#747e7b');
  add(84,z,76,28,17,'factory','#8f8c7e');
}
for(const x of [-145,145])for(const z of [-77,0,77])add(x,z,30,38,15+(z===0?5:0),'building',x<0?'#85816f':'#747f7a');
add(-66,-8,38,40,17,'factory','#8e8677');
add(65,4,40,38,19,'factory','#7b8985');
add(-101,35,35,19,11,'warehouse','#9d8b73');
add(102,-33,32,18,12,'warehouse','#9a917d');
add(-35,-72,23,35,12,'building','#85867b');
add(31,76,20,32,14,'building','#78827b');
// Enterable warehouses: actual wall colliders below, decorative roofs above.
warehouse('rail-hangar',72,-78,60,42,10,'#8d9389');
warehouse('port-depot',-78,78,64,44,10,'#8c897b');
warehouse('repair-bay',88,78,46,38,8,'#738884');
// Container rows preserve broad infantry flanks around both yards.
for(const [x,z,w,d]of [
  [-116,-94,20,5],[-116,-70,20,5],[-62,-94,16,5],[-62,-70,16,5],
  [-104,-109,5,12],[-78,-110,5,12],[-104,-55,5,12],[-78,-55,5,12],
  [119,64,5,20],[119,89,5,15],[61,63,5,16],[61,94,5,12],
  [-112,61,5,12],[-112,92,5,12],[-45,62,5,12],[-45,94,5,12],
])add(x,z,w,d,2.8,'container',z<0?'#607d7c':'#837656');
// Interior cover leaves a clear straight spine through each warehouse.
for(const [cx,cz]of [[72,-78],[-78,78],[88,78]])for(const sign of [-1,1]){
  add(cx+sign*14,cz-8,6,3,1.3,'crate','#9c8968');
  add(cx+sign*14,cz+8,6,3,1.3,'crate','#9c8968');
}
// Roadside concrete islands break long sightlines without blocking the road.
for(const z of [-122,-98,-54,-24,25,54,101,125]){
  add(-13,z,3,7,1.15,'barrier','#a5a38e');
  add(13,z+5,3,7,1.15,'barrier','#a5a38e');
}
for(const [x,z]of [[-27,-40],[28,-40],[-29,40],[28,40],[-52,-110],[52,110],[-100,-40],[103,40]])add(x,z,7,1.2,1.1,'barrier','#a7a28f');
for(const [x,z,w,d]of [[-8,-9,5,1.2],[8,9,5,1.2],[-20,13,3,6],[20,-13,3,6]])add(x,z,w,d,1.1,'barrier','#aaa38e');
for(const [x,z]of [[-55,-42],[53,40],[-118,8],[116,-9],[-30,-118],[31,118],[-72,-25],[72,29],[-105,112],[105,-113]])add(x,z,3,3,1.35,'crate','#9f8a67');
for(const [x,z]of [[-117,-126],[116,125],[-118,125],[117,-125]])add(x,z,10,8,4,'warehouse','#8a9387');
export const MAP={
  size:360,name:'Портовый район «Рубеж»',boxes,structures,
  districts:[
    {id:'yard',name:'КОНТЕЙНЕРНЫЙ ДВОР',x:-88,z:-82},
    {id:'rail',name:'ЖЕЛЕЗНОДОРОЖНЫЙ СКЛАД',x:72,z:-78},
    {id:'plaza',name:'ПРОМЫШЛЕННАЯ ПЛОЩАДЬ',x:0,z:0},
    {id:'port',name:'ПОРТОВЫЙ ТЕРМИНАЛ',x:-78,z:78},
    {id:'repair',name:'РЕМОНТНОЕ ДЕПО',x:86,z:78},
  ],
  points:[
    {id:'A',name:'КОНТЕЙНЕРЫ',x:-88,z:-82},
    {id:'B',name:'Ж/Д СКЛАД',x:72,z:-78},
    {id:'C',name:'ПЛОЩАДЬ',x:0,z:0},
    {id:'D',name:'ПОРТ',x:-78,z:78},
    {id:'E',name:'ДЕПО',x:86,z:78},
  ],
  spawns:[{x:0,z:150},{x:0,z:-150}],
};
export const PLAYER_RADIUS=.4;
export const EYE_HEIGHT=1.65;
export const CAPTURE_RADIUS=12;
