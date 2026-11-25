import {setWebGlShaderPatch} from './webgl-shader-patches.js';
const bindings=new WeakMap();
const shader=`
uniform sampler2D reliefMap;
uniform float reliefScale,reliefRange,reliefPackedAO;
uniform int reliefSteps;

vec2 reliefUv(vec2 baseUv, vec3 viewPosition, vec3 normal) {
  vec2 dx=dFdx(baseUv),dy=dFdy(baseUv);
  vec3 px=dFdx(viewPosition),py=dFdy(viewPosition);
  float determinant=dx.x*dy.y-dx.y*dy.x,dist=length(viewPosition);
  if(abs(determinant)<1.e-10||dist>=reliefRange)return baseUv;
  vec3 tangent=normalize(px*dy.y-py*dx.y)*sign(determinant);
  vec3 bitangent=normalize(py*dx.x-px*dy.x)*sign(determinant);
  vec3 view=normalize(-viewPosition);
  float facing=abs(dot(normal,view));
  if(facing<=.04)return baseUv;
  float strength=reliefScale*(1.-smoothstep(reliefRange*.60,reliefRange,dist))*smoothstep(.04,.19,facing);
  vec2 span=vec2(dot(view,tangent),dot(view,bitangent))*strength/max(.22,facing);
  if(reliefSteps==1)return baseUv-span*(.5-textureGrad(reliefMap,baseUv,dx,dy).r);
  float lod=clamp(1.-dist/reliefRange,0.,1.);
  int steps=int(clamp(floor(float(reliefSteps)*(.30+.70*lod)*(.58+.42*clamp(1.-facing,0.,1.))+.5),4.,float(reliefSteps)));
  float level=0.,stepSize=1./float(steps),previous=0.;
  vec2 coordinate=baseUv+span*.5,delta=span*stepSize;
  for(int i=0;i<=24;i++){
    float gap=1.-textureGrad(reliefMap,coordinate,dx,dy).r-level;
    if(gap<=0.){
      if(i==0)return coordinate;
      // Ultra refines the intersection twice, while lower modes interpolate.
      if(reliefSteps>16){
        vec2 lo=coordinate,hi=coordinate+delta;
        float loLevel=level,hiLevel=level-stepSize;
        for(int j=0;j<2;j++){
          vec2 mid=(lo+hi)*.5;float ml=(loLevel+hiLevel)*.5;
          if(1.-textureGrad(reliefMap,mid,dx,dy).r>ml){hi=mid;hiLevel=ml;}
          else{lo=mid;loLevel=ml;}
        }
        return (lo+hi)*.5;
      }
      return coordinate+delta*clamp(-gap/max(1.e-5,previous-gap),0.,1.);
    }
    if(i>=steps)break;
    previous=gap;coordinate-=delta;level+=stepSize;
  }
  return coordinate;
}
`;
export function setWebGlRelief(material,map,steps,scale,range=46){
  let binding=bindings.get(material);
  if(!map){if(binding){setWebGlShaderPatch(material,'relief',null);bindings.delete(material);}return;}
  const packedAO=Boolean(material.aoMap&&material.aoMap===material.roughnessMap);

  if(!binding){
    binding={reliefPackedAO:{value:Number(packedAO)},reliefMap:{value:map},reliefSteps:{value:steps},reliefScale:{value:scale},reliefRange:{value:range}};
    bindings.set(material,binding);
    setWebGlShaderPatch(material,'relief',source=>{
      Object.assign(source.uniforms,{reliefMap:binding.reliefMap,reliefSteps:binding.reliefSteps,reliefScale:binding.reliefScale,reliefRange:binding.reliefRange,reliefPackedAO:binding.reliefPackedAO});
      source.fragmentShader=source.fragmentShader.replace('void main() {',shader+'\nvoid main() {')
        .replace('#include <map_fragment>',`
          #if defined(USE_MAP) && !defined(FLAT_SHADED)
            vec2 s09ReliefUV=reliefUv(vMapUv,-vViewPosition,normalize(vNormal));
            #define vMapUv s09ReliefUV
            #define vNormalMapUv s09ReliefUV
            #define vRoughnessMapUv s09ReliefUV
            #define vMetalnessMapUv s09ReliefUV
            #ifdef USE_AOMAP
              vec2 s09ReliefAO=mix(vAoMapUv,s09ReliefUV,reliefPackedAO);
              #define vAoMapUv s09ReliefAO
            #endif
          #endif
          #include <map_fragment>
        `);
    });
  }
  binding.reliefMap.value=map;binding.reliefSteps.value=steps;binding.reliefScale.value=scale;binding.reliefRange.value=range;binding.reliefPackedAO.value=Number(packedAO);
}
