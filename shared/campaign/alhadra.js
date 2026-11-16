import {makeTerrain} from '../terrain.js';
import {registerLocalMap} from '../world.js';
import {rotateMapAssets} from '../geometry.js';
import {settlement} from './settlement.js';

// X east, +Z north in the mission document; the compass for this map follows it.
const boxes=[],structures=[],roads=[],size=480;
export const COURIER_SERVICE_ROAD=[[120,52],[82,51],[72,62],[40,66],[-22,66],[-148,65]];
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
const yard=settlement((id,kind,x,z,w,d,h,color,extra)=>village(kind,x,z,w,d,h,color,{id:'alhadra-'+id,...extra}));
function cover(kind,x,z,length,depth,height,yaw=0){
  const b=(kind.startsWith('village-')?village:add)(kind,x,z,length,depth,height,kind==='crate'?'#89704b':'#a88f6d',{modelRotation:{x:0,y:yaw,z:0},campaignCover:true});
  if(kind==='rock')b.baseY-=.25;
  return b;
}
function house(id,x,z,w=12,d=10,h=4.1){
  // Both north and south entrances have 2.6 m clearance, shared collision/visuals.
  const baseY=terrain.heightAt(x,z),part={assetMapId:'village',baseY};
  // Match the two shutter pairs on each side with real window openings.
  const isSchool=id==='school',sill=isSchool?.86:1.15,windowHeight=isSchool?1.64:1.1;
  const opening=isSchool?3.55:2.6,windowCenter=d*.24,sideDepth=d-.42,endLength=sideDepth/2-windowCenter-opening/2;
  for(const side of [-1,1]){
    const wallX=x+side*w/2;
    add('village-wall',wallX,z,.42,sideDepth,sill,'#c9b28b',part);
    add('village-wall',wallX,z,.42,sideDepth,h-sill-windowHeight,'#c9b28b',{...part,baseY:baseY+sill+windowHeight,overhead:true});
    add('village-wall',wallX,z,.42,windowCenter*2-opening,windowHeight,'#c9b28b',{...part,baseY:baseY+sill,overhead:true});
    for(const end of [-1,1]){
      add('village-wall',wallX,z+end*(sideDepth/2-endLength/2),.42,endLength,windowHeight,'#c9b28b',{...part,baseY:baseY+sill,overhead:true});
      if(isSchool){
        const windowZ=z+end*windowCenter;
        for(const edge of [-1,1])village('village-wood',wallX,windowZ+edge*(opening/2-.05),.46,.1,windowHeight,'#786549',{baseY:baseY+sill,overhead:true});
        village('village-wood',wallX,windowZ,.24,opening,.11,'#7b6a4e',{baseY:baseY+sill+.64,overhead:true});
        village('village-stone',wallX,windowZ,.66,opening+.25,.12,'#a58e71',{baseY:baseY+sill-.1});
      }
    }
  }
  for(const side of [-1,1]){
    const gap=2.6,segment=(w-gap)/2;
    for(const dir of [-1,1])add('village-wall',x+dir*(gap/2+segment/2),z+side*d/2,segment,.42,h,'#d4bf98',part);
    add('village-lintel',x,z+side*d/2,gap,.42,h-2.5,'#c6ad86',{...part,baseY:baseY+2.5,overhead:true});
  }
  add('village-floor',x,z,w+.5,d+.5,.22,'#bba684',{...part,baseY:baseY+h,overhead:true});
  structures.push({id,kind:'village-house',x,z,w,d,h,baseY,assetMapId:'village',floors:1,
    doorWidth:2.6,doorHeight:2.5,interactiveShutters:isSchool});
  yard.wear(id+'-facade',x,z-d/2-.21,w,{baseY});
  if(isSchool)for(const side of [-1,1])yard.wall(id+'-roof-cap-'+side,x,z+side*d/2,w,{baseY:baseY+h+.22,height:.59});
  // Furniture sits against the side walls; the two central doorways stay open.
  village('village-table',x-w/2+2.1,z+d/2-2.1,1.6,1.1,.8);
  village('village-chair',x-w/2+3.5,z+d/2-2.1,.55,.55,.9);
  village('village-cabinet',x+w/2-.65,z+d/2-1.25,.9,.55,1.8);
  village('village-rug',x,z,3.4,2.4,.06,'#876449',{noCollision:true});
  yard.detail(id+'-pots','village-pottery',x+w/2+1.1,z-d/2+1.3,1.5,1.2,.95,'#aa7956');
  yard.detail(id+'-baskets','village-woven-baskets',x-w/2-1.1,z+d/2-1.4,1.2,1.1,.8,'#a8885b');
  return {id,x,z,w,d,h};
}
const homes=[];
const lots=[
  [107,66,12,10,3.65],[132,63,11,9.5,3.9],[150,67,14,10,4.15],[184,64,13,11,4.55],
  [105,94,10.8,12,3.3],[187,89,15,10,4.1],[104,114,12,11,3.9],[185,112,13,12,4.45],
  [105,145,12,10,4.2],[131,147,11,12,3.95],[152,144,13,9.5,3.65],[183,146,12,11,4.5],[203,118,11,10,3.75],
];
for(const [i,lot] of lots.entries())homes.push(house(`home-${i}`,...lot));
const school=house('school',150,105,18,16,4.8);homes.push(school);
yard.canopy('school-porch',150,95.3,8.5,3,{height:2.86,wood:true});
yard.sign('school-sign',150,93.59,'ШКОЛА',{baseY:2.43,width:3.4});
for(const x of [145.2,154.7]){
  for(const z of [100.3,102.6])village('village-table',x,z,2.15,.67,.78,'#94785b');
  village('village-wood',x,98.03,3.1,.13,1.05,'#5a6558',{baseY:1.06,overhead:true});
  yard.detail('school-chalk-'+x,'village-wood',x,98.1,1.2,.08,.045,'#d5c6a2',{baseY:1.58},2);
}
village('village-table',155.9,109.5,2.35,1.1,.82,'#7c654a');
village('village-metal',155.9,109.58,1.6,.68,.45,'#655a43',{baseY:.82,overhead:true});
yard.detail('school-cable','village-metal',157.05,108,.065,2.65,.06,'#544637',{baseY:.03},2);
yard.detail('school-paper','village-wood',155.2,109.3,.28,.34,.025,'#d9caa6',{baseY:.826});
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
// Market and court gates turn toward the square and keep the four road crossings clear.
for(const [i,[x,z,w]] of [[129,97,3.1],[134,110.5,3.4],[129.8,105.7,2.8],[138.6,96.1,2.55]].entries())
  yard.stall('well-stall-'+i,x,z,w,{color:['#a97960','#9d8e66','#6a7b6e','#a78755'][i],goods:i===2?'village-pottery':'village-produce-crates'});
