import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PostPass } from '../src/post-pass.js';

test('prepared surfaces have 512px KTX2 albedo/normal maps with complete mip chains',async()=>{
  for(const name of ['concrete','brick','metal','asphalt','ground','cloth','wood'])for(const suffix of ['','-normal']){
    const bytes=await readFile(new URL(`../src/assets/surfaces/${name}${suffix}.ktx2`,import.meta.url));
    assert.equal(bytes.subarray(1,5).toString(),'KTX ');
    assert.equal(bytes.readUInt32LE(20),512);assert.equal(bytes.readUInt32LE(24),512);
    assert.equal(bytes.readUInt32LE(40),10,'all levels down to 1x1 are present');
  }
});

test('post pass preserves world counters, resizes once and disposes resources',()=>{
  let sizeChanges=0;const renderer={info:{autoReset:true},toneMappingExposure:1.06,getDrawingBufferSize(v){v.set(1280,720);},setRenderTarget(){},render(){assert.equal(this.info.autoReset,false);}};
  const pass=new PostPass(renderer),resize=pass.target.setSize.bind(pass.target);pass.target.setSize=(...args)=>{sizeChanges++;resize(...args);};
  pass.begin();pass.end(1,'low');pass.begin();pass.end(2,'high');
  assert.equal(sizeChanges,1);assert.equal(renderer.info.autoReset,true);assert.equal(pass.target.width,1280);pass.dispose();
});
