import {makeTerrain} from '../terrain.js';
import {registerLocalMap} from '../world.js';

// X east, +Z north in the mission document; the compass for this map follows it.
const boxes=[],structures=[],roads=[],size=480;
const landforms=[
  {x:-80,z:-30,rx:57,rz:44,height:12,flat:.25},
  {x:-193,z:-125,rx:28,rz:81,height:-3.8,flat:.4,angle:-.65},
  {x:70,z:38,rx:94,rz:12,height:-2.8,flat:.45,angle:-.3},
  ...[-1,1].flatMap(side=>[-160,-80,0,80,155].map((z,i)=>({x:side*(215+i%2*10),z,rx:38,rz:45,height:8+i%3*3,flat:.12}))),
];
const pads=[{x:20,z:30,w:75,d:65,height:0,blend:12},{x:150,z:105,w:126,d:116,height:0,blend:14}];
const terrain=makeTerrain(size,landforms,4,pads);
function add(kind,x,z,w,d,h,color='#bba17c',extra={}){
  const b={id:`alhadra-${boxes.length}`,kind,x,z,w,d,h,color,baseY:terrain.heightAt(x,z),...extra};boxes.push(b);return b;
}
function house(id,x,z,w=12,d=10,h=4.1){
  // Both north and south entrances have 2.6 m clearance, shared collision/visuals.
  const part={assetMapId:'village'};
  add('village-wall',x-w/2,z,.42,d,h,'#c9b28b',part);
  add('village-wall',x+w/2,z,.42,d,h,'#c9b28b',part);
  for(const side of [-1,1]){
    const gap=2.6,segment=(w-gap)/2;
    for(const dir of [-1,1])add('village-wall',x+dir*(gap/2+segment/2),z+side*d/2,segment,.42,h,'#d4bf98',part);
    add('village-wall',x,z+side*d/2,gap,.42,h-2.5,'#c6ad86',{...part,baseY:2.5});
  }
  add('village-floor',x,z,w+.5,d+.5,.22,'#bba684',{...part,baseY:h,overhead:true});
  return {id,x,z,w,d,h};
}
const homes=[];
for(const [i,[x,z]] of [[107,66],[128,66],[153,66],[179,66],[107,91],[181,91],[107,117],[181,117],[107,143],[130,143],[154,143],[181,143],[204,119]].entries())homes.push(house(`home-${i}`,x,z));
const school=house('school',150,105,18,16,4.8);homes.push(school);
add('generator',151,108,1.5,.7,1.1,'#5a685c');
add('pillar',159,110,.18,.18,12,'#6c756d');
// Well, fences, palms, a perimeter with broad gates.
add('sandbags',139,119,4,1.1,.9);add('village-well',137,103,3,3,2,'#b7a17d',{assetMapId:'village'});
for(const z of [79,131])for(const x of [118,164,194])add('wall',x,z,10,.45,1.4);
for(let i=0;i<16;i++)add('village-palm',69+i%4*8,54+Math.floor(i/4)*10,.65,.65,6.5,'#8d805a',{assetMapId:'village'});
// Ridge trench and two MG positions; sides leave an unblocked rear approach.
for(const x of [-88,-75])add('sandbags',x,-38,7,1,.95);
add('sandbags',-95,-29,1,15,1.1);add('tent',-78,-18,7,5,2.5);
for(const x of [1,20,39])add('tent',x,48,11,8,3.2);
for(const x of [0,21,42])add('truck',x,24,3,7,2.7,'#576354',{campaignDestructible:true});
for(let i=0;i<8;i++)add('village-barrels',9+i%4*3.6,33+Math.floor(i/4)*4,1.1,1.1,1.35,'#815e3e',{assetMapId:'village',campaignFuel:i,campaignDestructible:true});
for(const x of [-16,52])for(let z=10;z<=50;z+=10)add('sandbags',x,z,1,7,.95);
add('crate',14,44,6,3,2);add('crate',32,12,6,2,1.3);
add('truck',-212,-149,3,7,2.5,'#5c5549');
add('truck',200,147,3,7,2.7,'#586953');
for(let i=0;i<3;i++)add('wall',-206+i*8,-126+i*11,7,.8,.6,'#776b54');
// Cover at approximately ten metre intervals along each authored route.
export const ROUTES={
  wadi:[[-200,-140],[-183,-118],[-161,-100],[-143,-81],[-120,-61],[-103,-37],[-80,-30]],
  bank:[[-200,-140],[-214,-112],[-198,-83],[-157,-55],[-120,-26],[-95,-17],[-80,-30]],
  rocks:[[-200,-140],[-175,-151],[-140,-122],[-120,-102],[-86,-89],[-65,-58],[-80,-30]],
  dunes:[[-80,-30],[-64,-6],[-45,14],[-26,40],[0,57],[20,56]],
  road:[[-80,-30],[-47,-16],[-17,8],[20,15]],
  trench:[[-80,-30],[-71,-52],[-43,-40],[-15,-18],[17,2],[37,13]],
  grove:[[20,30],[52,46],[73,65],[91,78],[128,87]],
  channel:[[20,30],[48,7],[79,17],[113,31],[149,39],[164,52],[164,92]],
  wall:[[20,30],[46,60],[61,85],[81,107],[126,116]],
};
for(const [name,path] of Object.entries(ROUTES))for(let i=1;i<path.length;i++){
  const a=path[i-1],b=path[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
  if(name==='road')continue;
  for(let t=0;t<length;t+=10){const f=t/length;add('sandbags',a[0]+(b[0]-a[0])*f+4,a[1]+(b[1]-a[1])*f-4,3,1.4,1.05);}
}
const landmarks=[{id:'wadi',name:'Сухое русло',x:-200,z:-140},{id:'ridge',name:'Наблюдательный пост',x:-80,z:-30},{id:'depot',name:'Тыловой склад',x:20,z:30},{id:'village',name:'Аль-Хадра',x:150,z:105},{id:'exit',name:'Восточная дорога',x:200,z:140}];
export const ALHADRA=registerLocalMap({
  id:'alhadra',name:'Аль-Хадра',theme:'desert-village',campaign:true,size,width:480,depth:360,
  playArea:{minX:-240,maxX:240,minZ:-180,maxZ:180},navigationCell:2,stepHeight:.45,
  fogDensity:.008,fogColor:'#101b30',sunColor:'#a8c9ef',terrain,landforms,terrainPads:pads,
  terrainPadBlend:4,boxes,structures,roads,points:[],landmarks,districts:landmarks,homes,school,
  spawns:[{x:-200,z:-140},{x:210,z:155}],vehicleSpawns:[],signs:[],
});
