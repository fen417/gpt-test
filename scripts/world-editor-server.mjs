
import {readFile,writeFile,mkdir,rename,realpath,stat} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {validateM05Edits} from '../shared/campaign/m05-editor.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const file=join(root,'shared/campaign/m05-editor-data.json'),assets=join(root,'public/world-editor-assets'),backups=join(root,'.perf-local/world-editor-backups');
const hash=b=>createHash('sha256').update(b).digest('hex');
const reply=(res,status,data)=>{res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(data));};
async function body(req,max){const parts=[];let n=0;for await(const p of req){n+=p.length;if(n>max)throw Error('Слишком большой файл');parts.push(p);}return Buffer.concat(parts);}
async function safeDir(path){await mkdir(path,{recursive:true});const actual=await realpath(path),base=await realpath(root);if(!actual.startsWith(base+(/\\/.test(base)?'\\':'/')))throw Error('Папка вне проекта');}
function validateGlb(b){
  if(b.length<20||b.readUInt32LE(0)!==0x46546c67||b.readUInt32LE(4)!==2||b.readUInt32LE(8)!==b.length||b.readUInt32LE(16)!==0x4e4f534a)throw Error('Требуется корректный GLB 2.0');
  const len=b.readUInt32LE(12);if(len> b.length-20)throw Error('Повреждён GLB');
  const g=JSON.parse(b.subarray(20,20+len).toString('utf8'));
  for(const a of [...(g.buffers??[]),...(g.images??[])])if(a.uri&&!a.uri.startsWith('data:'))throw Error('GLB содержит внешние файлы; упакуйте текстуры');
}
export function worldEditorPlugin(){
  let queue=Promise.resolve();
  async function handle(req,res,action){
    try{
      if(action==='map'&&req.method==='GET'){const b=await readFile(file);return reply(res,200,{data:JSON.parse(b),revision:hash(b)});}
      if(action==='asset'&&req.method==='POST'){
        if(req.headers['content-type']!=='application/octet-stream')throw Error('Неверный тип файла');
        const b=await body(req,64*1024*1024);validateGlb(b);
        await safeDir(assets);const name=hash(b)+'.glb',dest=join(assets,name);
        try{await writeFile(dest,b,{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;if(hash(await readFile(dest))!==hash(b))throw Error('Конфликт ресурса');}
        return reply(res,200,{asset:name,bytes:b.length});
      }
      if(action==='map'&&req.method==='POST'){
        if(!String(req.headers['content-type']).startsWith('application/json'))throw Error('Требуется JSON');
        const {data,revision}=JSON.parse((await body(req,16*1024*1024)).toString('utf8'));
        const errors=validateM05Edits(data);if(errors.length)throw Error(errors.slice(0,10).join('; '));
        for(const m of data.models)if(!(await stat(join(assets,m.asset))).isFile())throw Error('Нет ресурса '+m.asset);
        const current=await readFile(file);if(hash(current)!==revision)return reply(res,409,{error:'Файл изменён извне. Скачайте черновик и заново откройте карту.'});
        await safeDir(backups);await writeFile(join(backups,Date.now()+'-'+randomUUID()+'.json'),current,{flag:'wx'});
        const next=Buffer.from(JSON.stringify(data,null,2)+'\n'),tmp=file+'.'+randomUUID()+'.tmp';
        await writeFile(tmp,next,{flag:'wx'});await rename(tmp,file);
        return reply(res,200,{revision:hash(next)});
      }
      reply(res,404,{error:'Неизвестная операция'});
    }catch(e){reply(res,400,{error:e.message??String(e)});}
  }
  return {name:'sector09-world-editor',apply:'serve',handleHotUpdate(ctx){if(ctx.file===file)return [];},configureServer(server){
    server.middlewares.use((req,res,next)=>{
      const path=(req.url??'').split('?')[0],prefix='/__world-editor/';if(!path.startsWith(prefix))return next();
      const host=req.headers.host??'',origin=req.headers.origin;
      if(!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host)||(origin&&origin!=='http://'+host&&origin!=='https://'+host)||req.method==='POST'&&!origin)return reply(res,403,{error:'Только локальный редактор'});
      queue=queue.then(()=>handle(req,res,path.slice(prefix.length)),()=>handle(req,res,path.slice(prefix.length)));
    });
  }};
}