for(const [i,[x,z,length,axis,gap]] of [
  [105,104,12,'x',3.25],[97,99,13,'z',2.1],[142,58,18,'x',3.6],
  [184,101,14,'x',3.8],[194,98,14,'z',3.1],[140,156.4,17,'x',3.6],[97,142,10,'z',2.25],
].entries())yard.wall('courtyard-'+i,x,z,length,{axis,gap,height:1.68});
yard.canopy('west-annex',99.4,111.2,3,6.4,{height:2.35,wood:true});
yard.canopy('east-annex',195.5,109.5,3.3,5.6,{height:2.38,wood:true});
for(const [i,[x,z,h]] of [[131,101,5.8],[139.8,106.3,6.45],[143,92.7,5.2],[98,103,6.7],[194,101,5.3],[95,146,6.2]].entries())
  village('village-palm',x,z,.62,.62,h,'#827246',{trunkCollision:true,modelRotation:{y:i*1.43}});
// Ridge trench and two MG positions; sides leave an unblocked rear approach.
for(const x of [-88,-75])cover('sandbags',x,-38,5.8,.85,1.15,-.15);
cover('sandbags',-95,-32,5.5,.85,1.15,Math.PI/2);cover('sandbags',-95,-26,5,.85,1.15,Math.PI/2);
add('tent',-78,-15,7,5,2.5);add('crate',-86,-22,2.2,1.3,1.1);add('generator',-68,-24,1.7,1.1,2.5);
add('tent',39,48,11,8,3.2);
yard.canopy('depot-repair',-4,47,11,7.8,{height:3.42,wood:true});
yard.sign('depot-repair-sign',-4,42.99,'РЕМОНТ',{baseY:3.02});
yard.sign('depot-fuel-sign',22.77,31.1,'ГОРЮЧЕЕ',{baseY:.9,width:1.55,yaw:Math.PI/2,color:'#7b5544'});
yard.wall('fuel-divider',23,35.5,10,{axis:'z',gap:3.1,height:1.15});
yard.wall('fuel-backing',14,39.8,15,{gap:3.8,offset:.5,height:.86});
yard.stall('repair-bench',-6.8,47,3.4,{roof:false,goods:'village-wood'});
yard.detail('depot-tool','village-metal',-7.1,46.9,.52,.12,.055,'#585957',{baseY:.95},2);
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
    // Roadside rocks from the infantry cover generator must not obstruct
    // a Humvee. An old rock at (159.5,77) blocked the evacuation turn.
    const blocksRoad=(Math.abs(x-120)<10||Math.abs(x-167)<10)&&z>50&&z<159
      ||(Math.abs(z-78)<8||Math.abs(z-130)<8)&&x>90&&x<206;
    const blocksService=COURIER_SERVICE_ROAD.slice(1).some(([bx,bz],i)=>{
      const [ax,az]=COURIER_SERVICE_ROAD[i],dx=bx-ax,dz=bz-az;
      const t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz)));
      return Math.hypot(x-ax-dx*t,z-az-dz*t)<5.4;
    });
    if(blocksRoad||blocksService||routeCover.some(p=>Math.hypot(p.x-x,p.z-z)<8)
      ||homes.some(h=>Math.abs(h.x-x)<h.w/2+2&&Math.abs(h.z-z)<h.d/2+2))continue;
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
// Keep the market awning beside the paved road, not across the car's path.
for(const [i,[x,z]] of [[91,58],[129,84],[154,84],[191,155],[117,152],[142,123]].entries()){
  village('village-awning',x,z,4.5,3.2,.12,'#a88a5e',{baseY:2.5,noCollision:true});
  for(const dx of [-2,2])village('village-wood',x+dx,z,.12,.12,2.5,'#796347');
  yard.detail('supply-baskets-'+i,'village-produce-crates',x,z+.7,2.1,1.1,.85,'#a58762');
  yard.detail('pottery-'+i,'village-pottery',x+2.9,z,1.7,1.2,.9,'#a77956');
  if(i%2===0)add('car',x-4,z+2,2.2,4.5,1.7,'#726e57');
}
for(const [x,z,h] of [[94,125,5.5],[196,76,6.4],[201,98,5.8],[-31,43,6.1],[-25,46,5.1]])
  village('village-palm',x,z,.62,.62,h,'#88734c',{trunkCollision:true});
