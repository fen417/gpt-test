// The original manor shell and stairs supply the structural collision. The
// Blender export uses the same widening and the authored furniture volumes.
export const ESTATE_WIDTH_SCALE=1.16;
const PACKED_WALLS=(
`av82BoQDEQB7/wEAqP3RBhEANgF7/wEALAHRBhEANgF7/wEAav9sB4QDEQB7/wEAAADA+cASMAAAAA4BlPj6AJYADAAAAHwAbAf6AJYADAAAAHwAoPa8AjAA
+BEAAA4BYAm8AjAA+BEAAA4BSfggAwwATAQAAHwA3/ggAwwATAQAAHwAIQcgAwwATAQAAHwAtwcgAwwATAQAAHwA4PwQBFgCDAAAAHwAhAMQBFgCDAAAAHwA
4PyIBFgCDAAAAHwAhAOIBFgCDAAAAHwAGPwUBZYADAAAAHwAlPhGBZYADAAAAHwAbAdGBZYADAAAAHwAvALcBZYADAAAAHwAzfukBgwAIAMAAHwAY/ykBgwA
IAMAAHwAcQIIBwwAWAIAAHwABwMIBwwAWAIAAHwAGPw0CJYADAAAAHwAvAI0CJYADAAAAHwAUPsVCSADDAAAAHwAFAUVCfQBDAAAAHwAwPlgCQwAlgAAAHwA
4PxgCQwAlgAAAHwAGgRgCQwAlgAAAHwADgZgCQwAlgAAAHwAUPurCSADDAAAAHwAFAWrCfQBDAAAAHwAx/y4C04MMAAAAA4BvQa4C0YFMAAAAA4BwPtE/eEA
JgAUAEoBfPxE/ZYAJgAUAG4AIf1E/bQAJgAUAEoBxv1E/ZYAJgAUAG4AsP5E/T4BJgAUAEoBQQFE/bACJgAUAEoB5AJE/ZYAJgAUAG4AdQNE/YwAJgAUAEoB
BgRE/ZYAJgAUAG4AgARE/V8AJgAUAEoB2v2c/RYAiAAUADEBIAOc/RYAiAAUADEBUPu+/SYA9QAUAEoBUPuO/iYAqgAUAG4A2v2a/hYAiAAUADEBIAOa/hYA
iAAUADEBsATZ/iYAKgMUAEoB7/ve/hYBFgAUADEByP3e/qQBFgAUADEBw//e/kIBFgAUADEBigHe/rwAFgAUADEB6QLe/gkBFgAUADEBQwTe/rIAFgAUADEB
UPsSACYAXQIUAEoB7/vmABYBFgAUADEByP3mAKQBFgAUADEBw//mAEIBFgAUADEBigHmALwAFgAUADEB6QLmAAkBFgAUADEBQwTmALIAFgAUADEBsAQiASYA
PAAUAEoB2v05ARYApgAUADEBIAM5ARYApgAUADEBUPuQASYAoAAUAG4AsASQASYAoAAUAG4AUPtOAiYA3AAUAEoBsAROAiYA3AAUAEoB2v1VAhYApgAUADEB
IANVAhYApgAUADEBvvu8AtwAJgAUAEoBfPy8AqAAJgAUAHEAEv28AowAJgAUAEoBqP28AqAAJgAUAHEAPv68AowAJgAUAEoB1P68AqAAJgAUAHEAV/+8AmYA
JgAUAEoB0QC8ArYAJgAUAEoBfAG8AqAAJgAUAHEAHAK8AqAAJgAUAEoBvAK8AqAAJgAUAHEAUgO8AowAJgAUAEoB6AO8AqAAJgAUAHEAdAS8AngAJgAUAEoB
Pf9hAykAKQAcAC4BPf9hAykAKQAcAC4BwwBhAykAKQAcAC4BwwBhAykAKQAcAC4Bhvy1AdcAEAAuAHYAfPxE/ZYADABuAPAAxv1E/ZYADABuAPAA5AJE/ZYA
DABuAPAABgRE/ZYADABuAPAAUPuO/gwAqgBuAPUAUPuQAQwAoABuAPUAsASQAQwAoABuAPUAfPy8AqAADABxAPwAqP28AqAADABxAPwA1P68AqAADABxAPwA
fAG8AqAADABxAPwAvAK8AqAADABxAPwA6AO8AqAADABxAPwAfPxE/ZYAJgDwAEoBxv1E/ZYAJgDwAEoB5AJE/ZYAJgDwAEoBBgRE/ZYAJgDwAEoB2v0b/hYA
dgDyADEBIAMb/hYAdgDyADEBuPze/n0AFgDyADEB3v7e/ocAFgDyADEBJgLe/n0AFgDyADEBrAPe/n0AFgDyADEBuPzmAH0AFgDyADEB3v7mAIcAFgDyADEB
JgLmAH0AFgDyADEBrAPmAH0AFgDyADEB2v3HARYAdgDyADEBIAPHARYAdgDyADEBUPuO/iYAqgD1AEoBUPuQASYAoAD1AEoBsASQASYAoAD1AEoBfPy8AqAA
JgD8AEoBqP28AqAAJgD8AEoB1P68AqAAJgD8AEoBfAG8AqAAJgD8AEoBvAK8AqAAJgD8AEoB6AO8AqAAJgD8AEoBnP9E/ZsAJgD/AEoBsAS5ACYAlgD/AEoB
wPtE/eEAJgBKAYACfPxE/ZYAJgBKAaQBIf1E/bQAJgBKAYACxv1E/ZYAJgBKAaQBrv5E/TsBJgBKAYACnP9E/aAAJgBKAaQBQgFE/a0CJgBKAYAC5AJE/ZYA
JgBKAaQBdQNE/YwAJgBKAYACBgRE/ZYAJgBKAaQBgARE/V8AJgBKAYACsASE/SYAfwBKAYAC2v2c/RYAiABKAWcCIAOc/RYAiABKAWcCUPu+/SYA9QBKAYAC
UPuO/iYAqgBKAaQB2v2a/hYAiABKAWcCIAOa/hYAiABKAWcC7/ve/hYBFgBKAWcCyP3e/qQBFgBKAWcCw//e/kIBFgBKAWcCigHe/rwAFgBKAWcC6QLe/gkB
FgBKAWcCQwTe/rIAFgBKAWcCsATK/yYA7AJKAYACUPsSACYAXQJKAYAC7/vmABYBFgBKAWcCyP3mAKQBFgBKAWcCw//mAEIBFgBKAWcCigHmALwAFgBKAWcC
6QLmAAkBFgBKAWcCQwTmALIAFgBKAWcC2v05ARYApgBKAWcCIAM5ARYApgBKAWcCUPuQASYAoABKAaQBsASQASYAoABKAaQBUPtOAiYA3ABKAYACsAROAiYA
3ABKAYAC2v1VAhYApgBKAWcCIANVAhYApgBKAWcCvvu8AtwAJgBKAYACfPy8AqAAJgBKAacBEv28AowAJgBKAYACqP28AqAAJgBKAacBPv68AowAJgBKAYAC
1P68AqAAJgBKAacBXv+8AnMAJgBKAYACAAC8AtIAJgBKAZgBygC8AsMAJgBKAYACfAG8AqAAJgBKAacBHAK8AqAAJgBKAYACvAK8AqAAJgBKAacBUgO8AowA
JgBKAYAC6AO8AqAAJgBKAacBdAS8AngAJgBKAYACAAC8AtIADACYAT0CfPxE/ZYADACkASYCxv1E/ZYADACkASYCnP9E/aAADACkASYC5AJE/ZYADACkASYC
BgRE/ZYADACkASYCUPuO/gwAqgCkASsCUPuQAQwAoACkASsCsASQAQwAoACkASsCfPy8AqAADACnATICqP28AqAADACnATIC1P68AqAADACnATICfAG8AqAA
DACnATICvAK8AqAADACnATIC6AO8AqAADACnATICfPxE/ZYAJgAmAoACxv1E/ZYAJgAmAoACnP9E/aAAJgAmAoAC5AJE/ZYAJgAmAoACBgRE/ZYAJgAmAoAC
2v0b/hYAdgAoAmcCIAMb/hYAdgAoAmcCuPze/n0AFgAoAmcC3v7e/ocAFgAoAmcCJgLe/n0AFgAoAmcCrAPe/n0AFgAoAmcCuPzmAH0AFgAoAmcC3v7mAIcA
FgAoAmcCJgLmAH0AFgAoAmcCrAPmAH0AFgAoAmcC2v3HARYAdgAoAmcCIAPHARYAdgAoAmcCsAQM/iYAkQArAoACUPuO/iYAqgArAoACUPuQASYAoAArAoAC
sASQASYAoAArAoACfPy8AqAAJgAyAoACqP28AqAAJgAyAoAC1P68AqAAJgAyAoACfAG8AqAAJgAyAoACvAK8AqAAJgAyAoAC6AO8AqAAJgAyAoAC`).replace(/\s/g,'');
function unpackWalls(){
  const binary=atob(PACKED_WALLS);
  if(binary.length%12)throw new Error('Linden collider encoding corrupted');
  const view=new DataView(Uint8Array.from(binary,char=>char.charCodeAt(0)).buffer);
  const result=[];
  for(let k=0;k<view.byteLength;k+=12){
    const [x,z,w,d,y0,y1]=Array.from({length:6},(_,i)=>view.getInt16(k+i*2,true)/100);
    result.push({id:'estate-solid-'+result.length,kind:'wall',x,z,w,d,baseY:y0,h:y1-y0,
      overhead:y0>=2.8});
  }
  return result;
}
// Unlike rendering, physics uses server-owned simplified solids. Openings
// (doors) are subtracted from the wall volumes, never blocked by their jambs.
// Interior doors align across floors. The upper exterior door has its own landing.
const DOORS=[
  ...[-2.9,2.3].flatMap(z=>[-8.4,-2.9,5.5,9.4].map(x=>({axis:'z',x,z,width:1.50}))),
  ...[-5.5,8].flatMap(x=>[-4.85,4.55].map(z=>({axis:'x',x,z,width:1.46}))),
  {axis:'z',x:0,z:7,width:2.18},
  {axis:'z',x:-1,z:-7,width:1.62},
  {axis:'x',x:12,z:1.85,width:1.60},
  {axis:'x',x:12,z:-5,width:1.46,y:3.3},
];
const rect=(x0,x1,y0,y1,z0,z1,source)=>({
  ...source,x:(x0+x1)/2,z:(z0+z1)/2,
  w:x1-x0,d:z1-z0,baseY:y0,h:y1-y0,
  overhead:y0>=2.0,
});
function subtractOpening(piece,opening){
  const ax0=piece.x-piece.w/2,ax1=piece.x+piece.w/2,
    az0=piece.z-piece.d/2,az1=piece.z+piece.d/2,
    ay0=piece.baseY,ay1=piece.baseY+piece.h;
  const ix0=Math.max(ax0,opening.x0),ix1=Math.min(ax1,opening.x1),
    iz0=Math.max(az0,opening.z0),iz1=Math.min(az1,opening.z1),
    iy0=Math.max(ay0,opening.y0),iy1=Math.min(ay1,opening.y1);
  if(ix1-ix0<=.0001||iz1-iz0<=.0001||iy1-iy0<=.0001)return [piece];
  // Six non-overlapping residual prisms: never replace an opening with an
  // oversize single box, which had covered visually open doorways in v0.23.
  return [
    rect(ax0,ix0,ay0,ay1,az0,az1,piece),
    rect(ix1,ax1,ay0,ay1,az0,az1,piece),
    rect(ix0,ix1,ay0,iy0,az0,az1,piece),
    rect(ix0,ix1,iy1,ay1,az0,az1,piece),
    rect(ix0,ix1,iy0,iy1,az0,iz0,piece),
    rect(ix0,ix1,iy0,iy1,iz1,az1,piece),
  ].filter(b=>b.w>.025&&b.d>.025&&b.h>.025);
}
const doorOpenings=DOORS.flatMap((door,i)=>(i<12?[.2,3.3]:[door.y??.2]).map(y0=>(
  door.axis==='z'?{
    x0:door.x-door.width/2,x1:door.x+door.width/2,
    z0:door.z-.34,z1:door.z+.34,y0:y0-.02,y1:y0+2.26,
  }:{
    x0:door.x-.34,x1:door.x+.34,
    z0:door.z-door.width/2,z1:door.z+door.width/2,
    y0:y0-.02,y1:y0+2.26,
  }
)));
// The side entrance opens against this partition. A continuous opening to the
// pantry clears the full approach and joins the two circulation routes.
doorOpenings.push({x0:8.68,x1:11.94,z0:2.10,z1:2.49,y0:.18,y1:2.48});
const wallBoxes=unpackWalls().flatMap(wall=>{
  let pieces=[wall];
  for(const opening of doorOpenings)
    pieces=pieces.flatMap(piece=>subtractOpening(piece,opening));
  return pieces;
}).map((box,i)=>({...box,id:'estate-solid-'+i,overhead:box.baseY>=2.0}));

