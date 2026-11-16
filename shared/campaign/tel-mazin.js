import {makeTerrain} from '../terrain.js';
import {rotateMapAssets} from '../geometry.js';
import {registerLocalMap} from '../world.js';

const size=2048,boxes=[],structures=[],interactives=[],navigationNodes=[];
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
  boxes.push(part);return part;
};

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
  const color=colors[structures.length%colors.length],thick=.32,door=1.5,level=3;
  const h=floors*level,kind=floors>1?'village-house-tall':'village-house';
  const structure={id,kind,x,z,w,d,h,assetMapId:'village',baseY:0,color,floors,plan,doorWidth:door,doorHeight:2.12,enterable:true,interactiveShutters:true};
  structures.push(structure);
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
      const topWindow=2.4,span=(w-topWindow)/2;
      wall(x,face,w,thick,.9,level);wall(x,face,w,thick,.8,level+2.2);
      for(const dir of [-1,1])wall(x+dir*(topWindow+span)/2,face,span,thick,1.3,level+.9);
    }
    interactive(`${id}-door-${side}`, 'door',x,face,door,.13,2.12,0,'#705238',side<0&&plan==='mayor'?'locked':'closed');
    for(const dz of [-1.25,0,1.25])navigationNodes.push({x,z:face+dz,y:0});
    for(let floor=0;floor<floors;floor++){
      const wy=floor*level,wx=x+side*w/2,opening=2.2,span=(d-opening)/2;
      // Side window openings remain aligned with their shutters and sill.
      wall(wx,z,thick,d,1,wy);wall(wx,z,thick,d,.85,wy+2.15);
      for(const dir of [-1,1])wall(wx,z+dir*(opening+span)/2,thick,span,1.15,wy+1);
      interactive(`${id}-shutter-${side}-${floor}`,'shutter',wx,z,.12,opening,1.15,wy+1,'#7a624c',
        (side===1||plan==='mg')&&plan!=='mayor'?'open':'closed');
    }
  }
  if(['home','two-storey','mayor'].includes(plan)){
    wall(x+w*.27,z+1,w*.37,.28,2.3);
    wall(x+w*.22,z-d*.24,.28,d*.31,2.3);
  }else if(plan==='shop')wall(x+w*.28,z+2.6,w*.35,.3,2.35);
  const stairW=1.7,left=x-w/2,right=x+w/2;
  for(let floor=1;floor<=floors;floor++){
    const dir=floor%2?1:-1,stairX=x-dir*(w/2-1.23),start=z-dir*(d/2-.8),run=d-1.6,stepD=run/10,base=floor*level;
    navigationNodes.push({x:stairX+dir*1.5,z:start+dir*stepD*.5,y:base-level});
    for(let n=0;n<10;n++){
      const stepZ=start+dir*(n+.5)*stepD,top=(floor-1)*level+(n+1)*level/10;
      add('village-stair',stairX,stepZ,stairW,stepD,.17,top-.17,'#af9875');
    }
    add('village-floor',(stairX+stairW/2+right)/2,z,right-stairX-stairW/2,d,.18,base-.18,'#ac987d');
    add('village-floor',(left+stairX-stairW/2)/2,z,stairX-stairW/2-left,d,.18,base-.18,'#ac987d');
    for(const side of [-1,1])add('village-floor',stairX,z+side*(d/2-.4),stairW,.8,.18,base-.18,'#ac987d');
    const landing=z+dir*(d/2-1.02);
    navigationNodes.push({x:stairX,z:landing,y:base},{x:stairX+dir*1.65,z:landing,y:base},{x,z,y:base});
  }
  for(const side of [-1,1]){
    wall(x+side*w/2,z,.3,d,.55,h);
    wall(x,z+side*d/2,w,.3,.55,h);
  }
  add('village-table',x+w*.28,z-d*.27,1.35,.8,.75,0,'#8b6a4b');
  if(plan!=='tea')add('village-cabinet',x+w*.36,z+d*.28,.6,1.25,1.6,0,'#8b6a4b');
  if(plan==='home'||plan==='mayor')add('village-rug',x+.8,z+.9,2.4,2,.03,0,'#a46c4e',{noCollision:true});
  navigationNodes.push({x,z:z-2,y:0},{x,z:z+2,y:0});
  if(cut)interactive(cut,'breach',blastX,blastZ,.34,blastW,level,0,color,'closed');
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

