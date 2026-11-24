import {setWebGlShaderPatch} from './webgl-shader-patches.js';

const bindings=new WeakMap();

const shader=`
uniform sampler2D reliefMap;
uniform float reliefScale;
uniform int reliefSteps;

vec2 reliefUv(vec2 baseUv, vec3 viewPosition, vec3 normal) {
  vec2 dx=dFdx(baseUv), dy=dFdy(baseUv);
  vec3 px=dFdx(viewPosition), py=dFdy(viewPosition);
  float determinant=dx.x*dy.y-dx.y*dy.x;
  if(abs(determinant)<1.e-10 || abs(viewPosition.z)>46.)return baseUv;
  vec3 tangent=normalize(px*dy.y-py*dx.y)*sign(determinant);
  vec3 bitangent=normalize(py*dx.x-px*dy.x)*sign(determinant);
  vec3 view=normalize(-viewPosition);
  float facing=abs(dot(normal,view));
  float strength=reliefScale*(1.-smoothstep(28.,46.,abs(viewPosition.z)))*smoothstep(.04,.19,facing);
  vec2 span=vec2(dot(view,tangent),dot(view,bitangent))*strength/max(.22,facing);
  if(reliefSteps==1){
    return baseUv-span*(.5-textureGrad(reliefMap,baseUv,dx,dy).r);
  }
  float level=0., stepSize=1./float(reliefSteps);
  float previous=0.;
  vec2 coordinate=baseUv+span*.5;
  vec2 delta=span*stepSize;
  for(int i=0;i<=16;i++){
    float surface=1.-textureGrad(reliefMap,coordinate,dx,dy).r;
    float gap=surface-level;
    if(gap<=0.)return coordinate+delta*clamp(-gap/max(1.e-5,previous-gap),0.,1.);
    if(i>=reliefSteps)break;
    previous=gap;
    coordinate-=delta;
    level+=stepSize;
  }
  return coordinate;
}
`;

export function setWebGlRelief(material,map,steps,scale) {
  let binding=bindings.get(material);
  if(!map){
    if(binding){
      setWebGlShaderPatch(material,'relief',null);
      bindings.delete(material);
    }
    return;
  }
  if(!binding){
    binding={reliefMap:{value:map},reliefSteps:{value:steps},reliefScale:{value:scale}};
    bindings.set(material,binding);
    setWebGlShaderPatch(material,'relief',source=>{
      Object.assign(source.uniforms,binding);
      source.fragmentShader=source.fragmentShader
        .replace('void main() {',shader+'\nvoid main() {')
        .replace('#include <map_fragment>',`
          #if defined(USE_MAP) && !defined(FLAT_SHADED)
            vec2 s09ReliefUV=reliefUv(vMapUv,-vViewPosition,normalize(vNormal));
            #define vMapUv s09ReliefUV
            #define vNormalMapUv s09ReliefUV
            #define vRoughnessMapUv s09ReliefUV
            #define vAoMapUv s09ReliefUV
          #endif
          #include <map_fragment>
        `);
    });
  }
  binding.reliefMap.value=map;
  binding.reliefSteps.value=steps;
  binding.reliefScale.value=scale;
}