// The GLB contains 18 narrow treads on each flight (17 cm rise / 29 cm
// run). A 40 cm capsule overlaps two or three upcoming treads simultaneously,
// so ordinary stair-step collision gets stuck even though the visual stairs are
// correct. The gameplay foot surface is a continuous walkable ramp; visible
// geometry remains the original Blender mesh.
const STAIRS=[
  {x:2,halfWidth:.73,zBottom:2.38,zTop:-2.96,base:.2,top:3.3},
  {x:13.4,halfWidth:.73,zBottom:.60,zTop:-4.74,base:.2,top:3.3},
];
function stairSurface(x,z){
  for(const stair of STAIRS){
    if(Math.abs(x-stair.x)>stair.halfWidth||z>stair.zBottom||z<stair.zTop)continue;
    const t=Math.max(0,Math.min(1,(stair.zBottom-z)/(stair.zBottom-stair.zTop)));
    return stair.base+(stair.top-stair.base)*t;
  }
  return null;
}
const stairBoxes=[];
for(const [x,startZ,w] of [[2,2.156,1.7],[13.4,.406,1.65]])
  for(let index=0;index<18;index++){
    const top=Math.round((.372+index*(3.3-.372)/17)*1000)/1000;
    stairBoxes.push({id:'estate-step-'+stairBoxes.length,kind:'village-stair',
      x,z:Math.round((startZ-index*.289)*1000)/1000,w,d:.289,
      baseY:0,h:top,noCollision:true});
  }
