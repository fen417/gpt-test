import {makeTerrain} from '../terrain.js';
import {registerLocalMap} from '../world.js';

const size=2048,cell=8,boxes=[],structures=[],roads=[],navigationNodes=[];
const landforms=[
  {x:-908,z:660,rx:225,rz:235,height:24,flat:.06},
  {x:748,z:-804,rx:246,rz:156,height:32,flat:.09},
  {x:955,z:517,rx:152,rz:346,height:16,flat:.08},
];
const terrainPads=[{x:90,z:116,w:1500,d:24,height:-4.2,blend:8}];
const terrain=makeTerrain(size,landforms,cell,terrainPads);

export const NAHAR_LANDING={primary:{x:-35,z:-35},alternate:{x:-111,z:-38}};
export const NAHAR_WATER={x:90,z:116,w:1490,d:21,y:-3.18};
export const NAHAR_SITES={
  supplyPrimary:{x:-52,z:-12},supplyAlternate:{x:-93,z:-15},workshop:{x:-76,z:20},
  platforms:{x:2,z:-1},station:{x:19,z:13},dispatcher:{x:33,y:3.12,z:31},
  log:{x:25,y:3.12,z:27},recording:{x:37,z:42},freight:{x:37,z:58},
  bridge:{x:104,z:93},power:{x:124,z:164},relay:{x:142,z:157},
  tunnelGate:{x:177,z:194},exit:{x:209,z:194},
};

function part(id,x,z,w,d,h,baseY,color,{surface='village-stucco',kind='city-box',detail=0,
  noCollision=false,dynamic=false,shape}={}){
  const b={id,kind,x,z,w,d,h,baseY,color,surface,detailLevel:detail,noCollision,missionDynamic:dynamic,shape,
    overhead:baseY>.5,assetMapId:'nahar'};
  boxes.push(b);return b;
}

function wall(id,x,z,width,depth,height,color,{baseY=0,gap=0,offset=0,axis='x',head=2.6}={}){
  const segment=(suffix,center,span,y=baseY,h=height)=>{
    if(span>.02&&h>.02)part(id+suffix,x+(axis==='x'?center:0),z+(axis==='z'?center:0),
      axis==='x'?span:depth,axis==='x'?depth:span,h,y,color);
  };
  if(!gap){segment('',0,width);return;}
  const left=width/2+offset-gap/2,right=width-left-gap;
  segment('-left',-width/2+left/2,left);
  segment('-right',width/2-right/2,right);
  segment('-lintel',offset,gap,baseY+head,height-head);
}

function street(id,x,z,w,d,color='#595856'){
  roads.push({id,x,z,w,d,yaw:0});
  part(id,x,z,w,d,.035,-.025,color,{surface:'asphalt',noCollision:true});
  const alongX=w>d,length=alongX?w:d;
  for(let n=-length/2+6;n<length/2-3;n+=12)
    part(`${id}-mark-${n}`,x+(alongX?n:0),z+(alongX?0:n),alongX?4:.13,alongX?.13:4,.012,.014,
      '#bcb589',{noCollision:true,detail:1});
}

