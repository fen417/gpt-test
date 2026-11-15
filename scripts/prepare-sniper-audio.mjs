import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import ffmpeg from 'ffmpeg-static';

function attack(file){
  const rate=44100,pcm=execFileSync(ffmpeg,['-v','error','-i',file,'-ac','1','-ar',String(rate),'-f','f32le','pipe:1']);
  let peak=0;for(let i=0;i<pcm.length;i+=4)peak=Math.max(peak,Math.abs(pcm.readFloatLE(i)));
  if(peak<.001)throw Error('Silent sniper recording: '+file);
  let first=0;while(first<pcm.length&&Math.abs(pcm.readFloatLE(first))<peak*.15)first+=4;
  return {firstStrongAttackMs:first/4/rate*1000,peak,durationSeconds:pcm.length/4/rate};
}
export async function prepareSniperAudio(){
  const recordings=[];
  for(const [number,weapon]of [[1,'dmr12'],[2,'sv98']]){
    const source=`art-source/audio/gunshots/user-${weapon}.ogg`,target=`src/assets/audio/gunshots/marksman-${number}`;
    await readFile(source);const before=attack(source),trimSeconds=Math.max(0,before.firstStrongAttackMs/1000-.003);
    const filters=`atrim=start=${trimSeconds},asetpts=PTS-STARTPTS,afade=t=in:d=0.001`;
    for(const [ext,codec]of [['ogg',['libopus','-b:a','80k','-vbr','constrained']],['m4a',['aac','-b:a','64k']]]){
      execFileSync(ffmpeg,['-v','error','-y','-i',source,'-map','0:a:0','-vn','-map_metadata','-1','-af',filters,'-c:a',...codec,target+'.'+ext]);
      const after=attack(target+'.'+ext);if(after.firstStrongAttackMs>20)throw Error('Late shot attack: '+target+'.'+ext);
      recordings.push({weapon,format:ext,source,trimSeconds,before,after});
    }
  }
  const report={method:'User uploads preserved as sources. First sample above 15% of peak aligned with 3ms lead and 1ms fade; no normalization or sample-rate change.',recordings};
  await writeFile('docs/perf/sniper-recordings.json',JSON.stringify(report,null,2)+'\n');return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(await prepareSniperAudio(),null,2));
