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

// Legacy callers stay on the conservative RGBA32 path. PBR callers may opt
// into native formats only when the GPUDevice explicitly enabled them.
export class SafeWebGpuKtx2Loader extends KTX2Loader {
  detectSupport(renderer) {
    super.detectSupport(renderer);
    const features=renderer.backend?.device?.features;
    // Existing model loaders keep their conservative RGBA path; the new PBR
    // loader opts into only those formats actually enabled on this device.
    const bc=this.allowCompression&&features?.has('texture-compression-bc');
    const etc=this.allowCompression&&features?.has('texture-compression-etc2');
    const astc=this.allowCompression&&features?.has('texture-compression-astc');
    for(const [key,enabled] of Object.entries({astcSupported:astc,astcHDRSupported:false,etc1Supported:false,etc2Supported:etc,dxtSupported:bc,bptcSupported:bc,pvrtcSupported:false})){
      this.workerConfig[key]=Boolean(enabled&&this.workerConfig[key]);
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
