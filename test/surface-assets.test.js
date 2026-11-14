import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PostPass } from '../src/post-pass.js';

test('prepared ground and normals use UASTC, with 1024px ground and complete mip chains',async()=>{
  for(const name of ['concrete','brick','metal','asphalt','ground','cloth','wood','village-sand','village-stucco'])for(const suffix of ['','-normal']){
    const bytes=await readFile(new URL(`../src/assets/surfaces/${name}${suffix}.ktx2`,import.meta.url));
    assert.equal(bytes.subarray(1,5).toString(),'KTX ');
    const ground=name==='ground'||name==='village-sand',size=ground?1024:512;
    assert.equal(bytes.readUInt32LE(20),size);assert.equal(bytes.readUInt32LE(24),size);
    assert.equal(bytes.readUInt32LE(40),ground?11:10,'all levels down to 1x1 are present');
    if(ground||suffix)assert.equal(bytes.readUInt32LE(44),2,'UASTC with Zstandard, not ETC1S/BasisLZ');
  }
});

test('high resolves MSAA without FXAA, low uses tone-mapped FXAA, explicit AA off is respected',()=>{
  const renderer={capabilities:{maxSamples:4},getDrawingBufferSize(v){v.set(1280,720);},setRenderTarget(){}};
  const pass=new PostPass(renderer);pass.begin('high');assert.equal(pass.target.samples,4);assert.equal(pass.material.uniforms.useFxaa.value,0);
  pass.begin('low');assert.equal(pass.target.samples,0);assert.equal(pass.material.uniforms.useFxaa.value,1);
  assert.ok(pass.material.fragmentShader.includes('linearToOutputTexel(vec4(ACESFilmicToneMapping(texel.rgb)'));
  pass.dispose();const off=new PostPass(renderer,{antialias:'off'});off.begin('high');assert.equal(off.target.samples,0);assert.equal(off.material.uniforms.useFxaa.value,0);off.dispose();
});

test('post pass preserves world counters, resizes once and disposes resources',()=>{
  let sizeChanges=0;const renderer={info:{autoReset:true},toneMappingExposure:1.06,getDrawingBufferSize(v){v.set(1280,720);},setRenderTarget(){},render(){assert.equal(this.info.autoReset,false);}};
  const pass=new PostPass(renderer),resize=pass.target.setSize.bind(pass.target);pass.target.setSize=(...args)=>{sizeChanges++;resize(...args);};
  pass.begin();pass.end(1,'low');pass.begin();pass.end(2,'high');
  assert.equal(sizeChanges,1);assert.equal(renderer.info.autoReset,true);assert.equal(pass.target.width,1280);pass.dispose();
});
