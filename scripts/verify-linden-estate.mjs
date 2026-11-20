import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl']});
try{
 const page=await browser.newPage({viewport:{width:640,height:400}});
 const errors=[];
 page.on('pageerror',err=>errors.push(err.stack??String(err)));
 page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
 await page.goto('http://127.0.0.1:5173/test/linden-estate-smoke.html',{waitUntil:'networkidle'});
 const result=await page.evaluate(()=>window.runLindenSmoke());
 assert.equal(result.ok,true);assert.ok(result.meshes>=42);
 assert.ok(result.materials>=15);assert.equal(errors.length,0,errors.join('\n'));
 mkdirSync('artifacts/linden-estate',{recursive:true});
 await page.screenshot({path:'artifacts/linden-estate/estate-preview.png'});
 console.log('LINDEN ESTATE GLB SCENE PASS',JSON.stringify(result));
}finally{await browser.close();}
