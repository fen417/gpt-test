import {readFile,writeFile,rename} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const file=fileURLToPath(new URL('../src/assets/grip-overrides.json',import.meta.url));
const route='/__grip-editor/';
export function gripEditorPlugin(){
  let bakerPromise,queue=Promise.resolve(),lastKey='',lastResult;
  const baker=()=>bakerPromise??=import('./grip-baker.mjs');
  const profiles=async()=>JSON.parse(await readFile(file,'utf8'));
  const send=(res,status,data)=>{
    res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');
    res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(data));
  };
  async function body(req){
    let text='';for await(const chunk of req){text+=chunk;if(text.length>16000)throw Error('Request too large');}
    return JSON.parse(text);
  }
  async function handle(req,res,action){
    try{
      if(action==='profiles'&&req.method==='GET'){send(res,200,await profiles());return;}
      if(!['preview','save','reset'].includes(action)||req.method!=='POST'){send(res,404,{error:'Unknown editor endpoint'});return;}
      if(!String(req.headers['content-type']).startsWith('application/json')){send(res,415,{error:'JSON required'});return;}
      const {weapon,side,params}=await body(req),mod=await baker();
      if(!mod.weaponIds.includes(weapon)||!['left','right'].includes(side))throw Error('Unknown weapon/hand');
      if(action==='reset'){
        const current=await profiles();if(current[weapon]){delete current[weapon][side];if(!Object.keys(current[weapon]).length)delete current[weapon];}
        await writeFile(file+'.tmp',JSON.stringify(current,null,2)+'\n');await rename(file+'.tmp',file);
        send(res,200,{entry:null});return;
      }
      const normalized=mod.normalizeGrip(params),key=JSON.stringify([weapon,side,normalized]);
      const entry=key===lastKey?lastResult:await mod.bakeProfile(weapon,side,normalized);
      lastKey=key;lastResult=entry;
      if(action==='save'){
        const current=await profiles();
        (current[weapon]??={})[side]=entry;
        await writeFile(file+'.tmp',JSON.stringify(current,null,2)+'\n');await rename(file+'.tmp',file);
      }
      send(res,200,{entry});
    }catch(error){send(res,400,{error:error.message??String(error)});}
  }
  return {name:'sector09-grip-editor',apply:'serve',handleHotUpdate(ctx){if(ctx.file===file)return [];},configureServer(server){
    server.middlewares.use((req,res,next)=>{
      const path=(req.url??'').split('?')[0];if(!path.startsWith(route))return next();
      // Local developer tool only. Reject LAN and cross-origin write requests.
      const host=req.headers.host??'';
      if(!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host)||
        (req.headers.origin&&req.headers.origin!=='http://'+host&&req.headers.origin!=='https://'+host)){
        send(res,403,{error:'Local same-origin editor only'});return;
      }
      const action=path.slice(route.length);
      queue=queue.then(()=>handle(req,res,action),()=>handle(req,res,action));
    });
  }};
}
