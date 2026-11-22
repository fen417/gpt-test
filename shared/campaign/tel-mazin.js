import {makeTerrain} from '../terrain.js';
import {rotateMapAssets} from '../geometry.js';
import {registerLocalMap} from '../world.js';
import {settlement} from './settlement.js';

const size=2048,cell=4,boxes=[],structures=[],interactives=[],navigationNodes=[];
const foundations=new Map();
let foundation=null;
export const PANEL_STATES=['closed','open','locked','destroyed'];
export function packPanels(states){
  const packed=new Uint8Array(Math.ceil(interactives.length/4));
  for(const [i,panel] of interactives.entries())packed[i>>2]|=PANEL_STATES.indexOf(states[panel.id])<<((i&3)*2);
  return packed;
}
export const panelState=(packed,index)=>PANEL_STATES[(packed[index>>2]>>((index&3)*2))&3];
const colors=['#d9bd92','#d5c4a2','#caa482','#e0cba5','#c8b7a0','#decfb2'];
const box=(id,kind,x,z,w,d,h,color,extra={})=>{
  const part={id,kind,x,z,w,d,h,color,baseY:0,assetMapId:'village',...extra};
  if(foundation)foundations.set(part,foundation);
  boxes.push(part);return part;
};
function navigationNode(x,y,z){
  const node={x,y,z};
  if(foundation)foundations.set(node,foundation);
  navigationNodes.push(node);
}

export const CONVOY_ROAD=[[-923,-38],[-795,-38],[-660,-69],[-522,-57],[-390,-24],[-240,0],[-205,0],[-100,0]];
export function convoyRoadZ(x){
  const end=CONVOY_ROAD.findIndex(([at])=>at>x);
  if(end<1)return end<0?CONVOY_ROAD.at(-1)[1]:CONVOY_ROAD[0][1];
  const [ax,az]=CONVOY_ROAD[end-1],[bx,bz]=CONVOY_ROAD[end],u=(x-ax)/(bx-ax);
  return az+(bz-az)*u*u*(3-2*u);
}
export function m03ConvoyPose(definition,index,seconds){
  const {firstX,speed,interval,ambushAt}=definition.convoy;
  const x=firstX-index*interval+Math.min(ambushAt,seconds)*speed,z=convoyRoadZ(x);
  return {x,z,yaw:Math.atan2(-2,convoyRoadZ(x-1)-convoyRoadZ(x+1))};
}

function interactive(id,type,x,z,w,d,h,baseY,color,initial){
  const part=box(id,'village-wall',x,z,w,d,h,color,{baseY,overhead:baseY>0,missionDynamic:true});
  const opened=type==='door'&&w>d?box(`${id}-swing`,'village-wall',x-w/2+d/2,z+w/2,d,w,h,color,
    {baseY,missionDynamic:true}):null;
  const item={id,type,part,opened,initial};interactives.push(item);return item;
}

