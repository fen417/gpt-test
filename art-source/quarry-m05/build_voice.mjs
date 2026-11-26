import {spawnSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const key=process.env.ELEVENLABS_API_KEY;
if(!key)throw Error('Set ELEVENLABS_API_KEY in the current process.');
const dir=new URL('../../public/campaign/m05/',import.meta.url),manifestUrl=new URL('voice/manifest.json',dir);
const localeUrl=new URL('ru.json',dir);
const manifest=JSON.parse(await readFile(manifestUrl,'utf8')),locale=JSON.parse(await readFile(localeUrl,'utf8'));
const endpoint='https://api.elevenlabs.io/v1/text-to-speech/';
const headers={'xi-api-key':key,'Content-Type':'application/json'};
const request=(url,options={})=>fetch(url,{headers,signal:AbortSignal.timeout(55000),...options});
const fallbackIds=['pqHfZKP75CvOlQylNhV4','SAz9YHcvj6GT2YYXdXww','CYw3kZ02Hs0563khs1Fj','N2lVS1w4EtoT3dr4eOWO',
  'EXAVITQu4vr4xnSDxMaL','D38z5RcWu1voky8WS1ja','cjVigY5qzO86Huf0OWal','JBFqnCBsd6RMkjVDRZzb',
  'bVMeCyTHy58xNoL34h3p','ErXwobaYiN019PkySvjV','oWAxZDx7w5VEj9dCyTzz','MF3mGyEYCl7XYWbV9V6O',
  'yoZ06aMxZJJ28mfd3POQ','VR6AewLTigWG4xSOukaG','pFZP5JQG7iQjIQuC4Bku'];
const reserved=new Set(manifest.clips.map(c=>c.voiceId).filter(Boolean));
let candidates=[];
try{
  const r=await request('https://api.elevenlabs.io/v2/voices?page_size=100');
  if(r.ok)candidates=(await r.json()).voices.filter(v=>v.category==='premade')
    .sort((a,b)=>Number(b.labels?.language==='ru')-Number(a.labels?.language==='ru')||
      Number(b.labels?.gender==='male')-Number(a.labels?.gender==='male')).map(v=>v.voice_id);
}catch{ /* The synthesis endpoint can be scoped separately. */ }
const voices=[...new Set([...candidates,...fallbackIds])].filter(id=>id&&!reserved.has(id));
const casting=new Map();
for(const clip of manifest.clips)if(!clip.voiceId){
  if(!casting.has(clip.speaker))casting.set(clip.speaker,voices.shift());
  clip.voiceId=casting.get(clip.speaker)??null;
}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function duration(buffer){
  let offset=0,last=0,skip=0;
  while(offset+27<=buffer.length){
    if(buffer.toString('ascii',offset,offset+4)!=='OggS')throw Error('Invalid Ogg file');
    const segments=buffer[offset+26],body=offset+27+segments;
    const granule=Number(buffer.readBigUInt64LE(offset+6));
    if(Number.isSafeInteger(granule))last=Math.max(last,granule);
    if(buffer.toString('ascii',body,body+8)==='OpusHead')skip=buffer.readUInt16LE(body+10);
    let bytes=0;for(let i=0;i<segments;i++)bytes+=buffer[offset+27+i];
    offset=body+bytes;
  }
  return Math.round((last-skip)/48000*1e6)/1e6;
}
let completed=0,next=0,halt=false;
const failed=[];
async function work(){
  while(!halt){
    const clip=manifest.clips[next++];if(!clip)return;
    const output=new URL('voice/'+clip.id+'.ogg',dir);
    if(clip.status==='ready'){
      try{await readFile(output);completed++;continue;}catch{}
    }
    if(!clip.voiceId){failed.push([clip.id,'no_voice']);continue;}
    try{
      let response;
      for(let attempt=0;attempt<4;attempt++){
        response=await request(endpoint+clip.voiceId+'?output_format=mp3_44100_128',{
          method:'POST',body:JSON.stringify({model_id:manifest.model,language_code:'ru',
            text:clip.spoken,voice_settings:manifest.voice_settings}),
        });
        if(response.ok||response.status<429)break;
        if(attempt<3)await pause((1+attempt)*1300);
      }
      if(!response.ok){
        let reason='';
        try{reason=(await response.json()).detail?.status;}catch{}
        failed.push([clip.id,response.status,/^[a-z0-9_]+$/i.test(reason)?reason:'service_error']);
        if(response.status===401||['quota_exceeded','missing_permissions'].includes(reason))halt=true;
        continue;
      }
      const mp3=Buffer.from(await response.arrayBuffer());
      const proc=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-i','pipe:0','-af','highpass=f=72,loudnorm=I=-18:TP=-2:LRA=7',
        '-ac','1','-ar','24000','-c:a','libopus','-application','voip','-b:a','20k','-vbr','constrained','-f','ogg','pipe:1'],
        {input:mp3,windowsHide:true,maxBuffer:2_000_000});
      if(proc.status!==0){failed.push([clip.id,'encode_error']);continue;}
      const seconds=duration(proc.stdout);
      if(!(seconds>.1)){failed.push([clip.id,'invalid_duration']);continue;}
      await writeFile(fileURLToPath(output),proc.stdout);
      Object.assign(clip,{status:'ready',duration:seconds,bytes:proc.stdout.length});
      Object.assign(locale.lines[clip.id],{duration:seconds,audio:'voice/'+clip.id+'.ogg'});
      completed++;
      if(completed%10===0)console.log('Озвучено',completed,'из',manifest.clips.length);
    }catch(error){failed.push([clip.id,error.name]);}
  }
}
await Promise.all(Array.from({length:3},()=>work()));
await writeFile(manifestUrl,JSON.stringify(manifest,null,2)+'\n');
await writeFile(localeUrl,JSON.stringify(locale,null,2)+'\n');
console.log(JSON.stringify({completed,total:manifest.clips.length,bytes:manifest.clips.reduce((n,c)=>n+(c.bytes??0),0),failed}));
if(failed.length||completed!==manifest.clips.length)process.exitCode=1;
