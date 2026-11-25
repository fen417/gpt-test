import * as THREE from 'three';
import {MeshStandardNodeMaterial} from 'three/webgpu';
import {attribute,positionLocal,instanceIndex,uniform,vec3,sin,normalView,materialColor,materialEmissive,pow,max,dot} from 'three/tsl';
export function makeWebGpuFoliageMaterial(map,uniforms){
  const material=new MeshStandardNodeMaterial({map,alphaTest:.40,side:THREE.DoubleSide,roughness:.94,metalness:0});
  material.userData.noGI=true;
  const time=uniform(0),wind=uniform(0),transmission=uniform(0),sun=uniform(uniforms.sun.value);
  const phase=instanceIndex.toFloat().mul(.371),w=attribute('s09Wind','float').mul(wind),gust=sin(time.mul(.71).add(phase.mul(.28))).mul(.36).add(.64);
  const dx=w.mul(gust).mul(sin(time.mul(1.7).add(phase)).mul(.125).add(sin(time.mul(3.4).add(phase.mul(1.7))).mul(.035)));
  const dz=w.mul(sin(time.mul(1.31).add(phase))).mul(.081);
  material.positionNode=positionLocal.add(vec3(dx,0,dz));
  const back=pow(max(0,dot(normalView,sun).negate()),1.4);
  material.emissiveNode=materialEmissive.add(materialColor.rgb.mul(transmission).mul(back.mul(.84).add(.16)).mul(vec3(1,.91,.63)));
  return {material,update(){time.value=uniforms.time.value;wind.value=uniforms.wind.value;transmission.value=uniforms.transmission.value;}};
}