function house(id,x,z,plan,floors=1,w=14,d=12){
  const color=colors[structures.length%colors.length],thick=.32,door=plan==='shop'?3.25:plan==='workshop'?2.45:1.5,level=3;
  const h=floors*level,kind=floors>1?'village-house-tall':'village-house';
  const structure={id,kind,x,z,w,d,h,assetMapId:'village',baseY:0,color,floors,plan,doorWidth:door,doorHeight:2.12,enterable:true,interactiveShutters:true};
  structures.push(structure);
  foundation=structure;
  let serial=0;
  const add=(kind,x,z,w,d,h,baseY=0,tint=color,extra={})=>{
    if(w>.025&&d>.025&&h>.025)box(`${id}-part-${serial++}`,kind,x,z,w,d,h,tint,
      {editorParent:`structure:${id}`,editorPart:true,baseY,overhead:baseY>0,...extra});
  };
  const cut=id==='breach-west'?'west-wall':id==='breach-east'?'east-wall':null;
  const blastX=x+w/2,blastZ=z+3.7,blastW=2.4;
  const wall=(x,z,w,d,h,baseY=0)=>{
    if(!cut||x!==blastX||baseY>=level||w>.4||z+d/2<=blastZ-blastW/2||z-d/2>=blastZ+blastW/2){
      add('village-wall',x,z,w,d,h,baseY);return;
    }
    const left=z-d/2,right=z+d/2,stop=blastZ-blastW/2,start=blastZ+blastW/2;
    add('village-wall',x,(left+stop)/2,w,stop-left,h,baseY);
    add('village-wall',x,(start+right)/2,w,right-start,h,baseY);
  };
  for(const side of [-1,1]){
    const face=z+side*d/2,wing=(w-door)/2;
    for(const dir of [-1,1])wall(x+dir*(door+wing)/2,face,wing,thick,2.12);
    wall(x,face,w,thick,level-2.12,2.12);
    if(floors>1){
      const emplacement=plan==='mg'&&side===-Math.sign(z);
      const topWindow=emplacement?3.55:2.4,span=(w-topWindow)/2;
      const sill=emplacement?.46:.9,lintel=emplacement?2.28:2.2;
      wall(x,face,w,thick,sill,level);wall(x,face,w,thick,level-lintel,level+lintel);
      for(const dir of [-1,1])wall(x+dir*(topWindow+span)/2,face,span,thick,lintel-sill,level+sill);
    }
    interactive(`${id}-door-${side}`, 'door',x,face,door,.13,2.12,0,'#705238',side<0&&plan==='mayor'?'locked':'closed');
    for(const dz of [-1.25,0,1.25])navigationNode(x,0,face+dz);
    for(let floor=0;floor<floors;floor++){
      const wy=floor*level,wx=x+side*w/2,emplacement=plan==='mg'&&side<0&&floor===1;
      const opening=emplacement?2.9:2.2,center=emplacement?z-Math.sign(z)*3.55:z;
      const sill=emplacement?.47:1,lintel=emplacement?2.30:2.15;
      wall(wx,z,thick,d,sill,wy);wall(wx,z,thick,d,level-lintel,wy+lintel);
      for(const dir of [-1,1]){
        const edge=z+dir*d/2,jamb=center+dir*opening/2;
        wall(wx,(edge+jamb)/2,thick,Math.abs(edge-jamb),lintel-sill,wy+sill);
      }
      interactive(`${id}-shutter-${side}-${floor}`,'shutter',wx,center,.12,opening,lintel-sill,wy+sill,'#7a624c',
        (side===1||plan==='mg')&&plan!=='mayor'?'open':'closed');
      if(emplacement)structure.emplacement={x:wx+.73,y:wy,z:center};
    }
  }
  if(['home','two-storey','mayor'].includes(plan)){
    wall(x+w*.27,z+1,w*.37,.28,2.3);
    wall(x+w*.22,z-d*.24,.28,d*.31,2.3);
  }else if(plan==='shop')wall(x+w*.28,z+2.6,w*.35,.3,2.35);
  add('village-floor',x,z,w-.18,d-.18,.18,-.16,'#b5a27f');
  const stairW=1.7,left=x-w/2,right=x+w/2;
  for(let floor=1;floor<=floors;floor++){
    if(plan==='mg'&&floor===2){
      add('village-floor',x,z,w,d,.18,floor*level-.18,'#ac987d');
      break;
    }
    const dir=(floor%2?1:-1)*(plan==='mg'?-1:1);
    const stairX=x-dir*(w/2-1.23),start=z-dir*(d/2-.8),run=d-1.6,stepD=run/10,base=floor*level;
    navigationNode(stairX+dir*1.5,base-level,start+dir*stepD*.5);
    for(let n=0;n<10;n++){
      const stepZ=start+dir*(n+.5)*stepD,top=(floor-1)*level+(n+1)*level/10;
      add('village-stair',stairX,stepZ,stairW,stepD,.17,top-.17,'#af9875');
    }
    add('village-floor',(stairX+stairW/2+right)/2,z,right-stairX-stairW/2,d,.18,base-.18,'#ac987d');
    add('village-floor',(left+stairX-stairW/2)/2,z,stairX-stairW/2-left,d,.18,base-.18,'#ac987d');
    for(const side of [-1,1])add('village-floor',stairX,z+side*(d/2-.4),stairW,.8,.18,base-.18,'#ac987d');
    const landing=z+dir*(d/2-1.02);
    navigationNode(stairX,base,landing);navigationNode(stairX+dir*1.65,base,landing);navigationNode(x,base,z);
  }
  for(const side of [-1,1]){
    wall(x+side*w/2,z,.3,d,.55,h);
    wall(x,z+side*d/2,w,.3,.55,h);
  }
  add('village-table',x+w*.28,z-d*.27,1.35,.8,.75,0,'#8b6a4b');
  if(plan!=='tea')add('village-cabinet',x+w*.36,z+d*.28,.6,1.25,1.6,0,'#8b6a4b');
  if(plan==='tea'||plan==='home')add('village-bench',x-w*.33,z+d*.28,1.7,.5,.47,0,'#947554');
  if(plan==='workshop'||plan==='shop')add('village-shelf',x-w*.348,z+d*.24,.52,1.8,1.68,0,'#937452');
  if(plan==='workshop'){
    add('village-workbench',x+w*.34,z-d*.026,2.32,.77,.95,0,'#80614a');
    add('village-workcase',x+w*.29,z+d*.19,1.03,.72,.53,0,'#696d59');
  }
  if(plan==='shop'||plan==='tea')add('village-counter',x-w*.305,z-d*.071,2.18,.74,.95,0,'#9a7852');
  if(plan==='home'||plan==='two-storey')add('village-cot',x-w*.275,z+d*.025,1.05,1.92,.51,0,'#83735a');
  if(plan==='home'||plan==='mayor')add('village-rug',x+.8,z+.9,2.4,2,.03,0,'#a46c4e',{noCollision:true});
  navigationNode(x,0,z-2);navigationNode(x,0,z+2);
  if(cut)interactive(cut,'breach',blastX,blastZ,.34,blastW,level,0,color,'closed');
  foundation=null;
  return structure;
}

