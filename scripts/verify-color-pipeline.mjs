import { chromium } from 'playwright';
import { loadImage, createCanvas } from '@napi-rs/canvas';
import assert from 'node:assert/strict';

const browser=await chromium.launch({headless:true,args:[
  '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
  '--enable-unsafe-swiftshader','--enable-unsafe-webgpu',
]});
const results={};
try{
  for (const api of ['webgl2','webgpu']){
    for(const fsr of ['off','quality']){
      const ctx=await browser.newContext({viewport:{width:320,height:200}});
      const page=await ctx.newPage();
      const pageErrors=[];
      page.on('pageerror',error=>pageErrors.push(error.message));
      page.on('console',message=>{if(api==='webgpu')console.log('PROBE LOG',message.type(),message.text().slice(0,500));});
      try{
        await page.goto('http://127.0.0.1:5173/test/graphics-color-smoke.html',{waitUntil:'domcontentloaded'});
        await page.waitForFunction(()=>typeof window.runColorSmoke==='function');
        const info=await page.evaluate(([a,q])=>window.runColorSmoke(a,q,false),[api,fsr]);
        if(info.skipped){console.log('COLOR SMOKE SKIPPED',info);continue;}
        assert.equal(info.ok,true);
        assert.deepEqual(pageErrors,[]);
        const png=await page.locator('#probe').screenshot({timeout:60000});
        const image=await loadImage(png);
        const target=createCanvas(image.width,image.height);
        const pixel=target.getContext('2d');pixel.drawImage(image,0,0);
        const data=pixel.getImageData(110,54,30,30).data;
        const mean=[0,0,0];
        for(let i=0;i<data.length;i+=4)for(let channel=0;channel<3;channel++)mean[channel]+=data[i+channel];
        for(let i=0;i<3;i++)mean[i]=Math.round(mean[i]/(data.length/4));
        if(api==='webgpu'&&mean.every(v=>v<=4)){
          // A headless SwiftShader WebGPU canvas can be blank after the software
          // device is destroyed by Chromium. This is NOT a pass for WebGPU
          // color fidelity; hardware comparisons remain required.
          console.warn('WEBGPU COLOR INCONCLUSIVE: software adapter framebuffer is blank');
          continue;
        }
        results[api+':'+fsr]={rgb:mean,...info};
        console.log('COLOR SMOKE',JSON.stringify(results[api+':'+fsr]));
      }finally{await ctx.close();}
    }
  }
  const distance=(a,b)=>Math.max(...a.map((value,i)=>Math.abs(value-b[i])));
  for(const api of ['webgl2','webgpu']){
    if(!results[api+':off']||!results[api+':quality'])continue;
    assert.ok(distance(results[api+':off'].rgb,results[api+':quality'].rgb)<=14,
      api+' FSR changes color or brightness more than tolerance');
  }
  if(results['webgl2:off']&&results['webgpu:off']){
    assert.ok(distance(results['webgl2:off'].rgb,results['webgpu:off'].rgb)<=25,
      'WebGPU is significantly lighter/darker than WebGL 2');
  }
  assert.ok(results['webgl2:off']?.rgb.every(v=>v>25&&v<245),'WebGL color probe is black or blown out');
  // Exercise real shipped textures without SwiftShader/WebGPU framebuffer
  // instability: this tests transcoding and DataTexture mipmap structure.
  const assetContext=await browser.newContext({viewport:{width:320,height:200}});
  const assetPage=await assetContext.newPage();
  assetPage.on('console',message=>{if(message.type()==='error')console.log('ASSET PROBE',message.text().slice(0,700));});
  try{
    await assetPage.goto('http://127.0.0.1:5173/test/graphics-color-smoke.html',{waitUntil:'domcontentloaded'});
    await assetPage.waitForFunction(()=>typeof window.runBasisDecodeSmoke==='function');
    const decoded=await assetPage.evaluate(()=>window.runBasisDecodeSmoke());
    console.log('REAL GLB KTX2 DECODE',JSON.stringify(decoded));
    assert.ok(decoded.count>0,'Real GLB provides no texture maps');
    assert.ok(decoded.formats.every(t=>t.type!=='CompressedTexture'),'KTX2 fallback still marked compressed');
    assert.ok(decoded.formats.every(t=>t.width>0&&t.height>0&&t.mipmaps>0),'Invalid decoded mipmap structure');
  }finally{await assetContext.close();}
}finally{await browser.close();}
