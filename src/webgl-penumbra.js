import {setWebGlShaderPatch} from './webgl-shader-patches.js';
import {ShaderChunk} from 'three';
import {PCSS_SETTINGS as p} from './directional-penumbra.js';
import {StaticMaterialVisitor} from './render-work.js';

const diskPoints=(n,turn,vec)=>Array.from({length:n},(_,i)=>{const a=i*2.3999632+turn,r=Math.sqrt((i+.5)/n);return vec+'('+ (Math.cos(a)*r).toFixed(8)+','+(Math.sin(a)*r).toFixed(8)+')';}).join(',');
const softShadow=`

float s09DirectionalShadow(sampler2D shadowMap, vec2 size, float intensity, float bias, float spread, vec4 shadowCoord) {
  vec3 point=shadowCoord.xyz/shadowCoord.w;
  point.z+=bias;
  vec2 texel=1./size;
  // Stable disk rotation avoids the checkerboard pattern caused by
  // changing the entire kernel at every shadow texel.
  const vec2 searchDisk[${p.blockerTaps}]=vec2[${p.blockerTaps}](${diskPoints(p.blockerTaps,.73,'vec2')});
  const vec2 filterDisk[${p.filterTaps}]=vec2[${p.filterTaps}](${diskPoints(p.filterTaps,1.83,'vec2')});
  const vec2 smallDisk[8]=vec2[8](${diskPoints(8,1.83,'vec2')});
  float depthPerTexel=.024/max(spread,.01);
  // Receiver-plane correction for each sample. A sloping lit face must not
  // compare every neighbouring depth against the centre's depth.
  vec3 sx=dFdx(point),sy=dFdy(point);
  float det=sx.x*sy.y-sx.y*sy.x;
  vec2 gradient=abs(det)>1.e-10?vec2(sy.y*sx.z-sx.y*sy.z,sx.x*sy.z-sy.x*sx.z)/det:vec2(0.);
  vec2 slope=clamp(gradient*texel,vec2(-2.5*depthPerTexel),vec2(2.5*depthPerTexel));
  if(any(lessThan(point,vec3(0.)))||any(greaterThan(point,vec3(1.))))return 1.;
  float blockers=0., average=0.;
  for(int i=0;i<${p.blockerTaps};i++){
    vec2 offset=searchDisk[i]*${p.searchRadius};
    vec2 sampleUV=point.xy+offset*texel;
    float depth=unpackRGBAToDepth(texture2D(shadowMap,sampleUV))-dot(slope,offset);
    if(depth<point.z-.45*depthPerTexel){average+=depth;blockers+=1.;}
  }
  float center=unpackRGBAToDepth(texture2D(shadowMap,point.xy));
  if(center<point.z-.45*depthPerTexel){average+=center;blockers+=1.;}
  if(blockers==0.)return 1.;
  float penumbra=clamp((point.z-average/blockers)*spread,${p.minRadius},${p.maxRadius}.);
  float visibility=0.;
  if(penumbra<=1.35){
    for(int i=0;i<8;i++){
      vec2 offset=smallDisk[i]*penumbra;
      visibility+=texture2DCompare(shadowMap,point.xy+offset*texel,point.z+dot(slope,offset)-.28*depthPerTexel);
    }
    return mix(1.,visibility/8.,intensity);
  }
  for(int i=0;i<${p.filterTaps};i++){
    vec2 offset=filterDisk[i]*penumbra;
    vec2 sampleUV=point.xy+offset*texel;
    visibility+=texture2DCompare(shadowMap,sampleUV,point.z+dot(slope,offset)-.28*depthPerTexel);
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

  forgetMaterial(material){if(this.active.delete(material))setWebGlShaderPatch(material,'penumbra',null);}
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
