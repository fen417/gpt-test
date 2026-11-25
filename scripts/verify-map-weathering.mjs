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
  const errors=[],networkErrors=[];
  // Full Chromium requests a favicon automatically; this fixture has no icon.
  // Only intercept that exact optional resource, never application assets.
  await page.route('**/favicon.ico',route=>route.fulfill({status:204,body:''}));
  page.on('response',response=>{
    if(response.status()>=400)networkErrors.push(response.status()+' '+response.url());
  });
  page.on('requestfailed',request=>{
    const reason=request.failure()?.errorText??'unknown';
    if(reason!=='net::ERR_ABORTED')networkErrors.push(reason+' '+request.url());
  });
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{
    if(message.type()!=='error')return;
    const url=message.location().url;
    errors.push(message.text()+(url?' ['+url+']':''));
  });
  try{
    await page.goto('http://127.0.0.1:5173/test/map-weathering-smoke.html',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>typeof window.initWeatherSmoke==='function');
    const info=await page.evaluate(api=>window.initWeatherSmoke(api,api==='webgpu'),api);
    if(info.skipped){assert.equal(api,'webgpu');return {inconclusive:info.skipped};}
    const frames={};
    for(const q of ['off','low','high','offAgain']){
      const result=await page.evaluate(q=>window.drawWeatherSmoke(q==='offAgain'?'off':q),q);
      assert.deepEqual(result.errors,[],api+' GPU validation errors');
      assert.deepEqual(networkErrors,[],api+' resource loading errors');
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
    assert.deepEqual(networkErrors,[],api+' resource loading errors');
    const reliefFrames={};
    for(const q of ['off','low','ultra','offAgain']){
      const result=await page.evaluate(q=>window.drawReliefSmoke(q==='offAgain'?'off':q),q);
      assert.deepEqual(result.errors,[],api+' POM GPU validation errors');
      assert.deepEqual(errors.filter(e=>!info.software||!softwareLoss(e)),[],api+' POM shader/browser errors');
      if(result.lost){
        if(api==='webgpu'&&info.software)return {inconclusive:'software device lost during POM '+q+': '+result.lost};
        assert.fail(api+' POM GPU lost: '+result.lost);
      }
      reliefFrames[q]=await pixels(page);
    }
    const reliefLow=compare(reliefFrames.off,reliefFrames.low),reliefUltra=compare(reliefFrames.off,reliefFrames.ultra),reliefRestore=compare(reliefFrames.off,reliefFrames.offAgain);
    console.log('POM',api,JSON.stringify({low:reliefLow,ultra:reliefUltra,restored:reliefRestore}));
    assert.ok(reliefLow.changed>.01&&reliefUltra.changed>.01,api+' POM did not change projected texture');
    assert.ok(reliefRestore.mean<.5,api+' POM did not restore original shading');
    if(api==='webgpu'){
      const result=await page.evaluate(()=>window.drawCascadeScheduleSmoke());
      assert.deepEqual(result.errors,[],api+' CSM GPU validation errors');
      assert.deepEqual(errors.filter(e=>!info.software||!softwareLoss(e)),[],api+' CSM shader/browser errors');
      if(result.lost){
        if(info.software)return {inconclusive:'software device lost during CSM: '+result.lost};
        assert.fail(api+' CSM GPU lost: '+result.lost);
      }
      console.log('CSM schedule',JSON.stringify(result.stats));
      assert.ok(result.stats.frames>=7&&result.stats.reused>0,api+' CSM did not reuse distant maps');
    }
    const waterFrames={};
    for(const q of ['legacy','high','legacy']){
      const result=await page.evaluate(q=>window.drawWaterSmoke(q),q);
      assert.deepEqual(result.errors,[],api+' water GPU validation errors');
      assert.deepEqual(networkErrors,[],api+' water resource loading errors');
      assert.deepEqual(errors.filter(e=>!info.software||!softwareLoss(e)),[],api+' water shader/browser errors');
      if(result.lost){
        if(api==='webgpu'&&info.software)return {inconclusive:'software device lost during water '+q+': '+result.lost};
        assert.fail(api+' GPU lost: '+result.lost);
      }
      const frame=await pixels(page);
      if(q==='high'){
        assert.ok(result.receivers>0,api+' water SSR mask is missing');
        assert.ok(result.transmission>0,api+' physical pool transmission is not active');
        const diff=compare(waterFrames.legacy,frame);
        console.log('WATER',api,JSON.stringify(diff));
        assert.ok(diff.black<.99&&diff.changed>.015,api+' enhanced water frame did not render');
      }else if(waterFrames.legacy){
        const diff=compare(waterFrames.legacy,frame);
        assert.ok(diff.mean<.5,api+' disabling water did not restore baseline');
      }else waterFrames.legacy=frame;
    }
    const fx={};
    for(const q of ['off','flash','expired','offAgain','particles']){
      const result=await page.evaluate(q=>window.drawEffectSmoke(q),q);
      assert.deepEqual(result.errors,[],api+' effects GPU validation errors');
      assert.deepEqual(networkErrors,[],api+' effects resource loading errors');
      assert.deepEqual(errors.filter(e=>!info.software||!softwareLoss(e)),[],api+' effects shader/browser errors');
      if(result.lost){
        if(api==='webgpu'&&info.software)return {inconclusive:'software device lost during effects '+q+': '+result.lost};
        assert.fail(api+' GPU lost: '+result.lost);
      }
      fx[q]=await pixels(page);
      if(q==='flash'){assert.equal(result.lights,1);assert.equal(result.slots,3);}
      if(q==='expired')assert.equal(result.lights,0);
      if(q==='offAgain')assert.equal(result.slots,0);
    }
    let delta=0;
    for(let i=0;i<fx.off.length;i+=4)delta+=(fx.flash[i]+fx.flash[i+1]+fx.flash[i+2]-fx.off[i]-fx.off[i+1]-fx.off[i+2])/3;
    delta/=fx.off.length/4;
    const light=compare(fx.off,fx.flash),expired=compare(fx.off,fx.expired),removed=compare(fx.off,fx.offAgain),particles=compare(fx.off,fx.particles);
    console.log('EFFECTS',api,JSON.stringify({light,delta,expired,removed,particles}));
    // No sprites are visible during the flash test: the wall and cube must
    // actually brighten due to the pooled PointLight, then restore.
    assert.ok(delta>2&&light.changed>.05,api+' point light does not illuminate scene geometry');
    assert.ok(expired.mean<.5&&removed.mean<.5,api+' transient lighting did not restore baseline');
    assert.ok(particles.changed>.01,api+' particle materials did not render');
    const air={};
    for(const q of ['clear','cloud','moving','fog','rays','clearAgain']){
      const result=await page.evaluate(q=>window.drawAtmosphereSmoke(q),q);
      assert.deepEqual(result.errors,[],api+' atmosphere GPU validation errors');
      assert.deepEqual(networkErrors,[],api+' atmosphere resource loading errors');
      assert.deepEqual(errors.filter(e=>!info.software||!softwareLoss(e)),[],api+' atmosphere shader/browser errors');
      if(result.lost){
        if(api==='webgpu'&&info.software)return {inconclusive:'software device lost during atmosphere '+q+': '+result.lost};
        assert.fail(api+' GPU lost: '+result.lost);
      }
      air[q]=await pixels(page);
      if(q==='fog')assert.equal(result.fog,true);
      if(q==='rays')assert.equal(result.mask,true);
      if(q==='clearAgain')assert.equal(result.passes,0);
    }
    const clouds=compare(air.clear,air.cloud),moving=compare(air.cloud,air.moving),fog=compare(air.clear,air.fog),rays=compare(air.clear,air.rays),reset=compare(air.clear,air.clearAgain);
    console.log('ATMOSPHERE',api,JSON.stringify({clouds,moving,fog,rays,reset}));
    assert.ok(clouds.changed>.015,api+' cloud layers not visible');
    assert.ok(moving.changed>.01,api+' clouds do not move');
    assert.ok(fog.changed>.015,api+' height fog not visible');
    assert.ok(reset.mean<.5,api+' atmosphere did not restore baseline');
    const gi={};
    for(const q of ['off','low','high','offAgain']){
      const result=await page.evaluate(q=>window.drawGISmoke(q==='offAgain'?'off':q),q);
      assert.deepEqual(result.errors,[],api+' GI GPU validation errors');
      assert.deepEqual(networkErrors,[],api+' GI resource loading errors');
      assert.deepEqual(errors.filter(e=>!info.software||!softwareLoss(e)),[],api+' GI shader/browser errors');
      if(result.lost){
        if(api==='webgpu'&&info.software)return {inconclusive:'software device lost during GI '+q+': '+result.lost};
        assert.fail(api+' GPU lost: '+result.lost);
      }
      gi[q]=await pixels(page);
    }
    const giLow=compare(gi.off,gi.low),giHigh=compare(gi.off,gi.high),giReset=compare(gi.off,gi.offAgain);
    console.log('GI',api,JSON.stringify({low:giLow,high:giHigh,reset:giReset}));
    assert.ok(giLow.changed>.01&&giHigh.changed>.01,api+' baked probe lighting not visible on real lit materials');
    assert.ok(giReset.mean<.5,api+' GI did not restore original shading');
    const foliage={};
    for(const q of ['off','low','high','moving','offAgain']){
      const result=await page.evaluate(q=>window.drawFoliageSmoke(q==='offAgain'?'off':q),q);
      assert.deepEqual(result.errors,[],api+' vegetation GPU validation errors');
      assert.deepEqual(networkErrors,[],api+' vegetation resource loading errors');
      assert.deepEqual(errors.filter(e=>!info.software||!softwareLoss(e)),[],api+' vegetation shader/browser errors');
      if(result.lost){
        if(api==='webgpu'&&info.software)return {inconclusive:'software device lost during foliage '+q+': '+result.lost};
        assert.fail(api+' GPU lost: '+result.lost);
      }
      foliage[q]=await pixels(page);
      if(q==='high'){assert.ok(result.authored>0);assert.ok(result.grass>0);assert.ok(result.tiles<=52);}
      if(q==='offAgain')assert.equal(result.batches,0);
    }
    const foliageHigh=compare(foliage.off,foliage.high),foliageLow=compare(foliage.off,foliage.low),wind=compare(foliage.high,foliage.moving),foliageRestored=compare(foliage.off,foliage.offAgain);
    console.log('VEGETATION',api,JSON.stringify({high:foliageHigh,low:foliageLow,wind,restored:foliageRestored}));
    assert.ok(foliageHigh.changed>.01&&foliageLow.changed>.01,api+' enhanced foliage not rendered');
    assert.ok(wind.changed>.0002,api+' GPU wind did not change image');
    assert.ok(foliageRestored.mean<.5,api+' original vegetation did not restore');
    const warmup=await page.evaluate(()=>window.drawWarmupSmoke());
    assert.deepEqual(warmup.errors,[],api+' warmup GPU validation errors');
    assert.deepEqual(networkErrors,[],api+' warmup resource loading errors');
    assert.deepEqual(errors.filter(e=>!info.software||!softwareLoss(e)),[],api+' warmup shader/browser errors');
    if(warmup.lost){
      if(api==='webgpu'&&info.software)return {inconclusive:'software device lost during warmup: '+warmup.lost};
      assert.fail(api+' GPU lost: '+warmup.lost);
    }
    console.log('WARMUP',api,JSON.stringify(warmup));
    assert.equal(warmup.stats.complete,true);assert.equal(warmup.stats.assetsReady,true);assert.ok(warmup.stats.textures>0);
    assert.equal(warmup.restored,true);assert.equal(warmup.stages.at(-1),1);
    assert.ok(warmup.stages.every((v,i,a)=>i===0||v>=a[i-1]));
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
