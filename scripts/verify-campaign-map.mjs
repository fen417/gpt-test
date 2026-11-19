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
    const errors=[],consoleErrors=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
    await page.goto(base,{waitUntil:'domcontentloaded',timeout:60000});
    const campaignEntry=page.locator('#open-campaign');
    await campaignEntry.waitFor({state:'attached',timeout:60000});
    assert.equal(await campaignEntry.isVisible(),true,
      'campaign must be the visible first main menu entry without DEBUG');
    assert.equal(await page.locator('.home-nav > button').first().getAttribute('id'),'open-campaign');
    await campaignEntry.click();
    const dialog=page.locator('.campaign-map-screen');
    await dialog.waitFor({state:'visible',timeout:25000});
    assert.equal(await dialog.locator('.campaign-map-mission').count(),8,'all eight missions must have cards');
    assert.match(await dialog.locator('.campaign-development-note').innerText(),/В РАЗРАБОТКЕ/);
    for(const [missionId,percent] of [['m01',80],['m02',70],['m03',45],['m04',15]]){
      assert.match(await dialog.locator(`[data-mission="${missionId}"]`).innerText(),new RegExp(`${percent}%`));
    }
    await dialog.locator('[data-mission="m02"]').click();
    assert.match(await dialog.locator('.campaign-readiness-text').innerText(),/70%/);
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
    if(width===1280){
      await dialog.locator('.campaign-play').click();
      const mission=page.locator('.campaign-m02');
      try{await mission.waitFor({state:'visible',timeout:33000});}
      catch(error){
        await page.screenshot({path:'artifacts/campaign-map/m02-start-failure.png',fullPage:true});
        const diagnostics=await page.evaluate(()=>({
          status:document.getElementById('status')?.textContent,
          campaignError:document.querySelector('.campaign-menu-error')?.textContent,
          selected:document.querySelector('.campaign-mission-title')?.textContent,
          mainMenu:document.getElementById('menu')?.className,
          bodyText:document.body.innerText.slice(-2200),
          dialogOpen:document.querySelector('.campaign-map-screen')?.open,
          loading:document.querySelector('#busy')?.textContent
        }));
        console.log('MISSION 2 START FAILURE',JSON.stringify({diagnostics,errors,consoleErrors}));
        throw error;
      }
      await mission.locator('.m02-briefing').waitFor({state:'visible',timeout:20000});
      await page.screenshot({path:'artifacts/campaign-map/m02-briefing.png'});
      await mission.locator('.m02-skip').click();
      await page.waitForFunction(()=>document.querySelector('.campaign-m02 .m02-mission-status')?.textContent.includes('БОЙ'),
        {timeout:30000});
      await page.screenshot({path:'artifacts/campaign-map/m02-battle.png'});
      assert.ok(errors.length===0,`mission 2 has page errors: ${errors.join(' / ')}`);
      console.log('PASS mission 2 browser start and briefing skip');
    }
    await page.close();
  }
}finally{await browser.close();}
