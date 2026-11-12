// Input: extracted curated/ directory from the CC0 Military SFX Pack v0.2.
// Keep source stereo, isolate single reports, and master without distortion.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const input=process.argv[2];
if(!input)throw new Error('Usage: node scripts/prepare-gunshot-assets.mjs <curated-directory>');
const destination=resolve('src/assets/audio/gunshots');
const ar='assault_rifles/ar/',pi='pistols/pi_hand/',sr='sniper_rifles/sr/';
const reports=[
  ['rifle-light-1',ar+'ar_full_near_01.wav',4.74,.66,.16,.72],
  ['rifle-light-2',ar+'ar_full_near_01.wav',7.265,.66,.16,.72],
  ['rifle-heavy-1',ar+'ar_single_near_01.wav',0,.76,.16,.72],
  ['rifle-heavy-2',ar+'ar_single_near_02.wav',0,.76,.16,.72],
  ['smg-1',ar+'ar_full_near_01.wav',4.74,.34,.13,.65],
  ['smg-2',ar+'ar_full_near_01.wav',7.265,.34,.13,.65],
  ['smg-suppressed-1',pi+'pi_hand_single_near_03.wav',0,.55,.10,.68],
  // Stop before the unrelated broadband noise later in the range recording.
  ['lmg-1','machine_guns/mg/mg_single_near_01.wav',2.06,.28,.16,.72],
  ['lmg-2','machine_guns/mg/mg_single_near_01.wav',4.0,.28,.16,.72],
  ['marksman-1',sr+'sr_single_near_01.wav',0,.59,.16,.72],
  ['marksman-2',sr+'sr_single_near_02.wav',0,.59,.16,.72],
  ['sniper-1',sr+'sr_single_near_01.wav',.685,.99,.19,.76],
  ['sniper-2',sr+'sr_single_near_02.wav',.685,.99,.19,.76],
  ['pistol-1','pistols/pi_rev/pi_rev_single_near_04.wav',0,.9,.14,.68],
  ['pistol-2','pistols/pi_rev/pi_rev_single_near_04.wav',1.60,.9,.14,.68],
  ['pistol-heavy-1',pi+'pi_hand_single_near_01.wav',0,.321,.17,.72],
  ['pistol-heavy-2',pi+'pi_hand_single_near_01.wav',0,.310,.165,.70],
];
const cache=new Map();
function decode(file){
  if(cache.has(file))return cache.get(file);
  const bytes=readFileSync(join(input,file));let offset=0,size=0,channels,rate,bits;
  for(let p=12;p+8<=bytes.length;){
    const id=bytes.toString('ascii',p,p+4),n=bytes.readUInt32LE(p+4);
    if(id==='fmt '){channels=bytes.readUInt16LE(p+10);rate=bytes.readUInt32LE(p+12);bits=bytes.readUInt16LE(p+22);}
    if(id==='data'){offset=p+8;size=n;}
    p+=8+n+(n%2);
  }
  if(bits!==16||!offset)throw new Error('Expected PCM16: '+file);
  const count=Math.floor(size/(2*channels)),data=Array.from({length:channels},()=>new Float64Array(count));
  for(let c=0;c<channels;c++)for(let i=0;i<count;i++)data[c][i]=bytes.readInt16LE(offset+(i*channels+c)*2)/32768;
  const sound={data,rate,channels,count};cache.set(file,sound);return sound;
}
for(const [name,file,time,duration,rmsTarget,peakCeiling] of reports){
  const source=decode(file),{rate,channels}=source;
  const search=Math.max(0,Math.floor((time-.025)*rate)),limit=Math.min(source.count,Math.floor((time+.035)*rate));
  let windowPeak=0;
  for(const channel of source.data)for(let i=search;i<limit;i++)windowPeak=Math.max(windowPeak,Math.abs(channel[i]));
  const threshold=Math.max(.04,windowPeak*(name.startsWith('lmg')?.8:.4));
  let onset=search;
  while(onset<limit&&!source.data.some(data=>Math.abs(data[onset])>threshold))onset++;
  const start=Math.max(0,onset-Math.round(rate*.003)),count=Math.min(Math.round(duration*rate),source.count-start);
  const data=source.data.map(channel=>channel.slice(start,start+count));
  let peak=0,energy=0;
  const body=Math.min(count,Math.round(rate*.18));
  for(const channel of data){
    let mean=0;for(const sample of channel)mean+=sample;mean/=count;
    for(let i=0;i<count;i++){channel[i]-=mean;peak=Math.max(peak,Math.abs(channel[i]));if(i<body)energy+=channel[i]**2;}
  }
  const rms=Math.sqrt(energy/(body*channels));
  const gain=Math.min(2,rmsTarget/Math.max(.01,rms),peakCeiling/Math.max(.01,peak));
  const fade=Math.min(Math.round(rate*.10),Math.floor(count/4)),attack=Math.round(rate*.0005);
  const wav=Buffer.alloc(44+count*channels*2);
  wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);
  wav.writeUInt16LE(1,20);wav.writeUInt16LE(channels,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*channels*2,28);
  wav.writeUInt16LE(channels*2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(count*channels*2,40);
  for(let i=0;i<count;i++){
    const edge=Math.max(0,Math.min(1,i/attack,(count-1-i)/fade));
    for(let c=0;c<channels;c++)wav.writeInt16LE(Math.round(data[c][i]*gain*edge*32767),44+(i*channels+c)*2);
  }
  writeFileSync(join(destination,name+'.wav'),wav);
  console.log(`${name}: ${channels}ch ${(count/rate).toFixed(3)}s, source ${file} @ ${(onset/rate).toFixed(4)}s`);
}
