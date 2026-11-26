import {makeTerrain} from '../terrain.js';
import {registerLocalMap} from '../world.js';
import {addNaharGroundDistrict, NAHAR_DISTRICT_ROADS, NAHAR_TUNNEL} from './nahar-district.js';

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
const terrainPads=[{x:0,z:116,w:4136,d:24,height:-4.2,blend:8}];
const terrain=makeTerrain(size,landforms,cell,terrainPads);

export const NAHAR_LANDING={primary:{x:-35,z:-35},alternate:{x:-111,z:-38}};
export const NAHAR_WATER={x:0,z:116,w:4096,d:32,y:-3.165};
export const NAHAR_STORM={x:-50,z:5,innerX:640,innerZ:510,outerX:1080,outerZ:860};
export const NAHAR_RAIL_CROSSINGS=[-18,19];
const railHalfWidth=4.4,crossingWidth=7;
function railZ(x){
  const t=Math.max(0,Math.min(1,(x+56)/29));
  return 1.5-20*(1-t*t*(3-2*t));
}
function nearRail(x,z,w,d){
  return z+d/2+2>railZ(x-w/2-2)-railHalfWidth&&z-d/2-2<railZ(x+w/2+2)+railHalfWidth;
}
const roadPlan=[
  ['north-avenue',-142,-166,1080,13],['depot-road',-41,-13,210,7],
  ['station-road',5,64,206,8],['canal-road',91,153,740,8],['bridge-road',104,78,8,82],
  ['bridge-north-road',104,-66,8,206],['bridge-south-road',104,145,8,16],
  ...NAHAR_DISTRICT_ROADS,
  ...[-492,-397,-300,-221,225,306,387,468,549].map(z=>['cross-street-'+z,0,z,1660,9.2]),
  ...[-704,-545,-380,-216,251,421,580,733].flatMap(x=>[[-680,96],[137,670]].map(([start,end])=>
    [`district-street-${x}-${start}`,x,(start+end)/2,9.3,end-start])),
];
export const NAHAR_SITES={
  supplyPrimary:{x:-52,z:-12},supplyAlternate:{x:-93,z:-15},workshop:{x:-76,z:20},
  platforms:{x:2,z:-1},station:{x:19,z:13},dispatcher:{x:33,y:3.12,z:31},
  log:{x:24.21,y:3.12,z:25.83,surfaceY:4.17,yaw:.06},
  recording:{x:37,y:0,z:42,surfaceY:.68,yaw:-.3},freight:{x:37,z:58},
  bridge:{x:104,z:93},power:{x:124,z:164},relay:{x:142,z:157},
  workshopCorner:{x:232,z:153},workshops:{x:232,z:214},serviceStreet:{x:166,z:214},
  tunnelGate:{x:177,z:194},exit:{x:216,z:194},
};

function part(id,x,z,w,d,h,baseY,color,{surface='village-stucco',kind='city-box',detail=0,
  noCollision=false,dynamic=false,shape,facing,groundLayer,profile,collisionOnly}={}){
  const b={id,kind,x,z,w,d,h,baseY,color,surface,detailLevel:detail,noCollision,missionDynamic:dynamic,shape,
    facing,groundLayer,profile,collisionOnly,overhead:baseY>.5,assetMapId:'nahar'};
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
  ['balcony',38,-81,28,20,18.3,6,false],['siding',67,-25,19,14,10.6,8,false],
  ['signal',-70,2,21,17,10.2,15,false],['foundry',-44,47,25,21,12.0,5,false],
])airPosts[id]={x,y:block(id,x,z,w,d,h,seed,{tank}),z};
airPosts.station={x:33,y:10.07,z:33};

