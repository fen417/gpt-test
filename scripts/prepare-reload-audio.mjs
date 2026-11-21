import ffmpeg from 'ffmpeg-static';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const source = new URL('../art-source/audio/reload/',import.meta.url);
const output = new URL('../src/assets/audio/reload/',import.meta.url);
const cuts = JSON.parse(await readFile(new URL('cuts.json',source),'utf8'));
const rate = 24000, gap = Buffer.alloc(rate*.055*2);
const bank=[], segments=new Map(), timings={};
let frames=0;
function makeClip({file,from,to}){
  const input = execFileSync(ffmpeg,[
    '-v','error','-i',fileURLToPath(new URL(file+'.mp3',source)),
    '-ss',String(from),'-t',String(to-from),'-af','highpass=f=100,lowpass=f=10500',
    '-vn','-ac','1','-ar',String(rate),'-f','s16le','pipe:1',
  ]);
  const length=input.length/2;
  let peak=0;
  for(let i=0;i<length;i++)peak=Math.max(peak,Math.abs(input.readInt16LE(i*2)));
  if(length<rate*.04||peak<100)throw new Error('Empty reload cut: '+file+' at '+from);
  const gain=Math.min(8,18500/peak);
  for(let i=0;i<length;i++){
    const fade=Math.min(1,i/(rate*.005),(length-i-1)/(rate*.016));
    input.writeInt16LE(Math.round(input.readInt16LE(i*2)*gain*fade),i*2);
  }
  return input;
}

for(const [weapon,rows] of Object.entries(cuts)){
  timings[weapon]=rows.map(cue=>{
    const key=[cue.file,cue.from,cue.to].join('/');
    if(!segments.has(key)){
      const clip=makeClip(cue);
      segments.set(key,[frames/rate,clip.length/2/rate]);
      bank.push(clip,gap);
      frames+=(clip.length+gap.length)/2;
    }
    return [cue.phase,...segments.get(key),...(cue.empty?[true]:[])];
  });
}
await mkdir(output,{recursive:true});
const input=Buffer.concat(bank);
for(const [extension,encoder,bitrate] of [['ogg','libopus','23k'],['m4a','aac','25k']]){
  const target=new URL('reloads.'+extension,output);
  execFileSync(ffmpeg,['-y','-v','error','-f','s16le','-ar',String(rate),'-ac','1','-i','pipe:0',
    '-c:a',encoder,'-b:a',bitrate,fileURLToPath(target)],{input});
}
await writeFile(new URL('cues.json',output),JSON.stringify(timings,null,2)+'\n');
