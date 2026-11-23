import {makeTerrain} from '../terrain.js';
import {registerLocalMap} from '../world.js';

const size=4096,cell=8,boxes=[],structures=[],roads=[],navigationNodes=[];
const landforms=[
  {x:-908,z:660,rx:225,rz:235,height:24,flat:.06},
  {x:748,z:-804,rx:246,rz:156,height:32,flat:.09},
  {x:955,z:517,rx:152,rz:346,height:16,flat:.08},
  {x:-1225,z:-595,rx:410,rz:188,height:28,flat:.1,angle:.21},
  {x:-1450,z:622,rx:470,rz:215,height:46,flat:.08,angle:-.28},
  {x:-1524,z:-1135,rx:440,rz:265,height:76,flat:.13,angle:.45},
  {x:-611,z:-1110,rx:485,rz:210,height:35,flat:.05,angle:.17},
  {x:272,z:-1278,rx:550,rz:250,height:42,flat:.07,angle:-.26},
  {x:987,z:-1180,rx:430,rz:220,height:58,flat:.06,angle:.39},
  {x:1410,z:-843,rx:325,rz:320,height:81,flat:.13,angle:.39},
  {x:1460,z:-135,rx:280,rz:465,height:52,flat:.11,angle:-.31},
  {x:1552,z:535,rx:350,rz:440,height:92,flat:.12,angle:-.36},
  {x:1309,z:1159,rx:480,rz:360,height:56,flat:.12,angle:.34},
  {x:701,z:1346,rx:425,rz:228,height:66,flat:.09,angle:-.46},
  {x:-50,z:1320,rx:520,rz:248,height:54,flat:.08,angle:.26},
  {x:-635,z:1410,rx:460,rz:229,height:72,flat:.15,angle:.32},
  {x:-1110,z:1080,rx:388,rz:232,height:42,flat:.1,angle:-.46},
];
const terrainPads=[{x:90,z:116,w:1500,d:24,height:-4.2,blend:8}];
const terrain=makeTerrain(size,landforms,cell,terrainPads);

export const NAHAR_LANDING={primary:{x:-35,z:-35},alternate:{x:-111,z:-38}};
export const NAHAR_WATER={x:90,z:116,w:1490,d:21,y:-3.18};
export const NAHAR_STORM={x:-50,z:5,innerX:640,innerZ:510,outerX:1080,outerZ:860};
const roadPlan=[
  ['north-avenue',-142,-166,1080,13],['depot-road',-41,-13,210,7],
  ['station-road',5,64,206,8],['canal-road',91,153,740,8],['bridge-road',104,78,8,82],
  ['bridge-north-road',104,-66,8,206],['bridge-south-road',104,145,8,16],
  ...[-492,-397,-300,-221,225,306,387,468,549].map(z=>['cross-street-'+z,0,z,1660,9.2]),
  ...[-704,-545,-380,-216,251,421,580,733].flatMap(x=>[[-680,96],[137,670]].map(([start,end])=>
    [`district-street-${x}-${start}`,x,(start+end)/2,9.3,end-start])),
];
export const NAHAR_SITES={
  supplyPrimary:{x:-52,z:-12},supplyAlternate:{x:-93,z:-15},workshop:{x:-76,z:20},
  platforms:{x:2,z:-1},station:{x:19,z:13},dispatcher:{x:33,y:3.12,z:31},
  log:{x:25,y:3.12,z:27},recording:{x:37,z:42},freight:{x:37,z:58},
  bridge:{x:104,z:93},power:{x:124,z:164},relay:{x:142,z:157},
  tunnelGate:{x:177,z:194},exit:{x:209,z:194},
};

function part(id,x,z,w,d,h,baseY,color,{surface='village-stucco',kind='city-box',detail=0,
  noCollision=false,dynamic=false,shape,facing,groundLayer}={}){
  const b={id,kind,x,z,w,d,h,baseY,color,surface,detailLevel:detail,noCollision,missionDynamic:dynamic,shape,
    facing,groundLayer,overhead:baseY>.5,assetMapId:'nahar'};
  boxes.push(b);return b;
}

