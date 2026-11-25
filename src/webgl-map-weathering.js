import {setWebGlShaderPatch} from './webgl-shader-patches.js';
const bindings=new WeakMap();
const fragment=`
varying vec3 s09WeatherPosition;
uniform sampler2D s09WeatherMask;
uniform vec4 s09WeatherParams;
uniform float s09WeatherHigh;
vec3 s09WeatherFactor(vec3 p){
  vec2 wide=(p.xz+p.y*vec2(.53,.91))*.023;
  vec4 macro=texture2D(s09WeatherMask,wide);
  float variation=(macro.r-.5)*s09WeatherParams.x;
  float dirt=smoothstep(.47,.78,macro.g)*s09WeatherParams.y;
  float crack=0.;
  if(s09WeatherHigh>.5){
    vec3 n=abs(cross(dFdx(p),dFdy(p)));
    vec2 projected=n.y>=max(n.x,n.z)?p.xz:(n.x>n.z?p.zy:p.xy);
    vec4 local=texture2D(s09WeatherMask,projected*vec2(.18,.12)+wide*.17);
    float vertical=1.-step(max(n.x,n.z),n.y);
    dirt+=smoothstep(.51,.79,local.g)*s09WeatherParams.y*(.32+.28*vertical);
    crack=local.b*s09WeatherParams.z*(1.-smoothstep(18.,55.,distance(cameraPosition,p)));
  }
  float shade=clamp(1.+variation-dirt-crack,.57,1.22);
  return vec3(shade)*(1.+vec3(.65,.15,-.8)*s09WeatherParams.w*(.5+macro.r));
}
`;
export function setWebGlWeathering(material,mask,params){
  let b=bindings.get(material);
  if(!mask||!params){if(b){setWebGlShaderPatch(material,'weathering',null);bindings.delete(material);}return;}
  if(!b){
    b={s09WeatherMask:{value:mask},s09WeatherParams:{value:params.slice(0,4)},s09WeatherHigh:{value:params[4]}};
    bindings.set(material,b);
    setWebGlShaderPatch(material,'weathering',shader=>{
      Object.assign(shader.uniforms,b);
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
      shader.fragmentShader=fragment+shader.fragmentShader.replace('#include <color_fragment>',
        '#include <color_fragment>\ndiffuseColor.rgb*=s09WeatherFactor(s09WeatherPosition);');
    });
  }
  b.s09WeatherMask.value=mask;b.s09WeatherParams.value=params.slice(0,4);b.s09WeatherHigh.value=params[4];
}
