import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const {chromium}=await import(process.env.S09_PLAYWRIGHT?pathToFileURL(process.env.S09_PLAYWRIGHT).href:'playwright');
const [label='after-ultra',preset='ultra',api='webgl2']=process.argv.slice(2);
const output=process.env.S09_OUTPUT??'.perf-local/graphics-remaster';
const server=process.env.S09_URL??'http://127.0.0.1:5173/';
const custom=process.env.S09_CUSTOM??'null';
const poses=[
  {mapId:'village',eye:[22,4,-34],target:[-12,-2,-15],fov:70},
  {mapId:'quarry',eye:[-22,15,42],target:[-65,-5,-38],fov:72},
  {mapId:'port',eye:[-144,7,31],target:[-110,5,74],fov:71},
  {mapId:'fy_pool_day',eye:[7.15,2.16,16.5],target:[-2.7,1.28,-5.5],fov:66},
];
await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome', headless:true,args:[
  '--enable-gpu','--disable-background-timer-throttling',
  ...(process.env.S09_UNCAPPED?['--disable-frame-rate-limit','--disable-gpu-vsync']:[]),
]});
const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('console',message=>{
  if(message.type()==='error'&&!message.text().startsWith('WebSocket connection'))errors.push(message.text());
});
try{
  await page.addInitScript(({preset,api,custom})=>{
    for(const [key,value] of Object.entries({
      quality:preset,'gfx-api':api,'gfx-custom':custom,'gfx-resolution':'1','gfx-aa':'on',
      'gfx-fsr':'off','gfx-frame-generation':'off',
    }))localStorage.setItem('sector09-'+key,value);
  },{preset,api,custom});
  const url=new URL(server);
  url.searchParams.set('poolScreenshot','');
  url.searchParams.set('perf','');
  await page.goto(url.href,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__S09_POOL_REVIEW?.renderer?.quality,null,{timeout:90000});
  const environment=await page.evaluate(()=>{
    const r=window.__S09_POOL_REVIEW.renderer;
    const gl=r.api==='webgl2'?r.renderer.getContext():null;
    const debug=gl?.getExtension('WEBGL_debug_renderer_info');
    return {api:r.api, gpu:r.gpuName??gl?.getParameter(debug?.UNMASKED_RENDERER_WEBGL??gl.RENDERER),
      selection:document.getElementById('quality').value,agent:navigator.userAgent,screen:{width:innerWidth,height:innerHeight}};
  });
  assert.equal(environment.api,api);
  assert.equal(environment.selection,custom==='null'?preset:'custom');
  assert.doesNotMatch(environment.gpu??'',/SwiftShader|llvmpipe|software/i);
  const measurements=[];
  for(const pose of poses){
    if(process.env.S09_MAP&&pose.mapId!==process.env.S09_MAP)continue;
    const {data,...report}=await page.evaluate(async({pose,preset,custom})=>{
      const r=window.__S09_POOL_REVIEW.renderer;
      const render=r.render;
      // Freeze the shipping animation loop before preloading a different map.
      r.render=()=>{};
      const start=new AbortController();
      const gfx={shadows:'auto',resolution:'1',detail:'auto',fsr:'off',frameGeneration:'off'};
      if(custom!=='null')gfx.customGraphics=r.graphicsEffects;
      const view={mapId:pose.mapId,quality:preset,gfx,paused:true};
      const tick=()=>new Promise(resolve=>requestAnimationFrame(resolve));
      try{
        await r.prepareMatchMap(pose.mapId,view,start.signal);
        r.clock=11;
        render.call(r,null,null,1/60,view);
        if(r.map.id!==pose.mapId)throw Error('Loaded the wrong map: '+r.map.id);
        const c=r.camera;
        c.position.fromArray(pose.eye);c.lookAt(...pose.target);
        c.fov=pose.fov;c.near=.12;c.updateProjectionMatrix();
        r.atmosphere.sky.position.copy(c.position);r.updateSunShadow(c.position.x,c.position.z);
        // Warm new materials, shadow maps and passes before sampling.
        for(let i=0;i<85;i++){await tick();r.drawScene(false);}
        r.gpuTimer.samples.reset();
        const frames=[], cpu=[];
        let previous=await tick();
        for(let i=0;i<120;i++){
          const now=await tick();frames.push(now-previous);previous=now;
          const start=performance.now();r.drawScene(false);cpu.push(performance.now()-start);
        }
        const stats=r.getStats();
        r.drawScene(false);
        const data=r.canvas.toDataURL('image/png').split(',')[1];
        frames.sort((a,b)=>a-b);cpu.sort((a,b)=>a-b);
        const p=(a,v)=>a[Math.ceil(a.length*v)-1];
        const slow=frames.slice(-Math.ceil(frames.length*.01));
        return {data,pose,stats,cpuP95:p(cpu,.95),frameP95:p(frames,.95),frameP99:p(frames,.99),
          onePercentLow:1000*slow.length/slow.reduce((a,b)=>a+b,0),
          fps:1000*frames.length/frames.reduce((a,b)=>a+b,0)};
      }finally{r.render=render;}
    },{pose,preset,custom});
    assert.equal(report.stats.sceneWidth,1920);
    assert.equal(report.stats.sceneHeight,1080);
    assert.ok(report.stats.calls>1);
    await writeFile(output+'/'+label+'-'+pose.mapId+'.png',Buffer.from(data,'base64'));
    measurements.push(report);
    console.log(pose.mapId,report.fps.toFixed(1)+' FPS',report.stats.gpuMs?.p95??null,'GPU p95 ms',report.stats.calls,'draw calls');
  }
  await writeFile(output+'/'+label+'.json',JSON.stringify({environment,measurements,errors},null,2));
  assert.deepEqual(errors,[]);
}finally{
  await browser.close();
}
