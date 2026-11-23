import {makeTerrain} from './terrain.js';
import {routeRoads} from './map-edits.js';
import {QUARRY_KITS,quarryKitPlan} from './quarry-sites.js';
import {groundAsset,groundQuarryProp} from './asset-grounding.js';

const size=896,boxes=[],structures=[],navigationNodes=[],pads=[];
const points=[{id:'A',name:'СТАРЫЙ СКЛАД',x:-155,z:-97},{id:'B',name:'РЕТРАНСЛЯТОР',x:111,z:-79},{id:'C',name:'ВЫРАБОТКА',x:0,z:0},{id:'D',name:'ДРОБИЛКА',x:-111,z:79},{id:'E',name:'АНГАР',x:155,z:97}];
const nodes=[],edges=[],objectives={};
const node=(id,x,z)=>{nodes.push({id,x,z});return id;};
const track=(...ids)=>{for(let i=1;i<ids.length;i++)edges.push([ids[i-1],ids[i]]);};
for(const sign of [-1,1]){
  const end=sign<0?'north':'south';node(end+'-junction',0,sign*240);
  node(end+'-tank',0,sign*335);track(end+'-tank',end+'-junction');
  for(const [suffix,x] of [['atv',18],['atv-2',28],['humvee',-18],['humvee-2',-28]]){
    node(end+'-'+suffix,x*sign,sign*347);node(end+'-'+suffix+'-merge',x*sign,sign*319);
    track(end+'-'+suffix,end+'-'+suffix+'-merge',end+'-junction');
  }
  for(const x of [-210,210])node(end+'-corner-'+x,x,sign*240);
  track(end+'-corner--210',end+'-junction',end+'-corner-210');
}
for(const x of [-210,210]){
  const stops=points.filter(p=>p.x*x>0).sort((a,b)=>a.z-b.z);let previous='north-corner-'+x;
  for(const p of stops){const lane=node('lane-'+p.id,x,p.z),stop=node('parking-'+p.id,p.x,p.z);track(previous,lane);track(lane,stop);previous=lane;objectives[p.id]=stop;}
  track(previous,'south-corner-'+x);
}
node('north-cut',-24,-150);node('south-cut',24,150);
node('north-pit',-24,-65);node('south-pit',24,65);node('pit-parking',0,0);
track('north-junction','north-cut','north-pit','pit-parking','south-pit','south-cut','south-junction');objectives.C='pit-parking';
const roads=routeRoads(nodes,edges);
function roadClear(x,z,w,d,margin=1){
  return !roads.some(r=>{const c=Math.cos(r.yaw),s=Math.sin(r.yaw),dx=x-r.x,dz=z-r.z;
    return Math.abs(dx*c-dz*s)<r.w/2+(Math.abs(c)*w+Math.abs(s)*d)/2+margin&&Math.abs(dx*s+dz*c)<r.d/2+(Math.abs(s)*w+Math.abs(c)*d)/2+margin;});
}
function add(x,z,w,d,h,kind='wall',color='#8b8779',options={}){const box={id:'quarry-'+boxes.length,x,z,w,d,h,kind,color,...options};boxes.push(box);return box;}
function pair(x,z,w,d,h,kind,color,options={}){add(x,z,w,d,h,kind,color,options);add(-x,-z,w,d,h,kind,color,options);}
function levelSite(structure,margin=8){
  const {x,z,w,d}=structure;
  structures.push({...structure,terrainPad:true});
  pads.push({x,z,w:w+margin,d:d+margin,blend:4,protectedW:w+margin,protectedD:d+margin});
}
function pillbox(x,z,yaw,id){
  const parent='structure:'+id,sign=yaw===Math.PI?-1:1;
  levelSite({id,x,z,w:6,d:5,h:2.8,kind:'pillbox',facing:yaw,color:'#77796f'},4);
  const part=(px,pz,w,d,h,y=0)=>add(x+px*sign,z+pz*sign,w,d,h,'bunker-concrete','#77796f',{editorParent:parent,editorPart:true,baseY:y,overhead:y>0});
  part(0,-2.2,4.8,.6,1.3);part(0,-2.2,4.8,.6,.98,1.82);
  for(const s of [-1,1])part(s*1.9,-2.2,1,.6,.52,1.3);
  part(2.7,0,.6,3.8,1.3);part(2.7,0,.6,3.8,.98,1.82);
  for(const s of [-1,1])part(2.7,s*1.35,.6,1.1,.52,1.3);
  part(-2.7,0,.6,5,2.8);
  for(const s of [-1,1])part(s*1.825,2.2,2.35,.6,2.8);
  part(0,2.2,1.3,.6,.7,2.1);part(0,0,6,5,.5,2.3);
  add(x,z,4.8,3.8,.10,'bunker-concrete','#464c45',{editorParent:parent,editorPart:true,baseY:-.06,noCollision:true});
  for(const [px,pz] of [[0,4.5],[0,3],[0,1.3],[0,0],[0,-1.3],[1.8,0]])navigationNodes.push({x:x+px*sign,z:z+pz*sign});
}
// Facing is mirrored so the two sides get the same approaches and sightlines.
const sites=[
  ['loading',-157,-124,'transfer'],
  ['sorting',112,-105,'crusher'],
  ['pit',-41,17,'pump'],
  ['upper-road',-59,-187,'service'],
  ['east-road',55,-161,'service'],
  ['lower-road',-83,-58,'service'],
  ['west-flank',-256,-118,'pump'],
];
for(const [label,cx,cz,quarryKit] of sites){
  const kit=QUARRY_KITS[quarryKit], {w,d,h,paint}=kit, plan=quarryKitPlan(kit);
  for(const sign of [1,-1]){
    const x=cx*sign,z=cz*sign,id=`quarry-${label}-${sign}`,editorParent='structure:'+id;
    levelSite({id,x,z,w,d,h:h+.28,kind:'quarry-building',color:paint,quarryKit,quarryFacing:sign===1?0:Math.PI});
    for(const part of plan.parts)add(x+part.x*sign,z+part.z*sign,part.w,part.d,part.h,part.material==='metal'?'quarry-metal':'quarry-structure',part.color,{
      baseY:part.baseY,quarrySurface:part.material,overhead:part.baseY>=2.5,noCollision:part.noCollision,editorParent,editorPart:true,
    });
    for(const [px,pz] of plan.navigation)navigationNodes.push({x:x+px*sign,z:z+pz*sign});
  }
}
for(const [id,x,z] of [['west',-185,-72],['east',137,-59],['pit',-24,-27]]){
  pillbox(x,z,0,`quarry-dot-${id}-1`);
  pillbox(-x,-z,Math.PI,`quarry-dot-${id}--1`);
}
const coverColors={wall:'#8d8e7a',barrier:'#96927e',container:'#6b7565',rock:'#857a65',sandbags:'#a59c84','pump-manifold':'#8a7a60'};
const foundationKinds=new Set(['container','pump-manifold']);
const yards=[
  // North industrial approach and its south counterpart.
  [-32,-292,15,2,2.45,'wall'],[34,-279,9,3,2.6,'container'],
  [-56,-258,16,3,2.8,'wall'],[55,-224,14,2,2.7,'wall'],
  [-83,-220,9,3,2.6,'container'],[-31,-205,10,2,2.35,'wall'],
  [-119,-195,16,2.8,2.8,'wall'],[-136,-173,10,3,2.6,'container'],
  [-154,-153,7,3,2.5,'container'],[-111,-155,14,2,2.5,'wall'],
  [-79,-141,13,2,2.8,'wall'],[-44,-130,9,3,2.6,'container'],
  [33,-188,11,2,2.7,'wall'],[73,-202,9,3,2.6,'container'],
  [99,-170,15,2.5,2.8,'wall'],[82,-132,9,3,2.6,'container'],
  [134,-132,9,3,2.5,'container'],[164,-114,12,2,2.6,'wall'],
  [150,-155,11,2.5,2.8,'wall'],[180,-174,14,10,4.9,'rock'],
  // Objective yards and two protected off-road routes through the pit.
  [-133,-106,7,2,2.2,'barrier'],[-169,-85,8,1.5,1.4,'sandbags'],
  [-126,-78,12,2,2.45,'wall'],[-99,-91,13,8,4.1,'rock'],
  [101,-66,7,2,2.3,'barrier'],[120,-58,8,2,2.1,'wall'],
  [-62,-79,8,3,2.6,'container'],[-48,-52,9,2,2.55,'wall'],
  [-68,-34,9,6,3.65,'rock'],[-43,-19,11,2,2.65,'wall'],
  [-66,-13,12,2,2.5,'wall'],[-58,4,11,2,2.35,'wall'],
  [-45,36,8,3,1.3,'pump-manifold'],[-25,21,8,2,2.5,'wall'],
  [-14,0,4.8,2,1.35,'barrier'],[-30,41,8,2,1.35,'barrier'],
  [-60,55,17,2.5,2.65,'wall'],[-90,32,11,3,2.6,'container'],
  [78,-40,10,3,2.6,'container'],
  [96,-24,10,8,4.2,'rock'],[132,-20,15,2,2.55,'wall'],
  // The far side of the haul road stays useful to infantry.
  [-232,-158,14,2,2.5,'wall'],[-254,-146,10,3,2.6,'container'],
  [-235,-95,10,2,2.45,'wall'],[-264,-88,12,2,2.6,'wall'],
  [-249,-51,13,9,4.8,'rock'],[-234,-25,8,3,2.6,'container'],
  [-259,12,17,3,2.55,'wall'],[-237,49,12,9,3.8,'rock'],
  // Loading courts and machinery pens. The returns stop short of mine roads.
  [-175,-146,2.3,14,2.6,'wall'],[-167,-152,13,2.3,2.6,'wall'],
  [140,-111,2,10,2.6,'wall'],[147,-117,12,2,2.6,'wall'],
  [69,-159,2.2,13.5,2.5,'wall'],[74,-151.5,8,2.2,2.5,'wall'],
  [-51,37,2,10,2.3,'wall'],[-46,43,8,2,2.3,'wall'],
];
for(const [x,z,w,d,h,kind] of yards){
  if(!roadClear(x,z,w,d,1.5))continue;
  const options=kind==='wall'?{quarrySurface:'concrete'}:{quarryFoundation:foundationKinds.has(kind)};
  pair(x,z,w,d,h,kind,coverColors[kind],options);
}
for(const sign of [-1,1]){add(0,sign*377,65,2,4);for(const x of [-42,42])add(x,sign*350,15,26,7,'warehouse','#8c806b');}
for(const sign of [-1,1])pads.push({x:sign*18,z:sign*365,w:16,d:20,blend:4});
for(let i=0;i<28;i++){
  const x=-370+(i%7)*105,z=-285+Math.floor(i/7)*110,w=9+i%3*3,d=7+i%4*2;
  if(Math.hypot(x,z)<70||!roadClear(x,z,w,d,5)||boxes.some(b=>Math.hypot(x-b.x,z-b.z)<22))continue;
  pair(x,z,w,d,4+i%4,'rock','#857a65');
}
const landforms=[{x:0,z:0,rx:125,rz:130,height:-15,flat:.35}];
for(const sign of [-1,1])for(const [x,z,rx,rz,height] of [[330,50,90,105,14],[-300,210,85,70,10],[-110,-335,60,55,12]])landforms.push({x:x*sign,z:z*sign,rx,rz,height,flat:.25});
for(const sign of [-1,1])for(const [x,z,rx,rz,height,angle] of [
  [-92,-117,18,25,5.9,-.7],[-157,-196,25,13,6.1,.44],
  [81,-91,15,21,5.6,-.38],[-72,35,15,14,4.1,.32],
])landforms.push({x:x*sign,z:z*sign,rx,rz,height,angle,flat:.24});
const raw=makeTerrain(size,landforms);
const terrainPads=pads.map(p=>({...p,height:raw.heightAt(p.x,p.z)}));
const terrain=makeTerrain(size,landforms,4,terrainPads);
const anchors=new Map();
for(const s of structures){
  s.baseY=terrain.heightAt(s.x,s.z);
  anchors.set('structure:'+s.id,s.baseY);
}
for(const b of boxes){
  b.baseY=(b.baseY??0)+(anchors.get(b.editorParent)??terrain.heightAt(b.x,b.z));
  Object.assign(b,b.quarryFoundation?groundQuarryProp(b,terrain):groundAsset(b,terrain));
}
for(const p of points)p.y=terrain.heightAt(p.x,p.z);
for(const n of navigationNodes)n.y=terrain.heightAt(n.x,n.z);
const vehicleSpawns=[];
for(const team of [0,1]){const n=nodes.find(n=>n.id===(team?'north':'south')+'-tank');vehicleSpawns.push({id:n.id,type:'tank',team,x:n.x,z:n.z,yaw:team?Math.PI:0});}
for(const team of [0,1])for(const type of ['atv','atv-2','humvee','humvee-2']){const end=team?'north':'south',n=nodes.find(n=>n.id===end+'-'+type);vehicleSpawns.push({id:n.id,type:type.startsWith('atv')?'atv':'humvee',team,x:n.x,z:n.z,yaw:team?Math.PI:0});}
for(const team of [0,1]){const sign=team?-1:1;vehicleSpawns.push({id:team?'north-black-hawk':'south-black-hawk',type:'black-hawk',team,x:sign*18,z:sign*365,yaw:team?Math.PI:0});}
const patrolWaypoints=ids=>ids.map(id=>{
  const {x,z}=points.find(point=>point.id===id);
  return {x,z};
});
const airPatrols={
  'south-black-hawk':{altitude:41,routes:[patrolWaypoints(['D','A','C','E']),patrolWaypoints(['E','B','A','D'])]},
  'north-black-hawk':{altitude:30,routes:[patrolWaypoints(['B','E','C','A']),patrolWaypoints(['A','D','E','B'])]},
};
export const QUARRY_MAP={id:'quarry',layoutVersion:2,name:'Карьер «Перевал»',size,fogDensity:.00195,terrain,terrainPads,landforms,boxes,structures,roads,points,navigationNodes,supplySpawns:points.flatMap(p=>p.id==='C'?[-1,1].map(s=>({id:'map-ammo-C-'+s,x:0,z:s*14})):[{id:'map-ammo-'+p.id,x:p.x,z:p.z+(p.id==='A'||p.id==='B'?14:-14)}]),spawns:[{x:0,z:358},{x:0,z:-358}],vehicleSpawns,airPatrols,vehicleRoutes:{nodes,edges,objectives,stops:{}},landmarks:[],districts:points,signs:[{x:0,z:-380,name:'ПЕРЕВАЛ',note:'СЕВЕРНЫЙ ПАРК',baseSign:true,yaw:0},{x:0,z:380,name:'ПЕРЕВАЛ',note:'ЮЖНЫЙ ПАРК',baseSign:true,yaw:Math.PI}]};
