import {makeTerrain} from '../terrain.js';
import {registerLocalMap} from '../world.js';
import {ALHADRA} from './alhadra.js';
import {rotateMapAssets} from '../geometry.js';
import {desertMountainSurface} from '../desert-mountain.js';
import {terrainHeightfield} from '../terrain-heightfield.js';

// The village itself is preserved exactly from mission 1. Mission 2 moves
// its centre (150,105) to (0,0) on a much larger battlefield; no mission 1
// geometry, collisions or terrain heights are edited.
export const ALHADRA_OFFSET=Object.freeze({x:150,z:105});
export const M02_BOUNDS=Object.freeze({minX:-1000,maxX:1000,minZ:-600,maxZ:600});
export const M02_RESERVE_ROUTE=Object.freeze([
  [300,-235],[270,-315],[151,-345],[8,-332],[-370,-477],[-473,-456],[-562,-419],
]);
const size=2000,cell=8,margin=112;
const shift=object=>({...object,x:object.x-ALHADRA_OFFSET.x,z:object.z-ALHADRA_OFFSET.z});
const inVillage=obj=>Math.abs(obj.x)<255&&Math.abs(obj.z)<185;
const shiftedBoxes=ALHADRA.boxes.map(shift).filter(box=>inVillage(box)&&box.kind!=='village-palm')
  .map(box=>{
    if(box.kind!=='village-rock')return box;
    // Leave the east approach between the village and the foot of the ridge.
    if(box.x>95)Object.assign(box,{x:box.x+36,w:box.w+8,h:box.h*.86});
    return {...box,noCollision:true};
  });