const masonry=['#af9e83','#c3ab91','#a98c76','#d0b794','#a79d91','#bcab9d','#c0aa80'];
const roof=['#92816d','#a29a88','#8a7a68','#a28d72','#96867d'];
function block(id,x,z,w,d,h,seed,{near=true,tint=null,tank=false}={}){
  const color=tint??masonry[seed%masonry.length],top=roof[seed%roof.length];
  const y=0;
  structures.push({id,kind:'city-block',x,z,w,d,h,baseY:y,assetMapId:'nahar'});
  part(id,x,z,w,d,h,y,color,{noCollision:!near});
  part(id+'-roof',x,z,w+.46,d+.46,.23,h,top,{noCollision:!near,kind:'village-floor'});
  for(const side of [-1,1]){
    part(id+'-edge-'+side,x,z+side*d*.49,w,.25,.48,h+.23,top,{noCollision:!near});
    if(!near)continue;
    part(id+'-curb-'+side,x,z+side*(d/2+.72),w+1.25,1.22,.14,0,'#aa9b83');
    const bays=Math.max(2,Math.floor(w/4.2));
    for(let y=2.05;y<h-1.3;y+=3.36){
      for(let bay=0;bay<bays;bay++){
        const px=x+(bay+.5-bays/2)*w/bays;
        part(`${id}-glass-${side}-${y}-${bay}`,px,z+side*(d/2+.021),1.36,.055,1.42,y,
          (seed+bay)%5===2?'#576765':'#55544e',{surface:'metal',detail:1,noCollision:true});
        part(`${id}-sill-${side}-${y}-${bay}`,px,z+side*(d/2+.05),1.57,.22,.12,y-.06,top,{detail:2,noCollision:true});
      }
      if((seed+(side>0?1:0))%3===0)
        part(`${id}-balcony-${side}-${y}`,x-w*.24,z+side*(d/2+.48),w*.3,1.12,.23,y-.15,top,
          {detail:1,noCollision:true});
    }
    for(const edge of [-1,1]){
      part(`${id}-column-${side}-${edge}`,x+edge*(w/2-.28),z+side*(d/2+.055),.48,.13,h,0,top,{detail:1,noCollision:true});
    }
    const entry=x+(seed%3-1)*w*.23,front=z+side*(d/2+.08);
    part(id+'-entrance-'+side,entry,front,1.85,.14,2.55,0,'#6d6256',{detail:1,noCollision:true});
    part(id+'-awning-'+side,entry,front+side*.74,3.8,1.52,.15,2.69,
      ['#86715e','#7c6660','#75847b','#607982'][seed%4],{surface:'metal',detail:1,noCollision:true});
    if(seed%5===0)part(id+'-stripe-'+side,x,front,w,.1,.47,h-1.3,top,{detail:1,noCollision:true});
  }
  if(tank||near&&seed%4===0){
    const tx=x+w*.29,tz=z-d*.27,tone=tank?'#315d79':'#686861';
    part(id+'-tank-stand',tx,tz,3.4,2.9,.48,h+.23,'#52585a',{surface:'metal',noCollision:true});
    part(id+'-tank',tx,tz,2.85,2.85,2,h+.71,tone,{surface:'metal',shape:'cylinder'});
  }
  if(near||seed%5===0)part(id+'-headhouse',x-w*.21,z+d*.26,w*.26,d*.23,2.45,h+.23,top,{noCollision:!near});
  return h+.235;
}

const airPosts={};
for(const [id,x,z,w,d,h,seed,tank] of [
  ['blue',-347,-113,24,23,12.8,2,true],['line',-255,-111,23,21,16.0,3,false],
  ['arcade',-162,-97,26,22,15.6,4,false],['corner',-68,-91,25,22,14.8,7,false],
  ['balcony',38,-81,28,20,18.3,6,false],['siding',67,0,19,14,10.6,8,false],
  ['signal',-70,2,21,17,10.2,15,false],['foundry',-44,47,25,21,12.0,5,false],
])airPosts[id]={x,y:block(id,x,z,w,d,h,seed,{tank}),z};
airPosts.station={x:33,y:10.07,z:33};
export const NAHAR_AIR_POSTS=airPosts;

