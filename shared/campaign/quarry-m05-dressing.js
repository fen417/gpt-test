import {affineBox,rotationMatrix} from '../geometry.js';

// Metres in the campaign map coordinate system. The same layout is used by
// the Blender export and by the static collision world.
const sizes={
  case:[1.16,.73,.55],caseStack:[1.23,.83,1.39],ammo:[.98,.50,.45],
  crate:[1.31,1.03,1.05],crateStack:[1.49,1.17,2.01],pallet:[1.42,1.14,.15],
  oil:[.61,.61,.94],oilRack:[1.38,1.28,1.06],barrelSide:[.94,.61,.62],
  can:[.35,.21,.49],water:[1.23,1.06,1.28],sackPile:[2.21,1.44,.74],
  spool:[1.35,1.09,1.36],pipeRack:[3.94,1.91,1.27],hose:[1.71,1.48,.21],
  skip:[2.64,1.76,1.16],screenRack:[2.61,1.54,1.92],scrap:[2.79,1.75,.87],
  bench:[2.57,.90,1.25],shelf:[2.30,.63,2.16],locker:[1.57,.59,1.93],
  compressor:[2.31,1.19,1.42],generator:[3.19,1.53,1.79],flood:[1.43,1.37,4.52],
  mast:[1.38,1.38,5.8],bollard:[.27,.27,1.01],rail:[3.25,.32,1.03],
  barrier:[2.39,.67,.87],chain:[3.8,.43,1.94],board:[1.26,.38,2.01],survey:[1.29,1.19,1.49],
  shade:[4.84,3.61,3.06],office:[6.91,3.27,3.37],hopper:[6.2,4.4,6.7],
  blockStack:[3.91,2.17,1.82],aggregate:[10.4,7.7,3.12],rubble:[3.08,2.18,.55],
  stone:[.61,.47,.19],scrub:[.68,.58,.38],stakes:[1.49,.45,.78],curb:[2.96,.52,.18],
};
const solidTypes=new Set(['crate','crateStack','caseStack','oilRack','water','pipeRack','skip','screenRack',
  'bench','shelf','locker','case','oil','spool','board','bollard','compressor','generator','office','hopper','blockStack','barrier','rail','chain','flood','aggregate']);
const lightTypes=new Set(['can','ammo','barrelSide','hose','pallet','scrub','stone','stakes']);
const frameParts={
  shade:[[-2.14,-1.58,.11,.11,2.48],[2.14,-1.58,.11,.11,2.48],[-2.14,1.58,.11,.11,2.48],[2.14,1.58,.11,.11,2.48]],
  mast:[[0,0,.58,.58,2.1]],survey:[[0,0,.66,.62,1.2]],
  sackPile:[[0,0,1.98,1.27,.52]],scrap:[[0,0,2.3,1.38,.58]],
};
const colors=['#736458','#667072','#8e5941','#ac914d','#55615a','#554c43','#827659'];

