import { createCanvas } from '@napi-rs/canvas';
import { writeFile,mkdir } from 'node:fs/promises';
import { Simulation } from '../shared/simulation.js';
import { rayCollider } from '../shared/asset-colliders.js';

await mkdir('src/assets/shadows',{recursive:true});
const length=Math.hypot(-90,75,65),direction={x:-90/length,y:75/length,z:65/length},size=256;
for(const mapId of ['port','quarry','village']){
  const sim=new Simulation({bots:0,mapId}),canvas=createCanvas(size,size),ctx=canvas.getContext('2d'),pixels=ctx.createImageData(size,size);
  const start=performance.now();
  for(let z=0;z<size;z++)for(let x=0;x<size;x++){
    const wx=((x+.5)/size-.5)*sim.map.size,wz=((z+.5)/size-.5)*sim.map.size;
    const origin={x:wx,y:sim.groundAt(wx,wz)+.08,z:wz};let shadow=false;
    for(const box of sim.rayBoxes(origin,direction,150))if(rayCollider(origin,direction,box,150)<150){shadow=true;break;}
    const offset=(z*size+x)*4;pixels.data[offset]=pixels.data[offset+1]=pixels.data[offset+2]=shadow?0:255;pixels.data[offset+3]=255;
  }
  ctx.putImageData(pixels,0,0);await writeFile(`src/assets/shadows/${mapId}.png`,canvas.toBuffer('image/png'));
  console.log(`${mapId}: baked ${size}x${size} ground mask in ${(performance.now()-start).toFixed(1)}ms`);
}