const reserved=[
  {x:-68,z:-33,w:138,d:61},{x:-96,z:25,w:82,d:34},{x:12,z:13,w:108,d:104},
  {x:83,z:37,w:30,d:85},{x:104,z:97,w:36,d:85},{x:152,z:171,w:127,d:91},
  {x:-192,z:-171,w:675,d:27},{x:0,z:116,w:1800,d:36},
  ...structures.map(s=>({...s,w:s.w+13,d:s.d+13})),
];
for(let row=-8;row<=8;row++)for(let col=-11;col<=11;col++){
  const seed=(row+14)*419+(col+15)*83;
  for(let n=0;n<2;n++){
    const x=col*77+n*27-10+(seed%13-6),z=row*81+(n?9:-16)+(seed%17-8);
    const w=18+(seed+n*9)%15,d=17+(seed+n*5)%13;
    if(reserved.some(b=>Math.abs(x-b.x)<(w+b.w)/2+4&&Math.abs(z-b.z)<(d+b.d)/2+4))continue;
    const near=Math.abs(x)<447&&Math.abs(z)<280;
    const height=6+(seed+n*11)%(near?19:23)+(near?0:seed%9===0?26:0);
    block(`building-${row}-${col}-${n}`,x,z,w,d,height,seed+n,{near});
  }
}

street('north-avenue',-142,-166,793,12);
street('depot-road',-41,-9,210,7.5);
street('station-road',5,58,167,8.5);
street('canal-road',91,153,361,7);
street('bridge-road',104,75,8,78);
for(const z of [-396,-291,-221,187,266,348,434,516])
  part('cross-street-'+z,0,z,1700,9.3,.019,-.012,'#676360',{surface:'asphalt',noCollision:true});
for(const x of [-704,-532,-373,-216,269,421,580,733])for(const [start,end] of [[-680,96],[135,671]])
  part(`district-street-${x}-${start}`,x,(start+end)/2,10.3,end-start,.017,-.012,'#68655e',{surface:'asphalt',noCollision:true});
for(const [i,pad] of Object.values(NAHAR_LANDING).entries()){
  part('yard-'+i,pad.x,pad.z,48,36,.07,-.055,i?'#716f62':'#62686a',{surface:'asphalt',noCollision:true});
  for(const dx of [-3.2,3.2])part(`pad-line-${i}-${dx}`,pad.x+dx,pad.z,.23,7.4,.032,.04,'#baab77',{noCollision:true});
  part('pad-bar-'+i,pad.x,pad.z,6.4,.23,.032,.04,'#baab77',{noCollision:true});
  for(const z of [pad.z-20,pad.z+20])wall(`depot-fence-${i}-${z}`,pad.x,z,36,.27,1.55,'#908d80',{gap:10});
}

