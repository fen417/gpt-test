import { writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { createSoldierRig } from '../src/soldier.js';
// Geometry-only measurement; canvas/image stubs do not measure texture loading.
const ctx={fillRect(){},drawImage(){},beginPath(){},closePath(){},moveTo(){},lineTo(){},fill(){},stroke(){},arc(){},save(){},restore(){},getImageData(x,y,w,h){return {data:new Uint8ClampedArray(w*h*4)};},putImageData(){}};
globalThis.document={createElement:()=>({width:8,height:8,getContext:()=>ctx})};
globalThis.Image=class{set src(v){queueMicrotask(()=>this.onload?.());}};
globalThis.ImageData=class{constructor(data){this.data=data;}};
const owner={},rows=[];
for(const classId of ['assault','medic','support','recon']){
  const start=performance.now(),rig=createSoldierRig(owner,{id:classId,classId,team:0,x:0,z:0,shotSeq:0});
  rows.push({classId,ms:performance.now()-start,triangles:[rig.detailGeometry,rig.mediumGeometry,rig.distantGeometry].map(g=>g.index.count/3)});
}
await owner.soldierHeadReady;
console.log(rows);if(process.argv[2])await writeFile(process.argv[2],JSON.stringify(rows,null,2)+'\n');
