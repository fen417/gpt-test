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
const audio=[];for(const file of runtimeFiles)if(/\.(ogg|m4a|mp3|wav)$/.test(file))audio.push({file,bytes:(await readFile(file)).length});
const report={schema:1,createdAt:new Date().toISOString(),initialJsGzipBytes:initial.reduce((n,item)=>n+item.gzipBytes,0),audioBytes:audio.reduce((n,item)=>n+item.bytes,0),budgets:{initialJsGzipBytes:700000,audioBytes:2500000},initial,audio,pass:true};
report.pass=report.initialJsGzipBytes<=report.budgets.initialJsGzipBytes&&report.audioBytes<=report.budgets.audioBytes;
const i=process.argv.indexOf('--output'),output=i<0?'.perf-local/build-budget.json':process.argv[i+1];await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');
console.log(`Initial JS: ${report.initialJsGzipBytes} / 700000 gzip bytes; audio (all runtime formats): ${report.audioBytes} / 2500000 bytes`);
if(!report.pass){console.error('Runtime asset budget exceeded');process.exitCode=1;}
