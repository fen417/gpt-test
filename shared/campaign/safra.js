import {makeTerrain} from '../terrain.js';
import {rotateMapAssets} from '../geometry.js';
import {registerLocalMap} from '../world.js';

export const SAFRA_NEST={x:70,z:-10};
export const SAFRA_GUN={x:74.8,z:-10};
export const SAFRA_MINES=[
  {id:'west',x:-174,z:-94,w:43,d:28},
  {id:'east',x:112,z:84,w:36,d:24},
];
export const SAFRA_SAPPERS=[[13,1.6],[24,-1.6],[38,1.65]];
export const SAFRA_SLABS=['breastwork-0','breastwork-1','breastwork-2'];
export const SAFRA_WATER={x:0,z:0,w:60,d:498,y:-.36};
const landforms=[
  {x:-323,z:38,rx:48,rz:36,height:-2.7,flat:.33},
  {x:-220,z:-23,rx:65,rz:42,height:8,flat:.23},
  {x:70,z:-10,rx:37,rz:34,height:3,flat:.38},
  {x:133,z:-116,rx:104,rz:27,height:-2.25,flat:.25},
  {x:100,z:117,rx:90,rz:32,height:-2.8,flat:.3},
  {x:-119,z:70,rx:24,rz:19,height:-1.2,flat:.3},
  {x:-238,z:155,rx:116,rz:69,height:19,flat:.1},
  {x:-133,z:-174,rx:125,rz:48,height:17,flat:.12},
  {x:229,z:138,rx:118,rz:74,height:13,flat:.08},
  {x:243,z:-161,rx:117,rz:60,height:16,flat:.12},
];
for(let i=0;i<18;i++)landforms.push({x:-182+(i%6)*23,z:-62+Math.floor(i/6)*57+(i%3)*6,
  rx:4.2+i%3,rz:5.1,height:-.65-(i%3)*.23,flat:.2});
const terrain=makeTerrain(768,landforms,2,[
  {x:0,z:0,w:60,d:768,height:-.76,blend:5},
  {x:0,z:0,w:86,d:6,height:.34,blend:2},
  {x:70,z:-10,w:14,d:10,height:3,blend:5},
  {x:66,z:-2,w:20,d:3,height:1.85,blend:3},
  {x:66,z:-19,w:19,d:3,height:1.85,blend:3},
]);
const boxes=[];
function part(id,kind,x,z,w,d,h,color,extra={}){
  const box={id,kind,x,z,w,d,h,color,assetMapId:'village',baseY:terrain.heightAt(x,z),...extra};
  boxes.push(box);return box;
}
const stone=(...args)=>part(args[0],'village-stone',...args.slice(1));
const metal=(...args)=>part(args[0],'village-metal',...args.slice(1));
for(const side of [-1,1]){
  const z=side*3.05;
  metal(`bridge-rail-${side}`,0,z,90,.23,.38,'#61605a',{baseY:.27});
  metal(`bridge-chord-${side}`,0,z,90,.23,.24,'#777367',{baseY:4.62,noCollision:true});
  for(let i=0;i<=12;i++){
    const x=-45+i*7.5;
    metal(`bridge-post-${side}-${i}`,x,z,.25,.27,4.38,'#797467',{baseY:.49,noCollision:true});
    if(i===12)continue;
    metal(`bridge-truss-${side}-${i}`,x+3.75,z,8.55,.20,.20,'#777061',
      {baseY:2.58,noCollision:true,modelRotation:{z:(i%2?-1:1)*.48}});
  }
}
for(const x of [-30,-11,11,30]){
  stone(`pier-${x}`,x,0,3.8,8.1,1,'#998574',{baseY:-.76,noCollision:true});
  metal(`bridge-crossmember-${x}`,x,0,.28,6.4,.25,'#757162',{baseY:4.54,noCollision:true});
}
metal('deck',0,0,90,6,.09,'#6f6a5a',{baseY:.27,noCollision:true});
for(const [i,x,z] of [[0,-27,1.9],[1,-6,-1.8],[2,18,1.9],[3,30,-2.1]]){
  part(`deck-scar-${i}`,'village-wood',x,z,2.4,1.1,.025,'#4c4540',{baseY:.36,noCollision:true});
}
const concrete='#ae9c83';
stone('nest-roof',70,-10,12.6,8.6,.36,concrete,{baseY:5.72,overhead:true});
for(const z of [-14,-6])stone(`nest-side-${z}`,70,z,12,.4,2.74,concrete,{baseY:3});
for(const [z,d] of [[-12.7,2.62],[-7.3,2.62]])stone(`nest-door-side-${z}`,64,z,.44,d,2.72,concrete,{baseY:3});
stone('nest-embrasure-low',76,-10,.45,8,1.17,concrete,{baseY:3});
stone('nest-embrasure-high',76,-10,.45,8,.58,concrete,{baseY:5.14,overhead:true});
for(const side of [-1,1])stone(`nest-cheek-${side}`,76,-10+side*3.6,.45,.8,.97,concrete,{baseY:4.17});
for(const [x,z] of [[58,-2],[66,-2],[74,-2],[58,-19],[66,-19],[74,-19]])stone(`trench-${x}-${z}`,x,z,6.6,.65,.78,'#9a8b70');
for(const [i,x,z,w,d] of [[0,-132,-62,11,.8],[1,-139,-57,.8,8],[2,-126,-45,6,.65],[3,-147,-44,.65,5],[4,-123,-62,.65,5],
  [5,134,39,12,.75],[6,128,45,.75,11],[7,147,54,10,.8],[8,139,56,.8,8],[9,164,31,.75,10],[10,163,36,8,.8],[11,125,34,.7,8]]){
  stone(`ruin-${i}`,x,z,w,d,1.25+i%3*.48,'#bfaa83');
}
for(let i=0;i<29;i++){
  const x=-188+(i%8)*19+(i%3)*2,z=-69+Math.floor(i/8)*42+(i%5)*3;
  if(Math.abs(z)<5)continue;
  const type=i%3===0?'village-wood':'village-stone';
  part(`field-cover-${i}`,type,x,z,2.5+i%4*.8,.76+i%3*.46,.55+i%4*.24,
    i%3===0?'#63584b':'#9c896d',{modelRotation:{y:i*.64}});
}
for(const [i,x,z] of [[0,-217,-27],[1,-224,-21],[2,-215,-14],[3,92,3],[4,111,18],[5,100,-36],[6,158,2],[7,200,-4]])
  stone(`breastwork-${i}`,x,z,5.8,1.25,.95,'#a59578',i<3?{campaignDestructible:true}:{});
