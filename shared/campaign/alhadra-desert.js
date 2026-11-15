import {makeTerrain} from '../terrain.js';
import {registerLocalMap} from '../world.js';
import {ALHADRA} from './alhadra.js';

// The village itself is preserved exactly from mission 1. Mission 2 moves
// its centre (150,105) to (0,0) on a much larger battlefield; no mission 1
// geometry, collisions or terrain heights are edited.
export const ALHADRA_OFFSET=Object.freeze({x:150,z:105});
export const M02_BOUNDS=Object.freeze({minX:-1000,maxX:1000,minZ:-600,maxZ:600});
const shift=object=>({...object,x:object.x-ALHADRA_OFFSET.x,z:object.z-ALHADRA_OFFSET.z});
// Reuse the village itself, not the old mission's outer ridge and boundary
// cliffs. Those colliders sit across the new tank highway around (-400,-315).
// The original village/mission-1 map remains untouched.
const inVillage=obj=>Math.abs(obj.x)<255&&Math.abs(obj.z)<185;
const shiftedBoxes=ALHADRA.boxes.map(shift).filter(inVillage);
const shiftedStructures=(ALHADRA.structures??[]).map(shift).filter(inVillage);
const shiftedLandforms=(ALHADRA.landforms??[]).map(shift);
const shiftedPads=(ALHADRA.terrainPads??[]).map(shift);
const outerLandforms=[
  {x:-690,z:-434,rx:240,rz:48,height:-4.4,angle:.62,flat:.20},
  {x:-451,z:-193,rx:135,rz:72,height:8,angle:-.38,flat:.14},
  {x:-145,z:-328,rx:190,rz:80,height:9.5,angle:.29,flat:.12},
  {x:204,z:-253,rx:190,rz:90,height:8.5,angle:-.34,flat:.2},
  {x:352,z:160,rx:126,rz:71,height:12,angle:-.22,flat:.2},
  {x:570,z:330,rx:210,rz:98,height:7.5,angle:.28,flat:.15},
  {x:-756,z:264,rx:172,rz:113,height:7,angle:-.27,flat:.2},
  {x:-632,z:-90,rx:178,rz:85,height:5.6,flat:.15},
  {x:738,z:-230,rx:182,rz:80,height:6.1,angle:.35,flat:.1},
];
const outerTerrain=makeTerrain(2000,outerLandforms,8);
// Separate the tank approach from the steep dunes and the buildings in the
// centre of the original village. The roads are authored in mission data,
// but terrain is available before mission JSON loads in the renderer.
const militaryCorridors=[
  [[-910,-535],[-750,-455],[-565,-373],[-400,-300],[-235,-248],[-115,-230]],
  [[910,105],[730,-25],[550,-145],[365,-210],[175,-235],[-5,-235]],
];
// Broad, flat approach corridors allow 10 separate tank lanes and reduce
// steep grade spikes near dunes. Dunes remain outside the tank approach.
// Smooth a 60-metre shoulder instead of making an abrupt rectangular cut.
const flattenTankCorridors=(x,z,ground)=>{
  let closest=Infinity;
  for(const points of militaryCorridors){
    for(let i=0;i<points.length-1;i++){
      const [ax,az]=points[i],[bx,bz]=points[i+1];
      const dx=bx-ax,dz=bz-az,lengthSq=dx*dx+dz*dz;
      const t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/lengthSq));
      closest=Math.min(closest,Math.hypot(x-(ax+dx*t),z-(az+dz*t)));
    }
  }
  if(closest<=85)return 0;
  if(closest>=145)return ground;
  const t=(closest-85)/60,weight=1-t*t*(3-2*t);
  return ground*(1-weight);
};
// At the edge of the original map, softly fade terrain back to the new
// desert. The entire old village rectangle is sampled from the original
// terrain; playable geometry and footing there remain unchanged.
const smooth=t=>t<=0?0:t>=1?1:t*t*(3-2*t);
const innerHalfX=240,innerHalfZ=180;
const heightAt=(x,z)=>{
  const oldX=x+ALHADRA_OFFSET.x,oldZ=z+ALHADRA_OFFSET.z;
  // Bound the preserved village around its NEW local origin (0,0), not
  // the old Al-Hadra world origin. Comparing against oldX/oldZ accidentally
  // preserved rough village cliffs over the southern tank road instead.
  const spreadX=innerHalfX-Math.abs(x),spreadZ=innerHalfZ-Math.abs(z);
  const edge=Math.min(spreadX,spreadZ);
  const outer=flattenTankCorridors(x,z,outerTerrain.heightAt(x,z));
  if(edge<0)return outer;
  const preserved=ALHADRA.terrain.heightAt(oldX,oldZ);
  if(edge>24)return preserved;
  const weight=smooth(edge/24);
  // Blend against the SAME cleared tank approach. Using the raw dune height
  // here created a 1.5m step across the former village-map boundary and
  // immobilised the entire tank column at z=-285.
  return preserved*weight+outer*(1-weight);
};
function raycast(origin,dir,length){
  const step=4;
  const f=t=>origin.y+dir.y*t-heightAt(origin.x+dir.x*t,origin.z+dir.z*t);
  if(f(0)<-.001)return 0;
  for(let t=Math.min(step,length);t>0;){
    if(f(t)<=0){
      let a=Math.max(0,t-step),b=t;
      for(let n=0;n<9;n++){const mid=(a+b)*.5;if(f(mid)<=0)b=mid;else a=mid;}
      return b;
    }
    if(t===length)break;
    t=Math.min(length,t+step);
  }
  return Infinity;
}
const terrain={cell:8,heightAt,raycast};
const additionalBoxes=[];
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
const roads=[
  ...(ALHADRA.roads??[]).map(shift),
  {x:-522,z:-345,w:9,d:1070,yaw:-.93},
  {x:481,z:84,w:11,d:820,yaw:Math.PI/2},
];
export const ALHADRA_DESERT=registerLocalMap({
  ...ALHADRA,
  id:'alhadra-desert',name:'Аль-Хадра: пустыня',missionId:'m02',
  campaign:true,theme:'desert-village',size:2000,width:2000,depth:1200,
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
});
