import * as THREE from 'three';
import {setWebGlShaderPatch} from './webgl-shader-patches.js';
function windShader(shader,uniforms){
  shader.uniforms.s09FoliageTime=uniforms.time;shader.uniforms.s09FoliageWind=uniforms.wind;
  shader.vertexShader='attribute float s09Wind;\nuniform float s09FoliageTime,s09FoliageWind;\n'+shader.vertexShader.replace('#include <begin_vertex>',`
    #include <begin_vertex>
    float s09Phase=0.;
    #ifdef USE_INSTANCING
      s09Phase=dot(instanceMatrix[3].xz,vec2(.19,.137));
    #endif
    float s09Gust=.64+.36*sin(s09FoliageTime*.71+s09Phase*.28);
    transformed.x+=s09Wind*s09FoliageWind*s09Gust*(sin(s09FoliageTime*1.7+s09Phase)*.125+sin(s09FoliageTime*3.4+s09Phase*1.7)*.035);
    transformed.z+=s09Wind*s09FoliageWind*sin(s09FoliageTime*1.31+s09Phase)*.081;
  `);
}
export function makeGlFoliageMaterial(map,uniforms){
  const material=new THREE.MeshStandardMaterial({map,alphaTest:.40,side:THREE.DoubleSide,roughness:.94,metalness:0});
  material.userData.noGI=true;
  setWebGlShaderPatch(material,'vegetation',shader=>{
    windShader(shader,uniforms);
    shader.uniforms.s09FoliageTransmission=uniforms.transmission;shader.uniforms.s09FoliageSun=uniforms.sun;
    shader.fragmentShader='uniform float s09FoliageTransmission;\nuniform vec3 s09FoliageSun;\n'+shader.fragmentShader.replace('#include <lights_fragment_end>',`
      #include <lights_fragment_end>
      float s09Back=pow(max(0.,-dot(normal,s09FoliageSun)),1.4);
      reflectedLight.directDiffuse+=reflectedLight.directDiffuse*s09FoliageTransmission*(.20+.80*s09Back)*vec3(1.,.96,.83);
    `);
  });
  const depth=new THREE.MeshDepthMaterial({map,alphaTest:.40,side:THREE.DoubleSide,depthPacking:THREE.RGBADepthPacking});
  depth.onBeforeCompile=shader=>windShader(shader,uniforms);depth.customProgramCacheKey=()=> 's09-foliage-depth';
  return {material,depth};
}