const shiftedStructures=(ALHADRA.structures??[]).map(shift).filter(inVillage);
const shiftedLandforms=(ALHADRA.landforms??[]).map(shift);
const shiftedPads=(ALHADRA.terrainPads??[]).map(shift);
const outerLandforms=[
  // Rise between the two columns. Its long axis runs across the approach.
  {x:-681,z:-482,rx:75,rz:122,height:14,flat:.18},
  {x:-868,z:-478,rx:104,rz:66,height:7.8,angle:.43,flat:.13},
  {x:-792,z:-563,rx:115,rz:48,height:4.8,angle:.25,flat:.12},
  {x:-598,z:-524,rx:150,rz:71,height:7.5,angle:-.46,flat:.08},
  {x:-682,z:-393,rx:170,rz:32,height:-4.4,angle:.62,flat:.20},
  {x:-451,z:-193,rx:135,rz:72,height:8,angle:-.38,flat:.14},
  {x:-145,z:-328,rx:190,rz:80,height:9.5,angle:.29,flat:.12},
  {x:204,z:-253,rx:190,rz:90,height:8.5,angle:-.34,flat:.2},
  {x:191,z:-252,rx:96,rz:51,height:16.5,angle:-.22,flat:.19},
  {x:326,z:-200,rx:78,rz:48,height:14,angle:.31,flat:.13},
  {x:102,z:-412,rx:137,rz:48,height:9,angle:.11,flat:.12},
  {x:-371,z:-490,rx:134,rz:43,height:8,angle:-.37,flat:.12},
  {x:352,z:160,rx:126,rz:71,height:12,angle:-.22,flat:.2},
  {x:570,z:330,rx:210,rz:98,height:7.5,angle:.28,flat:.15},
  {x:-756,z:264,rx:172,rz:113,height:7,angle:-.27,flat:.2},
  {x:-632,z:-90,rx:178,rz:85,height:5.6,flat:.15},
  {x:738,z:-230,rx:182,rz:80,height:6.1,angle:.35,flat:.1},
];
const outerTerrain=makeTerrain(size,outerLandforms,cell);
// At the edge of the original map, softly fade terrain back to the new
// desert. The entire old village rectangle is sampled from the original
// terrain; playable geometry and footing there remain unchanged.
const smooth=t=>t<=0?0:t>=1?1:t*t*(3-2*t);
const innerHalfX=270,innerHalfZ=210;
const originalHeight=(x,z)=>{
  const oldX=x+ALHADRA_OFFSET.x,oldZ=z+ALHADRA_OFFSET.z;
  // Bound the preserved village around its NEW local origin (0,0), not
  // the old Al-Hadra world origin. Comparing against oldX/oldZ accidentally
  // preserved rough village cliffs over the southern tank road instead.
  const spreadX=innerHalfX-Math.abs(x),spreadZ=innerHalfZ-Math.abs(z);
  const edge=Math.min(spreadX,spreadZ);
  const outer=outerTerrain.heightAt(x,z);
  if(edge<0)return outer;
  const preserved=ALHADRA.terrain.heightAt(oldX,oldZ);
  if(edge>24)return preserved;
  const weight=smooth(edge/24);
  // Use the same outer surface on both sides of the transition.
  return preserved*weight+outer*(1-weight);
};
const approach=[[-950,-560],[-750,-455],[-565,-373],[-400,-300],[-235,-248],[-115,-230],[-90,-110],[17,-70],[17,0]];
function corridor(path,halfWidth,blend){
  return path.slice(1).map(([x,z],i)=>{
    const [ax,az]=path[i],dx=x-ax,dz=z-az;
    return {ax,az,dx,dz,lengthSq:dx*dx+dz*dz,ay:originalHeight(ax,az),by:originalHeight(x,z),halfWidth,blend};
  });
}
const corridors=[...corridor(M02_RESERVE_ROUTE,26,30),...corridor(approach.slice(2,7),22,32)];
const half=size/2+margin,columns=2*half/cell;
const elevations=new Float32Array((columns+1)*(columns+1));
for(let row=0;row<=columns;row++)for(let col=0;col<=columns;col++){
  const x=col*cell-half,z=row*cell-half;
  let height=originalHeight(x,z),best=0,grade=height;
  for(const {ax,az,dx,dz,lengthSq,ay,by,halfWidth,blend} of corridors){
    const u=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/lengthSq));
    const weight=1-smooth((Math.hypot(x-ax-u*dx,z-az-u*dz)-halfWidth)/blend);
    if(weight>best){best=weight;grade=ay+(by-ay)*u;}
  }
  elevations[row*(columns+1)+col]=height+(grade-height)*best;
}
const baseGrid=terrainHeightfield({x:-half,z:-half,columns,rows:columns,stepX:cell,stepZ:cell,heights:elevations});
const baseSurface={heightAt:(x,z)=>{
  const height=baseGrid.heightAt(x,z);
  return Number.isFinite(height)?height:0;
}};
for(const b of shiftedBoxes){
  const original=ALHADRA.terrain.heightAt(b.x+ALHADRA_OFFSET.x,b.z+ALHADRA_OFFSET.z);
  if(b.kind==='village-rock')b.baseY=baseSurface.heightAt(b.x,b.z);
  else b.baseY=(b.baseY??original)+baseSurface.heightAt(b.x,b.z)-original;
}
const mountains=new Map(shiftedBoxes.filter(box=>box.kind==='village-rock')
  .map(box=>[box.id,desertMountainSurface(box,baseSurface)]));
function heightAt(x,z){
  let y=baseSurface.heightAt(x,z);
  for(const mountain of mountains.values())y=Math.max(y,mountain.heightAt(x,z));
  return y;
}
function raycast(origin,dir,length){
  let hit=baseGrid.raycast(origin,dir,length);
  for(const mountain of mountains.values())hit=Math.min(hit,mountain.raycast(origin,dir,Math.min(hit,length)));
  return hit;
}
const terrain={cell,heightAt,raycast,baseSurface,mountains};
const additionalBoxes=[];
// Keep the tank approaches clear and break up the original rows into small groves.
const palms=[[-81,-49,6.1],[-72,-46,4.2],[-68,-39,7.0],[-79,-36,5.4],[-58,-42,5.9],
  [-52,19,6.5],[-46,27,5.0],[-58,38,4.7],[-55,31,7.1],
  [53,-49,4.9],[64,-46,6.8],[62,-56,5.8],
  [81,5,6.3],[86,13,4.6],[74,11,7.1],[-121,-63,5.1],[-137,-58,6.0]];
