import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createCanvas,loadImage} from '@napi-rs/canvas';
const browser=await chromium.launch({headless:true,args:[
  '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
  '--enable-unsafe-swiftshader','--enable-unsafe-webgpu',
]});
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
try{
  for(const api of ['webgl2','webgpu']){
    const page=await browser.newPage({viewport:{width:480,height:320},deviceScaleFactor:1});
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    try{
      await page.goto('http://127.0.0.1:5173/test/map-weathering-smoke.html',{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>typeof window.initWeatherSmoke==='function');
      const info=await page.evaluate(api=>window.initWeatherSmoke(api),api);
      if(info.skipped){assert.equal(api,'webgpu');console.warn('INCONCLUSIVE:',api,info.skipped);continue;}
      const frames={};
      let unavailable=false;
      for(const q of ['off','low','high','offAgain']){
        const result=await page.evaluate(q=>window.drawWeatherSmoke(q==='offAgain'?'off':q),q);
        if(result.lost&&api==='webgpu'&&!result.errors.length&&!errors.length){
          console.warn('INCONCLUSIVE: software WebGPU device lost',result.lost);unavailable=true;break;
        }
        assert.deepEqual(result.errors,[],api+' GPU validation errors');
        assert.deepEqual(errors,[],api+' browser errors');
        frames[q]=await pixels(page);
      }
      if(unavailable)continue;
      const low=compare(frames.off,frames.low),high=compare(frames.off,frames.high),restored=compare(frames.off,frames.offAgain);
      console.log('WEATHERING',api,JSON.stringify({low,high,restored}));
      if(api==='webgpu'&&low.black>.99){console.warn('INCONCLUSIVE: software WebGPU framebuffer blank');continue;}
      assert.ok(low.black<.99,api+' blank canvas');
      assert.ok(low.changed>.015,api+' low weathering did not change the rendered image');
      assert.ok(high.changed>.025,api+' high weathering did not change the rendered image');
      assert.ok(restored.mean<.3,api+' disabling weathering failed to restore original frame');
    }finally{await page.close();}
  }
}finally{await browser.close();}
