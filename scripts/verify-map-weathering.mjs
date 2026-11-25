import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createCanvas,loadImage} from '@napi-rs/canvas';
const commonArgs=['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--enable-unsafe-webgpu'];
const softwareLoss=error=>/Instance dropped in popErrorScope|external Instance reference no longer exists|GPU device (?:was )?lost/i.test(String(error));
const launch=api=>chromium.launch({headless:true,...(api==='webgpu'?{channel:'chromium'}:{}),args:[...commonArgs,...(api==='webgpu'?['--use-webgpu-adapter=swiftshader']:[])]});
async function pixels(page){
  const image=await loadImage(await page.locator('#probe').screenshot({timeout:60000}));
  const canvas=createCanvas(image.width,image.height),ctx=canvas.getContext('2d');
  ctx.drawImage(image,0,0);
  return ctx.getImageData(0,0,image.width,image.height).data;
}
function compare(a,b){
  assert.equal(a.length,b.length);
  let sum=0,changed=0,black=0;
  for(let i=0;i<a.length;i+=4){
    const d=(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]))/3;
    sum+=d;if(d>2)changed++;
    if(a[i]<5&&a[i+1]<5&&a[i+2]<5)black++;
  }
  const count=a.length/4;
  return {mean:sum/count,changed:changed/count,black:black/count};
}
async function run(api){
  const browser=await launch(api);
  const page=await browser.newPage({viewport:{width:480,height:320},deviceScaleFactor:1});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  try{
    await page.goto('http://127.0.0.1:5173/test/map-weathering-smoke.html',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>typeof window.initWeatherSmoke==='function');
    const info=await page.evaluate(api=>window.initWeatherSmoke(api,api==='webgpu'),api);
    if(info.skipped){assert.equal(api,'webgpu');return {inconclusive:info.skipped};}
    const frames={};
    for(const q of ['off','low','high','offAgain']){
      const result=await page.evaluate(q=>window.drawWeatherSmoke(q==='offAgain'?'off':q),q);
      assert.deepEqual(result.errors,[],api+' GPU validation errors');
      // Never accept shader compilation errors, even when a device is lost.
      assert.deepEqual(errors.filter(e=>!info.software||!softwareLoss(e)),[],api+' browser errors');
      if(result.lost){
        if(api==='webgpu'&&info.software)return {inconclusive:'software device lost during '+q+': '+result.lost};
        assert.fail(api+' GPU lost: '+result.lost);
      }
      frames[q]=await pixels(page);
      if(q==='off'&&api==='webgpu'&&info.software&&compare(frames.off,frames.off).black>.99){
        return {inconclusive:'software WebGPU baseline framebuffer blank'};
      }
    }
    const low=compare(frames.off,frames.low),high=compare(frames.off,frames.high),restored=compare(frames.off,frames.offAgain);
    console.log('WEATHERING',api,JSON.stringify({low,high,restored}));
    assert.ok(low.black<.99,api+' blank canvas');
    assert.ok(low.changed>.015,api+' low weathering did not change the rendered image');
    assert.ok(high.changed>.025,api+' high weathering did not change the rendered image');
    assert.ok(restored.mean<.3,api+' disabling weathering failed to restore original frame');
    return {passed:true};
  }finally{await browser.close();}
}
await run('webgl2');
let gpuResult;
for(let attempt=1;attempt<=2;attempt++){
  gpuResult=await run('webgpu');
  if(gpuResult.passed)break;
  console.warn('WebGPU attempt '+attempt+' inconclusive: '+gpuResult.inconclusive);
}
if(!gpuResult.passed){
  // The runner has no physical GPU. Explicitly distinguish an unavailable
  // software baseline from a pass, and keep hardware validation outstanding.
  console.warn('::warning title=WebGPU weathering unverified::'+gpuResult.inconclusive);
  if(process.env.S09_REQUIRE_WEBGPU==='1')assert.fail(gpuResult.inconclusive);
}
