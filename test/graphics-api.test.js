import test from 'node:test';
import assert from 'node:assert/strict';
import { GRAPHICS_API_KEY,preferredGraphicsApi,graphicsApiName,createWebGpuRenderer } from '../src/graphics-api.js';

test('graphics API preference: auto is safe and unknown values are rejected',()=>{
  const storage={ getItem(){return null;} };
  assert.equal(GRAPHICS_API_KEY,'sector09-gfx-api');
  assert.equal(preferredGraphicsApi(storage),'auto');
  for(const value of ['auto','webgl2','webgpu']){
    assert.equal(preferredGraphicsApi({getItem:()=>value}),value);
  }
  assert.equal(preferredGraphicsApi({getItem:()=> 'webgpu-fallback'}),'auto');
  assert.equal(graphicsApiName('webgl2'),'WebGL 2');
  assert.equal(graphicsApiName('webgpu'),'WebGPU');
});

test('WebGPU cannot silently emulate when no secure GPU context exists', async()=>{
  const secure=globalThis.isSecureContext;
  try{
    globalThis.isSecureContext=false;
    await assert.rejects(createWebGpuRenderer(null),/HTTPS|WebGPU/);
  }finally{
    if(secure===undefined)delete globalThis.isSecureContext;
    else globalThis.isSecureContext=secure;
  }
});
