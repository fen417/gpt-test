import {setWebGlShaderPatch} from './webgl-shader-patches.js';
const bindings=new WeakMap();
const fragment=`
varying vec3 s09WeatherPosition;
uniform sampler2D s09WeatherMask;
uniform vec4 s09WeatherParams;
uniform float s09WeatherHigh;
uniform vec4 s09WeatherArt;
uniform float s09WeatherRoughness;
uniform vec3 s09DustTint,s09ChipTint,s09OxideTint;
float s09WearRoughness=0.;
vec3 s09WeatherFactor(vec3 p){
  vec2 wide=(p.xz+p.y*vec2(.53,.91))*.023;
  vec4 macro=texture2D(s09WeatherMask,wide);
  float variation=(macro.r-.5)*s09WeatherParams.x;
  float dirt=smoothstep(.47,.78,macro.g)*s09WeatherParams.y;
  float crack=0.;
  vec3 n=abs(cross(dFdx(p),dFdy(p)));
  float vertical=step(n.y,max(n.x,n.z));
  float dust=smoothstep(.40,.76,macro.g)*s09WeatherArt.w*(1.-vertical*.55)*.34;
  float chips=0.,oxide=0.,streak=0.;
  if(s09WeatherHigh>.5){
    vec2 projected=n.y>=max(n.x,n.z)?p.xz:(n.x>n.z?p.zy:p.xy);
    vec4 local=texture2D(s09WeatherMask,projected*vec2(.18,.12)+wide*.17);
    float nearDetail=1.-smoothstep(18.,55.,distance(cameraPosition,p));
    dirt+=smoothstep(.51,.79,local.g)*s09WeatherParams.y*(.32+.28*vertical);
    crack=local.b*s09WeatherParams.z*nearDetail;
    // Vertical runoff samples a stretched field; floor wear is isotropic.
    vec2 detailUV=projected*mix(vec2(.81,.81),vec2(.62,.38),vertical)+wide*.23;
    vec4 detail=texture2D(s09WeatherMask,detailUV);
    streak=smoothstep(.46,.73,detail.a)*smoothstep(.62,.84,macro.g)*s09WeatherArt.x*vertical*nearDetail*.14;
    chips=smoothstep(.61,.84,local.g+detail.b*.35)*s09WeatherArt.y*nearDetail*.34;
    oxide=smoothstep(.45,.72,local.g+detail.a*.23)*s09WeatherArt.z*nearDetail*.62;
    dust+=smoothstep(.40,.73,local.r)*s09WeatherArt.w*(1.-vertical*.65)*nearDetail*.24;
  }
  float shade=clamp(1.+variation-dirt-crack-streak,.72,1.22);
  s09WearRoughness=(dust+oxide+streak+chips*.35)*s09WeatherRoughness;
  vec3 tint=vec3(shade)*(1.+vec3(.65,.15,-.8)*s09WeatherParams.w*(.5+macro.r));
  return tint*mix(vec3(1.),s09DustTint,clamp(dust,0.,.7))*mix(vec3(1.),s09ChipTint,chips)*mix(vec3(1.),s09OxideTint,oxide);
}
`;
const roadFragment=`
uniform sampler2D s09WeatherRoadMask;
uniform float s09WeatherRoadSpan;
uniform float s09WeatherRoadStrength;
float s09RoadWear(vec3 p){
  vec2 uv=p.xz*vec2(1.,-1.)/s09WeatherRoadSpan+.5;
  float road=texture2D(s09WeatherRoadMask,uv).g;
  float shoulder=4.*road*(1.-road);
  float noise=texture2D(s09WeatherMask,p.xz*.18).r;
  return 1.+s09WeatherRoadStrength*(shoulder*(noise-.32)*.26-road*smoothstep(.55,.84,noise)*.09);
}
`;
export function setWebGlWeathering(material,mask,params){
  let b=bindings.get(material);
  if(!mask||!params){if(b){setWebGlShaderPatch(material,'weathering',null);bindings.delete(material);}return;}
  const road=material.roadMask&&material.userData.villageRoadSpan;
  if(b&&b.road!==Boolean(road)){setWebGlShaderPatch(material,'weathering',null);bindings.delete(material);b=null;}
  const art=params.slice(5,10),dust=params.slice(10,13),chip=params.slice(13,16),oxide=params.slice(16,19);
  if(!b){
    b={road:Boolean(road),values:{
      s09WeatherMask:{value:mask},s09WeatherParams:{value:params.slice(0,4)},s09WeatherHigh:{value:params[4]},
      s09WeatherArt:{value:art.slice(0,4)},s09WeatherRoughness:{value:art[4]},
      s09DustTint:{value:dust},s09ChipTint:{value:chip},s09OxideTint:{value:oxide},
      ...(road?{s09WeatherRoadMask:{value:material.roadMask},s09WeatherRoadSpan:{value:road},s09WeatherRoadStrength:{value:params[4]}}:{})
    }};
    bindings.set(material,b);
    setWebGlShaderPatch(material,'weathering',shader=>{
      Object.assign(shader.uniforms,b.values);
      shader.vertexShader='varying vec3 s09WeatherPosition;\n'+shader.vertexShader.replace('#include <project_vertex>',`
        vec4 s09WeatherLocal=vec4(transformed,1.);
        #ifdef USE_BATCHING
          s09WeatherLocal=batchingMatrix*s09WeatherLocal;
        #endif
        #ifdef USE_INSTANCING
          s09WeatherLocal=instanceMatrix*s09WeatherLocal;
        #endif
        s09WeatherPosition=(modelMatrix*s09WeatherLocal).xyz;
        #include <project_vertex>
      `);
      shader.fragmentShader=fragment+(b.road?roadFragment:'')+shader.fragmentShader.replace('#include <color_fragment>',
        '#include <color_fragment>\ndiffuseColor.rgb*=s09WeatherFactor(s09WeatherPosition);'+(b.road?'\nif(s09WeatherHigh>.5)diffuseColor.rgb*=s09RoadWear(s09WeatherPosition);':''));
      if(material.isMeshStandardMaterial)shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=clamp(roughnessFactor+s09WearRoughness,.04,1.);');
    });
  }
  Object.assign(b.values.s09WeatherMask,{value:mask});
  b.values.s09WeatherParams.value=params.slice(0,4);b.values.s09WeatherHigh.value=params[4];
  b.values.s09WeatherArt.value=art.slice(0,4);b.values.s09WeatherRoughness.value=art[4];
  b.values.s09DustTint.value=dust;b.values.s09ChipTint.value=chip;b.values.s09OxideTint.value=oxide;
  if(road){b.values.s09WeatherRoadMask.value=material.roadMask;b.values.s09WeatherRoadSpan.value=road;b.values.s09WeatherRoadStrength.value=params[4];}
}