const lots=[
  ['gate',-159,11,'tea'],['lane-west',-181,-11,'home'],['lane-east',-136,11,'home'],['gate-roof',-200,-11,'two-storey',2],
  ['workshop',-92,39,'workshop'],['forge',-114,40,'shop'],['craft-north',-70,43,'home'],['craft-roof',-113,14,'two-storey',2],
  ['craft-south',-92,14,'shop'],['craft-east',-70,14,'home'],['craft-yard',-92,62,'tea'],
  ['mg-north',-32,-11,'mg',2],['mg-south',-12,11,'mg',2],['cross-west',-45,12,'home'],['cross-east',9,11,'shop'],['cross-yard',-24,34,'tea'],
  ['market-west',16,-30,'shop'],['market-east',80,-28,'home'],['market-south',50,-61,'tea'],['market-north',50,11,'shop'],
  ['market-roof',69,12,'two-storey',2],['market-court',24,-59,'workshop'],
  ['breach-west',96,39,'workshop',1,15,14],['breach-east',119,39,'shop',1,15,14],['breach-roof',100,13,'two-storey',2],['breach-yard',120,64,'home'],
  ['headquarters',174,-10,'mayor',2,19,14],['hq-guard',185,14,'home',1,12,12],
];
const houses=Object.fromEntries(lots.map(([id,x,z,...spec])=>[id,house(id,x,Math.abs(z)===11?Math.sign(z)*9.4:z,...spec)]));

