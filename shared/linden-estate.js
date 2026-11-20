// Linden Estate: gameplay geometry was derived from the user's Blender GLB,
// not approximated by a single bounding box. All positions use metres,
// +Y up, and the same coordinates as GLTFLoader/Three.js.
// The GLB remains the authoritative visual asset and is loaded separately.
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
// Both floors share the same 2D door layout.
const DOORS=[
  ...[-2.9,2.3].flatMap(z=>[-8.4,-2.9,5.5,9.4].map(x=>({axis:'z',x,z,width:1.50}))),
  ...[-5.5,8].flatMap(x=>[-4.85,4.55].map(z=>({axis:'x',x,z,width:1.46}))),
  {axis:'z',x:0,z:7,width:2.18},
  {axis:'z',x:-1,z:-7,width:1.62},
  {axis:'x',x:12,z:1.85,width:1.60},
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
const doorOpenings=DOORS.flatMap(door=>[.2,3.3].map(y0=>(
  door.axis==='z'?{
    x0:door.x-door.width/2,x1:door.x+door.width/2,
    z0:door.z-.34,z1:door.z+.34,y0:y0-.02,y1:y0+2.26,
  }:{
    x0:door.x-.34,x1:door.x+.34,
    z0:door.z-door.width/2,z1:door.z+door.width/2,
    y0:y0-.02,y1:y0+2.26,
  }
)));
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
  x:12.9,z:-5.06,w:2,d:.82,baseY:3.1,h:.2,overhead:true};
const boxes=[...wallBoxes,...stairBoxes,...gallerySlabs,eastLanding];
const groundY=(x,z)=>{
  const ramp=stairSurface(x,z);
  if(ramp!==null)return ramp;
  // Ease onto the exterior stairs from their little bottom step.
  if(x>12.67&&x<14.13&&z>.60&&z<1.10)return .2*(1.10-z)/.50;
  if(x>-5.9&&x<2.9&&z>15.9&&z<18.9)return -1.33;
  if(Math.abs(x)<11.95&&Math.abs(z)<6.95)return .2;
  return 0;
};
const playable=(x,z)=>x>-23.3&&x<23.3&&z>-15.2&&z<29.2;
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
  {xs:[-22.1,-19.6,-17.1,-14.6],zs:[27.1,24.5,21.9,19.3,16.7]},
  {xs:[22.1,19.6,17.1,14.6],zs:[-13.4,-10.8,-8.2,-5.6,-3.0]},
];
for(let team=0;team<2;team++){
  const {xs,zs}=corners[team];
  for(const z of zs)for(const x of xs){
    if(!safe(x,z))continue;
    if(spawnPoints[team].some(p=>Math.hypot(x-p.x,z-p.z)<2.3))continue;
    spawnPoints[team].push({x,z});
  }
}
export const LINDEN_ESTATE_MAP={
  id:'linden_estate',name:'Linden Estate',theme:'linden-estate',size:64,
  playArea:{minX:-23.5,maxX:23.5,minZ:-15.4,maxZ:29.4},
  terrain:{cell:1,heightAt:groundY,
    raycast(origin,direction,max){
      if(direction.y>=0)return Infinity;
      // Preserve the exterior/pool ground. Complex geometry (walls, overhead
      // floors and stair rails) is handled by authoritative solid colliders.
      const sampleY=groundY(origin.x,origin.z);
      const t=(sampleY-origin.y)/direction.y;
      return t>=0&&t<=max?t:Infinity;
    }},
  boxes,structures:[],landforms:[],landmarks:[
    {id:'manor',name:'Особняк',x:0,z:0},
    {id:'courtyard',name:'Двор',x:0,z:13},
    {id:'pool',name:'Бассейн',x:-1.5,z:17.45},
  ],
  districts:[{id:'manor',name:'Особняк',x:0,z:0},{id:'garden',name:'Сад',x:0,z:18}],
  points:[],vehicleSpawns:[],weaponSpawns:[],
  spawnPoints,spawns:[spawnPoints[0][0],spawnPoints[1][0]],
  playerRadius:.30,navigationCell:.55,navigationClearance:.45,navigationSize:64,stepHeight:.42,
  // The neutral daytime palette needs less direct orange sunlight and more
  // neutral bounced light indoors, especially with roof shadows enabled.
  fogColor:0xa9bdc4,fogDensity:.0018,sunColor:0xfff4e4,
  sunIntensity:1.7,hemisphereLightIntensity:1.55,
  ambientLightIntensity:.78,toneMappingExposure:.94,
  tdmLoadout:'class',tdmNoWeaponDrops:true,
};
