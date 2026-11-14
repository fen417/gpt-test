import {createCanvas} from '@napi-rs/canvas';
import {mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const canvas=createCanvas(512,512),ctx=canvas.getContext('2d');ctx.fillStyle='#c8cbbb';ctx.fillRect(0,0,512,512);let seed=417;
const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
for(let i=0;i<180;i++){ctx.fillStyle=['#a6ae96','#b2b99f','#d6d8c9'][i%3];ctx.beginPath();const x=random()*512,y=random()*512;ctx.moveTo(x,y);for(let j=0;j<6;j++)ctx.lineTo(x+Math.cos(j*Math.PI/3)*(12+random()*40),y+Math.sin(j*Math.PI/3)*(10+random()*30));ctx.closePath();ctx.fill();}
await mkdir('src/assets/tank',{recursive:true});await mkdir('.perf-local/tank',{recursive:true});await writeFile('.perf-local/tank/atlas.png',canvas.toBuffer('image/png'));
execFileSync('node_modules/basis_universal/bin/'+(process.platform==='win32'?'basisu.exe':'basisu'),['-ktx2','-uastc','-uastc_level','2','-mipmap','-file','.perf-local/tank/atlas.png','-output_file','src/assets/tank/atlas.ktx2'],{stdio:'pipe'});
