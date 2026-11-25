import {setWebGlShaderPatch} from './webgl-shader-patches.js';
const bindings=new WeakMap();
export function setWebGlArchitectureAO(material,atlas,strength=0){
  const old=bindings.get(material);
  if(!atlas){if(old){setWebGlShaderPatch(material,'architectureAO',null);bindings.delete(material);}return;}
  if(old){old.s09ArchitectureAtlas.value=atlas;old.s09ArchitectureStrength.value=strength;return;}
  const values={s09ArchitectureAtlas:{value:atlas},s09ArchitectureStrength:{value:strength}};
  bindings.set(material,values);
  setWebGlShaderPatch(material,'architectureAO',shader=>{
    Object.assign(shader.uniforms,values);
    shader.vertexShader='attribute vec2 s09ArchitectureUV; varying vec2 vS09ArchitectureUV;\n'+shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\nvS09ArchitectureUV=s09ArchitectureUV;');
    shader.fragmentShader='varying vec2 vS09ArchitectureUV;uniform sampler2D s09ArchitectureAtlas;uniform float s09ArchitectureStrength;\n'+shader.fragmentShader.replace('#include <aomap_fragment>',`
      #include <aomap_fragment>
      float s09GeometryAO=mix(1.,texture2D(s09ArchitectureAtlas,vS09ArchitectureUV).a,s09ArchitectureStrength);
      reflectedLight.indirectDiffuse*=s09GeometryAO;
      #ifdef STANDARD
        reflectedLight.indirectSpecular*=sqrt(s09GeometryAO);
      #endif
    `);
  });
}
