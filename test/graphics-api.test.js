import test from 'node:test';
import assert from 'node:assert/strict';
import { GRAPHICS_API_KEY, preferredGraphicsApi, graphicsApiName, createWebGpuRenderer } from '../src/graphics-api.js';
import { loadTankAtlas } from '../src/tank-model.js';
import * as THREE from 'three';
import { WebGpuPostPass } from '../src/webgpu-post-pass.js';
import { FSR1_SCALES, fsr1RenderScale } from '../src/fsr1.js';
import { FrameGenerationPolicy, FRAME_GENERATION_MODES } from '../src/frame-generation-policy.js';
import { SafeWebGpuKtx2Loader, convertWebGpuKtx2Texture } from '../src/webgpu-ktx2.js';

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

test('FSR high-fidelity presets preserve the requested internal resolution',()=>{
  assert.deepEqual(FSR1_SCALES,{ultra:.92,quality:.85,balanced:.75,performance:.67});
  assert.equal(Math.round(1920*fsr1RenderScale('ultra')),1766);
  assert.equal(Math.round(1080*fsr1RenderScale('ultra')),994);
  assert.equal(fsr1RenderScale('auto',.7),.7);
  assert.equal(fsr1RenderScale('auto',.2),.6);
});

test('WebGPU RCAS sharpness applies live and is bounded to 0–100%',()=>{
  const post=new WebGpuPostPass({});
  try{
    post.setUpscaling('ultra',1,40);
    assert.equal(post.fsrScale,.92);
    assert.equal(post.rcasSharpness.value,.4);
    post.setUpscaling('quality',1,0);
    assert.equal(post.rcasSharpness.value,0);
    post.setUpscaling('quality',1,200);
    assert.equal(post.rcasSharpness.value,1);
    post.setUpscaling('off',1,30);
    assert.equal(post.fsrScale,1);
  }finally{post.dispose();}
});

const meta=(override={})=>({
  playerId:'p',mapId:'village',alive:true,weaponId:'m4',
  vehicleId:null,seat:null,scoped:false,aim:false,thirdPerson:false,
  yaw:0,pitch:0,x:0,y:1.7,z:0,...override,
});

test('Frame Generation defaults off and refuses to generate without two real frames',()=>{
  const policy=new FrameGenerationPolicy();
  assert.deepEqual(FRAME_GENERATION_MODES,['off','auto','1.5','2']);
  assert.equal(policy.shouldGenerate(16,meta()),false);
  policy.setMode('1.5');
  assert.equal(policy.shouldGenerate(16,meta()),false);
  policy.noteReal(16,meta(),10);
  assert.equal(policy.shouldGenerate(32,meta()),false);
  policy.noteReal(32,meta(),10);
  assert.equal(policy.summary().historyReady,true);
});

test('1.5x runs only one synthetic presentation per two native frames',()=>{
  const p=new FrameGenerationPolicy();p.setMode('1.5');
  p.noteReal(16,meta(),10);p.noteReal(32,meta(),10);
  assert.equal(p.shouldGenerate(48,meta()),false);p.noteReal(48,meta(),10);
  assert.equal(p.shouldGenerate(64,meta()),false);p.noteReal(64,meta(),10);
  assert.equal(p.shouldGenerate(80,meta()),true);p.noteGenerated(80);
  assert.equal(p.shouldGenerate(96,meta()),false);p.noteReal(96,meta(),10);
  assert.equal(p.shouldGenerate(112,meta()),false);
  assert.equal(p.summary().realFrames,5);
  assert.equal(p.summary().generatedFrames,1);
});

test('2x generates alternate frames while input and simulation remain external',()=>{
  const p=new FrameGenerationPolicy();p.setMode('2');
  p.noteReal(16,meta(),9);p.noteReal(32,meta(),9);
  assert.equal(p.shouldGenerate(48,meta()),false);p.noteReal(48,meta(),9);
  assert.equal(p.shouldGenerate(64,meta()),true);p.noteGenerated(64);
  assert.equal(p.shouldGenerate(80,meta()),false);
});

