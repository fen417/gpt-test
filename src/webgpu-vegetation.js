import * as THREE from 'three';
import {MeshStandardNodeMaterial} from 'three/webgpu';
import {attribute,positionGeometry,instanceIndex,uniform,vec3,sin} from 'three/tsl';
export function makeWebGpuFoliageMaterial(map,uniforms){
  const material=new MeshStandardNodeMaterial({map,alphaTest:.40,side:THREE.DoubleSide,roughness:.94,metalness:0});
  material.userData.noGI=true;
  const time=uniform(0),wind=uniform(0);
  const phase=instanceIndex.toFloat().mul(.371),w=attribute('s09Wind','float').mul(wind),gust=sin(time.mul(.71).add(phase.mul(.28))).mul(.36).add(.64);
  const dx=w.mul(gust).mul(sin(time.mul(1.7).add(phase)).mul(.125).add(sin(time.mul(3.4).add(phase.mul(1.7))).mul(.035)));
  const dz=w.mul(sin(time.mul(1.31).add(phase))).mul(.081);
  material.positionNode=positionGeometry.add(vec3(dx,0,dz));
  // Keep real shadows; do not add unshadowed emissive glow.
  return {material,update(){time.value=uniforms.time.value;wind.value=uniforms.wind.value;}};
}
