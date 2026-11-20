import { MeshBasicNodeMaterial } from 'three/webgpu';
import { attribute } from 'three/tsl';

// The WebGL path uses a GLSL camera-facing vertex shader. WebGPU uses the
// identical instancing/sorting buffers but rotates quads on CPU at write time,
// avoiding extra draw calls and keeping a single alpha-blended smoke batch.
export function createWebGpuSmokeMaterial(texture) {
  const material=new MeshBasicNodeMaterial({
    map:texture,transparent:true,depthWrite:false,fog:true,
  });
  material.opacityNode=attribute('instanceAlpha','float');
  material.toneMapped=true;
  return material;
}