const gallerySlabs=[
  [-5.5,0,13,14],[7.5,0,9,14],[2,4.7,2,4.6],[2,-4.95,2,4.1],
].map(([x,z,w,d],i)=>({id:'estate-gallery-'+i,kind:'village-floor',
  x,z,w,d,baseY:3.06,h:.24,overhead:true}));
const eastLanding={id:'estate-east-landing',kind:'village-floor',
  x:12.9,z:-5.06,w:2,d:.82,baseY:3.1,h:3.3-3.1,overhead:true};
const pantryLintel={id:'estate-pantry-lintel',kind:'wall',
  x:10.25,z:2.30,w:3.10,d:.22,baseY:2.48,h:.57,overhead:true};
const widen=value=>({...value,x:value.x*ESTATE_WIDTH_SCALE,w:value.w*ESTATE_WIDTH_SCALE});
const retainedShell=wallBoxes.filter(b=>Math.abs(b.x)<14.8&&b.z>-8&&b.z<10.5);
const architecture=[...retainedShell,...stairBoxes,...gallerySlabs,eastLanding,pantryLintel].map(widen);
const fitted=[];
const furnishings=[];
const paint={oak:'#6f5239',leather:'#5a4837',linen:'#89847a',sage:'#666b54',
  plaster:'#a09a85',limestone:'#817e70',hedge:'#546149',metal:'#465152',brick:'#786356'};
