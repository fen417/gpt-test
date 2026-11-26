
import {chromium} from 'playwright';
import {createServer} from 'vite';
import {readFile,writeFile,rm,mkdir} from 'node:fs/promises';
import {strict as assert} from 'node:assert';
import {createHash} from 'node:crypto';

// CI uses a clean checkout. Restore editor data and delete our synthetic
// resource even if the browser or editor fails.
const file='shared/campaign/m05-editor-data.json',original=await readFile(file),registry='shared/editor-maps.json',originalRegistry=await readFile(registry);
const vertices=new Float32Array([-1,0,0,1,0,0,0,2,0]),bin=Buffer.from(vertices.buffer);
const gltf={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0,name:'SmokeMesh'}],meshes:[{primitives:[{attributes:{POSITION:0},material:0}]}],materials:[{name:'SmokeMaterial',pbrMetallicRoughness:{baseColorFactor:[.5,.5,.5,1],metallicFactor:0,roughnessFactor:.8}}],buffers:[{byteLength:bin.length}],bufferViews:[{buffer:0,byteOffset:0,byteLength:bin.length,target:34962}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[-1,0,0],max:[1,2,0]}]};
let json=Buffer.from(JSON.stringify(gltf));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);
const glb=Buffer.alloc(12+8+json.length+8+bin.length);
glb.writeUInt32LE(0x46546c67,0);glb.writeUInt32LE(2,4);glb.writeUInt32LE(glb.length,8);glb.writeUInt32LE(json.length,12);glb.writeUInt32LE(0x4e4f534a,16);json.copy(glb,20);const at=20+json.length;glb.writeUInt32LE(bin.length,at);glb.writeUInt32LE(0x004e4942,at+4);bin.copy(glb,at+8);
const asset='public/world-editor-assets/'+createHash('sha256').update(glb).digest('hex')+'.glb';
const server=await createServer({server:{host:'127.0.0.1',port:5178,strictPort:true}});
let browser,page;
try{
 await server.listen();
 browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
 page=await browser.newPage({viewport:{width:1360,height:900}});
 page.on('pageerror',e=>console.error('PAGE ERROR',e));
 page.on('console',m=>{if(m.type()==='error')console.error('BROWSER',m.text());});
 await page.goto('http://127.0.0.1:5178/world-editor.html',{timeout:120000});
 await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('Карта загружена')||!document.querySelector('#fatal')?.classList.contains('hidden'),{},{timeout:120000});
 assert.equal(await page.locator('#fatal').isVisible(),false,await page.locator('#fatal').textContent());
 await page.waitForFunction(()=>document.querySelector('#stats')?.textContent.includes('Draw calls'),{},{timeout:90000});
 await page.selectOption('#quality','low');
 await page.locator('#files').setInputFiles({name:'world-editor-smoke.glb',mimeType:'model/gltf-binary',buffer:glb});
 await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('Импортировано'),{},{timeout:90000});
 await page.getByRole('button',{name:'+ Пустой Box',exact:true}).click();
 const colorField=page.locator('#inspector .field').filter({hasText:'Шероховатость'}).locator('input');await colorField.fill('0.42');await colorField.blur();
 await page.waitForFunction(()=>document.querySelector('#inspector')?.textContent.includes('PBR-материалы'),{},{timeout:30000});
 await page.locator('#save').click();
 await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('Сохранено в проект'),{},{timeout:90000});
 const data=JSON.parse(await readFile(file,'utf8')),model=data.models.find(m=>m.name==='world-editor-smoke.glb');
 assert.ok(model);assert.equal(model.colliders.length,1);assert.equal(model.materials['0:0'].roughness,.42);
 await page.reload({timeout:120000});
 await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('Карта загружена')||!document.querySelector('#fatal')?.classList.contains('hidden'),{},{timeout:120000});
 assert.equal(await page.locator('#fatal').isVisible(),false,await page.locator('#fatal').textContent());
 assert.ok(await page.locator('#tree').getByRole('button',{name:/world-editor-smoke/}).count());
 await page.waitForFunction(()=>document.querySelector('#stats')?.textContent.includes('Draw calls'),{},{timeout:90000});
 console.log('Editor smoke: render, import, collider, material, save and reload OK');
 // Create a new map via the actual editor UI, then verify it opens.
 let answers=['Smoke sandbox','256'];page.on('dialog',d=>d.accept(answers.shift()??''));
 await page.locator('#newMap').click();
 await page.waitForURL(/map=editor-/,{timeout:90000});
 await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('Карта загружена')||!document.querySelector('#fatal')?.classList.contains('hidden'),{},{timeout:120000});
 assert.equal(await page.locator('#fatal').isVisible(),false,await page.locator('#fatal').textContent());
 assert.ok(await page.locator('#tree').getByRole('button',{name:/spawnA/}).count());
 await page.waitForFunction(()=>document.querySelector('#stats')?.textContent.includes('Draw calls'),{},{timeout:90000});
 const rect=await page.locator('#canvas').boundingBox();await page.locator('#layerMode').click();
 await page.mouse.click(rect.x+rect.width/2,rect.y+rect.height/2);
 await page.locator('#roadMode').click();
 await page.mouse.click(rect.x+rect.width*.45,rect.y+rect.height*.5);await page.mouse.click(rect.x+rect.width*.55,rect.y+rect.height*.55);
 await page.locator('#finishRoad').click();
 await page.locator('#save').click();
 await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('Сохранено в проект'),{},{timeout:90000});
 const entry=Object.values(JSON.parse(await readFile(registry,'utf8')).maps).find(m=>m.config.name==='Smoke sandbox');
 assert.equal(entry.data.layers.length,1);assert.equal(entry.data.roads.length,1);
 assert.equal(await page.locator('#fatal').isVisible(),false);
 console.log('Editor smoke: new map, textured terrain and road save OK');
}catch(error){
 await mkdir('.perf-local',{recursive:true});await page?.screenshot({path:'.perf-local/world-editor-failure.png'}).catch(()=>{});
 throw error;
}finally{
 await browser?.close();await server.close();await writeFile(file,original);await writeFile(registry,originalRegistry);await rm(asset,{force:true});
}