const clusters={
  camp:[
    [-262,-230,[
      ['compressor',-4,-2,.16],['bench',-1.4,1.1,-.12],['oilRack',-6,1.9,.15],['barrelSide',-4.6,3.4,-.7],
      ['crate',-2.7,2.9,.24],['case',-.7,3.3,-.1],['hose',-1.4,-1.1,.72],['shelf',2.9,-.2,.06],
      ['flood',-6.5,-4.8,.54],['skip',-7.2,4.8,.41],['scrap',-4.1,4.81,.55],['pallet',-2.1,4.4,.32],
    ]],
    [-258,-204,[
      ['water',-2.4,-1.1,.11],['water',-1,-.9,-.05],['oilRack',-3.8,.8,.18],['pallet',.7,-.9,.18],
      ['caseStack',1.4,1.0,-.13],['can',1.2,1.7,.09],['can',1.9,1.8,.3],['sackPile',-.8,1.9,-.27],
      ['case',3.1,2.0,.31],['board',-.9,3.25,2.85,'water'],['rail',-4.5,2.8,-.22],
    ]],
    [-238,-191,[
      ['shade',-2.6,-.8,.07],['bench',-2.3,-.9,-.05],['case',-.5,1.1,.13],['caseStack',3.1,-.5,.09],
      ['crate',3.7,1.3,.16],['water',1.1,-1.7,-.1],['can',1.7,-1.3,.38],['pallet',3.2,2.3,.42],
      ['sackPile',-3.5,3.1,.64],['oil',-.7,-2.1,.1],['flood',-6.1,1.8,.42],
    ]],
    [-221,-235,[
      ['generator',1,0,1.45],['compressor',-.9,-.1,.38],['spool',3.5,-1.3,.17],['oilRack',3.35,1.01,-.35],
      ['caseStack',-.8,2.2,.2],['can',1.5,1.72,1.44],['hose',.7,2.65,.15],['mast',-2.5,-1.4,.3],
      ['board',3.2,3,3.1,'repair'],['sackPile',.8,-2.4,.16],
    ]],
  ],
  ridge:[
    [-168,-136,[
      ['survey',-.6,.1,.39],['ammo',.9,0,.43],['case',-.3,1.4,.14],['water',-2.8,2.6,-.14],
      ['can',-2.2,1.2,1.2],['stakes',-1.7,-.75,2.6],['rail',-3.2,-1.1,-.54],['rubble',-3.8,3.3,.12],
    ]],
    [-139,-127,[
      ['board',2.4,1.6,2.48,'works'],['bollard',2.32,.1,.2],['bollard',.9,2.2,.2],['rail',.25,2.8,-.53],
      ['sackPile',4.8,2.8,-.31],['case',4.1,.7,.8],['rubble',5.3,4.4,-.43],
    ]],
    [-110,-70,[
      ['water',1.6,.4,.2],['spool',.14,.1,-.2],['oilRack',3,1.1,.14],['hose',2.7,2.9,.53],
      ['barrier',5.2,3.7,-.21],['pallet',1.8,3.21,-.21],['board',-1.2,1.4,2.4,'works'],
    ]],
    [-121,-46,[
      ['compressor',-2.1,2.6,.47],['screenRack',-3.9,3.3,.39],['pipeRack',-5.4,1.4,.21],
      ['spool',-1.4,4.1,.26],['oil',-3,5.2,.17],['barrelSide',-4.2,5.4,-.31],
      ['flood',-6.4,4.6,.3],['caseStack',-5,2.9,.34],['scrap',-5.8,5.75,.53],
    ]],
  ],
  works:[
    [-88,-13.5,[
      ['locker',-.4,-.12,3.05],['caseStack',1.2,.08,-.12],['can',1.6,-.7,.34],['spool',2.9,-.5,-.25],
      ['pipeRack',-1.4,-2.2,.21],['oil',3.6,1.1,.45],['oil',4.3,1.08,.38],['board',-2.7,1.1,.35,'works'],
    ]],
    [-77,-5.1,[
      ['case',-1.05,.55,.2],['ammo',-.9,1.24,.37],['can',-1.28,1.32,1.3],
    ]],
    [-64,-9.25,[
      ['locker',-.24,-.59,.08],['shelf',2.31,-.42,-.025],['caseStack',3.92,-.2,.14],
      ['can',3.6,.61,.72],['spool',-.7,.59,.25],['pallet',-2.17,-.1,-.08],
      ['case',2.4,.9,.22],['ammo',1.16,.65,1.55],
    ]],
    [-51,10,[
      ['scrap',-5.31,.73,0],['hose',-2.08,-1.88,.13],['oil',1.48,.84,.18],['barrelSide',2.47,.7,1.4],
      ['pallet',5.08,-.15,-.25],['crate',8.21,.51,.13],['can',8.66,-.4,.52],
    ]],
    [-31,-9.05,[
      ['bench',-.1,-.61,.11],['caseStack',-2.26,-.43,.23],['shelf',3.48,-.73,-.07],
      ['can',-1.37,.6,.9],['oil',1.91,-.74,.36],['spool',-.12,.91,1.1],
    ]],
    [-57,5.9,[
      ['case',-.94,1.23,.38],['sackPile',-.75,2.77,.31],['pallet',.04,.02,-.2],
      ['oil',-2.16,1.67,.6],['barrelSide',-2.44,2.48,.52],['can',-.01,.93,.29],
      ['bench',.27,1.79,3.14],
    ]],
    [-29,8.6,[
      ['locker',-2.6,.68,3.16],['caseStack',-.2,.26,.08],['bench',.74,-1.58,3.06],
      ['spool',-.99,-1.98,-.05],['can',.61,-.3,-.4],['oil',1.84,.81,.54],['barrelSide',1.63,1.76,1.14],
    ]],
    [-25,7.9,[
      ['screenRack',-1.5,-.4,1.55],['pipeRack',2.34,1.27,-.18],['spool',.34,.52,-.3],
      ['oil',3.17,-.36,.03],['can',2.8,-.8,.44],['case',3.71,-.95,.2],
    ]],
    [-12,16.8,[
      ['skip',-.1,1.4,-.2],['blockStack',3.1,1.12,.17],['screenRack',-3.5,2.38,1.67],
      ['oilRack',.5,3.42,.12],['scrap',-2.25,4.79,.1],['rubble',4.61,4.61,.7],
      ['flood',-1.09,-.9,.6],['board',3.9,-.8,3.1,'works'],['pallet',2.3,3.3,.16],
    ]],
  ],
  cover:[
    [57,-77,[
      ['caseStack',1.57,.2,.13],['ammo',2.5,-.1,.03],['oil',3.59,-.75,.72],['barrelSide',4.6,-.23,.83],
      ['sackPile',-2.6,.09,-.1],['can',-1.65,.96,1.3],['board',3.5,-2.1,2.92,'noentry'],
    ]],
    [75,-58,[
      ['caseStack',-2.46,-.37,.57],['case',-3.21,-.25,.12],['pallet',-1.2,1.12,.5],['sackPile',-2.12,-2.8,.5],
      ['scrap',-4.89,1.5,.22],['oil',-1.39,-.7,.58],
    ]],
    [91,-27,[
      ['pipeRack',-2.3,-1.8,1.57],['scrap',-.24,1.98,.7],['skip',2.05,-.2,-.44],['oilRack',3.95,1.45,-.17],
      ['blockStack',-2.85,2.6,.19],['rubble',.85,4.07,.09],['spool',-4.8,-.39,.1],['pallet',1.5,1.87,.2],
    ]],
    [117,-49,[
      ['office',.53,-.47,-.08],['oilRack',-3.3,1.8,.07],['water',-4.5,.23,.1],['shade',2.5,4.2,.04],
      ['caseStack',3.1,2.6,-.15],['locker',1.92,4.46,.11],['flood',-4.61,3.8,.15],
      ['board',4.4,1.83,2.85,'check'],['barrier',5.02,4.78,1.13],['hose',-.62,2.27,.91],
    ]],
  ],
  gate:[
    [162,6.8,[
      ['generator',-1.46,3.46,.04],['oilRack',.9,3.4,.06],['water',2.6,3.29,.5],['caseStack',-.8,5.1,.37],
      ['flood',3.82,2.89,.58],['barrier',-2.1,7.44,.1],['board',3.7,1.25,.5,'check'],['pallet',1.8,5.76,.4],
      ['chain',5.3,5.2,1.56],['compressor',3.02,5.56,.42],['spool',-.2,4.12,.05],
    ]],
    [121,17.8,[
      ['caseStack',1.1,.73,.28],['oilRack',-1.19,-.4,.23],['oil',-2.25,.17,.12],['can',.99,-.33,.08],
      ['bench',1.8,-1.7,-.13],['flood',-3.69,-.22,.44],['spool',-2.06,2.1,.32],
      ['scrap',3.55,2.7,.54],['curb',.38,3.74,.15],
    ]],
    [160,37,[
      ['hopper',3.03,3.85,.49],['blockStack',-1.9,-1.3,.55],['aggregate',5.41,-2.15,1.49],
      ['pipeRack',-.7,1.77,.07],['screenRack',2.88,-.39,.19],['spool',-.45,3.68,.44],['rubble',6.1,7.12,.7],
    ]],
  ],
  yards:[
    [82,23,[
      ['hopper',-4.7,1.6,1.23],['aggregate',-4.6,9.1,.53],['office',4.6,-1.1,.48],
      ['skip',2.7,4.2,.2],['blockStack',7.4,6.1,-.08],['pipeRack',-1.08,-2.62,-.3],
      ['oilRack',2.09,1.64,.33],['water',4.32,2.87,.58],['spool',-3.01,-1.65,.21],
      ['screenRack',-1.24,5.12,.81],['rubble',-1.7,8.3,.27],['flood',7.9,.59,.49],
      ['rail',5.8,9.25,.3],['board',-.6,-.08,3.19,'works'],
    ]],
    [105,38,[
      ['aggregate',5.6,-4.63,.52],['blockStack',-4.9,2.57,-.35],['pipeRack',3.27,2.08,1.54],
      ['skip',-.8,-1.31,1.35],['screenRack',.19,3.95,.36],['flood',-2.59,-4.23,.49],
      ['water',-3.13,-1.2,.28],['oilRack',-1.42,-3.73,.35],['caseStack',4.89,.44,-.55],
      ['rubble',6.7,2.93,.74],['spool',-4.21,-2.72,.16],['board',-5.3,-2.15,-.36,'check'],
    ]],
    [-8,38,[
      ['aggregate',-7.24,1.45,-.51],['pipeRack',-.82,3.83,.57],['skip',3.4,2.3,1.38],
      ['blockStack',-.88,6.72,.09],['rubble',-3.29,4.69,.53],['rubble',4.35,5.72,.13],
      ['oilRack',1.45,.09,.14],['spool',2.94,.1,-.16],['flood',-2.08,-.69,.2],
    ]],
    [45,49,[
      ['hopper',1.11,-2.7,.41],['aggregate',7.7,-1.75,.21],['skip',5.26,1.97,.48],
      ['screenRack',.89,1.66,1.2],['blockStack',-2.73,2.35,.15],['crate',-1.83,3.6,.34],
      ['rubble',4.02,-.34,.75],['flood',-3.33,2.81,.6],['oilRack',3.7,3.06,.15],
    ]],
    [67,98,[
      ['aggregate',-.81,2.21,.28],['aggregate',7.66,4.55,1.14],['pipeRack',1.71,-4.99,-.32],
      ['skip',-3.82,-3.42,.66],['scrap',-2.16,5.48,.68],['rubble',3.89,-.43,.1],['barrier',4.48,-3.4,.28],
    ]],
    [16,113,[
      ['office',1.54,-1.31,.21],['screenRack',-2.89,.1,1.4],['water',-.97,1.75,.34],['crateStack',2.69,2.09,.31],
      ['skip',4.2,1.5,.73],['rubble',3.97,4.32,.1],['spool',-3.89,-.27,.29],
    ]],
    [-22,150,[
      ['pipeRack',1.39,.87,.51],['blockStack',-1.7,-.28,-.19],['skip',3.56,2.69,-.12],
      ['oilRack',-2.7,1.94,.55],['case',-1.8,3.04,.43],['rubble',2.5,4.78,.42],
    ]],
  ],
  fuel:[
    [-127,181,[
      ['shade',-1.01,-.92,.12],['locker',-.77,-.84,.06],['bench',.44,.51,.08],['generator',-4.42,2.76,-.27],
      ['oilRack',-3.01,1.67,.23],['oilRack',-2.5,3.88,.12],['water',2.06,-1.31,.44],
      ['barrelSide',-1.62,4.12,.35],['can',-.94,2.82,.38],['hose',1.11,2.33,1.29],
      ['flood',-5.19,-2.63,.32],['skip',-4.51,-4.29,-.11],['pallet',1.1,4.23,.41],
    ]],
    [-133,145,[
      ['office',-1.6,-.63,.02],['pipeRack',-1.1,3.39,.18],['oilRack',2.31,1.7,.23],['oilRack',3.83,1.95,.23],
      ['water',4.2,3.31,.14],['barrelSide',2.9,4.09,.53],['generator',-3.15,4.77,.16],
      ['flood',4.2,-1.39,.52],['board',-.81,1.63,2.82,'fuel'],['chain',-4.37,3.17,1.57],
    ]],
    [-112,170.5,[
      ['oilRack',-.2,-.3,.16],['oil',1.52,-.1,.24],['oil',1.27,1.16,.8],['barrelSide',-1.33,.9,.71],
      ['compressor',-1.34,-2.05,.5],['scrap',.58,2.83,.91],['hose',1.16,-1.94,.11],['flood',-3.49,-.4,.6],
      ['sackPile',-3.63,2.3,.16],['board',-1.1,3.58,3.22,'fuel'],
    ]],
    [-68,140.6,[
      ['shade',-.12,.88,.07],['bench',1.53,.6,.1],['oilRack',-2.63,1.47,.05],['crateStack',-1.32,-1.76,.08],
      ['locker',1.29,-1.47,.07],['compressor',3.41,2.28,.4],['flood',4.48,-.85,.51],['can',.89,1.61,.38],
      ['pallet',-4.34,.57,.61],['hose',-1.18,2.03,.5],['curb',3.29,3.36,.14],
    ]],
    [-54,171,[
      ['skip',-1.1,-.3,-.11],['oilRack',1.96,-1.04,.18],['water',2.85,.36,.21],['case',-.79,1.64,.61],
      ['rubble',2.83,2.6,.73],['caseStack',-2.63,-1.54,.16],['flood',4,1.62,.61],['bollard',-2.48,1.15,.14],
    ]],
    [-104,157,[
      ['oil',-1.18,-1.31,1.11],['barrelSide',-1.47,-.45,.87],['hose',1.07,1.03,.37],['pallet',-1.29,.57,.37],
      ['board',2.22,1.44,3.05,'fuel'],['can',1.44,2.17,.2],
    ]],
  ],
  exit:[
    [33,217,[
      ['oilRack',.19,1.7,.1],['blockStack',-3.2,2.92,.34],['pipeRack',2.13,4.18,.52],
      ['board',-.65,-.1,3.22,'exit'],['scrap',-3.65,5.82,.46],['flood',-.69,4.18,.42],
    ]],
    [116,243,[
      ['shade',-2.46,.95,.04],['water',-2.61,-1.38,.26],['caseStack',-.34,1.1,.34],['sackPile',1.49,1.93,.15],
      ['oilRack',2.94,2.29,-.03],['can',.65,.8,.33],['pallet',3.51,3.86,.36],['mast',4.48,.94,.54],
    ]],
    [190,208.5,[
      ['office',1.2,-.66,-.25],['generator',-.18,2.16,-.22],['bench',2.45,2.37,.03],
      ['oilRack',-2.41,1,.33],['water',-3.24,-.61,.27],['board',-2.72,2.53,-.24,'exit'],
      ['caseStack',4.61,1.34,.22],['flood',4.36,-1.99,.28],['barrier',-3.76,-2.64,-.46],
    ]],
  ],
};

