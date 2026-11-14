import * as THREE from 'three';
const urls={port:new URL('./assets/shadows/port.png',import.meta.url),quarry:new URL('./assets/shadows/quarry.png',import.meta.url),village:new URL('./assets/shadows/village.png',import.meta.url)};

export class GroundShadows {
  constructor(){this.textures=new Map();this.uniforms={groundShadow:{value:null},groundSpan:{value:384},groundShadowStrength:{value:0}};}
  setMap(map){
    let texture=this.textures.get(map.id);
    if(!texture){texture=new THREE.TextureLoader().load(urls[map.id].href);texture.flipY=false;texture.minFilter=THREE.LinearFilter;texture.generateMipmaps=false;this.textures.set(map.id,texture);}
    this.uniforms.groundShadow.value=texture;this.uniforms.groundSpan.value=map.size;
  }
  apply(material){
    if(!material?.isMaterial||material.userData.groundShadowPatched)return;
    material.userData.groundShadowPatched=true;const previous=material.onBeforeCompile,previousKey=material.customProgramCacheKey();
    material.onBeforeCompile=(shader,renderer)=>{
      previous.call(material,shader,renderer);Object.assign(shader.uniforms,this.uniforms);
      shader.vertexShader='varying vec2 bakedWorldXZ;\n'+shader.vertexShader.replace('#include <project_vertex>',`vec4 bakedPosition=vec4(transformed,1.0);
        #ifdef USE_INSTANCING
          bakedPosition=instanceMatrix*bakedPosition;
        #endif
        bakedWorldXZ=(modelMatrix*bakedPosition).xz;
        #include <project_vertex>`);
      shader.fragmentShader='varying vec2 bakedWorldXZ;uniform sampler2D groundShadow;uniform float groundSpan;uniform float groundShadowStrength;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        vec2 shadowUv=bakedWorldXZ/groundSpan+0.5;
        float inside=step(0.0,shadowUv.x)*step(shadowUv.x,1.0)*step(0.0,shadowUv.y)*step(shadowUv.y,1.0);
        float lightMask=texture2D(groundShadow,clamp(shadowUv,0.0,1.0)).r;
        diffuseColor.rgb*=1.0-groundShadowStrength*(1.0-lightMask)*inside;
        // Fine, world-anchored variation avoids an extra detail texture fetch.
        float detail=sin(bakedWorldXZ.x*43.0)*sin(bakedWorldXZ.y*39.0);
        diffuseColor.rgb*=1.0+detail*0.018;`);
    };
    material.customProgramCacheKey=()=>`ground-shadow-v1-${material.type}-${previousKey}`;material.needsUpdate=true;
  }
  dispose(){for(const texture of this.textures.values())texture.dispose();}
}