function fitting(id,type,x,z,w,d,y=0,options={}){
  const prop={id,type,x,z,w,d,y,...options};
  const pieces=[];
  const part=(key,dx,dz,w,d,base,h,surface='oak')=>pieces.push({
    id:'estate-'+id+'-'+key,kind:surface==='oak'||surface==='leather'||surface==='linen'?'estate-wood':'estate-prop',
    x:x+dx,z:z+dz,w,d,baseY:y+base,h,overhead:base>0||y>2,color:paint[surface],surface,
  });
  const shade=options.finish??'oak';
  if(type==='table'||type==='chair'||type==='bench'){
    const top=options.top??(type==='table'?.81:type==='bench'?.51:.48),foot=type==='table'?.125:.092;
    for(const side of [-1,1])for(const end of [-1,1])
      part('leg-'+side+'-'+end,side*(w*.5-foot*.84),end*(d*.5-foot*.84),foot,foot,0,top-.075,shade);
    part('top',0,0,w,d,top-.09,.09,shade);
    if(type==='chair')part('back',0,(options.facing??1)*(d/2-.065),w,.13,top-.025,.49,shade);
    if(type==='bench')part('back',0,d/2-.075,w,.13,top-.025,.40,shade);
  }else if(type==='sofa'){
    const facing=options.facing??1;
    part('seat',0,0,w,d,.09,.40,shade);
    part('back',0,facing*(d/2-.13),w,.26,.39,.50,shade);
    for(const side of [-1,1])part('arm-'+side,side*(w/2-.13),-.038*facing,.26,d-.14,.41,.22,shade);
  }else if(type==='bed'){
    part('frame',0,0,w,d,0,.29,'oak');
    part('mattress',0,0,w-.045,d-.06,.29,.36,shade);
    part('head',0,d/2-.065,w,.13,.44,.63,'oak');
  }else if(type==='shelf'){
    const front=options.facing??1,h=options.h;
    part('back',-front*(w/2-.045),0,.09,d,0,h);
    for(const end of [-1,1])part('side-'+end,0,end*(d/2-.055),w,.11,0,h);
    for(let row=0;row<6;row++)part('board-'+row,0,0,w,d-.2,row*(h-.085)/5,.085);
  }else if(type==='lamp'){
    part('base',0,0,w,d,0,.27,'metal');
    part('post',0,0,.105,.105,.27,1.84,'metal');
    part('light',0,0,.22,.22,2.11,.27,'metal');
  }else{
    part('body',0,0,w,d,0,options.h,shade);
  }
  const worldParts=pieces.map(widen);
  fitted.push(...worldParts);
  furnishings.push({...widen(prop),parts:worldParts});
}