export const M05_SURFACE_PATCHES=[
  [-261,-231,14,9,-.17,'#867b69'],[-244,-193,19,8,.12,'#9b876b'],[-222,-235,12,6,.3,'#817362'],
  [-163,-133,14,8,.2,'#b59b7a'],[-121,-43,13,10,.27,'#92826b'],[-88,-15,11,6,-.26,'#8e8070'],
  [-18,17,23,8,.16,'#8e8070'],[66,-77,12,8,-.1,'#92846f'],[91,-27,15,11,.18,'#8d7a63'],
  [117,-49,14,9,-.16,'#9f8970'],[161,13,13,10,.3,'#877968'],[118,18,12,9,-.3,'#8c7e6f'],
  [82,24,16,14,.25,'#a29177'],[105,38,15,10,.41,'#a99981'],[-8,39,15,10,.54,'#ab9478'],
  [47,49,22,11,.28,'#8e7961'],[68,99,20,15,-.31,'#a68a69'],[18,113,13,11,.04,'#8d7a62'],
  [-127,181,12,8,.36,'#8c7f69'],
  [-133,146,17,17,.04,'#867565'],[-110,171,13,8,-.21,'#897666'],[-68,141,14,9,.04,'#8d7d68'],
  [-55,172,10,10,.27,'#847766'],[33,220,13,10,.1,'#917e64'],[193,208,18,12,.1,'#897861'],
];