// Repair halls and the station remain open to infantry and bot navigation.
const concrete='#afa18c',beam='#4c5858',iron={surface:'metal'};
for(const [id,x,z,w,d] of [['shed-west',-104,23,30,19],['shed-east',-68,25,25,17]]){
  for(const side of [-1,1])wall(id+'-side-'+side,x+side*w/2,z,d,.27,4.8,concrete,{axis:'z',gap:5});
  for(const side of [-1,1])wall(id+'-front-'+side,x,z+side*d/2,w,.27,4.8,concrete,{gap:7});
  part(id+'-roof',x,z,w+.8,d+.86,.26,4.8,id==='shed-west'?'#375d70':'#80796b',iron);
  for(const dz of [-5,5])part(id+'-workbench-'+dz,x-4,z+dz,6.5,1.12,.91,0,'#796747');
}
for(const z of [-1,4]){
  for(const dz of [-.68,.68])part(`rail-${z}-${dz}`,11,z+dz,186,.09,.105,.012,'#4c4641',iron);
  for(let x=-80;x<102;x+=1.4)part(`tie-${z}-${x}`,x,z,.22,2.25,.08,0,'#77695b',{detail:1,noCollision:true});
}
for(const [index,z] of [[0,-6],[1,9]]){
  part('platform-'+index,14,z,88,3.15,.26,0,'#b0a18a',{kind:'village-floor'});
  part('platform-roof-'+index,12,z,62,3.9,.16,4.1,'#615f55',iron);
  for(const x of [-18,-3,12,27,42])part(`platform-column-${index}-${x}`,x,z,.18,.18,4.1,.14,beam,iron);
}
for(const [index,x] of [[0,52],[1,65.4],[2,78.8]]){
  const z=4,tone=index===0?'#596f71':'#95876c';
  part('railcar-body-'+index,x,z,12.8,2.65,2.44,.49,tone,iron);
  part('railcar-cap-'+index,x,z,12.62,2.51,.18,2.93,'#777466',iron);
  for(const side of [-1,1]){
    for(const dx of [-4,-1.9,1.9,4])part(`railcar-window-${index}-${side}-${dx}`,x+dx,z+side*1.336,1.31,.046,.95,1.6,'#465958',
      {...iron,noCollision:true,detail:1});
    part(`railcar-door-${index}-${side}`,x,z+side*1.337,1.28,.05,1.96,.66,'#5a6462',{...iron,noCollision:true,detail:1});
    part(`railcar-step-${index}-${side}`,x,z+side*1.53,1.52,.44,.16,.43,'#514d43',iron);
  }
  for(const dx of [-4.4,4.4])part(`railcar-bogie-${index}-${dx}`,x+dx,z,2.15,1.86,.48,.015,'#454441',iron);
}
wall('station-north',20,13,48,.34,9.8,concrete,{gap:6,offset:-1});
wall('station-south',20,46,48,.34,9.8,concrete,{gap:5,offset:17});
wall('station-west',-4,29.5,33,.34,9.8,concrete,{axis:'z',gap:5,offset:5});
wall('station-east',44,29.5,33,.34,9.8,concrete,{axis:'z',gap:4,offset:11});
part('station-roof',20,29.5,49.2,34.15,.27,9.8,'#857a64',{kind:'village-floor'});
part('station-ledge',20,12.65,48.8,1.3,.26,3.45,'#827561');
part('station-clock',19,12.5,2.6,.29,2.6,6.25,'#e5dbb6',{noCollision:true});
part('clock-hand-long',19.22,12.33,.13,.08,.89,7.48,'#3d4644',{noCollision:true});
part('clock-hand-short',18.98,12.26,.75,.08,.145,7.47,'#3d4644',{noCollision:true});
for(const x of [-1,7,15,23,31,39])part('station-upper-window-'+x,x,12.77,1.8,.21,2.22,4.45,'#465750',{...iron,detail:1,noCollision:true});
for(const x of [1,10,36,41])part('station-counter-'+x,x,23,3.9,.77,1.05,0,'#877356');
part('dispatch-mezzanine',32.8,31.7,21,22.7,.29,2.83,'#857869',{kind:'village-floor'});
part('stair-landing',19.8,32.2,6.1,3.2,.29,2.83,'#857869',{kind:'village-floor'});
for(let i=0;i<12;i++){
  const z=20.1+i*.93,y=(i+1)*.26;
  part('station-stair-'+i,19.8,z,3.7,.95,.27,y-.27,'#9a8e7f',{kind:'village-stair'});
  navigationNodes.push({x:19.8,y,z});
}
for(const [x,z] of [[23,26],[34,33],[41,38]])part(`dispatch-console-${x}`,x,z,2.9,.86,1.05,3.12,'#4f6263',iron);
for(const side of [-1,1])part('stair-rail-'+side,19.8+side*2.05,23.4,.085,6.5,.08,1.25,beam,{...iron,detail:2,noCollision:true});
part('station-divider',1,36,5,.27,2.47,0,'#968a73');

for(const z of [101,131]){
  for(const x of [-160,-82,-15,53,148,221,292])if(Math.abs(x-104)>12)
    wall(`canal-rail-${x}-${z}`,x,z,55,.29,1.1,concrete,{gap:2.2,offset:12});
  for(const [start,end] of [[-183,99],[109,337]])
    part(`canal-bank-${z}-${start}`,(start+end)/2,z,end-start,.42,3.6,-3.15,'#867c6d');
}
// Two breaks in the bank align with the service bridge and the maintenance stairs.
part('canal-bridge',104,116,8.6,44,.44,-.41,'#9c9180',{kind:'village-floor'});
for(const dx of [-4.35,4.35])part('canal-bridge-rail-'+dx,104+dx,116,.23,36,1.06,.02,beam,iron);
for(const [id,x,z,axis] of [['pump-n',125,159,'x'],['pump-s',125,173,'x'],['pump-w',114,166,'z'],['pump-e',136,166,'z']])
  wall(id,x,z,axis==='x'?22:14,.3,4.1,concrete,{axis,gap:axis==='x'?3:2.6});
