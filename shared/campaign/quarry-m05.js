import {registerLocalMap} from '../world.js';
import {terrainHeightfield} from '../terrain-heightfield.js';
import {buildM05Dressing,M05_SURFACE_PATCHES} from './quarry-m05-dressing.js';
import {M05_ROCKS} from './quarry-m05-rocks.js';

const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
const mix=(a,b,t)=>a+(b-a)*t;
const pads=[
  [-240,-210,32,43,32],[-155,-145,29,24,18],[-120,-55,17,16,16],
  [-52,0,12,42,18],[26,-40,15,14,15],[60,-70,18,12,9],[105,-38,11,21,15],
  [145,5,8,41,26],[37,66,5,29,25],[-80,145,2,54,43],[170,230,17,38,25],
];
export const M05_ROUTES={
  infantry:[[-240,-210,32],[-204,-177,31],[-155,-145,29],[-143,-106,23],[-120,-55,17],
    [-95,-7,12],[-52,0,12],[-15,0,12],[24,-28,14],[43,-54,17],[51,-74,18],[60,-74,18],[60,-70,18]],
  armor:[[247,-212,29],[242,-157,24],[209,-119,20],[170,-102,18],[148,-72,15],
    [145,-35,11],[145,5,8],[134,54,6],[91,72,5],[37,66,5],[12,89,4],[-16,115,2],[-37,134,2]],
  exit:[[-69,174,2],[-31,191,3],[15,202,6],[63,215,10],[115,228,14],[170,230,17],[229,222,19]],
  assault:[[59,-66,18],[76,-52,16],[96,-42,12],[118,-30,10],[128,-15,9],[133,4,8]],
};
const paths=Object.entries(M05_ROUTES).flatMap(([id,route])=>route.slice(1).map((b,i)=>{
  const a=route[i],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);
  return {id,a,b,dx,dz,length,w:id==='armor'||id==='exit'?12:id==='infantry'?6:5};
}));
const ledges=[
  [-220,-261,133,44,38],[-303,-55,51,157,32],[-221,116,68,99,19],
  [-139,246,91,42,18],[20,-206,119,48,37],[128,-249,91,58,43],
  [307,-100,39,142,34],[292,92,51,88,29],[277,283,88,52,37],
];
function rawHeight(x,z){
  const radial=Math.hypot((x+8)/345,(z-18)/302);
  const noise=Math.sin(x*.043+Math.sin(z*.025))*Math.cos(z*.056)*1.2+Math.sin((x+z)*.105)*.48;
  const contour=radial+Math.sin(x*.014+z*.008)*.055+Math.cos(z*.022)*.037;
  let y=2+7*smooth(.34,.49,contour)+8*smooth(.64,.77,contour)+12*smooth(.87,1.04,contour)+noise;
  for(const [px,pz,rx,rz,top] of ledges){
    const d=Math.hypot((x-px)/rx,(z-pz)/rz);
    y=Math.max(y,mix(y,top+noise,1-smooth(.52,1,d)));
  }
  if(radial>1.05)y+=smooth(1.05,2.2,radial)*(8+Math.sin(x*.012-z*.01)*11+Math.cos(z*.014)*12);
  for(const [px,pz,h,w,d] of pads){
    const distance=Math.max(Math.abs(x-px)-w,Math.abs(z-pz)-d);
    y=mix(y,h,1-smooth(0,18,distance));
  }
  let best=Infinity,roadY=0,roadWidth=0;
  for(const {a,b,dx,dz,length,w} of paths){
    const t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(length*length)));
    const dist=Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t);
    if(dist<best){best=dist;roadY=mix(a[2],b[2],t);roadWidth=w/2;}
  }
  return mix(y,roadY,1-smooth(roadWidth,roadWidth+11,best));
}

export const M05_GRID={min:-816,cell:4,count:408};
const {min,cell,count}=M05_GRID;
const heights=new Float32Array((count+1)**2);
for(let z=0;z<=count;z++)for(let x=0;x<=count;x++)heights[z*(count+1)+x]=rawHeight(min+x*cell,min+z*cell);
const terrain={cell,...terrainHeightfield({x:min,z:min,columns:count,rows:count,stepX:cell,stepZ:cell,heights})};
export const quarryPoint=(x,z)=>({x,y:terrain.heightAt(x,z),z});
const roads=paths.map(({id,a,b,dx,dz,length,w})=>({id,x:(a[0]+b[0])/2,z:(a[1]+b[1])/2,w,d:length+1.5,yaw:Math.atan2(dx,dz)}));

export const M05_SITES=Object.fromEntries(Object.entries({
  camp:[-247,-228],reunion:[-238,-221],brief:[-221,-218],campExit:[-205,-177],overlook:[-155,-145],
  tunnel:[-92,-7],workerDoor:[-72,2],panel:[-45,-8],worksExit:[-15,0],mount:[60,-68],mountExit:[60,-72],mountEntry:[53,-74],
  gate:[145,5],gatePanel:[132,3.85],bend:[134,54],crusher:[36,65],armorMeet:[-34,134],martenCover:[-52,146],
  tankYard:[-36,135],blast:[-112,148],fuelA:[-69,174],fuelB:[-90,157],fuelC:[-103,181],
  fuelGate:[-90,165],fuelRelease:[-84,169],fuelCPost:[-98,176],withdraw:[153,215],
  finale:[170,215],storm:[614,400],
}).map(([id,[x,z]])=>[id,quarryPoint(x,z)]));