// Library and study share the west end. Drawers and seats face into the rooms.
fitting('library-wall','shelf',-11.23,-5.69,.58,1.80,.2,{h:2.20});
fitting('library-console','case',-9.4,-6.47,1.42,.46,.2,{h:.86,facing:1});
fitting('library-reading','chair',-6.72,-6.05,.72,.68,.2,{finish:'leather',facing:-1});
fitting('lounge-sofa','sofa',-9.28,6.40,2.23,.78,.2,{finish:'leather'});
fitting('lounge-coffee-table','table',-9.28,5.34,1.29,.66,.2,{top:.46});
fitting('lounge-chair','chair',-10.35,4.10,.72,.70,.2,{finish:'sage',facing:-1});
fitting('entry-console','case',-4.45,6.48,1.25,.44,.2,{h:.88,facing:-1});
fitting('hall-console','case',-4.70,1.86,1.14,.43,.2,{h:.89,facing:-1});

fitting('dining-table','table',5.25,5.11,1.96,.90,.2);
for(const side of [-1,1])for(const end of [-1,1])
  fitting('dining-chair-'+side+'-'+end,'chair',5.25+side*.51,5.11+end*.84,.48,.56,.2,{facing:end});
fitting('pantry-sideboard','case',10.24,6.47,2.15,.52,.2,{h:1.02,facing:-1});
fitting('kitchen-counter','case',10.06,-6.43,2.70,.56,.2,{h:.94,facing:1,sink:true});

