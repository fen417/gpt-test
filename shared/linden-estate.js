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
JgLmAH0AFgDyADEB2v3HARYAdgDyADEBIAPHARYAdgDyADEBUPuO/iYAqgD1AEoBUPuQASYAoAD1AEoBsASQASYAoAD1AEoBfPy8AqAA
JgD8AEoBqP28AqAAJgD8AEoB1P68AqAAJgD8AEoBfAG8AqAAJgD8AEoBvAK8AqAAJgD8AEoBnP9E/ZsAJgD/AEoBsAS5ACYAlgD/AEoB
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
const wallBoxes=unpackWalls();
const stairBoxes=[];
for(const [x,startZ,w] of [[2,2.156,1.7],[13.4,.406,1.65]]){
  for(let index=0;index<18;index++){
    const top=Math.round((.372+index*(3.3-.372)/17)*1000)/1000;
    stairBoxes.push({id:'estate-step-'+(stairBoxes.length),kind:'village-stair',
      x,z:Math.round((startZ-index*.289)*1000)/1000,w,d:.289,baseY:0,h:top});
  }
}
const gallerySlabs=[
  [-5.5,0,13,14], [7.5,0,9,14], [2,4.7,2,4.6], [2,-4.95,2,4.1]
].map(([x,z,w,d],i)=>({id:'estate-gallery-'+i,kind:'village-floor',
  x,z,w,d,baseY:3.06,h:.24,overhead:true}));
const boxes=[...wallBoxes,...stairBoxes,...gallerySlabs];
const groundY=(x,z)=>{
  if(x>-5.9&&x<2.9&&z>15.9&&z<18.9)return -1.33;
  if(Math.abs(x)<11.95&&Math.abs(z)<6.95)return .2;
  return 0;
};
const playable=(x,z)=>x>-23.3&&x<23.3&&z>-15.2&&z<29.2;
function safe(x,z){
  if(!playable(x,z))return false;
  const y=groundY(x,z);
  return !boxes.some(b=>!b.overhead&&y+.02<b.baseY+b.h&&y+1.65>b.baseY&&
    Math.abs(x-b.x)<b.w/2+.53&&Math.abs(z-b.z)<b.d/2+.53);
}
const spawnPoints=[[],[]];
for(let team=0;team<2;team++){
  const sign=team===0?-1:1;
  for(const unsignedX of [21.6,17.2,14.4]){
    for(let z=-12.6;z<=27;z+=2.65){
      const x=sign*unsignedX;
      if(!safe(x,z))continue;
      if(spawnPoints[team].some(p=>Math.hypot(x-p.x,z-p.z)<2.35))continue;
      spawnPoints[team].push({x,z:Math.round(z*100)/100});
    }
  }
}
export const LINDEN_ESTATE_MAP={
  id:'linden_estate',name:'Linden Estate',theme:'linden-estate',size:64,
  playArea:{minX:-23.5,maxX:23.5,minZ:-15.4,maxZ:29.4},
  terrain:{cell:1,heightAt:groundY,
    raycast(origin,direction,max){
      if(direction.y>=0)return Infinity;
      // Exterior ground and sunken pool are flat; main house floor is elevated.
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
  navigationCell:1.15,navigationSize:64,stepHeight:.4,
  tdmLoadout:'class',tdmNoWeaponDrops:true,
};
