import { createCanvas } from '@napi-rs/canvas';
import { mkdir,writeFile,copyFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createSurfaceMaterials } from '../src/visuals.js';
globalThis.document={createElement:()=>createCanvas(512,512)};
const surfaces=createSurfaceMaterials({capabilities:{getMaxAnisotropy:()=>4}},{bake:true});
await mkdir('src/assets/surfaces',{recursive:true});await mkdir('public/basis',{recursive:true});await mkdir('.perf-local/surfaces',{recursive:true});
for(const file of ['basis_transcoder.js','basis_transcoder.wasm'])await copyFile('node_modules/three/examples/jsm/libs/basis/'+file,'public/basis/'+file);
const basis='node_modules/basis_universal/bin/'+(process.platform==='win32'?'basisu.exe':'basisu');
for(const [name,map] of Object.entries(surfaces.maps)){
  const canvas=map.image;await writeFile(`src/assets/surfaces/${name}.webp`,canvas.toBuffer('image/webp'));
  const source=`.perf-local/surfaces/${name}.png`;await writeFile(source,canvas.toBuffer('image/png'));
  execFileSync(basis,['-ktx2','-mipmap','-q','180','-file',source,'-output_file',`src/assets/surfaces/${name}.ktx2`],{stdio:'pipe'});
  const ctx=canvas.getContext('2d'),pixels=ctx.getImageData(0,0,512,512),normal=ctx.createImageData(512,512);
  const height=(x,y)=>{const i=(((y+512)%512)*512+(x+512)%512)*4;return (pixels.data[i]+pixels.data[i+1]+pixels.data[i+2])/765;};
  for(let y=0;y<512;y++)for(let x=0;x<512;x++){const i=(y*512+x)*4,dx=(height(x-1,y)-height(x+1,y))*.7,dy=(height(x,y-1)-height(x,y+1))*.7,len=Math.hypot(dx,dy,1);normal.data[i]=128+127*dx/len;normal.data[i+1]=128+127*dy/len;normal.data[i+2]=128+127/len;normal.data[i+3]=255;}
  ctx.putImageData(normal,0,0);await writeFile(`src/assets/surfaces/${name}-normal.webp`,canvas.toBuffer('image/webp'));
  const normalSource=`.perf-local/surfaces/${name}-normal.png`;await writeFile(normalSource,canvas.toBuffer('image/png'));
  execFileSync(basis,['-ktx2','-mipmap','-linear','-q','180','-file',normalSource,'-output_file',`src/assets/surfaces/${name}-normal.ktx2`],{stdio:'pipe'});
  console.log(name);
}