fitting('study-shelf','shelf',-11.22,-5.72,.55,1.74,3.3,{h:2.08});
fitting('study-desk','table',-8.95,-5.93,1.55,.66,3.3,{top:.75});
fitting('study-chair','chair',-8.95,-4.95,.60,.60,3.3,{finish:'sage',facing:1});
fitting('guest-bed-west','bed',-9.72,5.80,1.62,1.98,3.3,{finish:'linen'});
fitting('guest-west-nightstand','case',-7.90,6.50,.57,.47,3.3,{h:.52,facing:-1});
fitting('guest-bed-east','bed',10.51,5.91,1.55,1.78,3.3,{finish:'sage'});
fitting('guest-east-nightstand','case',11.52,6.47,.47,.46,3.3,{h:.52,facing:-1});
fitting('upper-wardrobe','case',8.39,-6.10,.53,1.14,3.3,{h:1.97,wardrobe:true});
fitting('gallery-sofa','sofa',4.06,1.69,1.48,.72,3.3,{finish:'sage'});
fitting('gallery-console','case',-3.62,6.47,1.16,.45,3.3,{h:.85,facing:-1});
for(const side of [-1,1]){
  fitting('terrace-bench-'+side,'bench',side*5.6,9.0,2.12,.61);
  fitting('forecourt-planter-'+side,'planter',side*7.4,11.67,5.12,1.45,0,{finish:'limestone',h:.84});
  fitting('pool-planter-'+side,'planter',side*8.2,19.83,4.50,1.40,0,{finish:'limestone',h:.76});
  fitting('lane-hedge-'+side,'hedge',side*18.7,4.7,1.34,7.2,0,{finish:'hedge',h:1.23});
  fitting('garden-bench-'+side,'bench',side*14.80,14.58,2.3,.7);
  fitting('garden-plinth-'+side,'planter',side*18.3,-5.0,2.68,1.33,0,{finish:'limestone',h:.9});
}
fitting('pool-deck-box','case',5.25,17.17,1.70,.68,0,{finish:'oak',h:.82});
fitting('front-sculpture','planter',1.1,12.74,2.14,1.30,0,{finish:'limestone',h:.99});

for(const [i,x,z] of [[0,-20.5,-10],[1,17.8,-13],[2,-20.7,13.7],[3,20.8,11.0],[4,14.2,24.9],[5,-13.6,28.2]])
  fitting('tree-'+i,'tree',x,z,.45,.45,0,{finish:'oak',h:3.55});
for(const [i,x,z] of [[0,-11.0,12.8],[1,11.0,12.8],[2,-18.54,-8],[3,18.54,-8],
                       [4,-10.6,23.7],[5,14.1,21.8]])
  fitting('lantern-'+i,'lamp',x,z,.32,.34);

function gardenWall(id,x,z,w,d,h=2.65){
  fitted.push(widen({id:'estate-yard-'+id,kind:'estate-prop',x,z,w,d,h,baseY:0,
    color:paint.brick,surface:'brick'}));
}
gardenWall('north',0,-18.6,49.56,.44);
gardenWall('south',0,32.15,49.56,.44);
gardenWall('west',-24.56,6.78,.44,51.55);
gardenWall('east',24.56,6.78,.44,51.55);
// L-shaped screens protect each team from the yard while keeping two exits.
gardenWall('west-spawn-side',-16.45,25.45,.52,9.35,2.72);
gardenWall('west-spawn-front',-19.04,19.87,4.7,.52,2.72);
gardenWall('east-spawn-side',16.45,-11.95,.52,9.15,2.72);
gardenWall('east-spawn-front',19.04,-6.45,4.7,.52,2.72);