for(let i=0;i<10;i++)for(const side of [-1,1]){
  const x=side*(255+i%2*9),z=-175+i*39;
  village('village-rock',x,z,49+i%3*8,52,27+i%4*7,'#a68f74',{baseY:-5});
}
for(let i=0;i<9;i++)for(const side of [-1,1])village('village-rock',-210+i*54,side*207,58,55,24+i%3*9,'#a28d76',{baseY:-6});
const road=(a,b,width)=>roads.push({x:(a[0]+b[0])/2,z:(a[1]+b[1])/2,w:width,d:Math.hypot(b[0]-a[0],b[1]-a[1]),yaw:Math.atan2(b[0]-a[0],b[1]-a[1])});
road([-75,-27],[18,12],5.5);road([47,28],[81,58],5);road([81,58],[117,77],5);
const wadiTracks=[[-206,-144],[-188,-124],[-171,-112],[-157,-103],[-142,-91],[-127,-72]];
for(const offset of [-.8,.8])for(let i=1;i<wadiTracks.length;i++){
  const [x,z]=wadiTracks[i-1],[endX,endZ]=wadiTracks[i];
  road([x+offset,z-offset],[endX+offset,endZ-offset],.44);
}
for(const [i,[x,z]] of [[-202,-130],[-184,-118],[-163,-106],[-146,-88],[-129,-68]].entries()){
  yard.detail('wadi-silt-'+i,'village-stone',x,z,2.7,.8,.035,'#948062',{baseY:terrain.heightAt(x,z)+.015,modelRotation:{y:.42}},2);
  yard.detail('wadi-scrub-'+i,'village-scrub',x+.9,z,.65,.52,.38,'#767246',{baseY:terrain.heightAt(x+.9,z)});
}
road([124,103],[143,103],3.2);road([134,91],[136,116],2.7);
road([1,25],[1,42],4.3);road([22,27],[38,27],4.8);
for(let i=1;i<COURIER_SERVICE_ROAD.length;i++)road(COURIER_SERVICE_ROAD[i-1],COURIER_SERVICE_ROAD[i],4.4);
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
