import { chromium } from 'playwright';
import assert from 'node:assert/strict';

// Software WebGPU is allowed *only* inside this isolated shader smoke test.
// The shipped game still rejects software/fallback WebGPU adapters.
const browser=await chromium.launch({headless:true,args:[
  '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
  '--enable-unsafe-swiftshader','--enable-unsafe-webgpu',
]});
try{
  const page=await browser.newPage({viewport:{width:640,height:360}});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.stack||error.message));
  page.on('crash',()=>errors.push('Chromium page crashed'));
  page.on('framenavigated',frame=>{if(frame===page.mainFrame())console.log('FG NAV',frame.url());});
  // GPU validation errors are asynchronous console messages, not JS exceptions.
  // The old smoke test silently passed with invalid targets[1] pipelines.
  page.on('console',message=>{
    if(message.type()!=='error')return;
    const line=message.text();
    if(/Color target has no corresponding|Invalid RenderPipeline|targets\[1\]|CreateRenderPipeline|GPUValidationError|fragment stage output|writeBuffer|reading 'set'|Invalid CommandBuffer/i.test(line))
      errors.push('WebGPU validation: '+line);
  });
  await page.goto('http://127.0.0.1:5173/test/fg-smoke.html',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>typeof window.runFrameGenerationSmoke==='function');
  let result;
  try{result=await page.evaluate(()=>window.runFrameGenerationSmoke());}
  catch(error){
    if(!String(error).includes('Execution context was destroyed'))throw error;
    // Vite can trigger a late development-page reload after module transform.
    // Retry only this navigation race; validation/pipeline errors must fail.
    console.warn('FG smoke navigation race: retrying once');
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(()=>typeof window.runFrameGenerationSmoke==='function');
    result=await page.evaluate(()=>window.runFrameGenerationSmoke());
  }
  console.log('FG WEBGPU SMOKE',JSON.stringify(result));
  if(result.skipped)console.log('No usable software WebGPU adapter in CI: shader execution not tested.');
  else {
    assert.equal(result.ok,true);
    assert.equal(result.backend,'WebGPUBackend');
    assert.equal(result.mrt,1); // no velocity MRT on the world pass
    assert.equal(result.generated,1);
    assert.equal(result.renderScale,.85);
    assert.equal(result.customFragmentPreserved,true);
  }
  assert.deepEqual(errors,[]);
}finally{await browser.close();}