const pool={x:-1.5*ESTATE_WIDTH_SCALE,z:17.45,w:8.8*ESTATE_WIDTH_SCALE,d:3,depth:1.33};
pool.ramp=2.65;
for(const sign of [-1,1]){
  fitted.push({id:'estate-pool-side-'+sign,kind:'estate-prop',x:pool.x,z:pool.z+sign*(pool.d/2+.09),
    w:pool.w,d:.18,h:pool.depth,baseY:-pool.depth,color:'#557a71',surface:'plaster'});
}
const boxes=[...architecture,...fitted];
const groundY=(worldX,z)=>{
  const x=worldX/ESTATE_WIDTH_SCALE;
  const ramp=stairSurface(x,z);
  if(ramp!==null)return ramp;
  // Ease onto the exterior stairs from their little bottom step.
  if(x>12.67&&x<14.13&&z>.60&&z<1.10)return .2*(1.10-z)/.50;
  if(Math.abs(z-pool.z)<pool.d/2){
    const edge=pool.w/2-Math.abs(worldX-pool.x);
    if(edge>0)return -pool.depth*Math.min(1,edge/pool.ramp);
  }
  if(Math.abs(x)<11.95&&Math.abs(z)<6.95)return .2;
  return 0;
};
const poolSlope=pool.depth/pool.ramp;
const groundPlanes=[
  [0,0,0],[.2,0,0],[-pool.depth,0,0],
  [poolSlope*(pool.x-pool.w/2),-poolSlope,0],
  [-poolSlope*(pool.x+pool.w/2),poolSlope,0],
  [.44,0,-.4],
  ...STAIRS.map(stair=>{
    const slope=(stair.base-stair.top)/(stair.zBottom-stair.zTop);
    return [stair.base-slope*stair.zBottom,0,slope];
  }),
];
function raycastGround(origin,direction,max){
  let nearest=Infinity;
  for(const [height,slopeX,slopeZ] of groundPlanes){
    const crossing=direction.y-slopeX*direction.x-slopeZ*direction.z;
    if(crossing>=-1e-8)continue;
    const t=(height+slopeX*origin.x+slopeZ*origin.z-origin.y)/crossing;
    if(t<0||t>max||t>=nearest)continue;
    const x=origin.x+direction.x*t,z=origin.z+direction.z*t;
    if(Math.abs(groundY(x,z)-origin.y-direction.y*t)<1e-4)nearest=t;
  }
  return nearest;
}
const playArea={minX:-28.03,maxX:28.03,minZ:-18.14,maxZ:31.71};
const playable=(x,z)=>x>playArea.minX&&x<playArea.maxX&&z>playArea.minZ&&z<playArea.maxZ;
function safe(x,z){
  if(!playable(x,z))return false;
  const y=groundY(x,z);
  return !boxes.some(b=>!b.noCollision&&!b.overhead&&y+.02<b.baseY+b.h&&y+1.65>b.baseY&&
    Math.abs(x-b.x)<b.w/2+.50&&Math.abs(z-b.z)<b.d/2+.50);
}
// Opposite diagonal corners, separated by the full house. No shared courtyard
// spawns, no instantaneous cross-team sightlines on the first frames.
const spawnPoints=[[],[]];
const corners=[
  {xs:[-23.15,-21.15,-19.15,-17.15],zs:[30.55,28.2,25.85,23.5,21.15]},
  {xs:[23.15,21.15,19.15,17.15],zs:[-17.02,-14.67,-12.32,-9.97,-7.62]},
];
for(let team=0;team<2;team++){
  const {xs,zs}=corners[team];
  for(const z of zs)for(const oldX of xs){
    const x=oldX*ESTATE_WIDTH_SCALE;
    if(!safe(x,z))continue;
    if(spawnPoints[team].some(p=>Math.hypot(x-p.x,z-p.z)<2.3))continue;
    spawnPoints[team].push({x,z});
  }
}

const position=(x,z,y=.2)=>({x:x*ESTATE_WIDTH_SCALE,y,z});
const navigationNodes=DOORS.flatMap(({x,z,axis,y},i)=>
  (i<12?[.2,3.3]:[y??.2]).flatMap(floor=>[-.62,0,.62].map(offset=>{
    const px=x+(axis==='x'?offset:0),pz=z+(axis==='z'?offset:0);
    return position(px,pz,floor===.2?groundY(px*ESTATE_WIDTH_SCALE,pz):floor);
  })));