for(const [i,[x,z,h]] of palms.entries()){
  additionalBoxes.push({id:`m02-palm-${i}`,kind:'village-palm',assetMapId:'village',x,z,h,
    w:.65,d:.65,baseY:terrain.heightAt(x,z)-.08,trunkCollision:true,modelRotation:{y:i*1.47}});
}
const stones=[
  [-821,-316],[-760,-212],[-681,66],[-569,269],[-544,-475],
  [-460,-118],[-341,-411],[-292,291],[-122,-453],[38,-379],
  [222,-432],[368,-286],[416,185],[537,-340],[585,276],
  [701,-152],[802,317],[862,-330],[914,46],[-896,315],
  [-911,-15],[644,380],[426,-9],[113,421],[762,414]
];
for(const [i,[x,z]] of stones.entries()){
  if(Math.abs(x)<95&&Math.abs(z)<85)continue;
  const w=4+i%3*1.7,d=3+(i*2)%4,h=1.5+i%4*.3;
  additionalBoxes.push({id:`m02-rock-${i}`,kind:'rock',x,z,w,d,h,
    baseY:terrain.heightAt(x,z)-.2,color:'#a58d70',assetMapId:'quarry'});
}
// These sites sit off the travelled corridors. Their walls, shelters and
// supplies use the same authored placements for the baked scene and gameplay.
for(const [index,x,z] of [[0,-839,-449],[1,-520,-298],[2,360,-174],[3,113,-383]]){
  const add=(suffix,kind,dx,dz,w,d,h,color,extra={})=>additionalBoxes.push({
    id:`m02-site-${index}-${suffix}`,kind,x:x+dx,z:z+dz,w,d,h,color,assetMapId:'village',
    baseY:terrain.heightAt(x+dx,z+dz),...extra,
  });
  add('wall','village-stone',0,-5,7.6,.7,1.08,'#9e8560');
  add('return','village-stone',-3.8,-2.4,.7,5.6,1.02,'#98815f');
  add('case-a','village-street-crate',-1.6,-3.35,1.18,.88,.76,'#776548');
  add('case-b','village-street-crate',.06,-3.60,1.38,.93,.89,'#80724d');
  if(index<3)add('shelter','tent',3.5,4.8,5.5,6.2,2.55,'#a18d62',{assetMapId:'quarry'});
  if(index===2)add('truck','truck',11,2,3,7,3.3,'#756a49',{assetMapId:'quarry'});
}
const routeRoads=(route,w)=>route.slice(1).map(([x,z],i)=>{
  const [ax,az]=route[i],dx=x-ax,dz=z-az;
  return {x:(ax+x)/2,z:(az+z)/2,w,d:Math.hypot(dx,dz)+6,yaw:Math.atan2(dx,dz)};
});
const roads=[
  ...(ALHADRA.roads??[]).map(shift),
  ...routeRoads(approach,10),
  ...routeRoads(M02_RESERVE_ROUTE,8),
  {x:481,z:84,w:11,d:820,yaw:Math.PI/2},
];
// Rebuild editor poses and colliders in desert coordinates. A shallow copy of
// the old map retained world coordinates on rotated rocks and sandbags.
export const ALHADRA_DESERT=registerLocalMap(rotateMapAssets({
  ...ALHADRA,
  id:'alhadra-desert',name:'Аль-Хадра: пустыня',missionId:'m02',
  campaign:true,theme:'desert-village',size,width:2000,depth:1200,terrainApron:920,terrainMargin:margin,
  playArea:M02_BOUNDS,navigationCell:8,stepHeight:.5,
  terrain,landforms:[...outerLandforms,...shiftedLandforms],
  terrainPads:shiftedPads,terrainPadBlend:8,
  boxes:[...shiftedBoxes,...additionalBoxes],
  structures:shiftedStructures,roads,
  homes:(ALHADRA.homes??[]).map(shift),
  school:ALHADRA.school?shift(ALHADRA.school):undefined,
  landmarks:[
    {id:'start',name:'Колонна «Сокол»',x:-950,z:-560},
    {id:'wadi',name:'Сухое русло',x:-700,z:-450},
    {id:'dunes',name:'Линия дюн',x:-450,z:-200},
    {id:'depot',name:'Сгоревший склад',x:-130,z:-75},
    {id:'village',name:'Аль-Хадра',x:0,z:0},
    {id:'enemy',name:'Восточный корпус',x:950,z:120},
  ],
  districts:[],points:[],spawns:[{x:-950,z:-560},{x:950,z:120}],vehicleSpawns:[],
  signs:[],fogDensity:.0019,fogColor:'#c1b09a',sunColor:'#ffdc9b',
  // Captures in this local-only mission come from authored objectives,
  // not multiplayer sectors.
}));