const boxes=[];
const part=(id,x,z,w,d,h,color,extra={})=>{
  const box={id,x,z,w,d,h,color,kind:'quarry-m05-part',baseY:terrain.heightAt(x,z),...extra};
  boxes.push(box);return box;
};
const concrete='#96816a',iron='#526068',rust='#80523d',sand='#ad8e61',wood='#786044';
export const M05_GATES={
  worker:part('m05-worker-door',-72,3.1,3,.22,2.8,iron,{missionDynamic:true}),
  main:part('m05-main-gate',145,5,13,.35,4.7,iron,{missionDynamic:true}),
  fuel:part('m05-fuel-gate',-90,165,5.5,.3,4,iron,{missionDynamic:true}),
};
for(const [id,gate] of Object.entries(M05_GATES)){
  const {x,z,w,h,baseY}=gate;
  const guideHeight=2*h+.47,postWidth=id==='main'?.62:.24;
  for(const side of [-1,1])part('gate-guide-'+id+'-'+side,x+side*(w+postWidth)/2,z,
    postWidth,id==='main'?1.05:.48,guideHeight,iron,{baseY});
  part('gate-crosshead-'+id,x,z,w+postWidth*2,id==='main'?.8:.43,.32,iron,
    {baseY:baseY+guideHeight-.05,overhead:true});
}
part('camp-map-table',-221,-217,2.5,1.05,.95,wood);
part('camp-repair-cabinet',-242,-222,2.5,1.1,1.3,iron);
part('camp-ammo',-249,-221,2.5,1.48,1.06,sand);
part('ridge-parapet',-157,-139,8,.55,.84,concrete);
part('ridge-parapet-east',-142,-138,7,.55,.84,concrete);

// The conveyor hall has walk-through end bays and an accessible service room.
for(const [id,x,z,w,d,h] of [
  ['tunnel-north',-81,-10.8,24,.55,3.7],['tunnel-south',-83,-3.2,18,.55,3.7],
  ['hall-north-west',-62,-12,16,.55,8.3],['hall-north-east',-34,-12,28,.55,8.3],
  ['hall-south',-42,12,45,.55,8.3],['worker-west',-76,7,.45,8,3.2],
  ['worker-east',-68,7,.45,8,3.2],['worker-south',-72,10.8,8,.45,3.2],
  ['worker-wall-left',-74.8,3.1,2.6,.45,3.2],['worker-wall-right',-69.2,3.1,2.6,.45,3.2],
  ['hall-west-end',-69,8,.55,8,8.3],['hall-east-north',-16,-8,.55,8,8.3],
  ['hall-east-south',-16,8,.55,8,8.3],
])part(id,x,z,w,d,h,concrete,{baseY:12});
part('tunnel-roof',-81,-7,24,8,.4,concrete,{baseY:15.75,overhead:true});
part('hall-floor',-42,0,53,23,.048,'#a69a84',{baseY:11.99,noCollision:true});
for(let i=0;i<14;i++)part('service-step-'+i,-65.85+(i+.5)*.46,9.73,.46,1.65,(i+1)*.235,iron,{kind:'village-stair',baseY:12});
part('service-catwalk',-51.4,9.73,16.4,1.65,.28,iron,{kind:'village-floor',baseY:15.01,overhead:true});
part('hall-roof',-42,0,54,24.5,.45,iron,{baseY:20.3,overhead:true});
part('switchboard',-45,-9.4,4.2,1.3,2.1,iron);
part('crusher-body',-43,6,8,5.5,5.7,rust);
part('hall-cover',-27,-5,3,1.6,1.25,iron);
part('mount-parapet',60,-65.8,8.4,.42,.98,concrete);
part('mount-side-west',55.8,-68,.4,4.7,1,concrete);
part('mount-side-east',64.2,-68,.4,4.7,1,concrete);
part('middle-cover',96,-39,4.2,.9,1.2,concrete);
part('gate-hut',131.5,9,5.5,4.6,2.9,concrete);
part('gate-west-wall',134,5,9,.65,3,concrete);
part('gate-east-wall',157,5,11,.65,3,concrete);
part('crusher-yard-shield',35,59,10,1.4,2.1,concrete);
part('armor-infantry-cover',-50,144,3.1,1.1,1.48,concrete);
for(const [index,x,z] of [[0,-112,148],[1,-121,130],[2,-102,124]])
  part('reservoir-'+index,x,z,8.2,8.2,10.6,rust,{visualModel:true});
