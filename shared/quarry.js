import {makeTerrain} from './terrain.js';
import {routeRoads} from './map-edits.js';

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
export function pillbox(x,z,yaw,id){
  const parent='structure:'+id,sign=yaw===Math.PI?-1:1;
  structures.push({id,x,z,w:6,d:5,h:2.8,kind:'pillbox',facing:yaw,color:'#77796f'});pads.push({x,z,w:8,d:7,blend:3});
  const part=(px,pz,w,d,h,y=0)=>add(x+px*sign,z+pz*sign,w,d,h,'wall','#77796f',{editorParent:parent,baseY:y,...(y>0?{overhead:true}:{})});
  part(0,-2.2,4.8,.6,1.3);part(0,-2.2,4.8,.6,1.15,1.65);
  for(const s of [-1,1])part(s*1.9,-2.2,1,.6,.35,1.3);
  part(2.7,0,.6,3.8,1.3);part(2.7,0,.6,3.8,1.15,1.65);
  for(const s of [-1,1])part(2.7,s*1.35,.6,1.1,.35,1.3);
  part(-2.7,0,.6,5,2.8);
  for(const s of [-1,1])part(s*1.825,2.2,2.35,.6,2.8);
  part(0,2.2,1.3,.6,.7,2.1);part(0,0,6,5,.5,2.3);
  add(x,z,4.8,3.8,.10,'wall','#464c45',{editorParent:parent,baseY:-.10});
  for(const [px,pz] of [[0,4.5],[0,3],[0,1.3],[0,0],[0,-1.3],[1.8,0]])navigationNodes.push({x:x+px*sign,z:z+pz*sign});
}
for(const p of points){
  for(const side of [-1,1])pillbox(p.x+side*24,p.z+side*24,side<0?0:Math.PI,'quarry-dot-'+p.id+'-'+side);
  for(const side of [-1,1]){
    if(roadClear(p.x,p.z+side*35,40,2))add(p.x,p.z+side*35,40,2,3.6,'wall','#86887a');
    if(roadClear(p.x+side*29,p.z-side*17,9,7))add(p.x+side*29,p.z-side*17,9,7,4.4,'rock','#827b68');
    for(const [dx,dz,w,d,h,kind] of [[side*12,side*10,5,1.2,1.15,'sandbags'],[side*18,-side*10,6,3,2.3,'container']])if(roadClear(p.x+dx,p.z+dz,w,d))add(p.x+dx,p.z+dz,w,d,h,kind,kind==='container'?'#777c6b':'#a59c84');
  }
}
pair(0,-120,18,4,3.8,'wall','#86887a');pair(0,-55,10,4,3.8,'wall','#86887a');
// Each infantry lane and its alternating cover have a 180-degree mirror.
for(const p of points.slice(0,3)){
  const start={x:0,z:-315},distance=Math.hypot(p.x-start.x,p.z-start.z),count=Math.floor(distance/16);
  for(let i=1;i<count;i++){
    const t=i/count,side=i%2?1:-1,x=start.x+(p.x-start.x)*t+side*13,z=start.z+(p.z-start.z)*t;
    const w=i%3?4:7,d=i%3?2:3,h=i%3?1.2:2.4,kind=i%3?'sandbags':'container';
    if(roadClear(x,z,w,d)&&!boxes.some(b=>Math.hypot(x-b.x,z-b.z)<8))pair(x,z,w,d,h,kind,i%3?'#a59c84':'#79796a');
  }
}
for(const sign of [-1,1]){add(0,sign*377,65,2,4);for(const x of [-42,42])add(x,sign*350,15,26,7,'warehouse','#8c806b');}
for(let i=0;i<28;i++){
  const x=-370+(i%7)*105,z=-285+Math.floor(i/7)*110,w=9+i%3*3,d=7+i%4*2;
  if(Math.hypot(x,z)<70||!roadClear(x,z,w,d,5)||boxes.some(b=>Math.hypot(x-b.x,z-b.z)<22))continue;
  pair(x,z,w,d,4+i%4,'rock','#857a65');
}
const landforms=[{x:0,z:0,rx:125,rz:130,height:-15,flat:.35}];
for(const sign of [-1,1])for(const [x,z,rx,rz,height] of [[330,50,90,105,14],[-300,210,85,70,10],[-110,-335,60,55,12]])landforms.push({x:x*sign,z:z*sign,rx,rz,height,flat:.25});
const raw=makeTerrain(size,landforms),terrain=makeTerrain(size,landforms,4,pads.map(p=>({...p,height:raw.heightAt(p.x,p.z)})));
for(const b of boxes)b.baseY=(b.baseY??0)+terrain.heightAt(b.x,b.z);
for(const s of structures)s.baseY=terrain.heightAt(s.x,s.z);
for(const p of points)p.y=terrain.heightAt(p.x,p.z);
for(const n of navigationNodes)n.y=terrain.heightAt(n.x,n.z);
const vehicleSpawns=[];
for(const team of [0,1]){const n=nodes.find(n=>n.id===(team?'north':'south')+'-tank');vehicleSpawns.push({id:n.id,type:'tank',team,x:n.x,z:n.z,yaw:team?Math.PI:0});}
for(const team of [0,1])for(const type of ['atv','atv-2','humvee','humvee-2']){const end=team?'north':'south',n=nodes.find(n=>n.id===end+'-'+type);vehicleSpawns.push({id:n.id,type:type.startsWith('atv')?'atv':'humvee',team,x:n.x,z:n.z,yaw:team?Math.PI:0});}
export const QUARRY_MAP={id:'quarry',name:'Карьер «Перевал»',size,fogDensity:.00195,terrain,landforms,boxes,structures,roads,points,navigationNodes,spawns:[{x:0,z:358},{x:0,z:-358}],vehicleSpawns,vehicleRoutes:{nodes,edges,objectives,stops:{}},landmarks:[],districts:points,signs:[{x:0,z:-380,name:'ПЕРЕВАЛ',note:'СЕВЕРНЫЙ ПАРК',baseSign:true,yaw:0},{x:0,z:380,name:'ПЕРЕВАЛ',note:'ЮЖНЫЙ ПАРК',baseSign:true,yaw:Math.PI}]};
