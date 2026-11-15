import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';

const base='http://127.0.0.1:5173/?unlockAll';
const browser=await chromium.launch({
  headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']
});
try{
  await mkdir('artifacts/campaign-map',{recursive:true});
  for(const [width,height] of [[1280,720],[1920,1080],[360,780]]){
    const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(base,{waitUntil:'domcontentloaded',timeout:60000});
    await page.locator('#open-campaign').waitFor({timeout:60000});
    await page.locator('#open-campaign').click();
    const dialog=page.locator('.campaign-map-screen');
    await dialog.waitFor({state:'visible',timeout:25000});
    assert.equal(await dialog.locator('.campaign-map-mission').count(),8,'all eight missions must have cards');
    await dialog.locator('[data-mission="m02"]').click();
    assert.match(await dialog.locator('.campaign-mission-title').innerText(),/Рассвет над Аль-Хадрой/);
    assert.equal(await dialog.locator('.campaign-play').isDisabled(),false,'dev ?unlockAll must enable m02');
    await page.screenshot({path:`artifacts/campaign-map/${width}x${height}.png`,fullPage:false});
    const geometry=await dialog.evaluate(el=>({
      left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right,
      width:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth
    }));
    assert.ok(geometry.left>=-1&&geometry.right<=geometry.width+1,
      `dialog overflow at ${width}x${height}: ${JSON.stringify(geometry)}`);
    assert.ok(geometry.scrollWidth<=geometry.width+2,
      `document overflow at ${width}x${height}: ${JSON.stringify(geometry)}`);
    assert.ok(errors.length===0,`page errors at ${width}x${height}: ${errors.join(' / ')}`);
    console.log('PASS campaign screen',width,height);
    await page.close();
  }
}finally{await browser.close();}
