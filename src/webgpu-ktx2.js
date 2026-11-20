import * as THREE from 'three';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';

// In Three.js r181 the KTX2 transcoder may return an isCompressedTexture
// even when its fallback data has an uncompressed RGBAFormat. WebGPU then
// enters _copyCompressedBufferToTexture(), which cannot obtain block.width
// for rgba8unorm and crashes with "Cannot read properties of undefined
// (reading 'width')". DataTexture selects the correct non-block upload path.
export function convertWebGpuKtx2Texture(texture) {
  if (!texture?.isCompressedTexture || texture.format !== THREE.RGBAFormat) return texture;
  const mipmaps=texture.mipmaps;
  const first=mipmaps?.[0];
  if (!first || !Number.isFinite(first.width) || !Number.isFinite(first.height) || !first.data) {
    throw new Error('WebGPU KTX2 RGBA fallback missing valid image/mipmaps.');
  }

  const result=new THREE.DataTexture(first.data,first.width,first.height,texture.format,texture.type);
  result.name=texture.name;
  result.mipmaps=mipmaps;
  result.generateMipmaps=false;
  result.colorSpace=texture.colorSpace;
  result.minFilter=texture.minFilter;
  result.magFilter=texture.magFilter;
  result.wrapS=texture.wrapS;
  result.wrapT=texture.wrapT;
  result.anisotropy=texture.anisotropy;
  result.flipY=texture.flipY;
  result.premultiplyAlpha=texture.premultiplyAlpha;
  result.needsUpdate=true;
  texture.dispose();
  return result;
}

// Requested GPUDevice intentionally has NO optional compression features to
// support older hardware. Force Basis to select raw RGBA32 rather than a
// GPU format the device might not have enabled. The rest of the game keeps
// WebGL's compressed textures and WebGPU's regular WebP surface textures.
export class SafeWebGpuKtx2Loader extends KTX2Loader {
  detectSupport(renderer) {
    super.detectSupport(renderer);
    for (const key of ['astcSupported','astcHDRSupported','etc1Supported',
      'etc2Supported','dxtSupported','bptcSupported','pvrtcSupported']) {
      this.workerConfig[key]=false;
    }
    return this;
  }
  parse(buffer,onLoad,onError) {
    return super.parse(buffer,texture=>{
      try { onLoad?.(convertWebGpuKtx2Texture(texture)); }
      catch(error) { onError?.(error); }
    },onError);
  }
}
