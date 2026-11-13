// Usage: node scripts/prepare-combat-audio.mjs <staging-directory> <ffmpeg>
// Staging contains military/curated (hamsunqiu CC0 pack) and rocket/ (dklon).
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const [stage,ffmpeg]=process.argv.slice(2);
if(!stage||!ffmpeg)throw Error('Expected staging directory and ffmpeg path');
const curated=path.join(stage,'military/curated');
function convert(input,output,filters){
  execFileSync(ffmpeg,['-hide_banner','-loglevel','error','-y','-i',input,'-af',filters,'-ar','44100',
    ...(output.endsWith('.ogg')?['-c:a','libvorbis','-q:a','6']:['-c:a','pcm_s16le']),output]);
}
const clean='silenceremove=start_periods=1:start_duration=0.001:start_threshold=-40dB,highpass=f=35';
for(let i=1;i<=2;i++){
  const input=path.join(curated,`sniper_rifles/sr/sr_single_near_0${i+2}.wav`);
  convert(input,`src/assets/audio/gunshots/sniper-${i}.wav`,`${clean},atrim=duration=1.4,loudnorm=I=-20:TP=-4:LRA=11,afade=t=out:st=1.2:d=0.2`);
  convert(input,`src/assets/audio/gunshots/marksman-${i}.wav`,`${clean},asetrate=52800,aresample=44100,atrim=duration=1.1,loudnorm=I=-22:TP=-5:LRA=11,afade=t=out:st=0.9:d=0.2`);
  convert(path.join(stage,`rocket/rocket_launch_${i}.wav`),`src/assets/audio/foley/rocket-launch-${i}.ogg`,`${clean},loudnorm=I=-21:TP=-4:LRA=11,afade=t=out:st=1.3:d=0.25`);
}
convert(path.join(curated,'explosions/fx_exp/fx_exp_single_near_01.wav'),'src/assets/audio/foley/explosion-heavy.ogg',`${clean},atrim=duration=3.8,loudnorm=I=-20:TP=-4:LRA=11,afade=t=out:st=3.2:d=0.6`);
convert(path.join(curated,'explosions/fx_exp/fx_exp_single_near_02.wav'),'src/assets/audio/foley/explosion-grenade.ogg',`${clean},atrim=duration=2.6,loudnorm=I=-22:TP=-5:LRA=11,afade=t=out:st=2.1:d=0.5`);
// A moving motor loop, not a launch report played repeatedly. Crossfade the
// extracted sustained jet at the seam before encoding.
const raw=execFileSync(ffmpeg,['-v','error','-i',path.join(stage,'rocket/rocket_launch_2.wav'),'-af','atrim=start=0.22:end=1.02,asetpts=PTS-STARTPTS,highpass=f=160,lowpass=f=6200','-ar','44100','-ac','1','-f','f32le','pipe:1']);
const data=new Float32Array(raw.length/4);for(let i=0;i<data.length;i++)data[i]=raw.readFloatLE(i*4);
const overlap=4410,length=data.length-overlap,out=Buffer.alloc(length*4);let peak=0;
for(let i=0;i<overlap;i++){const t=i/overlap;data[i]=data[length+i]*(1-t)+data[i]*t;}
for(let i=0;i<length;i++)peak=Math.max(peak,Math.abs(data[i]));
for(let i=0;i<length;i++)out.writeFloatLE(data[i]*.55/Math.max(.01,peak),i*4);
execFileSync(ffmpeg,['-v','error','-y','-f','f32le','-ar','44100','-ac','1','-i','pipe:0','-c:a','libvorbis','-q:a','6','src/assets/audio/foley/rocket-flight.ogg'],{input:out});
