import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';

const browser=await chromium.launch({headless:true,args:[
  '--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage',
]});
await mkdir('docs/fpv-m4',{recursive:true});
try{
  const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
  const errors=[];
  page.on('pageerror',error=>{errors.push(String(error));console.error('PAGE ERROR:',error);});
  page.on('console',msg=>{if(msg.type()==='error'||msg.type()==='warning')console.log('BROWSER:',msg.type(),msg.text());});
  page.on('requestfailed',request=>console.error('REQUEST FAILED:',request.url(),request.failure()?.errorText));
  page.on('response',response=>{if(response.request().resourceType()==='script')console.log('SCRIPT:',response.status(),response.headers()['content-type'],response.url());});
  for(const pose of ['hip','ads','reload','grip','parts','profile']){
    await page.goto('http://127.0.0.1:5173/test/fpv-m4-review.html?pose='+pose,{waitUntil:'domcontentloaded'});
    await page.waitForTimeout(6500);
    if(errors.length)throw new Error('Initial page errors: '+errors.join('; '));
    await page.waitForFunction(()=>window.__previewReady||window.__previewError,null,{timeout:25000});
    const error=await page.evaluate(()=>window.__previewError);
    if(error)throw new Error(pose+': '+error);
    if(errors.length)throw new Error(pose+': '+errors.join('; '));
    const diagnostics=await page.evaluate(()=>window.__m4Diagnostics);
    console.log('Pose '+pose+' diagnostics:',JSON.stringify(diagnostics));
    await page.screenshot({path:'docs/fpv-m4/'+pose+'.png',animations:'disabled'});
    console.log('Rendered '+pose+' M4A1 with imported texture and live FPV rig');
  }
}finally{await browser.close();}