const outskirts=[
  [-299,-46,28,6,8],[-280,-96,31,9,12],[-238,-113,24,7,12],[-179,-88,21,10,14],
  [-74,-90,34,10,13],[-34,-70,28,9,14],[2,-92,31,11,12],[95,-124,34,9,14],
  [202,-62,30,10,14],[220,22,36,9,16],[198,71,34,13,16],[169,118,34,11,15],
  [-190,80,33,13,17],[-165,169,29,11,17],[-102,220,23,9,17],[-35,235,26,10,12],
  [42,179,23,11,12],[97,183,35,12,16],[133,247,27,9,12],[217,248,31,10,15],
];
const enclosures=[
  ['camp',-282,-205,-281,-181,'chain'],['camp',-279,-181,-251,-180,'rail'],
  ['ridge',-177,-126,-158,-122,'rail'],['ridge',-134,-100,-124,-89,'rail'],
  ['cover',109,-55,128,-56,'chain'],['cover',130,-55,135,-45,'chain'],
  ['gate',165,19,177,19,'chain'],['gate',177,19,177,33,'chain'],
  ['yards',37,44,28,32,'rail'],['yards',63,111,83,117,'chain'],['yards',75,13,93,12,'chain'],
  ['yards',93,12,95,28,'chain'],['yards',100,48,116,47,'rail'],['yards',-20,41,-18,51,'chain'],
  ['fuel',-144,129,-144,164,'chain'],['fuel',-144,164,-123,166,'chain'],
  ['fuel',-124,113,-94,114,'rail'],['exit',185,204,207,199,'chain'],
];
const rubbleMargins=[
  [-315,-108,73,13,-.21],[-323,10,70,17,.08],[-253,134,51,18,.29],[-194,254,44,10,-.31],
  [286,-153,51,17,-.17],[303,-71,32,13,.43],[302,50,49,17,.18],[287,134,55,18,-.24],
  [223,271,49,12,.2],[-72,-202,42,12,.27],[51,-157,40,14,.22],[-170,44,38,13,-.23],
];