const reserved=[
  {x:-68,z:-33,w:138,d:61},{x:-96,z:25,w:82,d:34},{x:12,z:13,w:108,d:104},
  {x:83,z:37,w:30,d:85},{x:104,z:97,w:36,d:85},{x:152,z:171,w:127,d:91},
  {x:-192,z:-171,w:675,d:27},{x:0,z:116,w:1800,d:36},
  {x:-1040,z:-20,w:1950,d:13},{x:1005,z:1.5,w:1900,d:13},
  ...structures.map(s=>({...s,w:s.w+13,d:s.d+13})),
  ...roadPlan.map(([,x,z,w,d])=>({x,z,w:w+3.4,d:d+3.4})),
];
for(let row=-8;row<=8;row++)for(let col=-11;col<=11;col++){
  const seed=(row+14)*419+(col+15)*83;
  for(let n=0;n<2;n++){
    const x=col*77+n*27-10+(seed%13-6),z=row*81+(n?9:-16)+(seed%17-8);
    const w=18+(seed+n*9)%15,d=17+(seed+n*5)%13;
    if(nearRail(x,z,w,d)||reserved.some(b=>Math.abs(x-b.x)<(w+b.w)/2+4&&Math.abs(z-b.z)<(d+b.d)/2+4))continue;
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
  const metal={surface:'metal'},visual=trim('metal');
  part(id+'-body',x,z,w,d,h-.41,.4,color,{...metal,shape:'beveled'});
  part(id+'-roof',x,z,w-.14,d-.44,.15,h,'#c0b99f',{...visual,shape:'beveled'});
  for(const side of [-1,1]){
    for(const dz of bus?[-2.45,-.87,.73,2.3]:[-.89,.35]){
      part(`${id}-window-${side}-${dz}`,x+side*(w/2+.04),z+dz,.075,bus?1.28:.78,bus?.72:.36,h*.67,'#536164',visual);
    }
    part(id+'-waist-'+side,x+side*(w/2+.02),z,.057,d-.32,.11,h*.49,'#9a8e74',visual);
    for(const dz of [-d*.31,d*.31]){
      const diameter=bus?.76:.60;
      part(`${id}-wheel-${side}-${dz}`,x+side*w*.46,z+dz,.30,diameter,diameter,0,'#41423b',{...visual,shape:'cylinder-x'});
      part(`${id}-hub-${side}-${dz}`,x+side*(w*.46+.157),z+dz,.035,diameter*.44,diameter*.44,
        diameter*.28,'#7e8070',{...visual,shape:'cylinder-x',detail:1});
    }
    part(id+'-windscreen-'+side,x,z+side*(d/2+.05),w*.72,.09,bus?.7:.36,h*.67,'#59686b',visual);
    part(id+'-bumper-'+side,x,z+side*d/2,w+.02,.18,.15,.35,'#6f7063',{...visual,shape:'beveled'});
    for(const dx of [-w*.37,w*.37])
      part(id+'-lamp-'+side+'-'+dx,x+dx,z+side*(d/2+.04),w*.12,.085,.13,.62,side>0?'#876052':'#bdb498',visual);
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
  ['south-quay',144,134],['workshop-walk',219,164],['repair-corner',226,218.5],
  ['tunnel-walk',158,197]])planter(id,x,z);

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
function railPoint(x,offset){
  const z=railZ(x)+(offset-1.5);
  return [x,terrain.heightAt(x,z),z];
}
function railStrip(id,a,b,width,height,color,surface){
  const item=part(id,(a[0]+b[0])/2,(a[2]+b[2])/2,b[0]-a[0],width,height,(a[1]+b[1])/2,color,
    {surface,shape:'rail-strip',noCollision:true});
  item.ends=[a,b];
}
for(let x=-2048;x<2048;){
  const next=Math.min(2048,x+((x>=-64&&x<-24)?4:16));
  railStrip('ballast-'+x,railPoint(x,1.5),railPoint(next,1.5),railHalfWidth*2,.094,'#8f806c','village-sand');
  for(const offset of [-1.68,-.32,3.32,4.68]){
    const a=railPoint(x,offset),b=railPoint(next,offset);
    a[1]+=.091;b[1]+=.091;
    railStrip(`rail-${x}-${offset}`,a,b,.087,.105,'#60594f','metal');
  }
  x=next;
}
for(const z of [-1,4]){
  for(let x=-280;x<344;x+=1.65){
    const [,y,trackZ]=railPoint(x,z);
    part(`tie-${z}-${x}`,x,trackZ,.22,2.25,.06,y+.092,'#6f6150',{detail:1,noCollision:true});
  }
}
for(const [index,z] of [[0,-6],[1,9]]){
  let from=-30;
  for(const [section,to] of [...NAHAR_RAIL_CROSSINGS,58+crossingWidth/2].entries()){
    const end=to-crossingWidth/2;
    part(`platform-${index}-${section}`,(from+end)/2,z,end-from,3.15,.26,0,'#b0a18a',{kind:'village-floor'});
    from=to+crossingWidth/2;
  }
  part('platform-roof-'+index,9.5,z,67,3.9,.16,4.1,'#615f55',iron);
  for(const x of [-23,-3,12,27,42])part(`platform-column-${index}-${x}`,x,z,.18,.18,4.1,.14,beam,iron);
}
for(const x of NAHAR_RAIL_CROSSINGS){
  paving(`rail-crossing-approach-${x}`,x,1.5,crossingWidth,25,'#bfa587','village-sand',2);
  for(const [i,[z,depth]] of [[-2.76,2.08],[-1,1.24],[1.5,3.52],[4,1.24],[5.77,2.08]].entries())
    part(`rail-crossing-deck-${x}-${i}`,x,z,crossingWidth,depth,.14,.035,'#7d6f59',{surface:'wood',noCollision:true});
  for(let z=-11;z<=12;z++)navigationNodes.push({x,y:terrain.heightAt(x,z),z});
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

const timber={surface:'wood'},fittings={...iron,noCollision:true,detail:1};
function cabinet(id,x,z,y,{wide=1.55,paint='#64746b',drawers=3}={}){
  part(id,x,z,wide,.64,1.58,y,paint,iron);
  for(let drawer=0;drawer<drawers;drawer++){
    const dy=y+.17+drawer*.36;
    part(id+'-drawer-'+drawer,x,z+.328,wide-.11,.045,.27,dy,paint,fittings);
    part(id+'-pull-'+drawer,x,z+.365,.29,.07,.047,dy+.135,'#9d9a84',fittings);
  }
}
function shelves(id,x,z,y,color='#6c7567'){
  for(const dx of [-1.4,1.4])part(id+'-post-'+dx,x+dx,z,.09,.72,2.14,y,beam,iron);
  for(const level of [.28,.97,1.61]){
    part(id+'-shelf-'+level,x,z,2.96,.79,.075,y+level,color,iron);
    for(const dx of [-.81,.42,1.08])
      part(id+'-stock-'+level+'-'+dx,x+dx,z,.45,.54,.22+Math.abs(dx)*.21,y+level+.075,dx>0?'#968468':'#70614a',timber);
  }
}
for(const [id,x,z] of [['west',-104,23],['east',-68,25]]){
  const depth=id==='west'?19:17,width=id==='west'?30:25;
  for(const dx of [-width*.37,-width*.19,width*.19,width*.37]){
    const wallZ=z-depth/2+.18;
    part(id+'-shop-pilaster-'+dx,x+dx,wallZ,.26,.21,4.54,0,beam,fittings);
    part(id+'-shop-skirt-'+dx,x+dx,wallZ+.14,3.3,.08,.88,0,'#70786b',trim('concrete'));
  }
  cabinet(id+'-tool-locker',x+8,z+5,0,{paint:'#6d755f'});
  shelves(id+'-parts-rack',x-9,z-6.6,0);
  shelves(id+'-bin-rack',x+7.4,z-6.5,0,'#7c7466');
  part(id+'-pegboard',x-7.6,z-depth/2+.30,3.2,.11,1.47,1.26,'#817257',timber);
  for(const row of [.25,.53,.84,1.14]){
    part(id+'-pegboard-rail-'+row,x-7.6,z-depth/2+.37,2.88,.05,.036,1.26+row,'#a09878',fittings);
  }
  for(const [i,dy] of [.72,.47,.61,.87].entries()){
    const toolX=x-8.73+i*.67,toolZ=z-depth/2+.39;
    part(id+'-tool-shank-'+i,toolX,toolZ,.07,.07,dy,1.58,'#5e6664',fittings);
    part(id+'-tool-head-'+i,toolX,toolZ,.19,.09,.08,1.58+dy,'#a5987b',fittings);
  }
  for(const [dx,tone] of [[-.29,'#716d56'],[.29,'#9c7557']]){
    part(id+'-welding-bottle-'+dx,x+9.1+dx,z+5.2,.37,.37,1.24,0,tone,{...iron,shape:'cylinder'});
    part(id+'-welding-valve-'+dx,x+9.1+dx,z+5.2,.13,.13,.18,1.24,'#9a917d',{...fittings,shape:'cylinder'});
  }
  part(id+'-safety-panel',x+7.5,z-depth/2+.24,2.4,.09,.84,2.86,'#a79a77',trim());
  for(const dx of [-.68,0,.68])part(id+'-safety-print-'+dx,x+7.5+dx,z-depth/2+.30,.39,.025,.48,3.02,'#985c42',fittings);
  part(id+'-worktop',x-4,z-5,6.6,1.14,.08,.87,'#74685b',timber);
  for(const dx of [-2.4,-1.8,1.3,2.35])part(id+'-bench-parts-'+dx,x-4+dx,z-5,.31,.42,.18,.95,'#56656a',fittings);
  for(const offset of [-5,2,6]){
    part(id+'-roof-girder-'+offset,x,z+offset,23,.17,.26,4.5,beam,fittings);
    part(id+'-shop-lamp-'+offset,x,z+offset,5,.24,.11,4.38,'#ecd7af',{surface:'unlit',noCollision:true});
  }
}
for(const [x,z] of [[-1,16],[4,43],[39,15]]){
  cabinet('station-locker-'+x,x,z,0);
  shelves('station-rack-'+x,x+2.7,z,0,'#9b8c70');
}
for(const [x,z] of [[27,36.9],[40.6,42.1]]){
  cabinet('dispatch-files-'+x,x,z,3.12,{wide:1.95,paint:'#67706b',drawers:4});
}
for(const [x,boardColor] of [[27.4,'#ac9972'],[36.8,'#8a9a86'],[41.3,'#ad9a7b']]){
  part('dispatch-noticeboard-'+x,x,45.72,3.3,.16,1.65,4.45,'#7b6e56',timber);
  part('dispatch-board-inset-'+x,x,45.618,3.13,.07,1.47,4.54,boardColor,trim('wood',1));
  for(const [dx,dy,shade] of [[-.96,.26,'#d1c5a1'],[-.25,.49,'#c9b897'],[.53,.34,'#b7ae98'],[1.01,.56,'#dad0af']]){
    part('dispatch-pin-sheet-'+x+'-'+dx,x+dx,45.565,.44,.015,.68,4.55+dy,shade,trim('concrete',1));
    for(let mark=0;mark<4;mark++)
      part('dispatch-note-line-'+x+'-'+dx+'-'+mark,x+dx,45.548,.31,.011,.018,4.65+dy+mark*.11,'#7c7763',trim('concrete',2));
  }
}
for(const z of [24,30,37,43]){
  part('dispatch-east-baseboard-'+z,43.787,z,.079,5.66,.61,3.12,'#687367',trim('concrete',1));
  part('dispatch-east-post-'+z,43.78,z,.19,.21,5.92,3.12,beam,fittings);
}
for(const x of [25,34,41]){
  part('dispatch-led-girder-'+x,x,34,0.13,15.1,.24,6.72,beam,fittings);
  for(const z of [26,41.8])part('dispatch-led-hanger-'+x+'-'+z,x,z,.06,.06,2.72,6.96,beam,fittings);
  part('dispatch-led-light-'+x,x,34,.36,3.6,.17,6.5,'#e0d2a3',{surface:'unlit',noCollision:true});
}
for(const [x,z] of [[23,26],[34,33],[41,38]]){
  part('dispatch-monitor-'+x,x+.61,z,.43,.49,.38,4.18,'#425b5b',iron);
  part('dispatch-console-dials-'+x,x-.43,z+.27,.92,.26,.07,4.175,'#b7aa86',fittings);
  for(const dx of [-.42,.06,.38])
    part('dispatch-console-led-'+x+'-'+dx,x+dx,z+.29,.051,.06,.028,4.243,'#bacc98',{surface:'unlit',noCollision:true,detail:2});
  part('dispatch-slate-'+x,x-.41,z-.14,.84,.33,.04,4.208,'#bcb292',trim('concrete',1));
  part('dispatch-mic-stem-'+x,x+.98,z+.17,.045,.046,.27,4.21,'#4e5a58',fittings);
  part('dispatch-mic-head-'+x,x+.98,z+.11,.10,.18,.085,4.46,'#4e5a58',fittings);
}
for(const [x,z] of [[118,161],[131,171]])cabinet('pump-controls-'+x,x,z,0,{paint:'#556a66'});
for(const [i,z] of [161,162.2,169.8,171].entries()){
  part('pump-interior-line-'+i,125,z,19,.17,.175,3.33,'#726c54',fittings);
  for(const x of [120,126,131])part('pipe-joint-'+i+'-'+x,x,z,.18,.33,.31,3.27,'#8b7e64',fittings);
}

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
for(const [id,x,z] of [['yard-west',-142,-35],['depot-west',-81,-57],
  ['workshop',-117,37],['station',45,-9],['freight',76,63],['bank',88,137],['pump',143,179],['tunnel',172,175]]){
  for(const [offset,width,height] of [[-1.35,1.22,.82],[0,1.28,1.14],[1.42,1.21,.91]]){
    part(id+'-freight-crate-'+offset,x+offset,z,width,1.16,height,0,'#8f7958',timber);
    for(const d of [-.39,.39])part(id+'-crate-batten-'+offset+'-'+d,x+offset+d,z+.59,.12,.055,height,0,'#685742',
      {surface:'wood',noCollision:true,detail:1});
  }
  part(id+'-drum',x+2.8,z-.65,.62,.62,.91,0,'#61756d',{surface:'metal',shape:'cylinder'});
  part(id+'-drum-top',x+2.8,z-.65,.58,.58,.035,.913,'#a28661',{surface:'metal',shape:'cylinder',noCollision:true});
}
for(const [id,x,z] of [['depot-storage',-61,-68],['freight-storage',87,61],['pump-storage',153,179]]){
  for(const dx of [-4.6,4.6])for(const dz of [-2.55,2.55])
    part(id+'-awning-post-'+dx+'-'+dz,x+dx,z+dz,.15,.16,3,0,beam,iron);
  part(id+'-awning',x,z,9.9,5.85,.17,3,'#6e7772',iron);
  for(const offset of [-2.15,0,2.15]){
    for(let board=0;board<4;board++)
      part(id+'-pallet-'+offset+'-'+board,x+offset,z-.63+board*.32,1.38,.19,.14,0,'#867453',timber);
    part(id+'-stack-'+offset,x+offset,z-.06,1.18,1.12,1.06,.14,offset===0?'#9a8161':'#71684f',timber);
    part(id+'-stack-cap-'+offset,x+offset,z-.06,1.22,1.15,.09,1.20,'#a18c6b',timber);
  }
}
for(const [id,x,z] of [['freight-cable',95,72],['pump-cable',151,170]]){
  part(id+'-drum',x,z,.94,.94,.92,0,'#665e4a',{surface:'wood',shape:'cylinder'});
  part(id+'-base',x,z,1.39,1.39,.14,0,'#94805f',{surface:'wood',shape:'cylinder'});
  part(id+'-rim',x,z,1.39,1.39,.16,.92,'#94805f',{surface:'wood',shape:'cylinder'});
  for(const height of [.27,.51,.74])part(id+'-wire-'+height,x,z,1.03,1.03,.13,height,'#424949',
    {surface:'metal',shape:'cylinder',noCollision:true});
}
for(const [id,x,z] of [['depot',-40,-9],['station',7,-5],['freight',46,60],['canal',124,148]]){
  part(id+'-sign-post',x,z,.08,.08,2.6,0,beam,{...iron,detail:1,noCollision:true});
  part(id+'-sign-board',x,z,1.8,.105,.52,2.04,'#6c827b',{...iron,detail:1,noCollision:true});
  part(id+'-sign-inset',x,z-.06,1.45,.03,.08,2.31,'#e0d4a5',{detail:1,noCollision:true});
}
export const NAHAR_GATES={
  service:part('nahar-service-gate',-4,34.5,.28,5,2.6,0,'#637675',{...iron,dynamic:true}),
  tunnel:part('nahar-tunnel-gate',178.2,NAHAR_TUNNEL.z,.27,9.4,4.9,0,'#756b59',{...iron,dynamic:true}),
};

// Infill follows the side streets and the rail approaches. Keep the actual
// helicopter yards, platform routes, and canal crossing clear on the ground.
const sightlines=[
  ...Object.values(NAHAR_LANDING).map(p=>({...p,w:50,d:42})),
  {x:-48,z:-5,w:185,d:24},{x:31,z:54,w:43,d:21},{x:97,z:90,w:23,d:51},
  {x:138,z:156,w:70,d:29},{x:177,z:189,w:22,d:24},
  {x:202,z:NAHAR_TUNNEL.z,w:51,d:12.2},
];
for(const [row,z] of [-149,-126,-74,-12,42,72,88,154,198,226].entries()){
  for(let column=-15;column<=13;column++){
    const seed=(row+17)*379+(column+16)*113;
    const x=column*43+(row%2)*20+seed%9-4;
    const width=11+seed%7,depth=9+(seed>>2)%6;
    const overlaps=(part,margin)=>Math.abs(x-part.x)<(width+part.w)/2+margin&&Math.abs(z-part.z)<(depth+part.d)/2+margin;
    if(nearRail(x,z,width,depth)||sightlines.some(b=>overlaps(b,4))||roads.some(b=>overlaps(b,2))||
      boxes.some(b=>b.h>.35&&!b.noCollision&&overlaps(b,3))||structures.some(b=>overlaps(b,2)))continue;
    const near=Math.abs(x)<355,detailed=near||z<75&&x>-535&&x<335;
    block(`side-street-${row}-${column}`,x,z,width,depth,4.8+seed%5,seed,{near,detailed,tint:masonry[(seed>>2)%masonry.length]});
  }
}
for(const [id,building,portTarget=false] of [
  ['north-yard','building--3--4-0',true],
  ['north-works','building--3--2-0',true],
  ['north-block','building--3--1-0',true],
  ['low-ward','building--1--4-1'],
  ['tram-terrace','side-street-2-2'],
  ['canal-west','side-street-6--1'],
  ['station-east','side-street-4-2'],
  ['canal-workshops','side-street-5--3'],
]){
  const roof=boxes.find(box=>box.id===building+'-roof');
  airPosts[id]={x:roof.x,y:roof.baseY+roof.h+.005,z:roof.z,portTarget};
}
airPosts['market-crossing']={x:-195,y:terrain.heightAt(-195,-102),z:-102};
export const NAHAR_AIR_POSTS=airPosts;

addNaharGroundDistrict(part,paving,({id,x,z,w,d,h,baseY},enterable=false)=>{
  structures.push({id,kind:'city-block',x,z,w,d,h,baseY,assetMapId:'nahar',enterable});
});

export const NAHAR=registerLocalMap({
  id:'nahar',missionId:'m04',name:'Нахар',theme:'desert-village',campaign:true,size,width:1900,depth:1660,
  terrain,terrainPads,landforms,terrainMargin:90,navigationCell:2,navigationSize:744,navigationClearance:.78,
  playArea:{minX:-208,maxX:318,minZ:-112,maxZ:230},
  fogColor:'#c6ac91',fogDensity:.00155,sunColor:'#ffe0ad',stepHeight:.36,
  boxes,structures,roads,navigationNodes,points:[],districts:[],signs:[],vehicleSpawns:[],
  spawns:[{x:-39,z:-34},{x:70,z:70}],
  landmarks:[{id:'depot',name:'Трамвайное депо',x:-35,z:-35},{id:'station',name:'Железнодорожная станция',x:19,z:19},
    {id:'pump',name:'Водомерная станция',x:125,z:164},
    {id:'workshops',name:'Улица Мастерских',x:232,z:185},
    {id:'service-street',name:'Ремонтная улица',x:191,z:214},
    {id:'service-tunnel',name:'Служебный тоннель',x:178,z:194}],
});