for(const [id,x,z] of [['B',-90,157],['C',-103,181]]){
  part('bay-'+id+'-west',x-4.3,z,.36,12,4,concrete);
  part('bay-'+id+'-east',x+4.3,z,.36,12,4,concrete);
  part('bay-'+id+'-back',x,z-6,8.8,.35,4,concrete);
  part('bay-'+id+'-roof',x,z,8.9,12.4,.32,iron,{baseY:6.1,overhead:true});
}
for(const [i,x,z] of [[0,-76,163],[1,-61,155],[2,-107,171],[3,-63,177],[4,-81,188],[5,77,-51],
  [6,104,-19],[7,122,-9],[8,-133,-68],[9,-109,-48],[10,-98,-16],[11,56,63],[12,67,83]])
  part('barrier-'+i,x,z,3.1,.72,1.01,i%3?concrete:sand);
for(const [i,x,z] of [[0,-260,-215],[1,-248,-198],[2,-225,-202]])
  part('camp-tent-'+i,x,z,7.5,6.3,3.15,sand,{visualModel:true,noCollision:true});

const exitPath=M05_ROUTES.exit.map(([x,z])=>[x,z]);
export const M05_FUEL_ROUTES={
  A:[[-69,184],[-56,188],...exitPath.slice(1,-1),[185,235]],
  B:[[-90,177],[-82,192],[-51,192],...exitPath.slice(1,-1),[175,243]],
  C:[[-103,194],[-86,202],[-56,208],...exitPath.slice(2,-1),[160,243]],
};
const convoyLanes=Object.entries(M05_FUEL_ROUTES).flatMap(([id,route])=>{
  const start=M05_SITES['fuel'+id],points=[[start.x,start.z],...route];
  return points.slice(1).map(([x,z],i)=>{
    const [ax,az]=points[i],dx=x-ax,dz=z-az;
    return {x:(ax+x)/2,z:(az+z)/2,w:6,d:Math.hypot(dx,dz)+2,yaw:Math.atan2(dx,dz)};
  });
});
const {props,solids}=buildM05Dressing(terrain,[...roads,...convoyLanes],boxes,M05_SITES);
boxes.push(...solids);
const modeled={visualModel:true};
for(const [i,x,z] of [[0,-260,-215],[1,-248,-198],[2,-225,-202]]){
  const baseY=terrain.heightAt(x,z);
  for(const side of [-1,1])part(`canvas-side-${i}-${side}`,x+side*3.75,z,.08,6.3,2,sand,{...modeled,baseY});
  part(`canvas-back-${i}`,x,z-3.15,7.5,.08,2,sand,{...modeled,baseY});
}
for(const [i,[x,z,w,d,h]] of M05_ROCKS.entries()){
  const baseY=terrain.heightAt(x,z)-.09;
  for(const [layer,factor,bottom,span] of [[0,1,0,.58],[1,.55,.58,.42]]){
    part(`limestone-${i}-${layer}`,x,z,w*factor,d*factor,h*span,concrete,{...modeled,baseY:baseY+h*bottom});
  }
}
for(const [i,[x,z]] of [[-123,152],[-94,145],[-99,170]].entries())
  part('pump-skid-'+i,x,z,1.95,1.26,1.11,iron,{...modeled,baseY:2});
for(const [i,x] of [-121,-112,-102].entries()){
  const z=[130,148,124][i],end=z+3.9;
  part('feed-branch-'+i,x,(end+120)/2,.38,end-120,.37,iron,{...modeled,baseY:2.33});
}
part('pipe-header',-113,119.8,32,.69,.68,iron,{...modeled,baseY:2.2});
part('belt-trough',-42,5.3,36,4.65,.5,iron,{...modeled,baseY:15.25,overhead:true});
for(let i=0;i<8;i++)for(const z of [3.2,7.4])
  part(`belt-leg-${i}-${z}`,-58+i*4.6,z,.24,.24,3.4,iron,{...modeled,baseY:12.1});
for(const id of ['panel','gatePanel','fuelRelease']){
  const {x,z}=M05_SITES[id];
  part(`control-${id}`,x,z+.74,.61,.42,1.25,iron,modeled);
}
export const M05_DRESSING=props;

export const QUARRY_M05=registerLocalMap({
  id:'quarry-m05',missionId:'m05',name:'Карьер',theme:'desert-village',campaign:true,
  size:1200,width:1040,depth:920,terrain,roads,boxes,surfacePatches:M05_SURFACE_PATCHES,structures:[],points:[],districts:[],signs:[],
  navigationCell:3,navigationSize:660,navigationClearance:.66,stepHeight:.38,
  playArea:{minX:-300,maxX:290,minZ:-270,maxZ:265},
  spawns:[M05_SITES.camp,M05_SITES.crusher],vehicleSpawns:[],
  fogColor:'#c3a483',fogDensity:.00132,sunColor:'#ffe0a9',
  landmarks:[['camp','Полевой лагерь'],['overlook','Обзорная гряда'],['panel','Дробильный цех'],
    ['gate','Нижние ворота'],['blast','Топливный двор'],['finale','Сбор колонны']]
    .map(([id,name])=>({id,name,...M05_SITES[id]})),
});