function overlaps(a,b,space=0){
  const bx=b.boundX??b.w/2,bz=b.boundZ??b.d/2;
  return Math.abs(a.x-b.x)<a.boundX+bx+space&&Math.abs(a.z-b.z)<a.boundZ+bz+space;
}
function randomSource(){
  let state=98791;
  return ()=>((state=(1664525*state+1013904223)>>>0)/4294967296);
}
function routeDistance(x,z,r){
  const dx=x-r.x,dz=z-r.z,s=Math.sin(r.yaw),c=Math.cos(r.yaw);
  return Math.hypot(Math.max(0,Math.abs(dx*c-dz*s)-r.w*.5),Math.max(0,Math.abs(dx*s+dz*c)-r.d*.5));
}

export function buildM05Dressing(terrain,roads,baseBoxes,sites){
  const props=[],solids=[],occupied=[],random=randomSource();
  const protectedSites=Object.entries(sites).filter(([name])=>name!=='storm'&&name!=='blast')
    .map(([id,p])=>({...p,range:['camp','reunion','brief','panel','workerDoor','fuelRelease','finale','withdraw','mount'].includes(id)?3.8:3.0}));
  const add=(zone,type,x,z,yaw,tag='',scale=1,mass=false)=>{
    const dims=sizes[type];
    if(!dims)throw new Error('Unknown quarry prop '+type);
    const [w,d,h]=dims.map(n=>n*scale),rx=Math.cos(yaw),rz=Math.sin(yaw);
    const item={id:'m05-dress-'+zone+'-'+props.length,zone,type,x,z,y:terrain.heightAt(x,z),
      yaw,tag,scale,variant:Math.floor(random()*colors.length),w,d,h,
      boundX:(w*Math.abs(rx)+d*Math.abs(rz))/2,boundZ:(w*Math.abs(rz)+d*Math.abs(rx))/2,
      detail:lightTypes.has(type)};
    if(!mass&&baseBoxes.some(b=>!b.noCollision&&b.id!=='hall-floor'&&
      item.y+h>b.baseY+.05&&item.y<b.baseY+b.h-.03&&overlaps(item,b,.05)))return;
    if(solidTypes.has(type)||mass){
      const obstacleRadius=Math.hypot(w,d)*.5;
      const clearance=type==='aggregate'?1.5:.78;
      if(roads.some(r=>routeDistance(x,z,r)<clearance+obstacleRadius))return;
      if(protectedSites.some(p=>Math.hypot(p.x-x,p.z-z)<p.range+obstacleRadius))return;
      if(occupied.some(b=>overlaps(item,b,.08)))return;
      const drift=Math.max(...[[item.boundX,0],[-item.boundX,0],[0,item.boundZ],[0,-item.boundZ]]
        .map(([dx,dz])=>Math.abs(terrain.heightAt(x+dx,z+dz)-item.y)));
      if(drift>Math.min(1.16,Math.max(.46,h*.52)))return;
      occupied.push(item);
      const basis=rotationMatrix({y:yaw});
      const levels=type==='aggregate'?[[1,0,.30],[.76,.30,.30],[.44,.60,.27]]:[[1,0,1]];
      for(const [index,[width,bottom,height]] of levels.entries()){
        const baseY=item.y+h*bottom,levelH=h*height,levelW=w*width,levelD=d*width;
        const obb=affineBox({x,y:baseY+levelH/2,z},[levelW/2,levelH/2,levelD/2],basis);
        solids.push({id:index?item.id+'-'+index:item.id,x,z,w:levelW,d:levelD,h:levelH,baseY,
          color:colors[item.variant],visualModel:true,kind:'quarry-m05-part',obb});
      }
    }
    props.push(item);
  };
  for(const [zone,lots] of Object.entries(clusters)){
    for(const [x,z,entries] of lots)for(const [type,dx,dz,yaw,tag] of entries)add(zone,type,x+dx,z+dz,yaw,tag);
  }
  for(const [zone,ax,az,bx,bz,type] of enclosures){
    const distance=Math.hypot(bx-ax,bz-az),count=Math.floor(distance/(sizes[type][0]+.12));
    const yaw=-Math.atan2(bz-az,bx-ax);
    for(let i=0;i<count;i++){
      const t=(i+.5)/count;
      add(zone,type,ax+(bx-ax)*t,az+(bz-az)*t,yaw);
    }
  }
  for(const [x,z,w,d,yaw] of rubbleMargins){
    for(let j=0;j<9;j++){
      const dx=(random()-.5)*w,dz=(random()-.5)*d;
      add('terrace','aggregate',x+dx,z+dz,yaw+random()-.5,'rock',.43+random()*.71,true);
    }
  }
  for(const [x,z,w,d,count] of outskirts){
    for(let j=0;j<count;j++){
      const angle=random()*Math.PI*2,radial=Math.sqrt(random());
      const px=x+Math.cos(angle)*w*radial,pz=z+Math.sin(angle)*d*radial;
      if(roads.some(r=>routeDistance(px,pz,r)<.55))continue;
      add('shoulder',j%4===0?'scrub':j%5===0?'rubble':'stone',px,pz,angle,'',.55+random()*.85);
    }
  }
  for(const p of props){
    const pieces=frameParts[p.type];if(!pieces)continue;
    const {x,z,y,yaw,scale}=p,c=Math.cos(yaw),s=Math.sin(yaw),basis=rotationMatrix({y:yaw});
    for(const [i,[dx,dz,w,d,h]] of pieces.entries()){
      const cx=x+(dx*c+dz*s)*scale,cz=z+(-dx*s+dz*c)*scale;
      const obb=affineBox({x:cx,y:y+h*scale/2,z:cz},[w*scale/2,h*scale/2,d*scale/2],basis);
      solids.push({id:p.id+'-part-'+i,x:cx,z:cz,w:w*scale,d:d*scale,h:h*scale,baseY:y,
        visualModel:true,kind:'quarry-m05-part',obb});
    }
  }
  return {props,solids};
}
