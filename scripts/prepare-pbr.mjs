import {createCanvas,loadImage} from '@napi-rs/canvas';
import {mkdir,readFile,writeFile,rename,stat,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {PBR_SOURCES,PBR_PACK_VERSION} from '../src/pbr-library.js';

const output='public/pbr-v1',cache='.perf-local/pbr-source';
const basis=join('node_modules','basis_universal','bin',process.platform==='win32'?'basisu.exe':'basisu');
if(process.env.S09_PBR_SKIP==='1'){console.log('PBR preparation skipped by S09_PBR_SKIP');process.exit(0);}
const selection=process.argv.find(a=>a.startsWith('--surface='))?.split('=')[1];
const all=!selection;
const userAgent='SECTOR09-PBR-Pack/1.0 (https://github.com/fen417/gpt-test)';
await mkdir(output,{recursive:true});await mkdir(cache,{recursive:true});
const previous=await readFile(join(output,'manifest.json'),'utf8').then(JSON.parse).catch(()=>null);
const files=previous?.version===PBR_PACK_VERSION?previous.files:{};
const sources=previous?.version===PBR_PACK_VERSION?previous.sources:{};
const sizesFor=(spec,channel)=>channel==='disp'?[512,1024]:channel==='arm'?[256,512,1024,2048]:[512,1024,2048,...(spec.max===4096?[4096]:[])];
const valid=async path=>{try{const s=await stat(path);return s.isFile()&&s.size>80;}catch{return false;}};
async function request(url){
  let error;
  for(let i=0;i<3;i++){
    try{
      const response=await fetch(url,{headers:{'User-Agent':userAgent},signal:AbortSignal.timeout(120000)});
      if(!response.ok)throw Error(response.status+' '+url);
      return response;
    }catch(e){error=e;await new Promise(resolve=>setTimeout(resolve,1000*(i+1)));}
  }
  throw error;
}
const index=new Map();
async function source(asset,channel,sourceSize){
  const key=asset+'-'+channel+'-'+sourceSize;
  if(!index.has(asset))index.set(asset,await (await request('https://api.polyhaven.com/files/'+asset)).json());
  const options=index.get(asset);
  const record=(channel==='diff'?(options.diff??options.diffuse):options[channel])?.[sourceSize/1024+'k'];
  const file=record?.jpg??record?.png;
  if(!file?.url)throw Error('No source: '+key);
  const path=join(cache,key+(record.jpg?'.jpg':'.png'));
  const hash=buffer=>createHash('md5').update(buffer).digest('hex');
  let data=await readFile(path).catch(()=>null);
  if(!data||(file.md5&&hash(data)!==file.md5)){
    data=Buffer.from(await (await request(file.url)).arrayBuffer());
    if(file.md5&&hash(data)!==file.md5)throw Error('Checksum mismatch '+key);
    await writeFile(path,data);
  }
  sources[key]={url:file.url,md5:hash(data),license:'CC0-1.0'};
  return path;
}
async function encode(surface,channel,size,input,spec){
  const path=join(output,surface+'-'+channel+'-'+size+'.ktx2');
  if(await valid(path)&&files[surface]?.[channel]?.includes(size))return;
  const image=await loadImage(input);
  const canvas=createCanvas(size,size),ctx=canvas.getContext('2d');
  ctx.imageSmoothingQuality='high';ctx.drawImage(image,0,0,size,size);
  const palette=channel==='diff'?spec.palette:null;
  if(palette||(channel==='arm'&&surface==='sand')){
    const pixels=ctx.getImageData(0,0,size,size);
    for(let i=0;i<pixels.data.length;i+=4){
      if(palette)for(let c=0;c<3;c++)pixels.data[i+c]=palette[c+3]+(pixels.data[i+c]-palette[c])*palette[6];
      else pixels.data[i+1]+=(255-pixels.data[i+1])*.52;
    }
    ctx.putImageData(pixels,0,0);
  }
  const png=join(cache,'encode-'+surface+'-'+channel+'-'+size+'.png');
  const temporary=path+'.tmp.ktx2';
  await writeFile(png,canvas.toBuffer('image/png'));
  try{
    const args=['-ktx2','-mipmap','-y_flip','-file',png,'-output_file',temporary,
      ...(channel==='diff'?['-q','190']:['-uastc','-uastc_level','1','-linear'])];
    execFileSync(basis,args,{stdio:'inherit',timeout:900000});
    if(!await valid(temporary))throw Error('Missing encoded KTX2 '+temporary);
    await rename(temporary,path);
    files[surface]??={};files[surface][channel]??=[];
    if(!files[surface][channel].includes(size))files[surface][channel].push(size);
  }finally{await rm(png,{force:true});await rm(temporary,{force:true});}
}
function checkpoint(){return writeFile(join(output,'manifest.json'),JSON.stringify({version:PBR_PACK_VERSION,files,sources},null,2)+'\n');}
for(const [surface,spec] of Object.entries(PBR_SOURCES)){
  if(selection&&selection!==surface)continue;
  for(const channel of ['diff','nor_gl','arm',...(spec.height?['disp']:[])]){
    const sizes=sizesFor(spec,channel);
    const missing=[];
    for(const size of sizes)if(!files[surface]?.[channel]?.includes(size)||!await valid(join(output,surface+'-'+channel+'-'+size+'.ktx2')))missing.push(size);
    if(!missing.length)continue;
    // Native 2K/4K scan inputs; no upsampling from legacy 1K assets.
    const input=await source(spec.asset,channel,Math.max(1024,...missing));
    for(const size of missing){console.log(surface,channel,size);await encode(surface,channel,size,input,spec);await checkpoint();}
  }
}
if(all||selection==='ceramic')for(const size of [256,1024]){
  await encode('ceramic','arm',size,'src/assets/remaster/ceramic-arm-'+size+'.webp',{});await checkpoint();
}
if(selection&&selection!=='ceramic'&&!Object.hasOwn(PBR_SOURCES,selection))throw Error('Unknown surface '+selection);
await checkpoint();
console.log('PBR pack ready:',Object.keys(files).join(', '));