const reserved=[
  {x:50,z:-31,w:54,d:48},{x:167,z:0,w:54,d:52},{x:108,z:40,w:49,d:24},
  {x:-158,z:25,w:27,d:19},{x:-91,z:30,w:52,d:26},{x:58,z:-47,w:11.4,d:18.2},
];
const lotFits=(x,z,w,d)=>[...structures,...reserved].every(s=>Math.abs(x-s.x)>(w+s.w)/2+2.6||Math.abs(z-s.z)>(d+s.d)/2+2.6);
const district=settlement(box);
function backgroundFacade(id,x,z,w,h,side,doorX,doorW,color,seed){
  const outside=z-side*.18,wood='#806247',lintel=2.22;
  const wall=(part,at,span,height,baseY=0)=>district.wall(id+part,at,z,span,{height,baseY,color});
  wall('-header',doorX,doorW,h-lintel,lintel);
  box(id+'-door-head','village-wood',doorX,outside,doorW+.19,.115,.14,wood,{baseY:lintel,noCollision:true});
  for(const edge of [-1,1]){
    const jamb=doorX+edge*doorW/2,limit=x+edge*w/2,span=Math.abs(limit-jamb),center=(limit+jamb)/2;
    box(id+'-jamb-'+edge,'village-wood',jamb+edge*.055,outside,.11,.115,lintel,wood,{noCollision:true});
    if(span<2.15||edge===1&&seed%3===2){wall('-wing-'+edge,center,span,h);continue;}
    const windowW=Math.min(1.25,span*.52),bottom=1.04,top=1.96;
    district.wall(id+'-wing-'+edge,center,z,span,{gap:windowW,height:h,color});
    wall('-below-'+edge,center,windowW,bottom);
    wall('-above-'+edge,center,windowW,h-top,top);
    // The panel sits inside the masonry recess and fills the original solid wall.
    box(id+'-window-'+edge,'village-wood',center,z+side*.045,windowW,.21,top-bottom,'#725b45',{baseY:bottom,overhead:true});
    for(const y of [bottom+.19,bottom+.63])box(id+'-window-rail-'+edge+'-'+y,'village-wood',center,z-side*.07,
      windowW,.045,.075,'#a48764',{baseY:y,noCollision:true});
    box(id+'-window-sill-'+edge,'village-stone',center,outside,windowW+.18,.22,.105,'#b39a75',
      {baseY:bottom-.08,noCollision:true});
  }
}
const blocks=[-198,-168,-127,-97,-58,-16,25,61,98,137,179,207];
for(const [row,band] of [-13,14,-31,33,-52,55,-74,78,-94,100].entries()){
  for(const [column,block] of blocks.entries())for(const wing of [0,1]){
    if(structures.length>=90)break;
    const seed=row*31+column*7+wing*11,side=Math.sign(band);
    const x=block+wing*(11+seed%5)+(seed%7-3);
    const w=8+seed%6,d=8+(seed*3)%9;
    const z=side*Math.max(5+d/2,Math.abs(band)+(seed%9-4)+wing*5);
    if(x+w/2>218||!lotFits(x,z,w,d))continue;
    const serial=structures.length,id=`facade-${serial}`,color=colors[seed%colors.length],h=2.85+(seed%4)*.45;
    foundation={id,kind:'village-facade',x,z,w,d,h,baseY:0,assetMapId:'village',color};
    structures.push(foundation);
    const face=z-side*d/2,back=z+side*d/2;
    backgroundFacade(id+'-front',x,face,w,h,side,x+(seed%2?.7:-.7),seed%3===0?2.9:1.55,color,seed);
    district.wall(id+'-back',x,back,w,{gap:1.65,height:h,color});
    district.wall(id+'-back-header',x,back,1.65,{height:h-2.22,baseY:2.22,color});
    for(const end of [-1,1])district.wall(id+'-side-'+end,x+end*w/2,z,d,{axis:'z',height:h,color});
    box(id+'-roof','village-floor',x,z,w+.2,d+.2,.23,'#9b876e',{baseY:h,overhead:true});
    box(id+'-floor','village-floor',x,z,w-.15,d-.15,.18,'#b6a180',{baseY:-.16});
    if(seed%3===0)box(id+'-bench','village-bench',x-w*.31,z+d*.22,1.4,.52,.47,'#866749');
    district.wall(id+'-parapet',x,back,w,{height:.33+seed%3*.16,color,baseY:h+.23});
    if(seed%4===0){
      const annexWidth=w*.48,annexDepth=2.25,annexX=x+w*.24,annexZ=back+side*annexDepth/2;
      if(lotFits(annexX,annexZ+side*2,annexWidth,.3)){
        box(id+'-annex','village-wall',annexX,annexZ,annexWidth,annexDepth,2.1,'#a99579');
        reserved.push({x:annexX,z:annexZ,w:annexWidth,d:annexDepth});
      }
    }
    foundation=null;
  }
}

// The two flanking walls and the street barricade open together at the fuse.
interactive('barrier','breach',133,0,.6,6.7,1.75,0,'#a38a6a','closed');
interactive('hq-gate','gate',155,0,.18,5.4,2.5,0,'#71583e','locked');

const high=12,tower={x:58,z:-41.9,y:high};
const towerSite={x:57.8,z:-46.8,w:10.3,d:17.4,baseY:0};
const towerStairs={left:55.81,right:57.99,near:-45.75,far:-53.55,width:1.67,rise:3,steps:10,flights:4};
foundation=towerSite;
for(const dx of [-2.32,2.32])for(const dz of [-1.95,1.95])
  box(`tower-leg-${dx}-${dz}`,'village-stone',tower.x+dx,tower.z+dz,.61,.61,high,'#9d8565');
