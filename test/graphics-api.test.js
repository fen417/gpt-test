import test from 'node:test';
import assert from 'node:assert/strict';
import { GRAPHICS_API_KEY,preferredGraphicsApi,graphicsApiName,createWebGpuRenderer } from '../src/graphics-api.js';
import {loadTankAtlas} from '../src/tank-model.js';
import * as THREE from 'three';
import {WebGpuPostPass} from '../src/webgpu-post-pass.js';

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

test('WebGPU tank atlas is an uncompressed, mipmapped texture independent of KTX2',async()=>{
  const previous=globalThis.document;
  let polygons=0;
  const canvas={
    width:0,height:0,
    getContext(kind){
      assert.equal(kind,'2d');
      return {
        fillRect(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},
        fill(){polygons++;},
        set fillStyle(value){assert.ok(typeof value==='string');}
      };
    },
  };
  try{
    globalThis.document={createElement(tag){assert.equal(tag,'canvas');return canvas;}};
    // Deliberately omit WebGL caps, browser APIs and KTX2 format support.
    const atlas=await loadTankAtlas({isWebGPURenderer:true,getMaxAnisotropy:()=>8});
    assert.ok(atlas instanceof THREE.CanvasTexture);
    assert.equal(atlas.isCompressedTexture,undefined);
    assert.equal(atlas.image,canvas);
    assert.equal(canvas.width,512);
    assert.equal(canvas.height,512);
    assert.equal(polygons,180);
    assert.equal(atlas.colorSpace,THREE.SRGBColorSpace);
    assert.equal(atlas.wrapS,THREE.RepeatWrapping);
    assert.equal(atlas.wrapT,THREE.RepeatWrapping);
    assert.equal(atlas.generateMipmaps,true);
    assert.equal(atlas.flipY,false);
    assert.equal(atlas.anisotropy,8);
  }finally{
    if(previous===undefined)delete globalThis.document;
    else globalThis.document=previous;
  }
});

test('WebGPU fullscreen UVs keep image upright with and without FSR',()=>{
  // Three.js WebGPU QuadMesh uses a top-left texture origin. The world, gun
  // viewmodel and both intermediate FSR targets must use that same convention.
  const post=new WebGpuPostPass({});
  try{
    const scenes=[post.scene,post.easuScene,post.rcasScene];
    for(const scene of scenes){
      const geometry=scene.children[0].geometry;
      assert.equal(geometry,post.geometry);
      const position=geometry.getAttribute('position');
      const uv=geometry.getAttribute('uv');
      assert.deepEqual(Array.from(position.array),[-1,-1,0,3,-1,0,-1,3,0]);
      assert.deepEqual(Array.from(uv.array),[0,1,2,1,0,-1]);
      // For this fullscreen triangle, texture V = (1 - clipY)/2.
      // The top of the physical screen must sample the first texture row.
      const y0=position.getY(0),y2=position.getY(2);
      const v0=uv.getY(0),v2=uv.getY(2);
      const sampleV=y=>v0+(v2-v0)*(y-y0)/(y2-y0);
      assert.equal(sampleV(1),0,'top row is mirrored');
      assert.equal(sampleV(-1),1,'bottom row is mirrored');
    }
  }finally{post.dispose();}
});
