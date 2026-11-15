import {makeTerrain} from '../terrain.js';
import {registerLocalMap} from '../world.js';
import {rotateMapAssets} from '../geometry.js';

// X east, +Z north in the mission document; the compass for this map follows it.
const boxes=[],structures=[],roads=[],size=480;
const landforms=[
  {x:-80,z:-30,rx:57,rz:44,height:12,flat:.25},
  {x:-193,z:-125,rx:28,rz:81,height:-3.8,flat:.4,angle:-.65},
  {x:70,z:38,rx:94,rz:12,height:-2.8,flat:.45,angle:-.3},
  ...[-1,1].flatMap(side=>[-160,-80,0,80,155].map((z,i)=>({x:side*(215+i%2*10),z,rx:38,rz:45,height:8+i%3*3,flat:.12}))),
];
const pads=[
  {x:20,z:30,w:75,d:65,height:0,blend:12},
  {x:150,z:105,w:126,d:116,height:0,blend:14},
  {x:-215,z:-151,w:13,d:15,height:0,blend:9},
  {x:200,z:147,w:9,d:12,height:0,blend:5},
  {x:-81,z:-30,w:26,d:24,height:12,blend:9},
  // The isolated ridge shelter sits just north of the main plateau. Its
  // footprint used to bridge a ~0.7 m slope and appear to float on one side.
  // Include a cell-margin around the walls for the actual terrain triangles.
  {x:-78,z:-15,w:16,d:14,height:12,blend:7,protectedW:16,protectedD:14},
];
const terrain=makeTerrain(size,landforms,4,pads);
function add(kind,x,z,w,d,h,color='#bba17c',extra={}){
  const b={id:`alhadra-${boxes.length}`,kind,x,z,w,d,h,color,baseY:terrain.heightAt(x,z),...extra};boxes.push(b);return b;
}
const village=(kind,x,z,w,d,h,color,extra={})=>add(kind,x,z,w,d,h,color,{assetMapId:'village',...extra});
function cover(kind,x,z,length,depth,height,yaw=0){
  const b=(kind.startsWith('village-')?village:add)(kind,x,z,length,depth,height,kind==='crate'?'#89704b':'#a88f6d',{modelRotation:{x:0,y:yaw,z:0},campaignCover:true});
  if(kind==='rock')b.baseY-=.25;
  return b;
}
function house(id,x,z,w=12,d=10,h=4.1){
  // Both north and south entrances have 2.6 m clearance, shared collision/visuals.
  const baseY=terrain.heightAt(x,z),part={assetMapId:'village',baseY};
  // Match the two shutter pairs on each side with real window openings.
  const opening=2.6,windowCenter=d*.24,sideDepth=d-.42,endLength=sideDepth/2-windowCenter-opening/2;
  for(const side of [-1,1]){
    const wallX=x+side*w/2;
    add('village-wall',wallX,z,.42,sideDepth,1.15,'#c9b28b',part);
    add('village-wall',wallX,z,.42,sideDepth,h-2.25,'#c9b28b',{...part,baseY:baseY+2.25,overhead:true});
    add('village-wall',wallX,z,.42,windowCenter*2-opening,1.1,'#c9b28b',{...part,baseY:baseY+1.15,overhead:true});
    for(const end of [-1,1])add('village-wall',wallX,z+end*(sideDepth/2-endLength/2),.42,endLength,1.1,'#c9b28b',{...part,baseY:baseY+1.15,overhead:true});
  }
  for(const side of [-1,1]){
    const gap=2.6,segment=(w-gap)/2;
    for(const dir of [-1,1])add('village-wall',x+dir*(gap/2+segment/2),z+side*d/2,segment,.42,h,'#d4bf98',part);
    add('village-lintel',x,z+side*d/2,gap,.42,h-2.5,'#c6ad86',{...part,baseY:baseY+2.5,overhead:true});
  }
  add('village-floor',x,z,w+.5,d+.5,.22,'#bba684',{...part,baseY:baseY+h,overhead:true});
  structures.push({id,kind:'village-house',x,z,w,d,h,baseY,assetMapId:'village',floors:1,doorWidth:2.6,doorHeight:2.5});
  // Furniture sits against the side walls; the two central doorways stay open.
  village('village-table',x-w/2+2.1,z+d/2-2.1,1.6,1.1,.8);
  village('village-chair',x-w/2+3.5,z+d/2-2.1,.55,.55,.9);
  village('village-cabinet',x+w/2-.65,z+d/2-2.2,.9,.55,1.8);
  village('village-rug',x,z,3.4,2.4,.06,'#876449',{noCollision:true});
  village('village-pottery',x+w/2+1.1,z-d/2+1.3,1.5,1.2,.95);
  village('village-woven-baskets',x-w/2-1.1,z+d/2-1.4,1.2,1.1,.8);
  return {id,x,z,w,d,h};
}
const homes=[];
for(const [i,[x,z]] of [[107,66],[128,66],[153,66],[179,66],[107,91],[181,91],[107,117],[181,117],[107,143],[130,143],[154,143],[181,143],[204,119]].entries())homes.push(house(`home-${i}`,x,z));
const school=house('school',150,105,18,16,4.8);homes.push(school);
add('generator',151,108,1.5,.7,1.1,'#5a685c');
add('pillar',159,110,.18,.18,12,'#6c756d');
// Well, fences, palms, a perimeter with broad gates.
cover('sandbags',139,119,4,.85,1.15,0);
structures.push({id:'well',kind:'village-well',x:137,z:103,w:3.8,d:3.8,h:3.5,baseY:0,assetMapId:'village'});
for(const side of [-1,1]){
  village('village-stone',137+side*1.25,103,.5,3,.9,'#aa9574');
  village('village-stone',137,103+side*1.25,2,.5,.9,'#aa9574');
  village('village-wood',137+side*1.65,103,.18,.18,3.2,'#75583d');
}
village('village-wood',137,103,3.8,.22,.22,'#75583d',{baseY:3.15,overhead:true});
// The old short perimeter walls were placed directly across both the 78/130
// east-west roads and the 120/167 north-south roads. They trapped scripted
// Humvees even when their intended road waypoints were perfectly aligned.
// Keep the roads clear; the surrounding homes and barricades remain cover.
for(const z of [79,131])for(const x of [118,164,194]){
  if(Math.abs(z-78)<3||Math.abs(z-130)<3)continue;
  add('wall',x,z,10,.45,1.4);
}
for(let i=0;i<16;i++)add('village-palm',69+i%4*8,54+Math.floor(i/4)*10,.65,.65,6.5,'#8d805a',{assetMapId:'village'});
// Ridge trench and two MG positions; sides leave an unblocked rear approach.
for(const x of [-88,-75])cover('sandbags',x,-38,5.8,.85,1.15,-.15);
cover('sandbags',-95,-32,5.5,.85,1.15,Math.PI/2);cover('sandbags',-95,-26,5,.85,1.15,Math.PI/2);
add('tent',-78,-15,7,5,2.5);add('crate',-86,-22,2.2,1.3,1.1);add('generator',-68,-24,1.7,1.1,2.5);
for(const x of [1,20,39])add('tent',x,48,11,8,3.2);
for(const x of [0,21,42])add('truck',x,24,3,7,3.3,'#576354',{campaignDestructible:true});
for(let i=0;i<8;i++)add('village-barrels',9+i%4*3.6,33+Math.floor(i/4)*4,1.1,1.1,1.35,'#815e3e',{assetMapId:'village',campaignFuel:i,campaignDestructible:true});
for(const x of [-16,52])for(const z of [12,43])cover('sandbags',x,z,6,.85,1.15,Math.PI/2);
for(const x of [-12,49]){add('crate',x,29,3,2,1.4);add('crate',x,32,1.5,1.5,.9);}
add('generator',-5,51,2,1.3,2.5);add('fueltank',49,55,2.4,5,2.5,'#716449');
for(const [x,z] of [[4,43],[23,43],[42,43]]){village('village-table',x,z,2.4,1.3,.85);village('village-chair',x-1.7,z,.6,.6,.9);}
add('crate',14,44,6,3,2);add('crate',32,12,6,2,1.3);
add('truck',-215,-151,3,7,3.3,'#5c5549');
add('truck',200,147,3,7,3.3,'#586953');
for(const [x,z] of [[-208,-150],[-223,-144],[-219,-158]])add('crate',x,z,1.6,1.2,.95);
// Route cover belongs to its setting: rock banks in the wadi, broken masonry
// near the village and supply stacks by the depot. Sandbags fortify posts only.
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
const routeCover=[];
for(const [name,path] of Object.entries(ROUTES))for(let i=1;i<path.length;i++){
  const a=path[i-1],b=path[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
  if(name==='road')continue;
  for(let t=8;t<length;t+=17){
    const f=t/length,dx=(b[0]-a[0])/length,dz=(b[1]-a[1])/length,side=(i+Math.floor(t/17))%2?1:-1;
    const x=a[0]+(b[0]-a[0])*f-dz*side*4.5,z=a[1]+(b[1]-a[1])*f+dx*side*4.5;
    if(routeCover.some(p=>Math.hypot(p.x-x,p.z-z)<8)||homes.some(h=>Math.abs(h.x-x)<h.w/2+2&&Math.abs(h.z-z)<h.d/2+2))continue;
    routeCover.push({x,z});const yaw=-Math.atan2(dz,dx)+Math.PI/2,index=routeCover.length;
    if(x<-45||name==='channel')cover('rock',x,z,3.4+index%3,2.2+index%2,1.2+index%3*.25,yaw);
    else if(x<55&&index%2)cover('crate',x,z,2.7,1.4,1.1,yaw);
    else cover(index%2?'village-barricade':'village-rubble',x,z,3.8,.85,1.25,yaw);
  }
}
// Authored scenery clusters give each approach a silhouette without filling
// the traversable corridors or placing props at random points on a slope.
for(const [x,z] of [[-187,-131],[-163,-112],[-135,-85],[-108,-62],[-51,-46],[-31,5],[60,23],[83,29]]){
  // Separate boulders leave the gaps in a rock pile traversable, using the
  // existing mesh and its matching bevelled collision for each stone.
  for(const [dx,dz,w,d,h] of [[-5,5,2.8,2.2,1.5],[-7.4,5.7,1.8,2.1,1],[-2.9,6.2,1.5,1.5,.85]])
    add('rock',x+dx,z+dz,w,d,h,'#aa977d',{assetMapId:'quarry',baseY:terrain.heightAt(x+dx,z+dz)-.15});
  village('village-rubble',x-1,z+7,2.8,1.5,.7);village('village-wood',x+2,z+8,4,.5,.5,'#736149',{modelRotation:{y:.45}});
}
for(const [i,[x,z]] of [[91,58],[129,84],[168,84],[191,155],[117,152],[142,123]].entries()){
  village('village-awning',x,z,4.5,3.2,.12,'#a88a5e',{baseY:2.5,overhead:true});
  for(const dx of [-2,2])village('village-wood',x+dx,z,.12,.12,2.5,'#796347');
  village('village-produce-crates',x,z+.7,2.1,1.1,.85);village('village-pottery',x+2.9,z,1.7,1.2,.9);
  if(i%2===0)add('car',x-4,z+2,2.2,4.5,1.7,'#726e57');
}
for(const [x,z] of [[94,128],[193,76],[121,53],[202,97],[-31,43],[-58,-13]])for(let n=0;n<3;n++)village('village-palm',x+n*3.7,z+n%2*4,.6,.6,5.5+n*.6);
for(let i=0;i<10;i++)for(const side of [-1,1]){
  const x=side*(255+i%2*9),z=-175+i*39;
  village('village-rock',x,z,49+i%3*8,52,27+i%4*7,'#a68f74',{baseY:-5});
}
for(let i=0;i<9;i++)for(const side of [-1,1])village('village-rock',-210+i*54,side*207,58,55,24+i%3*9,'#a28d76',{baseY:-6});
const road=(a,b,width)=>roads.push({x:(a[0]+b[0])/2,z:(a[1]+b[1])/2,w:width,d:Math.hypot(b[0]-a[0],b[1]-a[1]),yaw:Math.atan2(b[0]-a[0],b[1]-a[1])});
road([-75,-27],[18,12],5.5);road([47,28],[81,58],5);road([81,58],[117,77],5);
for(const x of [120,167])road([x,53],[x,157],5);
for(const z of [78,130])road([91,z],[204,z],5);
for(const x of [0,21,42])road([x,6],[x,56],6);
for(const [x,z] of [[93,152],[119,155],[171,151],[-12,54],[47,43]]){
  village('village-barrels',x,z,1.8,1.1,1.15,'#7c755a');add('crate',x+2.2,z,1.6,1.2,.8);village('village-wood',x+2,z+1.6,3.2,.8,.12,'#76634b');
}
const landmarks=[{id:'wadi',name:'Сухое русло',x:-200,z:-140},{id:'ridge',name:'Наблюдательный пост',x:-80,z:-30},{id:'depot',name:'Тыловой склад',x:20,z:30},{id:'village',name:'Аль-Хадра',x:150,z:105},{id:'exit',name:'Восточная дорога',x:200,z:140}];
export const ALHADRA=registerLocalMap(rotateMapAssets({
  id:'alhadra',name:'Аль-Хадра',theme:'desert-village',campaign:true,size,width:480,depth:360,
  playArea:{minX:-240,maxX:240,minZ:-180,maxZ:180},navigationCell:2,stepHeight:.45,
  fogDensity:.008,fogColor:'#101b30',sunColor:'#a8c9ef',terrain,landforms,terrainPads:pads,
  terrainPadBlend:4,boxes,structures,roads,points:[],landmarks,districts:landmarks,homes,school,
  spawns:[{x:-200,z:-140},{x:210,z:155}],vehicleSpawns:[],signs:[],
}));