for(const [i,z] of [towerStairs.near+.57,towerStairs.far-.57].entries()){
  const height=i?9.12:6.12;
  for(const [side,x] of [towerStairs.left-1.09,towerStairs.right+1.09].entries())
    box(`tower-stair-pier-${i}-${side}`,'village-wood',x,z,.24,.24,height,'#775b3e');
}
box('tower-platform','village-floor',tower.x,tower.z,6.2,5.5,.26,'#8b6f52',{baseY:high-.26,overhead:true});
box('tower-connector','village-floor',57.98,-45.07,1.73,1.72,.24,'#8b6f52',{baseY:high-.24,overhead:true});
box('tower-tank','village-wood',59.93,-42.62,1.68,1.58,1.55,'#6f7369',{baseY:high,overhead:true});
box('tower-street-parapet','village-stone',58,-39.23,6.15,.22,.48,'#a99372',{baseY:high,overhead:true});
for(const side of [-1,1])box(`tower-edge-${side}`,'village-wood',58+side*3,-41.9,.18,5.4,.68,'#775f44',{baseY:high,overhead:true});
for(let i=0;i<towerStairs.flights;i++){
  const {left,right,near,far,width,rise,steps}=towerStairs;
  const away=i%2===0,x=away?left:right,start=away?near:far,end=away?far:near;
  const length=Math.abs(end-start),depth=length/steps,pitch=(end-start)/steps;
  navigationNode(x,i*rise,start-Math.sign(pitch)*.37);
  for(let j=0;j<steps;j++){
    const z=start+(j+.5)*pitch,top=i*rise+(j+1)*rise/steps;
    box(`tower-flight-${i}-${j}`,'village-stair',x,z,width,depth,.18,'#8c7456',{baseY:top-.18,overhead:true});
    if(j%2===0||j===steps-1)navigationNode(x,top,z-pitch*.24);
  }
  if(i<towerStairs.flights-1){
    const z=end+Math.sign(pitch)*.59,y=(i+1)*rise;
    box(`tower-landing-${i}`,'village-floor',(left+right)/2,z,right-left+width,1.2,.22,'#897354',
      {baseY:y-.22,overhead:true});
    box(`tower-landing-beam-${i}`,'village-wood',(left+right)/2,z,right-left+2.22,.28,.18,'#72583d',
      {baseY:y-.38,overhead:true});
    navigationNode(left,y,z);navigationNode(right,y,z);
  }
}
navigationNode(57.98,high,-45.08);navigationNode(tower.x,high,tower.z);
foundation=null;
const awnings=['#a56751','#c3aa71','#718674','#a88168'];
const dressing=(id,...args)=>box(`street-dressing-${id}`,...args);
const street=settlement(dressing);
export const M03_CHARGE_CACHE={x:93,z:31};
dressing('breach-charge-cache','village-street-crate',M03_CHARGE_CACHE.x,M03_CHARGE_CACHE.z,1.15,.75,.65,'#596853');
// Keep the central lane and door approaches open. Back streets and the square
// carry the larger clusters, with staggered paths between groups of cover.
const stalls=[
  [36,-19,3.4],[50,-25,3.2],[40,-40,3.4],[63,-29,3.65],[34,-32,3.25],[70,-21,3.1],
  [-170,19,3.2],[-122,20,3.05],[-103,26,3.2],[-82,32,3],[-35,6.25,3.25],
  [22,-13,3.05],[53,-7.35,3.3],[76,27,3.4],[140,20,3.5],[161,26,3.05],
];
stalls.forEach(([x,z,w],i)=>street.stall('stall-'+i,x,z,w,{roof:i!==10&&i!==12,color:awnings[i%awnings.length],
  goods:i%3===0?'village-pottery':'village-produce-crates'}));
