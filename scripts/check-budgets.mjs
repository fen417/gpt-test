import { readFile,readdir,mkdir,writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { dirname } from 'node:path';
const manifest=JSON.parse(await readFile('dist/.vite/manifest.json','utf8')),seen=new Set();
function visit(key){if(seen.has(key))return;const chunk=manifest[key];if(!chunk)throw Error('Missing manifest entry '+key);seen.add(key);for(const dep of chunk.imports??[])visit(dep);}
visit('index.html');const initial=[];
for(const key of seen){const file=manifest[key].file;if(!file.endsWith('.js'))continue;const bytes=await readFile('dist/'+file);initial.push({file,bytes:bytes.length,gzipBytes:gzipSync(bytes).length});}
async function files(dir){const result=[];for(const entry of await readdir(dir,{withFileTypes:true})){const path=dir+'/'+entry.name;if(entry.isDirectory())result.push(...await files(path));else result.push(path);}return result;}
const runtimeFiles=await files('dist');
if(!runtimeFiles.some(file=>/\/solo-worker-[^/]+\.js$/.test(file)))throw Error('Solo worker must be bundled with its shared imports');
const audio=[],campaignAudio=[];for(const file of runtimeFiles)if(/\.(ogg|opus|m4a|mp3|wav)$/.test(file)){
  const item={file,bytes:(await readFile(file)).length};
  if(file.startsWith('dist/campaign/'))campaignAudio.push(item);else audio.push(item);
}
const campaignMissions=[...new Set(campaignAudio.map(item=>item.file.split('/')[2]))].map(id=>{
  const items=campaignAudio.filter(item=>item.file.startsWith(`dist/campaign/${id}/`));
  const musicBytes=items.filter(item=>item.file.includes('/music/')).reduce((n,item)=>n+item.bytes,0),voiceBytes=items.filter(item=>item.file.includes('/voice/')).reduce((n,item)=>n+item.bytes,0);
  const otherBytes=items.filter(item=>!item.file.includes('/music/')&&!item.file.includes('/voice/')).reduce((n,item)=>n+item.bytes,0);
  return {id,musicBytes,voiceBytes,otherBytes,budgets:{musicBytes:3000000,voiceBytes:1000000},pass:musicBytes<=3000000&&voiceBytes<=1000000&&otherBytes===0};
});
const report={schema:2,createdAt:new Date().toISOString(),initialJsGzipBytes:initial.reduce((n,item)=>n+item.gzipBytes,0),audioBytes:audio.reduce((n,item)=>n+item.bytes,0),budgets:{initialJsGzipBytes:700000,audioBytes:2550000},initial,audio,campaignMissions,campaignAudio,pass:true};
report.pass=report.initialJsGzipBytes<=report.budgets.initialJsGzipBytes&&report.audioBytes<=report.budgets.audioBytes&&campaignMissions.every(m=>m.pass);
const i=process.argv.indexOf('--output'),output=i<0?'.perf-local/build-budget.json':process.argv[i+1];await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');
console.log(`Initial JS: ${report.initialJsGzipBytes} / 700000 gzip bytes; audio (all runtime formats): ${report.audioBytes} / ${report.budgets.audioBytes} bytes`);
for(const m of campaignMissions)console.log(`Campaign ${m.id}: music ${m.musicBytes}/3000000; voice ${m.voiceBytes}/1000000 bytes`);
if(!report.pass){console.error('Runtime asset budget exceeded');process.exitCode=1;}
