import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const browser=await chromium.launch({
  headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']
});
try{
  await mkdir('artifacts/pool-day',{recursive:true});
  const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')console.log('BROWSER CONSOLE ERROR',m.text().slice(0,900));});
  await page.goto('http://127.0.0.1:5173/?poolScreenshot',{waitUntil:'domcontentloaded',timeout:60000});
  await page.locator('#open-solo').waitFor({state:'visible',timeout:60000});
  await page.locator('#open-solo').click();
  await page.locator('#map-select').selectOption('fy_pool_day');
  await page.locator('#population').selectOption('15');
  assert.equal(await page.locator('#solo-mode').inputValue(),'tdm');
  await page.locator('#solo').click();
  await page.waitForFunction(()=>!document.getElementById('hud').classList.contains('hidden'),
    {timeout:45000});
  await page.waitForFunction(()=>document.getElementById('weapon-name').textContent.includes('БЕЗ ОРУЖИЯ'),
    {timeout:30000});
  await page.waitForTimeout(2000);
  await page.screenshot({path:'artifacts/pool-day/first-person-wip.png',timeout:20000});
  const before=await page.evaluate(()=>({
    state:window.__S09_POOL_REVIEW?.snapshot(),
    map:window.__S09_POOL_REVIEW?.renderer?.map?.id
  }));
  assert.equal(before.map,'fy_pool_day');
  assert.equal(before.state?.gameMode,'tdm');
  assert.ok(!before.state?.players?.find(p=>p.id==='local')?.weaponId);
  const data=await page.evaluate(()=>{
    const {renderer:r}=window.__S09_POOL_REVIEW;
    r.camera.up.set(0,0,-1);r.camera.position.set(0,69,0);r.camera.lookAt(0,0,0);
    r.camera.fov=52;r.camera.near=.1;r.camera.far=300;r.camera.updateProjectionMatrix();
    r.drawScene();
    return document.getElementById('game').toDataURL('image/png').split(',')[1];
  });
  await writeFile('artifacts/pool-day/overview-wip.png',Buffer.from(data,'base64'));
  assert.equal(errors.length,0,errors.join(' | '));
  console.log('PASS browser TDM startup, empty inventory, gameplay frame and top-down screenshot');
}finally{
  await browser.close();
}