district.sign('tea-sign',-159,3.19,'ЧАЙНАЯ');
district.sign('workshop-sign',-92,32.83,'МАСТЕРСКИЕ',{width:3.8});
district.sign('market-sign',31,-13.6,'РЫНОК');
for(const dx of [-1.05,1.05])box('market-sign-post-'+dx,'village-wood',31+dx,-13.6,.13,.16,2.9,'#7a6045');
district.sign('service-sign',174,-17.26,'ШТАБ БРИГАДЫ',{width:4.2});
district.stall('tea-front-bench',-163.6,2.9,2.8,{roof:false});
district.stall('lane-loading-table',-150.4,-8.25,2.6,{roof:false});
dressing('lane-loading-crate','village-street-crate',-155.95,-8.65,1.05,.85,.78,'#8c704b');
dressing('lane-threshold-jars','village-pottery',-128.3,-6.1,1.24,1.05,.65,'#b17c57',{noCollision:true});
district.wall('unloading-south',-158,31,22,{gap:4.8,offset:-3,height:1.3});
district.wall('unloading-east',-146,25,12,{axis:'z',gap:3,offset:2,height:1.45});
district.canopy('tea-unloading',-166,24.8,5.8,3.4,{color:'#b79663'});
district.wall('workshop-yard-back',-99.5,29,11,{gap:3.8,offset:2.1});
district.wall('workshop-yard-east',-81,34,11,{axis:'z',gap:4,offset:-1.4,height:1.45});
district.canopy('workshop-yard-shelter',-102,35,5.7,4.4,{wood:true,height:2.62});
district.stall('workshop-bench',-102,35.8,3.6,{roof:false,goods:'village-wood'});
district.detail('workshop-spanner','village-metal',-102.4,35.72,.37,.09,.05,'#545657',{baseY:.95},2);
district.detail('workshop-rim','village-metal',-104,34.8,.46,.18,.46,'#6a6360',{},2);
district.wall('market-north-edge',58,-16,18,{gap:7,offset:-1,height:.65});
district.wall('hq-service-wall',196,-17.4,15,{axis:'z',gap:3.8,offset:-2,height:1.8});
district.wall('hq-service-yard',197,-26,19,{gap:4.5,height:1.65});
district.canopy('hq-stores',202,-18.4,5.5,4.25,{color:'#80816b'});
district.stall('hq-receiving-bench',202,-18.7,2.6,{roof:false});
const crates=[
  [-207,6.1],[-192,21],[-168,-5.8],[-147,19],[-124,8.4],[-106,23],[-97,25],[-82,22.8],[-65,31.5],
  [-53,5.2],[-38,22.8],[-24,8.7],[-5,20],[17,-7.2],[23,-18.3],[43,-21.5],
  [48,-38.8],[65,-19.0],[72,-13.8],[78,21],[90,25],[112,26],[134,9.7],[144,-12.8],[160,20],[198,10.6],
];
crates.forEach(([x,z],i)=>{
  const w=1.02+(i%3)*.18,h=.62+i%3*.13;
  dressing(`crate-${i}`,'village-street-crate',x,z,w,.93,h,'#967451',{modelRotation:{y:(i%5-2)*.14}});
  if(i%4===0)dressing(`crate-${i}-upper`,'village-street-crate',x+.12,z+.06,.7,.64,.42,'#a08260',{baseY:h+.044,overhead:true,modelRotation:{y:(i%3-1)*.19}});
  if(i%4===1)dressing(`basket-${i}`,'village-woven-baskets',x+.92,z+.25,1.03,.75,.53,'#b4986b',{noCollision:true});
  if(i%4===3)dressing(`jars-${i}`,'village-pottery',x+.25,z-.9,1.55,1.22,.7,'#b17c57',{noCollision:true});
});
const palms=[[-211,8.35,6.9],[-169,21.9,5.9],[-124,24.9,6.5],[-101,30.9,5.85],[-57,21.8,6.7],
  [-17,21.2,6.2],[34,-47,6.8],[72,-37,6.15],[136,14.6,7.1],[162,27,6.55]];
palms.forEach(([x,z,h],i)=>dressing(`palm-${i}`,'village-palm',x,z,.62,.62,h,'#827044',{trunkCollision:true,modelRotation:{y:i*.82}}));
// Open well rim, with separate masonry faces and a timber crossbar.
const well={x:54,z:-34.5};
for(const side of [-1,1]){
  dressing(`well-rim-x-${side}`,'village-stone',well.x+side*1.05,well.z,.34,2.44,.85,'#b7a080');
  dressing(`well-rim-z-${side}`,'village-stone',well.x,well.z+side*1.05,1.76,.34,.85,'#b7a080');
  dressing(`well-post-${side}`,'village-wood',well.x+side*1.05,well.z,.14,.14,2.51,'#755d46');
}
dressing('well-beam','village-wood',well.x,well.z,2.39,.15,.15,'#755d46',{baseY:2.48,overhead:true});
dressing('well-jars','village-pottery',well.x+.4,well.z+1.8,1.55,1.22,.76,'#b17c57',{noCollision:true});
for(const [i,x,z] of [[0,-155,7],[1,-79,27],[2,20,4],[3,88,39],[4,149,6],[5,164,21],[6,194,-7]])
  box(`street-cover-${i}`,'village-wood',x,z,2.2,1.15,1.05,'#8f704d');
