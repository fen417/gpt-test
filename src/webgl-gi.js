import {setWebGlShaderPatch} from './webgl-shader-patches.js';
const bindings=new WeakMap();
const code=`
varying vec3 s09GIPosition;
uniform sampler2D s09GIAtlas;
uniform vec4 s09GIBounds,s09GIGrid;
uniform vec3 s09GITint;
uniform float s09GIStrength,s09GIQuality;
vec4 s09GISample(vec2 cell,float layer){
  vec2 uv=(cell+vec2(mod(layer,4.),floor(layer*.25)))/vec2(4.,2.);
  return texture2D(s09GIAtlas,uv);
}
// Hardware bilinear filtering is limited to visible neighbour cells.
vec4 s09ConnectedSample(vec2 cell,vec2 anchor,float layer){
  vec4 links=s09GISample(anchor,4.+layer);
  vec2 delta=(cell-anchor)*s09GIGrid.xy;
  vec2 allow=mix(links.rb,links.ga,step(vec2(0.),delta));
  return s09GISample(anchor+delta*allow/s09GIGrid.xy,layer);
}
vec4 s09GI(vec3 p){
  vec2 uv=(p.xz-s09GIBounds.xy)/s09GIBounds.zw;
  vec2 edge=.5/s09GIGrid.xy;
  vec2 cell=clamp(uv,edge,1.-edge);
  vec2 anchor=(floor(cell*s09GIGrid.xy)+.5)/s09GIGrid.xy;
  vec2 h=s09GISample(cell,3.).rg;
  float altitude=p.y-s09GIGrid.z-(h.r*65280.+h.g*255.)/65535.*s09GIGrid.w;
  float level=altitude<3.2?clamp((altitude-.65)/2.55,0.,1.):1.+clamp((altitude-3.2)/5.3,0.,1.);
  vec4 result;
  if(s09GIQuality<1.5)result=s09ConnectedSample(cell,anchor,floor(level+.5));
  else{
    float lower=floor(level),upper=min(2.,lower+1.),t=fract(level);
    vec2 vertical=s09GISample(anchor,7.).rg;
    float connected=mix(vertical.r,vertical.g,step(1.,lower));
    t=mix(step(.5,t),t,connected);
    result=mix(s09ConnectedSample(cell,anchor,lower),s09ConnectedSample(cell,anchor,upper),t);
  }
  float fade=(1.-smoothstep(9.,17.,altitude))*step(0.,uv.x)*step(0.,uv.y)*step(uv.x,1.)*step(uv.y,1.);
  return mix(vec4(0.,0.,0.,1.),result,fade);
}`;
export function setWebGlGI(material,field){
  const old=bindings.get(material);
  if(!field){if(old){setWebGlShaderPatch(material,'gi',null);bindings.delete(material);}return;}
  if(old===field)return;
  bindings.set(material,field);
  const baked=material.userData?.architectureLightmap&&material.lightMap;
  setWebGlShaderPatch(material,'gi',shader=>{
    Object.assign(shader.uniforms,{s09GIAtlas:{value:field.texture},s09GIBounds:{value:field.bounds},s09GIGrid:{value:field.grid},s09GITint:{value:field.sunTint},s09GIStrength:field.strength,s09GIQuality:field.quality});
    shader.vertexShader='varying vec3 s09GIPosition;\n'+shader.vertexShader.replace('#include <project_vertex>',`
      vec4 s09GILocal=vec4(transformed,1.);
      #ifdef USE_BATCHING
        s09GILocal=batchingMatrix*s09GILocal;
      #endif
      #ifdef USE_INSTANCING
        s09GILocal=instanceMatrix*s09GILocal;
      #endif
      s09GIPosition=(modelMatrix*s09GILocal).xyz;
      #include <project_vertex>
    `);
    // Only the indirect diffuse lobe is changed. Direct sunlight, dynamic
    // lights, specular, and authored emissive remain independent.
    if(baked)shader.uniforms.s09GIAtlasNeutralUV={value:1/material.lightMap.image.width};
    shader.fragmentShader=code+(baked?'\nuniform float s09GIAtlasNeutralUV;':'')+'\n'+shader.fragmentShader.replace('#include <aomap_fragment>',`
      vec4 s09Probe=s09GI(s09GIPosition);
      float s09Strength=clamp(s09GIStrength,0.,1.2);
      ${baked?'#ifdef USE_LIGHTMAP\n      s09Strength*=1.-step(s09GIAtlasNeutralUV,max(vLightMapUv.x,vLightMapUv.y));\n      #endif':''}
      reflectedLight.indirectDiffuse*=1.-(1.-s09Probe.a)*.46*min(1.,s09Strength);
      #ifdef STANDARD
        reflectedLight.indirectDiffuse+=diffuseColor.rgb*(1.-metalnessFactor)*s09Probe.rgb*s09GITint*s09Strength;
      #else
        reflectedLight.indirectDiffuse+=diffuseColor.rgb*s09Probe.rgb*s09GITint*s09Strength;
      #endif
      #include <aomap_fragment>
    `);
  });
}
