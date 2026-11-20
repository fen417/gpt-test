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
  await page.waitForFunction(()=>!document.getElementById('hud').classList.contains('hidden'),null,{timeout:45000});
  try {
    await page.waitForFunction(()=>document.getElementById('weapon-name').textContent.includes('БЕЗ ОРУЖИЯ'),null,{timeout:30000});
  } catch (error) {
    console.error('POOL START DIAGNOSTICS',JSON.stringify(await page.evaluate(()=>{
      const review=window.__S09_POOL_REVIEW;
      const snapshot=review?.snapshot();
      return {
        hudHidden:document.getElementById('hud')?.classList.contains('hidden'),
        weaponName:document.getElementById('weapon-name')?.textContent,
        mapId:snapshot?.mapId,mode:snapshot?.gameMode,
        players:snapshot?.players?.slice(0,2).map(p=>({id:p.id,alive:p.alive,weaponId:p.weaponId,x:p.x,z:p.z})),
        reviewPresent:!!review,rendererMap:review?.renderer?.map?.id,
      };
    })),errors);
    await page.screenshot({path:'artifacts/pool-day/startup-diagnostic.png'}).catch(()=>{});
    throw error;
  }
  // Verify that the actual PROCEDURAL firearms exist in the world after
  // gameplay starts, rather than counting pickup metadata or placeholder boxes.
  await page.waitForFunction(()=>{
    const r=window.__S09_POOL_REVIEW?.renderer;
    return r?.poolWeaponModels?.size>0 &&
      [...r.poolWeaponModels.values()].some(model=>{
        let geometry=false;
        model.traverseVisible(object=>{
          if(object.isMesh&&object.geometry?.attributes?.position?.count>20)geometry=true;
        });
        return model.userData.procedural&&geometry&&model.parent===r.worldRoot;
      });
  },null,{timeout:30000});
  const floorGuns=await page.evaluate(()=>{
    const {renderer:r,snapshot}=window.__S09_POOL_REVIEW;
    const entities=[...r.poolWeaponModels.values()];
    let meshes=0,triangles=0;
    for(const entity of entities)entity.traverseVisible(object=>{
      if(object.isMesh){meshes++;triangles+=(object.geometry.index?.count??object.geometry.attributes.position.count)/3;}
    });
    return {shown:entities.length,items:snapshot()?.weaponItems?.length??0,meshes,triangles,
      names:entities.map(e=>e.name),procedural:entities.every(e=>e.userData.procedural)};
  });
  assert.ok(floorGuns.shown>0,'no floor pickup models');
  assert.ok(floorGuns.meshes>=floorGuns.shown,'not enough visible firearm meshes');
  assert.ok(floorGuns.triangles>100,'firearm models have no real geometry');
  assert.ok(floorGuns.procedural,'a non-procedural pickup was rendered');
  console.log('PASS procedural weapon meshes on ground',floorGuns);
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