test('camera cuts, teleports, weapon switches and stale source frames are rejected',()=>{
  const p=new FrameGenerationPolicy();p.setMode('1.5');
  p.noteReal(16,meta(),9);p.noteReal(32,meta(),9);
  assert.equal(p.shouldGenerate(40,meta({yaw:.2})),false);
  assert.equal(p.shouldGenerate(40,meta({x:15})),false);
  assert.equal(p.shouldGenerate(40,meta({weaponId:'sniper'})),false);
  assert.equal(p.shouldGenerate(40,meta({scoped:true})),false);
  assert.equal(p.shouldGenerate(100,meta()),false);
  p.noteReal(100,meta({mapId:'quarry'}),9);
  assert.equal(p.summary().historyReady,false);
});

test('slow frame timing suppresses auto mode but explicit mode remains user controlled',()=>{
  const p=new FrameGenerationPolicy();p.setMode('auto');
  p.noteReal(16,meta(),38);p.noteReal(32,meta(),39);
  p.noteReal(48,meta(),40);
  p.noteReal(64,meta(),39);
  assert.equal(p.shouldGenerate(80,meta()),false);
  p.setMode('2');
  assert.equal(p.summary().historyReady,false);
  p.noteReal(96,meta(),9);p.noteReal(112,meta(),9);
  assert.equal(p.shouldGenerate(128,meta()),false);
  assert.equal(p.shouldGenerate(144,meta()),true);
  p.setMode('off');
  assert.equal(p.shouldGenerate(160,meta()),false);
});

test('Basis RGBA32 fallback does not masquerade as compressed image on WebGPU',()=>{
  const mip0={width:8,height:8,data:new Uint8Array(8*8*4)};
  const mip1={width:4,height:4,data:new Uint8Array(4*4*4)};
  const source=new THREE.CompressedTexture([mip0,mip1],8,8,THREE.RGBAFormat,THREE.UnsignedByteType);
  source.colorSpace=THREE.SRGBColorSpace;
  source.minFilter=THREE.LinearMipmapLinearFilter;
  const image=convertWebGpuKtx2Texture(source);
  assert.equal(image.isDataTexture,true);
  assert.equal(image.isCompressedTexture,undefined);
  assert.equal(image.format,THREE.RGBAFormat);
  assert.equal(image.image.width,8);
  assert.equal(image.image.height,8);
  assert.equal(image.image.data,mip0.data);
  assert.deepEqual(image.mipmaps,[mip0,mip1]);
  assert.equal(image.colorSpace,THREE.SRGBColorSpace);
  assert.equal(image.minFilter,THREE.LinearMipmapLinearFilter);
  assert.equal(image.generateMipmaps,false);
  assert.ok(image.version>0);
  image.dispose();
});

test('valid hardware BC7 compressed texture is not changed',()=>{
  const texture=new THREE.CompressedTexture(
    [{width:4,height:4,data:new Uint8Array(16)}],4,4,THREE.RGBA_BPTC_Format);
  assert.equal(convertWebGpuKtx2Texture(texture),texture);
});

test('invalid fallback mipmaps rejected before GPU upload',()=>{
  const texture=new THREE.CompressedTexture([],1,1,THREE.RGBAFormat);
  assert.throws(()=>convertWebGpuKtx2Texture(texture),/missing valid image/);
});

test('WebGPU KTX2 worker requests no optional compression formats',()=>{
  const loader=new SafeWebGpuKtx2Loader();
  try{
    loader.detectSupport({isWebGPURenderer:true,hasFeature:()=>true});
    for(const [key,value] of Object.entries(loader.workerConfig)){
      if(key.endsWith('Supported'))assert.equal(value,false,key);
    }
  }finally{loader.dispose();}
});

test('PBR WebGPU loader selects only enabled hardware formats',()=>{
  const loader=new SafeWebGpuKtx2Loader();
  loader.allowCompression=true;
  try{
    loader.detectSupport({isWebGPURenderer:true,hasFeature:()=>true,backend:{device:{features:new Set(['texture-compression-bc'])}}});
    assert.equal(loader.workerConfig.dxtSupported,true);
    assert.equal(loader.workerConfig.bptcSupported,true);
    assert.equal(loader.workerConfig.astcSupported,false);
    assert.equal(loader.workerConfig.etc2Supported,false);
  }finally{loader.dispose();}
});