for(const [i,x,z] of [[0,-232,-2.9],[1,-232,2.9],[2,-206,-4],[3,-206,4],[4,155,-9],[5,155,9]])
  box(`kerb-${i}`,'village-stone',x,z,5,.55,.8,'#ae987a');

const roads=[];
const road=(ax,az,bx,bz,w)=>roads.push({x:(ax+bx)/2,z:(az+bz)/2,w,d:Math.hypot(bx-ax,bz-az)+.35,yaw:Math.atan2(bx-ax,bz-az)});
for(let x=-925;x<-205;x+=12)road(x,convoyRoadZ(x),x+12,convoyRoadZ(x+12),7.5);
road(-205,0,212,0,6.8);road(30,-11,30,-48,5.5);road(-92,4,-92,75,4.2);road(141,2,141,50,4.6);
const landforms=[
  {x:-705,z:-143,rx:240,rz:68,height:9,flat:.16},{x:-627,z:83,rx:220,rz:67,height:6.3,flat:.1},
  {x:-421,z:-130,rx:152,rz:71,height:10,flat:.1},{x:-254,z:122,rx:110,rz:67,height:13,flat:.12},
  {x:0,z:-154,rx:260,rz:56,height:13,flat:.08},{x:58,z:156,rx:235,rz:51,height:11,flat:.12},
  {x:-171,z:19,rx:66,rz:38,height:.82,flat:.13},
  {x:-107,z:45,rx:68,rz:43,height:1.46,flat:.33},
  {x:-74,z:-19,rx:60,rz:31,height:-.54,flat:.24},
  {x:-29,z:-12,rx:62,rz:44,height:1.32,flat:.22},
  {x:46,z:-29,rx:57,rz:37,height:-.92,flat:.19},
  {x:55,z:-70,rx:67,rz:34,height:2.11,flat:.24},
  {x:104,z:44,rx:62,rz:42,height:1.72,flat:.30},
  {x:131,z:4,rx:50,rz:28,height:.43,flat:.12},
  {x:178,z:-17,rx:47,rz:33,height:1.18,flat:.27},
];
const rough=makeTerrain(size,landforms,8);
const terrainPads=[...structures,towerSite].map(site=>{
  const {x,z,w,d}=site;
  const height=Math.round(rough.heightAt(x,z)*10)/10;
  site.baseY=height;
  return {x,z,w:w+3,d:d+3,height,blend:5,protectedW:w+3,protectedD:d+3};
});
const terrain=makeTerrain(size,landforms,cell,terrainPads);
for(const b of boxes)b.baseY+=foundations.get(b)?.baseY??terrain.heightAt(b.x,b.z);
for(const node of navigationNodes)node.y+=foundations.get(node)?.baseY??terrain.heightAt(node.x,node.z);
for(const house of Object.values(houses))if(house.emplacement)house.emplacement.y+=house.baseY;
tower.y+=towerSite.baseY;
tower.baseY=towerSite.baseY;

export function telMazinFloor(x,z){
  const inside=structures.find(s=>Math.abs(x-s.x)<=s.w/2+.18&&Math.abs(z-s.z)<=s.d/2+.18);
  return inside?.baseY??terrain.heightAt(x,z);
}
export const TEL_MAZIN=registerLocalMap(rotateMapAssets({
  id:'tel-mazin',name:'Тель-Мазин',missionId:'m03',theme:'desert-village',campaign:true,size,width:1160,depth:344,
  playArea:{minX:-928,maxX:225,minZ:-169,maxZ:169},navigationCell:2,navigationSize:448,stepHeight:.4,
  fogDensity:.0027,fogColor:'#c6b797',sunColor:'#fff1d7',terrain,terrainMargin:112,terrainPads,boxes,structures,roads,landforms,navigationNodes,
  points:[],districts:[],signs:[],vehicleSpawns:[],spawns:[{x:-830,z:-38},{x:208,z:-7}],
  landmarks:[{id:'gate',name:'Тракт',x:-159,z:0},{id:'market',name:'Рынок',x:50,z:-30},{id:'hq',name:'Штаб',x:174,z:-10}],
  interactives,houses,tower,towerStairs,
}));
