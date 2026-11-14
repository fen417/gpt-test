import ffmpeg from 'ffmpeg-static';
import { execFileSync } from 'node:child_process';
import { readdir,mkdir,rename,access } from 'node:fs/promises';
const exists=async path=>{try{await access(path);return true;}catch{return false;}};
for(const folder of ['gunshots','foley']){
  await mkdir(`art-source/audio/${folder}`,{recursive:true});
  for(const name of await readdir(`src/assets/audio/${folder}`))if(name.endsWith('.wav'))await rename(`src/assets/audio/${folder}/${name}`,`art-source/audio/${folder}/${name}`);
  for(const name of await readdir(`art-source/audio/${folder}`))if(name.endsWith('.wav')){
    const source=`art-source/audio/${folder}/${name}`,base=`src/assets/audio/${folder}/${name.slice(0,-4)}`;
    execFileSync(ffmpeg,['-y','-hide_banner','-loglevel','error','-i',source,'-map','0:a:0','-vn','-map_metadata','-1','-c:a','libopus','-b:a','80k','-vbr','constrained',base+'.ogg']);
    execFileSync(ffmpeg,['-y','-hide_banner','-loglevel','error','-i',source,'-map','0:a:0','-vn','-map_metadata','-1','-c:a','aac','-b:a','64k',base+'.m4a']);
  }
}
await mkdir('art-source/audio/music',{recursive:true});
const original='art-source/audio/music/quiet-resolve.mp3';
if(!await exists(original))await rename('src/assets/audio/music/quiet-resolve.mp3',original);
// Full track and stereo retained. AAC is supported by the target browsers.
execFileSync(ffmpeg,['-y','-hide_banner','-loglevel','error','-i',original,'-map','0:a:0','-vn','-map_metadata','-1','-c:a','aac','-b:a','75k','src/assets/audio/music/quiet-resolve.m4a']);
