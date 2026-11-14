import {mkdir,copyFile,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import ffmpeg from 'ffmpeg-static';

const source='art-source/audio/foley/explosion-heavy.ogg',target='src/assets/audio/foley/explosion-heavy.ogg',rate=44100;
await mkdir('art-source/audio/foley',{recursive:true});
if(!existsSync(source))await copyFile(target,source);
function analyse(file){
  const pcm=execFileSync(ffmpeg,['-v','error','-i',file,'-ac','1','-ar',String(rate),'-f','f32le','pipe:1']);
  let peak=0,first=-1,sum=0;const count=pcm.length/4;
  for(let i=0;i<count;i++)peak=Math.max(peak,Math.abs(pcm.readFloatLE(i*4)));
  for(let i=0;i<count;i++){const value=pcm.readFloatLE(i*4);if(first<0&&Math.abs(value)>=peak*.15)first=i;if(i<rate*.05)sum+=value*value;}
  if(first<0)throw Error('Explosion recording has no measurable attack');
  return {durationSeconds:count/rate,firstStrongAttackMs:first/rate*1000,first50msRms:Math.sqrt(sum/(rate*.05)),peak};
}
const before=analyse(source),trimSeconds=Math.max(0,before.firstStrongAttackMs/1000-.003);
execFileSync(ffmpeg,['-v','error','-y','-i',source,'-af',`atrim=start=${trimSeconds},asetpts=PTS-STARTPTS,afade=t=in:d=0.001`,'-c:a','libvorbis','-q:a','6',target]);
const after=analyse(target);
if(after.firstStrongAttackMs>20)throw Error('Explosion attack remains late after encoding');
const report={method:'First sample above 15% of global peak; aligned with 3 ms lead and 1 ms edge fade. Original compressed master preserved.',trimSeconds,before,after};
await writeFile('docs/perf/pt90-explosion-alignment.json',JSON.stringify(report,null,2)+'\n');console.log(report);