part('pump-roof',125,166,22.8,14.65,.26,4.1,'#827664',{kind:'village-floor'});
part('pump-board',124,165.7,2.5,.54,1.48,0,'#435c55',iron);
part('relay-box',142,158.4,1.8,.72,1.38,0,'#455a58',iron);
part('mast',147,163,.28,.28,22,0,'#57605b',iron);
for(const y of [5,9,13,17,21])part('mast-arm-'+y,147,163,4.6,.23,.15,y,'#65675d',{...iron,detail:1,noCollision:true});
for(const [x,z] of [[-56,-12],[-96,-15],[9,-11],[32,52],[48,58],[64,56],[91,88],[110,146],[138,146],[157,158],[169,178]]){
  part(`cover-${x}-${z}`,x,z,3.8,1.05,1.05,0,'#938371');
  part(`crate-${x}-${z}`,x+.95,z+.57,1.13,.74,.67,0,'#756c52',{surface:'wood'});
}
for(const [id,x,z,tone] of [['depot',-57,-53,'#78654e'],['yard',-129,-54,'#6c7e73'],['freight',54,66,'#786957'],
  ['west',62,61,'#8c6a54'],['water',159,153,'#65746e']]){
  part('container-'+id,x,z,6.1,2.45,2.55,0,tone,iron);
  for(const side of [-1,1])for(let n=-2.72;n<2.8;n+=.34)
    part(`container-rib-${id}-${side}-${n}`,x+n,z+side*1.24,.06,.09,2.28,.12,tone,{...iron,noCollision:true,detail:1});
}
for(const [id,x,z] of [['depot',-40,-9],['station',7,-5],['freight',46,60],['canal',124,148],['tunnel',175,185]]){
  part(id+'-sign-post',x,z,.08,.08,2.6,0,beam,{...iron,detail:1,noCollision:true});
  part(id+'-sign-board',x,z,1.8,.105,.52,2.04,'#6c827b',{...iron,detail:1,noCollision:true});
  part(id+'-sign-inset',x,z-.06,1.45,.03,.08,2.31,'#e0d4a5',{detail:1,noCollision:true});
}
for(const side of [-1,1])part('tunnel-side-'+side,200,194+side*4.85,46,.45,4.1,0,'#6d6d64');
part('tunnel-roof',200,194,46.4,10.5,.55,4.1,'#797267');
part('tunnel-back',223,194,.48,9.7,4.1,0,'#484942');
export const NAHAR_GATES={
  service:part('nahar-service-gate',-4,34.5,.28,5,2.6,0,'#637675',{...iron,dynamic:true}),
  tunnel:part('nahar-tunnel-gate',177.8,194,.27,9.6,3.4,0,'#756b59',{...iron,dynamic:true}),
};
export const NAHAR=registerLocalMap({
  id:'nahar',missionId:'m04',name:'Нахар',theme:'desert-village',campaign:true,size,width:1900,depth:1660,
  terrain,terrainPads,landforms,terrainMargin:90,navigationCell:2,navigationSize:744,navigationClearance:.78,
  playArea:{minX:-208,maxX:318,minZ:-112,maxZ:230},
  fogColor:'#c6ac91',fogDensity:.00155,sunColor:'#ffe0ad',stepHeight:.36,
  boxes,structures,roads,navigationNodes,points:[],districts:[],signs:[],vehicleSpawns:[],
  spawns:[{x:-39,z:-34},{x:70,z:70}],
  landmarks:[{id:'depot',name:'Трамвайное депо',x:-35,z:-35},{id:'station',name:'Железнодорожная станция',x:19,z:19},
    {id:'pump',name:'Водомерная станция',x:125,z:164}],
});