const reserved=[{x:50,z:-31,w:39,d:38},{x:167,z:0,w:52,d:48},{x:108,z:40,w:49,d:24}];
const lotFits=(x,z,w,d)=>[...structures,...reserved].every(s=>Math.abs(x-s.x)>(w+s.w)/2+2.6||Math.abs(z-s.z)>(d+s.d)/2+2.6);
for(const z of [-9.9,9.9,-31,33,-52,55,-74,78,-94,100])for(let col=0;col<21&&structures.length<90;col++){
  const x=-199+col*20,serial=structures.length,w=12+col%3,d=Math.abs(z)<20?13:14;
  if(!lotFits(x,z,w,d))continue;
  const id=`facade-${serial}`,color=colors[serial%colors.length],h=3+(col%3)*.8;
  structures.push({id,kind:'village-facade',x,z,w,d,h,baseY:0,assetMapId:'village',color});
  box(`${id}-shell`,'village-wall',x,z,w,d,h,color,{editorParent:`structure:${id}`,editorPart:true});
  const face=z-Math.sign(z)*(d/2+.03);
  box(`${id}-door`,'village-wood',x+.4,face,1.5,.12,2.05,'#866b53',{noCollision:true,editorParent:`structure:${id}`,editorPart:true});
  box(`${id}-blind`,'village-wood',x-3.15,face,1.55,.12,.85,'#6f604e',
    {baseY:1.18,noCollision:true,editorParent:`structure:${id}`,editorPart:true});
}

// The two flanking walls and the street barricade open together at the fuse.
interactive('barrier','breach',133,0,.6,6.7,1.75,0,'#a38a6a','closed');
interactive('hq-gate','gate',155,0,.18,5.4,2.5,0,'#71583e','locked');

const high=14,tower={x:58,z:-42,y:high};
for(const dx of [-1.8,1.8])for(const dz of [-1.8,1.8])box(`tower-leg-${dx}-${dz}`,'village-wood',tower.x+dx,tower.z+dz,.32,.32,high,'#725d49');
box('tower-platform','village-floor',tower.x,tower.z,5,5,.25, '#8b6f52',{baseY:high-.25,overhead:true});
box('tower-tank','village-wood',tower.x,tower.z-1.3,3.6,1.6,1.45,'#6f7369',{baseY:high,overhead:true});
const awnings=['#a56751','#c3aa71','#718674','#a88168'];
const dressing=(id,...args)=>box(`street-dressing-${id}`,...args);
function stall(i,x,z,w,roof){
  const d=1.35,h=.94;
  dressing(`stall-${i}-counter`,'village-wood',x,z,w,d,.13,'#a78960',{baseY:h-.13,overhead:true});
  for(const side of [-1,1])for(const edge of [-1,1])
    dressing(`stall-${i}-leg-${side}-${edge}`,'village-wood',x+side*(w/2-.13),z+edge*(d/2-.14),.14,.14,h-.13,'#7c6042');
  if(roof){
    for(const side of [-1,1])dressing(`stall-${i}-post-${side}`,'village-wood',x+side*(w/2-.12),z-d*.59,.13,.13,2.46,'#7c6042');
    dressing(`stall-${i}-awning`,'village-awning',x,z,w+.32,2.64,.085,awnings[i%awnings.length],{baseY:2.46,noCollision:true});
  }
  const kind=i%3===0?'village-pottery':'village-produce-crates';
  dressing(`stall-${i}-goods`,kind,x+w*.17,z,1.22,.77,i%3===0?.48:.27,'#a27b54',{baseY:h,noCollision:true});
}
// Keep the central lane and door approaches open. Back streets and the square
// carry the larger clusters, with staggered paths between groups of cover.
const stalls=[
  [36,-19,3.4],[50,-25,3.2],[40,-40,3.4],[63,-29,3.65],[34,-32,3.25],[70,-21,3.1],
  [-170,19,3.2],[-122,20,3.05],[-103,26,3.2],[-82,32,3],[-35,6.25,3.25],
  [22,-13,3.05],[53,-7.35,3.3],[76,27,3.4],[140,20,3.5],[161,26,3.05],
];
stalls.forEach(([x,z,w],i)=>stall(i,x,z,w,i!==10&&i!==12));
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
];
const terrain=makeTerrain(size,landforms,8);
export const TEL_MAZIN=registerLocalMap(rotateMapAssets({
  id:'tel-mazin',name:'Тель-Мазин',missionId:'m03',theme:'desert-village',campaign:true,size,width:1160,depth:344,
  playArea:{minX:-928,maxX:225,minZ:-169,maxZ:169},navigationCell:2,navigationSize:448,stepHeight:.4,
  fogDensity:.0027,fogColor:'#c6b797',sunColor:'#fff1d7',terrain,boxes,structures,roads,landforms,navigationNodes,
  points:[],districts:[],signs:[],vehicleSpawns:[],spawns:[{x:-830,z:-38},{x:208,z:-7}],
  landmarks:[{id:'gate',name:'Тракт',x:-159,z:0},{id:'market',name:'Рынок',x:50,z:-30},{id:'hq',name:'Штаб',x:174,z:-10}],
  interactives,houses,tower,
}));
