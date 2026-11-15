import {spawnSync} from 'node:child_process';
import {readFile,writeFile,mkdir,readdir,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,join} from 'node:path';
import ffmpeg from 'ffmpeg-static';

// Offline Windows TTS. No API keys, runtime synthesis service or voice cloning.
const root=fileURLToPath(new URL('../',import.meta.url)),raw=join(root,'.perf-local/campaign-voice/raw');
const localePath=join(root,'public/campaign/m01/ru.json'),missionPath=join(root,'public/campaign/m01/mission.json');
const output=join(root,'public/campaign/m01/voice');
const profiles={
  orlov:{pitch:.80,tempo:.94,description:'Низкий, размеренный, по радио'},
  duran:{pitch:.88,tempo:1.00,description:'Низкий, собранный командир'},
  lasko:{pitch:1.18,tempo:1.01,description:'Повышенный, немного торопливый'},
  bruno:{pitch:1.08,tempo:1.04,description:'Светлый, подвижный'},
  kane:{pitch:.95,tempo:.97,description:'Грубоватый, медленный'},
  courier:{pitch:1.12,tempo:.92,description:'Более высокий, усталый'},
  officer:{pitch:.84,tempo:1.08,description:'Резкий, низкий'},
  sentry:{pitch:1.02,tempo:.96,description:'Средний, настороженный'},
};
await mkdir(raw,{recursive:true});await mkdir(output,{recursive:true});
if(!process.argv.includes('--encode-only')){
  if(process.platform!=='win32')throw Error('Offline speech rendering requires Windows and Microsoft Pavel. Use --encode-only for existing WAV clips.');
  const rendered=spawnSync(process.env.CAMPAIGN_POWERSHELL??'pwsh.exe',['-NoProfile','-File',join(root,'scripts/synthesize-campaign-voice.ps1'),'-OutputDirectory',raw],{cwd:root,encoding:'utf8',windowsHide:true});
  if(rendered.status!==0)throw Error(rendered.stderr||rendered.stdout);process.stdout.write(rendered.stdout);
}
const locale=JSON.parse(await readFile(localePath,'utf8')),mission=JSON.parse(await readFile(missionPath,'utf8')),clips=[];
function oggSeconds(bytes){
  let offset=0,last=0,preSkip=0;
  while(offset+27<=bytes.length){
    if(bytes.toString('ascii',offset,offset+4)!=='OggS')throw Error('Invalid Ogg page');
    const segments=bytes[offset+26];let size=0;for(let i=0;i<segments;i++)size+=bytes[offset+27+i];
    const body=offset+27+segments;if(bytes.toString('ascii',body,body+8)==='OpusHead')preSkip=bytes.readUInt16LE(body+10);
    const granule=Number(bytes.readBigUInt64LE(offset+6));if(granule<Number.MAX_SAFE_INTEGER)last=Math.max(last,granule);
    offset=body+size;
  }
  return Math.max(0,(last-preSkip)/48000);
}
for(const [id,line] of Object.entries(locale.lines)){
  const p=profiles[line.speaker],source=join(raw,id+'.wav'),target=join(output,id+'.ogg');
  const filter=`aresample=24000,asetrate=${Math.round(24000*p.pitch)},aresample=24000,atempo=${p.tempo/p.pitch},highpass=f=80,lowpass=f=6700,silenceremove=start_periods=1:start_threshold=-48dB,areverse,silenceremove=start_periods=1:start_threshold=-48dB,areverse,apad=pad_dur=0.10,loudnorm=I=-18:TP=-2:LRA=8`;
  const result=spawnSync(ffmpeg,['-hide_banner','-loglevel','error','-y','-i',source,'-af',filter,'-ac','1','-ar','24000','-c:a','libopus','-application','voip','-b:a','20k',target],{encoding:'utf8',windowsHide:true});
  if(result.status!==0)throw Error(id+': '+result.stderr);
  const bytes=await readFile(target),duration=oggSeconds(bytes);line.duration=Math.max(2,Math.ceil((duration+.3)*100)/100);line.synthesis={engine:'Windows System.Speech / Microsoft Pavel',profile:line.speaker};
  clips.push({id,speaker:line.speaker,seconds:duration,bytes:bytes.length});
}
const totalBytes=clips.reduce((sum,c)=>sum+c.bytes,0);if(totalBytes>mission.audioBudgets.voice)throw Error(`Voice budget exceeded: ${totalBytes}`);
for(const scene of Object.values(mission.cutscenes)){
  let end=0;for(const cue of scene.lines){cue[0]=Math.max(cue[0],Math.ceil((end+.25)*100)/100);end=cue[0]+locale.lines[cue[1]].duration;}
  scene.duration=Math.max(scene.duration,Math.ceil(end+1));
}
await writeFile(localePath,JSON.stringify(locale,null,2)+'\n');await writeFile(missionPath,JSON.stringify(mission,null,2)+'\n');
await writeFile(join(output,'manifest.json'),JSON.stringify({engine:'Offline Windows System.Speech',baseVoice:'Microsoft Pavel',note:'Eight processed character timbres from one installed Russian male voice; synthetic, not actors or cloned people.',profiles,totalBytes,clips},null,2)+'\n');
console.log(`Encoded ${clips.length} clips; ${(totalBytes/1000).toFixed(1)} KB / ${mission.audioBudgets.voice/1000} KB.`);
