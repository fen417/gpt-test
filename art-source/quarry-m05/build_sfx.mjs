import {mkdirSync, mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const rate=24000;
const tau=Math.PI*2,sine=Math.sin;
const hz=n=>440*2**((n-69)/12);
let seed=581;
const noise=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**31-1;};
function wave(frames,sample){
  const buffer=Buffer.alloc(44+frames*2);
  buffer.write('RIFF');buffer.writeUInt32LE(buffer.length-8,4);buffer.write('WAVEfmt ',8);
  buffer.writeUInt32LE(16,16);buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(1,22);
  buffer.writeUInt32LE(rate,24);buffer.writeUInt32LE(rate*2,28);buffer.writeUInt16LE(2,32);
  buffer.writeUInt16LE(16,34);buffer.write('data',36);buffer.writeUInt32LE(frames*2,40);
  for(let i=0;i<frames;i++)buffer.writeInt16LE(Math.round(32767*Math.max(-.98,Math.min(.98,sample(i/rate,i)))),44+2*i);
  return buffer;
}
const sfx=new URL('../../public/campaign/m05/sfx/',import.meta.url);
mkdirSync(sfx,{recursive:true});
let grit=0,rumble=0;
const machines={
  conveyor:t=>.078*sine(tau*38*t)+.043*sine(tau*76*t)+grit*.18+
    .15*Math.exp(-13*(t%.68))*(sine(tau*110*t)+rumble),
  ventilation:t=>.105*sine(tau*42*t)*(.76+.22*sine(tau*6*t))+.08*rumble+.04*grit,
  gate:t=>(.09*sine(tau*59*t)+.10*grit+.09*rumble)*(.63+.26*sine(tau*2*t)),
  fire:t=>.24*rumble+.09*grit+.20*grit*Math.max(0,sine(tau*2.4*t))**7,
  warning:t=>.12*sine(tau*(520*t-17*Math.cos(tau*t/4)))*Math.max(0,sine(tau*t/2.5))**.4,
  wind:t=>rumble*(.24+.18*sine(tau*t/5))+grit*.08,
};
const stage=mkdtempSync(join(tmpdir(),'sector09-quarry-sfx-'));
try{
  for(const [id,source] of Object.entries(machines)){
    const seconds=10,buffer=wave(seconds*rate,t=>{
      const v=noise();grit+=(v-grit)*.085;rumble+=(v-rumble)*.004;
      return source(t)*Math.max(0,Math.min(1,t*15,(seconds-t)*15));
    });
    const file=join(stage,id+'.wav');writeFileSync(file,buffer);
    const ff=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',file,'-c:a','libopus','-b:a','26k',
      fileURLToPath(new URL(id+'.ogg',sfx))],{stdio:'inherit'});
    if(ff.status!==0)throw Error('ffmpeg: '+id);
  }
}finally{rmSync(stage,{recursive:true});}
