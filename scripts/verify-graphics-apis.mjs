import {chromium} from 'playwright';
import assert from 'node:assert/strict';

const browser=await chromium.launch({headless:true,args:[
  '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
  '--enable-unsafe-swiftshader','--enable-unsafe-webgpu',
]});
try{
  for(const api of ['auto','webgl2','webgpu']){
    const ctx=await browser.newContext({viewport:{width:800,height:450}});
    await ctx.addInitScript(selected=>{
      localStorage.setItem('sector09-gfx-api',selected);
      localStorage.setItem('sector09-quality',selected==='webgpu'?'low':'high');
      localStorage.setItem('sector09-gfx-aa',selected==='webgpu'?'off':'auto');
      localStorage.setItem('sector09-gfx-fsr','on');
      localStorage.setItem('sector09-gfx-fsr-quality','quality');
    },api);
    const page=await ctx.newPage();
    const pageErrors=[];
    page.on('pageerror',error=>pageErrors.push(error.message));
    page.on('console',message=>{if(message.type()==='error')console.log('BROWSER',api,message.text().slice(0,600));});
    await page.goto('http://127.0.0.1:5173/?poolScreenshot&perf',{waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForFunction(()=>Boolean(window.__S09_POOL_REVIEW?.renderer?.renderer ||
      document.getElementById('solo-status')?.classList.contains('error')),null,{timeout:60000});
    const state=await page.evaluate(async()=>{
      const obj=window.__S09_POOL_REVIEW?.renderer;
      let adapter=null,adapterError=null;
      if(navigator.gpu)try{
        const a=await navigator.gpu.requestAdapter();
        adapter=a?{fallback:a.isFallbackAdapter??false,description:a.info?.description??null}:null;
      }catch(e){adapterError=String(e);}
      return {
        requested:localStorage.getItem('sector09-gfx-api'),
        api:obj?.api??null,backend:obj?.renderer?.backend?.constructor?.name??null,
        activeText:document.getElementById('gfx-api-active').textContent,
        status:document.getElementById('solo-status').textContent,
        adapter,adapterError,
        recovery:sessionStorage.getItem('sector09-webgpu-failed')
      };
    });
    console.log('API STARTUP',JSON.stringify(state));
    assert.equal(state.requested,api,'API preference was changed by renderer failure');
    assert.ok(state.api,'Game must create renderer or report explicit fallback');
    if(api!=='webgpu')assert.equal(state.api,'webgl2');
    if(api==='webgpu'){
      if(state.api==='webgl2')assert.ok(state.recovery,'WebGPU failure must be reported and recover');
      else assert.equal(state.backend,'WebGPUBackend','WebGL fallback is forbidden');
    }
    await page.locator('#open-solo').waitFor({state:'visible',timeout:60000});
    await page.locator('#open-solo').dispatchEvent('click');
    await page.locator('#map-select').selectOption('fy_pool_day');
    await page.locator('#population').selectOption('15');
    await page.locator('#solo').dispatchEvent('click');
    await page.waitForFunction(()=>!document.getElementById('hud').classList.contains('hidden'),null,{timeout:45000});
    await page.waitForFunction(()=>window.__S09_POOL_REVIEW?.renderer?.getStats()?.calls>=0,null,{timeout:30000});
    const stats=await page.evaluate(()=>window.__S09_POOL_REVIEW.renderer.getStats());
    console.log('RENDERED',api,JSON.stringify({
      api:stats.api,backend:stats.backend,calls:stats.calls,triangles:stats.triangles,
      fsr:stats.fsr,sceneWidth:stats.sceneWidth,sceneHeight:stats.sceneHeight
    }));
    if(api==='webgpu' && state.api==='webgpu'){
      assert.equal(stats.api,'webgpu','WebGPU must not silently switch back during gameplay');
      assert.equal(stats.backend,'WebGPU','Actual backend changed during gameplay');
    }
    assert.ok(Number.isFinite(stats.calls) && stats.calls>0,'draw calls unavailable');
    assert.ok(Number.isFinite(stats.triangles) && stats.triangles>0,'triangle count unavailable');
    // FXAA / FSR is selected after loading: scene target must remain finite.
    await page.waitForFunction(()=>window.__S09_POOL_REVIEW.renderer.getStats().fsr==='quality',null,{timeout:15000});
    const scaled=await page.evaluate(()=>window.__S09_POOL_REVIEW.renderer.getStats());
    assert.equal(scaled.fsr,'quality');
    assert.ok(scaled.fsrScale<1 && scaled.sceneWidth>0);
    assert.equal(pageErrors.length,0,pageErrors.join(' | '));
    await ctx.close();
  }
}finally{await browser.close();}