for(const [i,x,z] of [[0,-331,38],[1,-325,29],[2,-199,20],[3,-197,26]]){
  part(`camp-cover-${i}`,'village-awning',x,z,6.4,4.4,.16,'#937955',{baseY:terrain.heightAt(x,z)+3.3,noCollision:true});
  for(const side of [-1,1])part(`camp-pole-${i}-${side}`,'village-wood',x+side*2.9,z,.13,.13,3.34,'#695645');
}
part('briefing-table','village-wood',-330,38,2.3,1.75,.13,'#765c43',{baseY:terrain.heightAt(-330,38)+.86,overhead:true});
for(const side of [-1,1])for(const end of [-1,1])
  part(`table-leg-${side}-${end}`,'village-wood',-330+side*.94,38+end*.7,.12,.12,.87,'#765c43');
for(const [i,x,z] of [[0,-169,34],[1,-109,-37],[2,-64,52],[3,120,26]])
  part(`abandoned-car-${i}`,'car',x,z,2.2,4.5,1.7,'#6b6453',{assetMapId:'quarry',modelRotation:{y:.8+i*.5}});
for(const [i,x,z,h] of [[0,-38,-32,5.8],[1,-43,49,6.9],[2,-51,-43,5.6],[3,39,35,7.1],[4,54,41,6.1],[5,146,39,5.9],[6,161,49,6.7]])
  part(`river-palm-${i}`,'village-palm',x,z,.62,.62,h,'#6f6042',{trunkCollision:true,modelRotation:{y:i*.83}});
for(const mine of SAFRA_MINES){
  for(const x of [mine.x-mine.w/2,mine.x+mine.w/2])for(let j=0;j<5;j++){
    const z=mine.z+mine.d*(j/4-.5);
    part(`mine-${mine.id}-${x}-${j}`,'village-wood',x,z,.12,.12,.93,'#7d4d2d',{noCollision:true});
  }
  for(const side of [-1,1])part(`mine-flag-${mine.id}-${side}`,'village-metal',mine.x,mine.z+side*mine.d/2,1.5,.09,.85,'#a75038',{noCollision:true});
}
const roads=[{x:0,z:0,w:6,d:590,yaw:Math.PI/2},{x:152,z:36,w:5,d:67,yaw:Math.PI/2}];
const navigationNodes=[[-335,35],[-267,6],[-220,-23],[-127,0],[-43,0],[0,0],[43,0],[57,-7],[70,-10],[75,-2],[76,-19],[103,0],[118,-52],[133,-103],[142,61],[182,105],[215,0]]
  .map(([x,z])=>({x,z,y:terrain.heightAt(x,z)}));
export const SAFRA=registerLocalMap(rotateMapAssets({
  id:'safra',name:'Сафра · Эль-Каср',missionId:'m04',theme:'desert-village',campaign:true,
  size:768,width:760,depth:496,playArea:{minX:-352,maxX:348,minZ:-198,maxZ:198},
  navigationCell:4,navigationSize:704,stepHeight:.42,fogDensity:.0021,fogColor:'#d6ac83',sunColor:'#ffbb79',
  terrain,landforms,boxes,roads,navigationNodes,structures:[],districts:[],points:[],signs:[],vehicleSpawns:[],
  spawns:[{x:-340,z:40},{x:262,z:2}],
  landmarks:[{id:'ridge',name:'Гряда',x:-220,z:-20},{id:'bridge',name:'Эль-Каср',x:0,z:0},{id:'nest',name:'Гнездо',...SAFRA_NEST}],
}));
