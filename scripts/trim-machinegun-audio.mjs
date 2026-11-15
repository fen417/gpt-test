// Derive two short single-round machine-gun reports from the supplied
// long-form machinegun.ogg recording. Usage: node scripts/trim-machinegun-audio.mjs
// Requires ffmpeg and ffprobe on PATH; no external npm packages.
import {spawnSync} from 'node:child_process';
import {mkdirSync,statSync} from 'node:fs';
import {join} from 'node:path';

const directory='src/assets/audio/gunshots';
const source=join(directory,'machinegun.ogg');
const output=(index,ext)=>join(directory,`machinegun-shot-${index}.${ext}`);
function run(bin,args){
  const result=spawnSync(bin,args,{encoding:null,maxBuffer:64*1024*1024});
  if(result.error||result.status!==0)
    throw Error(`${bin} failed (${result.status}): ${result.stderr?.toString()??result.error}`);
  return result.stdout;
}
const metadata=JSON.parse(run('ffprobe',['-v','error','-show_entries','format=duration','-of','json',source]));
const duration=Number(metadata.format?.duration);
if(!Number.isFinite(duration)||duration<.25)throw Error('Source recording is too short for a complete gunshot');
const sampleRate=24000,windowSize=120;
const pcm=run('ffmpeg',['-nostdin','-v','error','-i',source,'-ac','1','-ar',String(sampleRate),'-f','f32le','pipe:1']);
const frames=Math.floor(pcm.byteLength/(windowSize*4));
const rms=new Float64Array(frames);
const peak=new Float64Array(frames);
for(let n=0;n<frames;n++){
  let sum=0,max=0;
  for(let j=0;j<windowSize;j++){
    const sample=Math.abs(pcm.readFloatLE(4*(n*windowSize+j)));
    sum+=sample*sample;
    if(sample>max)max=sample;
  }
  rms[n]=Math.sqrt(sum/windowSize);peak[n]=max;
}
const maxRms=Math.max(...rms),maxPeak=Math.max(...peak);
if(maxRms<.002||maxPeak<.01)throw Error('No audible reports detected in machinegun.ogg');
const candidates=[];
const onsetFloor=Math.max(.004,maxRms*.14);
for(let i=10;i<frames-35;i++){
  const level=(rms[i]+rms[i+1])/2;
  let background=0;
  for(let j=3;j<=10;j++)background+=rms[i-j];
  background/=8;
  const rise=level-background;
  if(level<onsetFloor||rise<maxRms*.065)continue;
  // Peak in the immediate local attack window: avoid multiple selections
  // from the same transient during its first few milliseconds.
  if(rms[i]<rms[i-1]*.97||rms[i]<rms[i-2]*.96)continue;
  candidates.push({seconds:i*windowSize/sampleRate,score:rise+.12*level,level});
}
candidates.sort((a,b)=>b.score-a.score);
// The two selected attacks must come from distinct rounds. Keep their
// independent timing and spectral character instead of pitch-shifting.
const chosen=[];
for(const c of candidates){
  if(chosen.some(x=>Math.abs(x.seconds-c.seconds)<.24))continue;
  chosen.push(c);
  if(chosen.length===2)break;
}
if(chosen.length===0){
  const index=rms.findIndex(x=>x>maxRms*.55);
  chosen.push({seconds:Math.max(0,index*windowSize/sampleRate),score:maxRms,level:maxRms});
}
if(chosen.length===1){
  // A recording with only one distinct report still produces two runtime
  // variants, without taking a random quiet stretch.
  chosen.push({...chosen[0],seconds:chosen[0].seconds,duplicate:true});
}
chosen.sort((a,b)=>a.seconds-b.seconds);
console.log('Machine gun source:',{duration:duration.toFixed(2),maxRms:maxRms.toFixed(3),maxPeak:maxPeak.toFixed(3),
  strongOnsets:candidates.slice(0,12).map(x=>Number(x.seconds.toFixed(3))),
  selected:chosen.map(x=>Number(x.seconds.toFixed(3)))});
mkdirSync(directory,{recursive:true});
for(const [index,c] of chosen.entries()){
  const start=Math.max(0,c.seconds-.010);
  const filter=[
    'highpass=f=60',
    'lowpass=f=16000',
    'afade=t=in:st=0:d=0.002',
    // The next round in an automatic burst must not bleed into a single-shot
    // sample (the game emits a separate sound for each authoritative round).
    'afade=t=out:st=0.095:d=0.065',
    'alimiter=limit=0.85',
  ].join(',');
  const common=['-hide_banner','-nostdin','-loglevel','error','-y','-ss',String(start),'-i',source,'-t','0.16','-af',filter,'-ar','44100','-ac','1'];
  const variant=index+1;
  run('ffmpeg',[...common,'-c:a','libopus','-b:a','88k',output(variant,'ogg')]);
  run('ffmpeg',[...common,'-c:a','aac','-b:a','112k',output(variant,'m4a')]);
  for(const ext of ['ogg','m4a']){
    const file=output(variant,ext);
    const format=JSON.parse(run('ffprobe',['-v','error','-show_entries','format=duration','-of','json',file]));
    const seconds=Number(format.format?.duration);
    if(!Number.isFinite(seconds)||seconds<.12||seconds>.30)throw Error(`Unexpected duration for ${file}: ${seconds}`);
    console.log(`${file}: ${seconds.toFixed(3)} s, ${statSync(file).size} bytes`);
  }
}