function paving(id,x,z,w,d,color,surface='asphalt',groundLayer=1){
  return part(id,x,z,w,d,0,0,color,{surface,noCollision:true,groundLayer});
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

function street(id,x,z,w,d){
  roads.push({id,x,z,w,d,yaw:0});
  const alongX=w>d,span=alongX?d:w;
  paving(id+'-shoulder',x,z,w+(alongX?0:2.4),d+(alongX?2.4:0),'#c0a781','village-sand');
  paving(id,x,z,w,d,'#ae9470','village-sand',2);
  for(const side of [-1,1]){
    const offset=side*span*.23,rut=Math.max(.75,span*.135);
    paving(id+'-rut-'+side,x+(alongX?0:offset),z+(alongX?offset:0),alongX?w:rut,alongX?rut:d,
      '#a78c68','village-sand',3);
  }
}

const masonry=['#bcaa8c','#c9ae8b','#9f8e79','#d6c09d','#a2a49b','#bfb3a3','#bf977a','#a2ab9a','#c1a490'];
const roof=['#8e7f70','#a19985','#8c7563','#8e9285','#997467','#777976'];
const shades=['#786d5c','#746b61','#746b64','#a59174','#567473','#917368','#a18773'];
const trim=(surface='village-stucco',detail=0)=>({surface,detail,noCollision:true});
function block(id,x,z,w,d,h,seed,{near=true,detailed=near,tint=null,tank=false,landmark=false}={}){
  const color=tint??masonry[seed%masonry.length],top=roof[seed%roof.length];
  const accents=shades[seed%shades.length],style=seed%5;
  const y=near?0:Math.min(0,terrain.heightAt(x,z));
  structures.push({id,kind:'city-block',x,z,w,d,h,baseY:y,assetMapId:'nahar'});
  part(id,x,z,w,d,h-y,y,color,{noCollision:!near});
  part(id+'-roof',x,z,w+.46,d+.46,.23,h,top,{noCollision:!near,kind:'village-floor'});
  for(const side of [-1,1]){
    part(id+'-edge-'+side,x,z+side*d*.49,w,.25,.48,h+.23,top,{noCollision:!near});
    const face=z+side*(d/2+.085),edge=d/2;
    if(detailed){
      part(id+'-curb-'+side,x,z+side*(edge+.86),w+.9,1.52,.17,0,'#ab9e86',{surface:'concrete',noCollision:!near});
      part(id+'-plinth-'+side,x,face,w-.14,.22,.8,0,accents,trim('concrete'));
      part(id+'-cornice-'+side,x,z+side*(edge+.12),w+.29,.42,.25,h-.47,top,trim('concrete'));
    }
    const bays=Math.max(2,Math.floor(w/(detailed?4.1:7.3)));
    for(let y=style===3?2.9:2.1;y<h-1.65;y+=detailed?3.55:6.9){
      for(let bay=0;bay<bays;bay++){
        const px=x+(bay+.5-bays/2)*w/bays;
        const dark=(seed+bay)%6===2?'#6c8583':'#4e5654',width=style===3?2.18:1.48;
        part(`${id}-glass-${side}-${y}-${bay}`,px,face,width,.08,style===4?1.84:1.42,y,dark,
          {...trim('city-glass'),shape:'wall-panel',facing:side});
        if(detailed){
          part(`${id}-sill-${side}-${y}-${bay}`,px,z+side*(edge+.144),width+.34,.2,.16,y-.15,top,trim('concrete',1));
          if((seed+bay)%4===0)part(`${id}-shutter-${side}-${y}-${bay}`,px+width*.54,z+side*(edge+.19),.39,.13,1.42,y,
            accents,trim('wood',1));
        }
      }
      if(detailed&&style<=1&&y>3){
        const bx=x+side*w*.19,bz=z+side*(edge+.72),bw=w*(style===0?.38:.58);
        part(`${id}-balcony-${side}-${y}`,bx,bz,bw,1.42,.29,y-.38,top,trim('concrete'));
        part(`${id}-balcony-rail-${side}-${y}`,bx,bz+side*.665,bw,.16,.69,y-.09,accents,trim('concrete'));
      }
    }
    if(!detailed)continue;
    for(const end of [-1,1])part(`${id}-column-${side}-${end}`,x+end*(w/2-.34),face,.47,.16,h,0,top,trim('concrete',1));
    const entry=x+(seed%3-1)*w*.23,shop=style===1||style===4;
    part(id+'-entrance-'+side,entry,face+side*.11,shop?3.72:1.85,.14,2.38,0,'#625d54',trim('wood'));
    part(id+'-awning-'+side,entry,face+side*.8,shop?6.5:3.8,1.55,.2,2.73,
      ['#ad7854','#976961','#77856d','#57818a'][seed%4],trim(shop?'cloth':'metal'));
    if(shop)part(id+'-store-sign-'+side,entry,face+side*.27,5.8,.3,.51,3.15,accents,trim());
  }
  for(const side of [-1,1])if(detailed||landmark||style===4){
    const flank=x+side*(w/2+.085);
    part(id+'-side-cornice-'+side,flank,z,.32,d-.4,.27,h-.56,top,trim('concrete'));
    for(let level=3.6;level<h-1.7;level+=4)
      for(const end of [-1,1])part(`${id}-side-glass-${side}-${level}-${end}`,flank,z+end*d*.26,.08,1.55,1.5,level,
        '#596664',{...trim('city-glass'),shape:'wall-panel',facing:side});
  }
  if(tank||detailed&&seed%3===0){
    const tx=x+w*.29,tz=z-d*.27,tone=tank?'#315d79':'#686861';
    part(id+'-tank-stand',tx,tz,3.4,2.9,.48,h+.23,'#52585a',{surface:'metal',noCollision:true});
    part(id+'-tank',tx,tz,2.85,2.85,2,h+.71,tone,{surface:'metal',shape:'cylinder'});
  }
  if(detailed||seed%4===0)part(id+'-headhouse',x-w*.21,z+d*.26,w*(style===4?.47:.26),d*.24,style===4?3.8:2.45,h+.23,
    accents,{noCollision:!near});
  if(detailed&&style===3){
    part(id+'-duct',x+w*.12,z+d*.22,w*.36,.8,.55,h+.23,'#717c77',trim('metal'));
    part(id+'-duct-rise',x+w*.283,z+d*.22,.63,.74,1.2,h+.76,'#88908a',trim('metal',1));
  }
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
  ...roadPlan.map(([,x,z,w,d])=>({x,z,w:w+3.4,d:d+3.4})),
];
for(let row=-8;row<=8;row++)for(let col=-11;col<=11;col++){
  const seed=(row+14)*419+(col+15)*83;
  for(let n=0;n<2;n++){
    const x=col*77+n*27-10+(seed%13-6),z=row*81+(n?9:-16)+(seed%17-8);
    const w=18+(seed+n*9)%15,d=17+(seed+n*5)%13;
    if(reserved.some(b=>Math.abs(x-b.x)<(w+b.w)/2+4&&Math.abs(z-b.z)<(d+b.d)/2+4))continue;
    const near=Math.abs(x)<447&&Math.abs(z)<280,detailed=near||x>-770&&x<235&&z>-345&&z<40;
    const height=6+(seed+n*11)%(near?19:23)+(near?0:seed%9===0?26:0);
    block(`building-${row}-${col}-${n}`,x,z,w,d,height,seed+n,{near,detailed});
  }
}

for(const spec of roadPlan)street(...spec);
paving('rail-apron',7,1,177,16,'#ae9678','village-sand');
paving('station-square',18,14,60,8,'#b19d81','village-sand');
for(const [i,pad] of Object.values(NAHAR_LANDING).entries()){
  paving('yard-edge-'+i,pad.x,pad.z,49.2,37.2,'#bfa783','village-sand',2);
  paving('yard-'+i,pad.x,pad.z,48,36,i?'#a49075':'#a99575','village-sand',3);
  for(const dx of [-3.2,3.2])paving(`pad-line-${i}-${dx}`,pad.x+dx,pad.z,.36,7.4,'#bdb480','concrete',5);
  paving('pad-bar-'+i,pad.x,pad.z,6.4,.36,'#bdb480','concrete',5);
  for(const z of [pad.z-20,pad.z+20])wall(`depot-fence-${i}-${z}`,pad.x,z,36,.27,1.55,'#908d80',{gap:10});
}

for(const [x,z,w,d] of [[-153,-37,27,56],[-32,-79,38,18],[103,51,23,22],[137,134,35,6]])
  paving(`service-apron-${x}-${z}`,x,z,w,d,'#b19b7f','village-sand');

function parkedVehicle(id,x,z,color,bus=false){
  const w=bus?2.48:1.78,d=bus?8.2:4.16,h=bus?2.62:1.38;
  const metal={surface:'metal'},visual=trim();
  part(id+'-body',x,z,w,d,h-.41,.4,color,metal);
  part(id+'-roof',x,z,w-.14,d-.44,.15,h,'#c0b99f',visual);
  for(const side of [-1,1]){
    for(const dz of bus?[-2.45,-.87,.73,2.3]:[-.89,.35]){
      part(`${id}-window-${side}-${dz}`,x+side*(w/2+.04),z+dz,.075,bus?1.28:.78,bus?.72:.36,h*.67,'#536164',visual);
    }
    for(const dz of [-d*.31,d*.31])part(`${id}-wheel-${side}-${dz}`,x+side*w*.46,z+dz,.24,bus?.78:.62,bus?.69:.55,0,'#494642',visual);
    part(id+'-windscreen-'+side,x,z+side*(d/2+.05),w*.72,.09,bus?.7:.36,h*.67,'#59686b',visual);
  }
}
parkedVehicle('depot-bus',-67,-12,'#7b8d79',true);
parkedVehicle('repair-van',-139,-14,'#a9997f');
parkedVehicle('station-car',27,54,'#8f6750');
parkedVehicle('freight-van',67,72,'#8a8676');
parkedVehicle('quay-van',159,137,'#857c6c');

function planter(id,x,z){
  part(id+'-basin',x,z,2.37,2.37,.28,0,'#9e8d70',{surface:'concrete'});
  part(id+'-soil',x,z,1.95,1.95,.035,.281,'#726553',trim());
  part(id+'-trunk',x,z,.3,.3,5.25,.31,'#756448',{surface:'wood',shape:'cylinder'});
  part(id+'-fronds',x,z,4.3,4.3,1.25,4.95,'#687653',{noCollision:true,shape:'palm-crown'});
}
for(const [id,x,z] of [['north-corner',-199,-144],['roof-line',-128,-133],['yard-lip',-10,-8],
  ['station-front',2,15],['clock-square',45,15],['freight-entry',57,50],['canal-approach',93,74],
  ['south-quay',144,134],['tunnel-walk',184,169]])planter(id,x,z);

for(const dx of [-2.05,2.05])for(const dz of [-2.05,2.05])
  part(`water-tower-leg-${dx}-${dz}`,-147+dx,-64+dz,.28,.28,9.25,0,'#647273',{surface:'metal'});
for(const y of [2.9,6.2,8.9]){
  for(const dz of [-2.05,2.05])part(`water-tower-brace-x-${y}-${dz}`,-147,-64+dz,4.5,.21,.22,y,'#737e7a',trim('metal'));
  for(const dx of [-2.05,2.05])part(`water-tower-brace-z-${y}-${dx}`,-147+dx,-64,.21,4.5,.22,y,'#737e7a',trim('metal'));
}
part('water-tower-tank',-147,-64,6.7,6.7,4.15,9.22,'#557d83',{surface:'metal',shape:'cylinder'});
part('water-tower-cap',-147,-64,6.9,6.9,.26,13.37,'#889287',{surface:'metal',shape:'cylinder'});

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
part('platform-bridge-deck',-1,1.5,3.35,19.7,.4,5.34,'#777469',iron);
for(const dx of [-1.6,1.6]){
  part('platform-bridge-rail-'+dx,-1+dx,1.5,.17,19.6,.94,5.74,beam,iron);
  for(const z of [-8.28,11.32])part(`platform-bridge-leg-${dx}-${z}`,-1+dx,z,.22,.22,5.34,0,beam,iron);
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
part('clock-tower',13.85,16.7,5.25,5.3,4.3,10.07,'#c1b4a1');
part('clock-tower-cap',13.85,16.7,5.62,5.65,.26,14.37,'#7f796a',{surface:'concrete'});
part('clock-tower-dial',13.85,13.99,2.3,.12,2.3,11.13,'#e3d8b9',{noCollision:true,shape:'round-sign'});
part('clock-tower-minute',13.86,13.9,.11,.039,.79,12.17,'#3d4b4c',trim());
part('clock-tower-hour',13.62,13.84,.56,.04,.115,12.15,'#3d4b4c',trim());
part('station-ledge',20,12.65,48.8,1.3,.26,3.45,'#827561');
part('station-clock',19,12.5,2.6,.29,2.6,6.25,'#e5dbb6',{noCollision:true});
part('clock-hand-long',19.22,12.33,.13,.08,.89,7.48,'#3d4644',{noCollision:true});
part('clock-hand-short',18.98,12.26,.75,.08,.145,7.47,'#3d4644',{noCollision:true});
for(const x of [-1,7,15,23,31,39])part('station-upper-window-'+x,x,12.77,1.8,.21,2.22,4.45,'#465750',{...iron,detail:1,noCollision:true});
for(const x of [1,10,36,41])part('station-counter-'+x,x,23,3.9,.77,1.05,0,'#877356');
part('dispatch-mezzanine',32.8,31.7,21,22.7,.29,2.83,'#857869',{kind:'village-floor'});
part('stair-landing',19.525,32.315,5.55,3.04,.29,2.83,'#857869',{kind:'village-floor'});
for(let i=0;i<12;i++){
  const z=20.1+i*.93,y=(i+1)*.26;
  part('station-stair-'+i,19.8,z,3.7,.93,.26,y-.26,'#9a8e7f',{kind:'village-stair'});
  navigationNodes.push({x:19.8,y,z});
}
for(const [x,z] of [[23,26],[34,33],[41,38]])part(`dispatch-console-${x}`,x,z,2.9,.86,1.05,3.12,'#4f6263',iron);
for(const [x,z] of [[5,19],[11,32],[32,18],[37,42]]){
  part(`station-bench-${x}`,x,z,2.8,.68,.18,.5,'#837052',{surface:'wood'});
  for(const dx of [-.96,.96])part(`station-bench-leg-${x}-${dx}`,x+dx,z,.19,.51,.5,0,beam,iron);
}
for(const x of [8,20,32])part(`station-light-${x}`,x,24,3.1,.19,.13,8.76,'#e3cfab',{surface:'unlit',noCollision:true});
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
for(const x of [116,130])part('pump-roof-duct-'+x,x,168.2,2.5,1.3,.76,4.36,'#89918a',iron);
for(const x of [115,123,131])part('pump-pipe-'+x,x,175,7.8,.65,.59,1.03,'#8f7661',iron);
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

// Infill follows the side streets and the rail approaches. Keep the actual
// helicopter yards, platform routes, and canal crossing clear on the ground.
const sightlines=[
  ...Object.values(NAHAR_LANDING).map(p=>({...p,w:50,d:42})),
  {x:-48,z:-5,w:185,d:24},{x:31,z:54,w:43,d:21},{x:97,z:90,w:23,d:51},
  {x:138,z:156,w:70,d:29},{x:177,z:189,w:22,d:24},
];
for(const [row,z] of [-149,-126,-74,-12,42,72,88,154,198,226].entries()){
  for(let column=-15;column<=13;column++){
    const seed=(row+17)*379+(column+16)*113;
    const x=column*43+(row%2)*20+seed%9-4;
    const width=11+seed%7,depth=9+(seed>>2)%6;
    const overlaps=(part,margin)=>Math.abs(x-part.x)<(width+part.w)/2+margin&&Math.abs(z-part.z)<(depth+part.d)/2+margin;
    if(sightlines.some(b=>overlaps(b,4))||roads.some(b=>overlaps(b,2))||
      boxes.some(b=>b.h>.35&&!b.noCollision&&overlaps(b,3))||structures.some(b=>overlaps(b,2)))continue;
    const near=Math.abs(x)<355,detailed=near||z<75&&x>-535&&x<335;
    block(`side-street-${row}-${column}`,x,z,width,depth,4.8+seed%5,seed,{near,detailed,tint:masonry[(seed>>2)%masonry.length]});
  }
}
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
