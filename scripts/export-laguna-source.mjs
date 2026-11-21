import { mkdir, writeFile } from 'node:fs/promises';
import { createCanvas } from '@napi-rs/canvas';
import { POOL_DAY_MAP as map } from '../shared/pool-day.js';

const {boxes,pools,floorSections,menuView}=map;
const output=new URL('../src/assets/laguna/',import.meta.url);
await mkdir(output,{recursive:true});
await writeFile(process.argv[2],JSON.stringify({boxes,pools,floorSections,menuView}));

const canvas=createCanvas(512,512), ctx=canvas.getContext('2d');
let seed=721;
function random(){
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  return seed/4294967296;
}
ctx.fillStyle='#798280';
ctx.fillRect(0,0,512,512);
for(let row=0;row<8;row++)for(let col=0;col<8;col++){
  const x=col*64,y=row*64,c=177+Math.floor(random()*27);
  const gradient=ctx.createLinearGradient(x,y,x+64,y+64);
  gradient.addColorStop(0,`rgb(${c+13},${c+15},${c+13})`);
  gradient.addColorStop(.12,`rgb(${c+4},${c+7},${c+5})`);
  gradient.addColorStop(1,`rgb(${c-9},${c-8},${c-9})`);
  ctx.fillStyle=gradient;
  ctx.fillRect(x+1,y+1,62,62);
  for(let i=0;i<54;i++){
    ctx.fillStyle=i%3===0?'#605e5614':'#e0ebe51a';
    ctx.fillRect(x+3+random()*58,y+3+random()*58,1+random()*2,.7+random()*1.6);
  }
}
await writeFile(new URL('ceramic.webp',output),canvas.toBuffer('image/webp',82));

const ripples=createCanvas(192,192),surface=ripples.getContext('2d');
const pixels=surface.createImageData(192,192);
for(let y=0;y<192;y++)for(let x=0;x<192;x++){
  const u=x/192*Math.PI*2,v=y/192*Math.PI*2;
  const crest=.5+.5*Math.sin(3*u+2*v+.83*Math.sin(v)+.64*Math.cos(u-3*v));
  const light=184+50*crest**8+10*Math.sin(u-2*v);
  pixels.data.set([light,light+4,light+5,255],(y*192+x)*4);
}
surface.putImageData(pixels,0,0);
await writeFile(new URL('ripples.webp',output),ripples.toBuffer('image/webp',78));
