
import {readFile,writeFile,mkdir,rename,realpath,stat} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {join,relative,isAbsolute,sep} from 'node:path';
import {validateGameplay} from '../shared/editor-gameplay.js';
import {validEditorMapId,validEditorMapConfig} from '../shared/editor-map-config.js';
import {emptyM05Edits,validateM05Edits,modelAssetOk} from '../shared/campaign/m05-editor.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const file=join(root,'shared/campaign/m05-editor-data.json'),assets=join(root,'public/world-editor-assets'),backups=join(root,'.perf-local/world-editor-backups');
const registry=join(root,'shared/editor-maps.json'),dressingSource=join(root,'public/campaign/m05/dressing-source.glb');
const hasDressingSource=()=>stat(dressingSource).then(s=>s.isFile(),()=>false);
const hash=b=>createHash('sha256').update(b).digest('hex');
const reply=(res,status,data)=>{res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(data));};
async function body(req,max){const parts=[];let n=0;for await(const p of req){n+=p.length;if(n>max)throw Error('Слишком большой файл');parts.push(p);}return Buffer.concat(parts);}
async function safeDir(path){await mkdir(path,{recursive:true});const actual=await realpath(path),base=await realpath(root);const rel=relative(base,actual);if(!rel||rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel))throw Error('Папка вне проекта');}
function validateGlb(b){
  if(b.length<20||b.readUInt32LE(0)!==0x46546c67||b.readUInt32LE(4)!==2||b.readUInt32LE(8)!==b.length||b.readUInt32LE(16)!==0x4e4f534a)throw Error('Требуется корректный GLB 2.0');
  const len=b.readUInt32LE(12);if(len> b.length-20)throw Error('Повреждён GLB');
  const g=JSON.parse(b.subarray(20,20+len).toString('utf8'));
  for(const a of [...(g.buffers??[]),...(g.images??[])])if(a.uri&&!a.uri.startsWith('data:'))throw Error('GLB содержит внешние файлы; упакуйте текстуры');
}
async function storeAsset(b){
  validateGlb(b);await safeDir(assets);const name=hash(b)+'.glb',dest=join(assets,name);
  try{await writeFile(dest,b,{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;if(hash(await readFile(dest))!==hash(b))throw Error('Конфликт ресурса');}
  return {asset:name,bytes:b.length};
}
async function atomic(target,output,current){
  await safeDir(backups);await writeFile(join(backups,Date.now()+'-'+randomUUID()+'.json'),current,{flag:'wx'});
  const next=Buffer.from(JSON.stringify(output,null,2)+'\n'),tmp=target+'.'+randomUUID()+'.tmp';
  await writeFile(tmp,next,{flag:'wx'});await rename(tmp,target);return hash(next);
}
export function worldEditorPlugin(){
  let queue=Promise.resolve();
  async function handle(req,res,action){
    try{
      if(action==='maps'&&req.method==='GET'){const r=JSON.parse(await readFile(registry,'utf8'));return reply(res,200,{maps:[{id:'quarry-m05',name:'M05 Карьер'},...Object.entries(r.maps).map(([id,e])=>({id,...e.config}))]});}
      if(action==='create'&&req.method==='POST'){
        if(!String(req.headers['content-type']).startsWith('application/json'))throw Error('Требуется JSON');
        const config=JSON.parse((await body(req,16000)).toString('utf8'));
        if(!validEditorMapConfig(config))throw Error('Название и размер (128–1024 м, кратно 32)');
        const current=await readFile(registry),r=JSON.parse(current);if(Object.keys(r.maps).length>=32)throw Error('Максимум 32 карты');
        const id='editor-'+randomUUID().replaceAll('-','').slice(0,16);r.maps[id]={config,data:emptyM05Edits()};
        await atomic(registry,r,current);return reply(res,200,{id});
      }
      const mapId=action.startsWith('map/')?action.slice(4):action==='map'?'quarry-m05':null;
      if(mapId&&mapId!=='quarry-m05'&&!validEditorMapId(mapId))throw Error('Неизвестная карта');
      if(mapId&&req.method==='GET'){
        const b=await readFile(mapId==='quarry-m05'?file:registry),r=JSON.parse(b);
        if(mapId==='quarry-m05')return reply(res,200,{data:r,revision:hash(b),sourceAvailable:await hasDressingSource()});
        if(!Object.hasOwn(r.maps,mapId))throw Error('Неизвестная карта');
        return reply(res,200,{...r.maps[mapId],revision:hash(b)});
      }
      if(action==='asset'&&req.method==='POST'){
        if(req.headers['content-type']!=='application/octet-stream')throw Error('Неверный тип файла');
        const b=await body(req,64*1024*1024);return reply(res,200,await storeAsset(b));
      }
      if(action==='optimize'&&req.method==='POST'){
        if(!String(req.headers['content-type']).startsWith('application/json'))throw Error('Требуется JSON');
        const {asset}=JSON.parse((await body(req,4096)).toString('utf8'));
        if(!modelAssetOk(asset))throw Error('Неверный ресурс');
        const input=await readFile(join(assets,asset));if(input.length>64*1024*1024)throw Error('Ресурс слишком большой');
        const {optimizeEditorAsset}=await import('./world-editor-optimize.mjs');
        const out=await optimizeEditorAsset(input);
        if(out.length>=input.length)return reply(res,200,{asset,bytes:input.length,originalBytes:input.length,optimized:false});
        return reply(res,200,{...await storeAsset(out),originalBytes:input.length,optimized:true});
      }
      if(mapId&&req.method==='POST'){
        if(!String(req.headers['content-type']).startsWith('application/json'))throw Error('Требуется JSON');
        const {data,revision}=JSON.parse((await body(req,16*1024*1024)).toString('utf8'));
        if(Object.keys(data?.dressingProps??{}).length&&(mapId!=='quarry-m05'||!await hasDressingSource()))throw Error('Требуется экспорт исходных декораций M05');
        const errors=validateM05Edits(data);if(errors.length)throw Error(errors.slice(0,10).join('; '));
        for(const asset of new Set([...data.models.map(m=>m.asset),...Object.keys(data.assets??{})]))if(!(await stat(join(assets,asset))).isFile())throw Error('Нет ресурса '+asset);
        const target=mapId==='quarry-m05'?file:registry,current=await readFile(target);if(hash(current)!==revision)return reply(res,409,{error:'Файл изменён извне. Скачайте черновик и заново откройте карту.'});
        let output=data;
        if(mapId!=='quarry-m05'){output=JSON.parse(current);if(!Object.hasOwn(output.maps,mapId))throw Error('Неизвестная карта');const errors=validateGameplay(data.gameplay,output.maps[mapId].config.size);if(errors.length)throw Error(errors.join('; '));output.maps[mapId].data=data;}
        return reply(res,200,{revision:await atomic(target,output,current)});
      }
      reply(res,404,{error:'Неизвестная операция'});
    }catch(e){reply(res,400,{error:e.message??String(e)});}
  }
  return {name:'sector09-world-editor',apply:'serve',handleHotUpdate(ctx){if(ctx.file===file||ctx.file===registry)return [];},configureServer(server){
    server.middlewares.use((req,res,next)=>{
      const path=(req.url??'').split('?')[0],prefix='/__world-editor/';
      // Vite's public file index is not guaranteed to notice a newly created
      // file immediately. Serve content-addressed uploads directly in dev.
      const assetPrefix='/world-editor-assets/';
      if(path.startsWith(assetPrefix)){
        const asset=path.slice(assetPrefix.length);
        if(!modelAssetOk(asset)||!['GET','HEAD'].includes(req.method))return reply(res,404,{error:'Неизвестный ресурс'});
        readFile(join(assets,asset)).then(b=>{res.statusCode=200;res.setHeader('Content-Type','model/gltf-binary');res.setHeader('Content-Length',b.length);res.setHeader('Cache-Control','public, max-age=31536000, immutable');res.end(req.method==='HEAD'?undefined:b);},()=>reply(res,404,{error:'Ресурс не найден'}));return;
      }
      if(!path.startsWith(prefix))return next();
      const host=req.headers.host??'',origin=req.headers.origin;
      if(!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host)||(origin&&origin!=='http://'+host&&origin!=='https://'+host)||req.method==='POST'&&!origin)return reply(res,403,{error:'Только локальный редактор'});
      queue=queue.then(()=>handle(req,res,path.slice(prefix.length)),()=>handle(req,res,path.slice(prefix.length)));
    });
  }};
}