for(const stair of STAIRS){
  for(let i=0;i<=13;i++){
    const t=i/13;
    navigationNodes.push(position(stair.x,stair.zBottom+(stair.zTop-stair.zBottom)*t,stair.base+(stair.top-stair.base)*t));
  }
}

const frontHall=position(-.65,5.80),rearHall=position(-1.1,-5.58),sideHall=position(10.65,1.70);
const mainLanding=position(2,-3.65,3.3);
const terrace=[position(13.4,1.2,0),position(13.4,-5.06,3.3),position(11,-5,3.3)];
const botPatrols=[
  [
    {entry:[frontHall,mainLanding],rooms:[position(-7.1,-4.9,3.3),position(-7.25,.6,3.3),position(-7.5,4.65,3.3)]},
    {entry:[frontHall],rooms:[position(-7.2,4.70),position(-8.4,.40),position(-9.1,-4.70)]},
    {entry:[frontHall],rooms:[position(3.72,4.5),position(6.6,-.40),position(6.98,-4.80)]},
    {entry:[frontHall,mainLanding],rooms:[position(5.85,4.65,3.3),position(9.42,3.66,3.3),position(9.26,.50,3.3)]},
    {entry:[sideHall],rooms:[position(10.6,-4.78),position(8.92,-.34),position(10.48,4.66)]},
    {entry:[],rooms:[position(-14.7,9.5,0),position(-16.7,-.45,0),position(-11.6,-10.5,0)]},
  ],
  [
    {entry:[...terrace],rooms:[position(9.26,.41,3.3),position(9.42,3.66,3.3),position(5.48,-4.55,3.3)]},
    {entry:[rearHall],rooms:[position(5.24,-4.65),position(6.44,-.51),position(3.6,4.55)]},
    {entry:[rearHall],rooms:[position(-9.1,-4.25),position(-8.15,.45),position(-7.1,4.77)]},
    {entry:[rearHall,mainLanding],rooms:[position(-3.15,-4.55,3.3),position(-8.27,.71,3.3),position(-7.26,4.72,3.3)]},
    {entry:[sideHall],rooms:[position(10.48,4.63),position(9.08,.78),position(10.64,-4.84)]},
    {entry:[],rooms:[position(15.7,6.9,0),position(15.1,11.85,0),position(11.4,19.1,0)]},
  ],
];

export const LINDEN_ESTATE_MAP={
  id:'linden_estate',name:'Linden Estate',theme:'linden-estate',size:72,layoutVersion:4,playArea,
  menuView:{eye:[12.8,2.95,25.8],target:[-1.4,2.65,2.6],fov:64},
  terrain:{cell:1,heightAt:groundY,raycast:raycastGround},
  boxes,furnishings,pool,structures:[],landforms:[],landmarks:[
    {id:'manor',name:'Особняк',x:0,z:0},
    {id:'courtyard',name:'Двор',x:0,z:13},
    {id:'pool',name:'Бассейн',x:pool.x,z:pool.z},
  ],
  districts:[{id:'manor',name:'Особняк',x:0,z:0},{id:'garden',name:'Сад',x:0,z:18}],
  points:[],vehicleSpawns:[],weaponSpawns:[],
  spawnPoints,spawns:[spawnPoints[0][0],spawnPoints[1][0]],
  playerRadius:.30,navigationCell:.63,navigationClearance:.45,navigationWaypointRadius:.36,
  navigationSize:72,stepHeight:.42,navigationNodes,botPatrols,
  // The neutral daytime palette needs less direct orange sunlight and more
  // neutral bounced light indoors, especially with roof shadows enabled.
  fogColor:0xa9bdc4,fogDensity:.0018,sunColor:0xfff4e4,
  sunIntensity:2.23,hemisphereLightIntensity:1.81,
  ambientLightIntensity:.82,toneMappingExposure:1.06,
  tdmLoadout:'class',tdmNoWeaponDrops:true,
};
