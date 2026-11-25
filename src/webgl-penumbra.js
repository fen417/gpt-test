import {setWebGlShaderPatch} from './webgl-shader-patches.js';
import {ShaderChunk} from 'three';
import {PCSS_SETTINGS as p} from './directional-penumbra.js';
import {StaticMaterialVisitor} from './render-work.js';

const softShadow=`
vec2 s09ShadowDisk(int i, float n, float turn) {
  float angle=float(i)*2.3999632+turn;
  return vec2(cos(angle),sin(angle))*sqrt((float(i)+.5)/n);
}

float s09DirectionalShadow(sampler2D shadowMap, vec2 size, float intensity, float bias, float spread, vec4 shadowCoord) {
  vec3 point=shadowCoord.xyz/shadowCoord.w;
  point.z+=bias;
  if(any(lessThan(point,vec3(0.)))||any(greaterThan(point,vec3(1.))))return 1.;
  vec2 texel=1./size;
  float turn=6.283185*fract(dot(floor(point.xy*size),vec2(.754877666,.569840296)));
  float blockers=0., average=0.;
  for(int i=0;i<${p.blockerTaps};i++){
    vec2 sampleUV=point.xy+s09ShadowDisk(i,${p.blockerTaps}.,turn)*texel*${p.searchRadius};
    float depth=unpackRGBAToDepth(texture2D(shadowMap,sampleUV));
    if(depth<point.z){average+=depth;blockers+=1.;}
  }
  float center=unpackRGBAToDepth(texture2D(shadowMap,point.xy));
  if(center<point.z){average+=center;blockers+=1.;}
  if(blockers==0.)return 1.;
  float penumbra=clamp((point.z-average/blockers)*spread,${p.minRadius},${p.maxRadius}.);
  float visibility=0.;
  for(int i=0;i<${p.filterTaps};i++){
    vec2 sampleUV=point.xy+s09ShadowDisk(i,${p.filterTaps}.,turn+1.1)*texel*penumbra;
    visibility+=texture2DCompare(shadowMap,sampleUV,point.z);
  }
  return mix(1.,visibility/${p.filterTaps}.,intensity);
}
`;

export class WebGlPenumbra {
  enabled=false;
  active=new Set();visitor=new StaticMaterialVisitor();

  setEnabled(enabled) {
    if(this.enabled===enabled)return;
    this.enabled=enabled;
    for(const material of this.active)setWebGlShaderPatch(material,'penumbra',null);
    this.active.clear();this.visitor.invalidate();
  }

  update(scene,root,revision) {
    if(!this.enabled)return;
    this.visitor.visit(scene,root,revision,object=>{
      if(!object.material)return;
      if(Array.isArray(object.material)){
        for(const material of object.material)this.bind(material);
      }else this.bind(object.material);
    });
  }

  bind(material) {
    if(!(material.isMeshStandardMaterial||material.isMeshLambertMaterial||material.isMeshPhongMaterial))return;
    if(this.active.has(material))return;
    this.active.add(material);
    setWebGlShaderPatch(material,'penumbra',shader=>{
      shader.fragmentShader=shader.fragmentShader
        .replace('#include <lights_fragment_begin>',ShaderChunk.lights_fragment_begin)
        .replace(/getShadow\(\s*directionalShadowMap\[/g,'s09DirectionalShadow( directionalShadowMap[')
        .replace('#include <shadowmap_pars_fragment>',
          ShaderChunk.shadowmap_pars_fragment.replace('float getShadow(',softShadow+'\nfloat getShadow('));
    });
  }
}
