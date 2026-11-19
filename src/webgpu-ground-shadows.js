import * as THREE from 'three';
import { MeshStandardNodeMaterial, MeshLambertNodeMaterial, MeshBasicNodeMaterial } from 'three/webgpu';
import { texture, uniform, materialColor, positionWorld, vec2,
  float, clamp, step } from 'three/tsl';

const urls={port:new URL('./assets/shadows/port.png',import.meta.url),
  quarry:new URL('./assets/shadows/quarry.png',import.meta.url),
  village:new URL('./assets/shadows/village.png',import.meta.url)};

export class WebGpuGroundShadows {
  constructor(){
    this.textures=new Map();
    this.white=new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1);
    this.white.needsUpdate=true;
    this.sample=texture(this.white);
    this.span=uniform(384);
    this.strength=uniform(0);
    this.uniforms={
      groundShadow:{get value(){return this._texture;},set value(value){this._texture=value;}},
      groundSpan:{value:384},groundShadowStrength:{value:0},
    };
    Object.defineProperty(this.uniforms.groundSpan,'value',{get:()=>this.span.value,set:value=>{this.span.value=value;}});
    Object.defineProperty(this.uniforms.groundShadowStrength,'value',{get:()=>this.strength.value,set:value=>{this.strength.value=value;}});
  }
  setMap(map){
    let tex=this.textures.get(map.id);
    if(!tex){
      const imageUrl=urls[map.id]?.href;
      tex=imageUrl?new THREE.TextureLoader().load(imageUrl):this.white;
      tex.flipY=false;tex.minFilter=THREE.LinearFilter;tex.generateMipmaps=false;
      this.textures.set(map.id,tex);
    }
    this.sample.value=tex;this.uniforms.groundShadow.value=tex;
    this.span.value=map.size;
  }
  apply(material){
    if(!material?.isMaterial || material.userData.groundShadowPatched)return material;
    const NodeType=material.isMeshLambertMaterial?MeshLambertNodeMaterial:
      material.isMeshBasicMaterial?MeshBasicNodeMaterial:MeshStandardNodeMaterial;
    const nodeMaterial=new NodeType();
    nodeMaterial.copy(material);
    // NodeMaterial.copy(Material) copies common render state only. The source's
    // PBR/texturing properties must be forwarded explicitly.
    for(const key of ['color','map','emissive','emissiveIntensity','roughness','metalness',
      'normalMap','normalMapType','normalScale','bumpMap','bumpScale','roughnessMap',
      'metalnessMap','aoMap','aoMapIntensity','alphaMap','lightMap','lightMapIntensity',
      'envMap','envMapIntensity','wireframe','flatShading','specularMap','specular',
      'shininess','reflectivity','refractionRatio','displacementMap','displacementScale',
      'displacementBias']){
      if(!(key in material) || !(key in nodeMaterial))continue;
      const value=material[key];
      nodeMaterial[key]=value?.clone&&!value.isTexture?value.clone():value;
    }
    nodeMaterial.userData={...material.userData,groundShadowPatched:true};
    const uv=positionWorld.xz.div(this.span).add(vec2(.5));
    const inside=step(0,uv.x).mul(step(uv.x,1)).mul(step(0,uv.y)).mul(step(uv.y,1));
    const lightMask=this.sample.sample(clamp(uv,0,1)).r;
    const darkening=float(1).sub(this.strength.mul(float(1).sub(lightMask)).mul(inside));
    nodeMaterial.colorNode=materialColor.mul(darkening);
    return nodeMaterial;
  }
  dispose(){for(const tex of new Set(this.textures.values()))if(tex!==this.white)tex.dispose();this.white.dispose();}
}
