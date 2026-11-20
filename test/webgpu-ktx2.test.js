import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SafeWebGpuKtx2Loader, convertWebGpuKtx2Texture } from '../src/webgpu-ktx2.js';

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
