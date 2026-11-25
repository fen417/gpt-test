import {heatDistortionGLSL} from './webgl-heat-distortion.js';
import {cameraEffectsGLSL} from './webgl-camera-effects.js';
import {volumeSunGLSL} from './volume-sun.js';
import {renderTimed} from './gpu-pass-timing.js';
import * as THREE from 'three';

const vertex = 'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
const reconstruct = `
uniform sampler2D sceneDepth;
uniform mat4 projection, inverseProjection;
uniform vec2 depthSize;
float readDepth(vec2 uv){return texture2D(sceneDepth,clamp(uv,vec2(0.),vec2(1.))).r;}
vec3 viewPosition(vec2 uv,float depth){
  vec4 p=inverseProjection*vec4(uv*2.-1.,depth*2.-1.,1.);
  return p.xyz/p.w;
}
vec2 depthCenter(vec2 uv){return (clamp(floor(uv*depthSize),vec2(0.),depthSize-1.)+.5)/depthSize;}
vec3 viewAt(vec2 uv){vec2 at=depthCenter(uv);return viewPosition(at,readDepth(at));}
bool offscreen(vec2 uv){return any(lessThanEqual(uv,vec2(0.)))||any(greaterThanEqual(uv,vec2(1.)));}
`;
const mask = (cascadeCount) => `
varying vec2 vUv;
uniform vec3 steps,sunView,upView;
uniform vec2 sunScreen;
uniform float atmosphereStrength,cameraY;
` + reconstruct + volumeSunGLSL(cascadeCount) + `
// Cosine-weighted integral between the two horizon angles of a view slice.
vec2 integrateHorizon(vec2 cosine) {
  cosine=clamp(cosine,vec2(-1.),vec2(1.));
  vec2 sine=sqrt(max(vec2(0.),1.-cosine*cosine));
  return .5*vec2(acos(cosine.y)-acos(cosine.x)+sine.x*cosine.x-sine.y*cosine.y,
    2.-dot(cosine,cosine));
}
float horizonOcclusion(vec3 pos,vec3 n,vec2 foot,float rotation) {
  vec3 view=normalize(-pos);
  float occlusion=0.;
  for(int i=0;i<3;i++){
    float angle=rotation+float(i)*1.04719755;
    vec2 axis=vec2(cos(angle),sin(angle));
    vec3 side=normalize(cross(vec3(axis,0.),view)), tangent=cross(view,side);
    vec3 planeNormal=normalize(n-side*dot(n,side)+.00001*view);
    vec2 localNormal=vec2(dot(planeNormal,tangent),dot(planeNormal,view));
    vec2 open=vec2(-localNormal.x,localNormal.x);
    vec2 horizons=open;
    for(int j=1;j<=4;j++){
      float t=(float(j)-.22)/4.;
      vec2 offset=axis*foot*(.09+.91*t*t);
      for(int signIndex=0;signIndex<2;signIndex++){
        float sign=signIndex==0?1.:-1.;
        vec2 at=vUv+sign*offset;
        if(offscreen(at))continue;
        vec3 delta=viewAt(at)-pos;
        float len=length(delta);
        float rise=dot(view,delta)/max(len,.001);
        float weight=smoothstep(.015,.07,len)*(1.-smoothstep(.22,.83,len));
        horizons[signIndex]=max(horizons[signIndex],mix(open[signIndex],rise,weight));
      }
    }
    float exposure=dot(localNormal,integrateHorizon(open));
    float visible=dot(localNormal,integrateHorizon(horizons));
    occlusion+=clamp((exposure-visible)/max(.22,exposure),0.,1.);
  }
  return min(.72,occlusion*.45);
}
void main(){
  vec2 center=depthCenter(vUv);
  float depth=readDepth(center);
  vec3 pos=viewPosition(center,depth);
  float range=-pos.z, ao=0., contact=0., shaft=0.;
  if(depth<.999999 && range<95. && (steps.x>0. || steps.y>0.)){
    vec2 dx=vec2(1./depthSize.x,0.), dy=vec2(0.,1./depthSize.y);
    vec3 left=pos-viewAt(center-dx), right=viewAt(center+dx)-pos;
    vec3 down=pos-viewAt(center-dy), top=viewAt(center+dy)-pos;
    vec3 n=normalize(cross(abs(left.z)<abs(right.z)?left:right,abs(down.z)<abs(top.z)?down:top));
    if(steps.x>0.){
      float radius=.83, sum=0.;
      vec2 footprint=vec2(projection[0][0],projection[1][1])*.5*radius/max(.1,range);
      float rotation=6.283185*fract(dot(floor(gl_FragCoord.xy),vec2(.75487766,.56984029)));
      if(steps.x>12.) ao=horizonOcclusion(pos,n,footprint,rotation);
      else for(int i=0;i<12;i++){
        if(float(i)>=steps.x)break;
        float angle=float(i)*2.399963+rotation;
        float spread=.18+.82*sqrt((float(i)+.5)/steps.x);
        vec2 at=vUv+vec2(cos(angle),sin(angle))*footprint*spread;
        if(offscreen(at))continue;
        vec3 d=viewAt(at)-pos;
        float distance=length(d);
        sum+=max(0.,dot(n,d)/max(.001,distance)-.12)*(1.-smoothstep(.07,radius,distance));
      }
      if(steps.x<=12.)ao=clamp(sum*2.6/steps.x,0.,.65);
      ao*=1.-smoothstep(27.,48.,range);
    }
    float sunFacing=dot(n,sunView);
    if(steps.y>0. && sunFacing>.08 && range<36.){
      float pixelWorld=2.*range/(projection[1][1]*depthSize.y);
      float bias=clamp(pixelWorld*1.2,.012,.06);
      vec3 origin=pos+n*bias;
      for(int i=0;i<12;i++){
        if(float(i)>=steps.y)break;
        float t=(float(i)+.5)/steps.y;
        float rayLength=.035+.88*t*t;
        vec3 ray=origin+sunView*rayLength;
        vec4 clip=projection*vec4(ray,1.);
        if(clip.w<=0.)break;
        vec2 at=clip.xy/clip.w*.5+.5;
        if(offscreen(at))break;
        vec3 surface=viewAt(at);
        // The ray must be behind a visible surface, and the surface must
        // rise above the receiver plane to avoid shadowing the receiver itself.
        float hit=surface.z-ray.z;
        float thickness=.045+.11*rayLength+min(pixelWorld,.045);
        float above=dot(surface-pos,n);
        float overlap=smoothstep(.003,max(.012,bias*.8),hit)*(1.-smoothstep(thickness*.6,thickness,hit));
        float blocker=smoothstep(bias*.8,bias*1.65,above);
        vec2 margin=min(at,1.-at);
        float edge=smoothstep(0.,.04,min(margin.x,margin.y));
        contact=max(contact,overlap*blocker*edge*(1.-smoothstep(.12,.91,rayLength)));
        if(contact>.96)break;
      }
      contact*=smoothstep(.08,.27,sunFacing)*(1.-smoothstep(18.,36.,range));
    }
  }
  if(steps.z>0. && atmosphereStrength>0.){
    vec3 direction=normalize(pos);
    float angular=pow(max(0.,dot(direction,sunView)),10.);
    float visible=0.;
    if(angular>.008 && sunView.z<-.07){
      for(int i=1;i<=12;i++){
        if(float(i)>steps.z)break;
        vec2 at=mix(vUv,sunScreen,float(i)/steps.z);
        if(!offscreen(at))visible+=smoothstep(.99999,.9999995,readDepth(at));
      }
    }
    float haze=0.;
    if(steps.z>1. ${cascadeCount ? '' : '&& depth<.999999'}){
      float stepSize=min(length(pos),${cascadeCount ? 'volumeSplits['+(cascadeCount-1)+']' : '130.'})/steps.z;
      float density=0.;
      float slope=dot(direction,upView);
      for(int i=0;i<12;i++){
        if(float(i)>=steps.z)break;
        float distance=stepSize*(float(i)+.5);
        float height=max(0.,cameraY+distance*slope);
        float light=${cascadeCount ? '.22+.78*volumeSun(direction*distance)' : '1.'};
        density+=light*exp(-height*.048)*stepSize;
      }
      haze=${cascadeCount ? '(.18+.33*angular)' : '.18'}*(1.-exp(-density*.012));
    }
    shaft=(haze+.52*angular*visible/steps.z)*atmosphereStrength;
  }
  gl_FragColor=vec4(ao,contact,shaft,range);
}`;

const bloom = (first) => `
varying vec2 vUv;
uniform sampler2D source;
uniform vec2 pixel;
vec3 tap(vec2 uv) {
  vec3 color=texture2D(source,uv).rgb;
  ${first ? 'float lum=max(color.r,max(color.g,color.b)); float knee=clamp(lum-1.1,0.,.7); float scale=max(lum-1.8,knee*knee/.7)/max(lum,.001); return min(color,vec3(12.))*scale;' : 'return color;'}
}
void main(){
  vec2 d=pixel*${first ? '1.35' : '.8'};
  vec3 result=tap(vUv)*.28;
  result+=.12*(tap(vUv+d*vec2(-1.,-1.))+tap(vUv+d*vec2(1.,-1.))+tap(vUv+d*vec2(-1.,1.))+tap(vUv+d));
  result+=.06*(tap(vUv+vec2(d.x,0.))+tap(vUv-vec2(d.x,0.))+tap(vUv+vec2(0.,d.y))+tap(vUv-vec2(0.,d.y)));
  gl_FragColor=vec4(result,1.);
}`;

const reflectors = (receivers) => `
uniform vec2 shore;
uniform vec3 upView,worldXView;
uniform float cameraY,cameraX,cameraZ,waterActive,receiverActive;
bool waterSurface(vec3 pos){
  return waterActive>0. && cameraX+dot(pos,worldXView)<shore.x-.12 && abs(cameraY+dot(pos,upView)-shore.y)<.075;
}
${receivers?`uniform sampler2D receiverMask;
vec4 reflectionReceiver(vec2 uv, float range){
  if(receiverActive<.5)return vec4(0.);
  vec4 receiver=texture2D(receiverMask,uv);
  float tolerance=.045+.005*receiver.a;
  float difference=range-receiver.a;
  if(receiver.a<=0.||receiver.a>75.||difference < -tolerance || (receiver.b>0.&&difference>tolerance))return vec4(0.);
  return receiver;
}`:`vec4 reflectionReceiver(vec2 uv,float range){return vec4(0.);}`}
`;

const reflection = (receivers) => `
varying vec2 vUv;
uniform sampler2D source;
uniform float reflectionSteps,time;
uniform vec2 waterPixel;
` + reconstruct + reflectors(receivers) + `
vec3 decodeReflectionNormal(vec2 oct){
  vec3 n=vec3(oct,1.-abs(oct.x)-abs(oct.y));
  n.xy+=mix(vec2(1.),vec2(-1.),step(vec2(0.),n.xy))*max(0.,-n.z);
  return normalize(n);
}
void main(){
  vec3 pos=viewAt(vUv);
  gl_FragColor=vec4(0.);
  vec4 receiver=reflectionReceiver(vUv,-pos.z);
  bool water=waterSurface(pos)||(receiver.b>-.15&&receiver.b<-.10);
  if(receiver.b<0.)pos*=receiver.a/max(.001,-pos.z);
  if(!water && receiver.b==0.)return;
  if(water&&-pos.z>145.)return;
  bool wet=receiver.b>1.;
  float roughness=water?.21:wet?mix(.38,.15,receiver.b-1.):abs(receiver.b);
  vec3 worldZView=cross(worldXView,upView);
  float wx=cameraX+dot(pos,worldXView),wz=dot(pos,worldZView)+cameraZ;
  float fadeWave=1.-smoothstep(28.,130.,-pos.z);
  vec3 wave=worldXView*(sin(wx*.71+wz*.37+time*1.5)*.038+sin(wx*2.2-wz*.9-time*2.1)*.018)
    +worldZView*(cos(wz*.81-wx*.46+time*1.2)*.04+sin(wz*2.3+wx*.77-time*1.8)*.012);
  vec3 normal=water?normalize(upView+wave*fadeWave):decodeReflectionNormal(receiver.rg);
  vec3 ray=reflect(normalize(pos),normal);
  float noV=max(0.,-dot(normalize(pos),normal));
  float fresnel=water?.0204+.9796*pow(1.-noV,5.):pow(1.-noV,3.);
  if(water&&(fresnel<.035 || dot(ray,upView)<=.001))return;
  float reach=water?85.:mix(48.,24.,roughness);
  float bias=water?.12:.045;
  float lastTravel=bias;
  for(int i=1;i<=32;i++){
    if(float(i)>reflectionSteps)break;
    float t=float(i)/reflectionSteps, travel=.15+(reach-1.)*t*t;
    vec3 point=pos+normal*bias+ray*travel;
    vec4 clip=projection*vec4(point,1.);
    if(clip.w<=0.)break;
    vec2 at=clip.xy/clip.w*.5+.5;
    if(offscreen(at))break;
    vec3 hit=viewAt(at);
    float delta=hit.z-point.z;
    if(delta>0. && delta<(water?1.3:.35)+travel*.084 && !waterSurface(hit) && (water?dot(hit-pos,upView)>.06:dot(hit-pos,normal)>.06)){
      float lo=lastTravel, hi=travel;
      for(int j=0;j<3;j++){
        float mid=(lo+hi)*.5;
        vec3 samplePoint=pos+normal*bias+ray*mid;
        vec4 p=projection*vec4(samplePoint,1.);
        at=p.xy/p.w*.5+.5;
        if(viewAt(at).z>samplePoint.z)hi=mid;else lo=mid;
      }
      vec2 margin=min(at,1.-at);
      vec3 refined=viewAt(at);
      if((water?dot(refined-pos,upView)<.04:dot(refined-pos,normal)<.045)||abs(refined.z-(pos+normal*bias+ray*hi).z)>(water?.8:.4)+travel*.044){
        lastTravel=travel;
        continue;
      }
      float fade=smoothstep(0.,.11,min(margin.x,margin.y))*(1.-smoothstep(reach*.58,reach,travel));
      vec2 blur=waterPixel*(.58+roughness*2.+travel*.023);
      vec3 color=texture2D(source,at).rgb*.5;
      color+=(texture2D(source,at+blur).rgb+texture2D(source,at-blur).rgb)*.25;
      fade*=1.-smoothstep(85.,145.,-pos.z);
      float gain=water?fresnel*.82:(.19+.57*fresnel)*(1.-roughness*.8);
      if(wet&&!water)gain*=receiver.b-1.;
      float opacity=fade*gain;
      gl_FragColor=vec4(color*opacity,opacity);
      return;
    }
    lastTravel=travel;
  }
}`;

function composite(depth, levels, reflections, cameraFX, hasHeat, receivers) {
  return `
varying vec2 vUv;
uniform sampler2D source;
${depth||reflections||cameraFX||hasHeat ? reconstruct : ''}
${reflections ? reflectors(receivers)+'uniform sampler2D reflection;' : ''}
${depth ? `
uniform sampler2D mask;
uniform vec2 effectPixel;
uniform vec3 fogColor;
${cameraFX?'':'uniform vec3 sunColor;'}
` : ''}
${levels ? 'uniform float bloomGain;' : ''}
${Array.from({length:levels}, (_, i) => 'uniform sampler2D bloom'+i+';').join('\n')}
${cameraFX?cameraEffectsGLSL:''}
${hasHeat?heatDistortionGLSL:''}
void main(){
  vec3 color=texture2D(source,vUv).rgb;
  ${cameraFX?'color=applyCameraEffects(vUv,color);':''}
  ${hasHeat?'color=distortHeat(vUv,color);':''}
  ${depth ? `
  float raw=readDepth(vUv);
  float distance=-viewPosition(vUv,raw).z;
  vec2 grid=vUv/effectPixel-.5, f=fract(grid), base=(floor(grid)+.5)*effectPixel;
  vec2 effects=vec2(0.);
  float weights=0., contact=0., contactWeights=0.;
  for(int i=0;i<4;i++){
    vec2 c=vec2(float(i%2),float(i/2));
    vec4 v=texture2D(mask,base+c*effectPixel);
    vec2 s=mix(1.-f,f,c);
    float depthWeight=exp(-abs(v.a-distance)/(.08+.021*distance));
    float w=s.x*s.y*depthWeight;
    float contactWeight=w*depthWeight*depthWeight*depthWeight;
    effects+=v.rb*w;
    weights+=w;
    contact+=v.g*contactWeight;
    contactWeights+=contactWeight;
  }
  effects/=max(.12,weights);
  color*=(1.-.43*effects.x)*(1.-.23*contact/max(.12,contactWeights));
  color+=effects.y*mix(fogColor,sunColor,.44)*.24;
  ` : ''}
  ${Array.from({length:levels}, (_, i) => 'color+=texture2D(bloom'+i+',vUv).rgb*bloomGain*'+([.62,.23,.10,.05][i].toFixed(2))+';').join('\n')}
  ${reflections ? `if(waterActive>0.||receiverActive>0.){
    vec3 position=viewAt(vUv);
    vec4 receiver=reflectionReceiver(vUv,-position.z);
    if(receiver.b>1.)color*=1.-.17*(receiver.b-1.);
    if(waterSurface(position)||receiver.b!=0.){
      vec4 reflected=texture2D(reflection,vUv);
      color=color*(1.-reflected.a)+reflected.rgb;
    }
  }` : ''}
  gl_FragColor=vec4(color,1.);
}`;
}

export function webGlWorldStages(post) {
  const { renderer, world, state } = post;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,3,-1,0,-1,3,0],3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,2,0,0,2],2));
  const scene=new THREE.Scene(), camera=new THREE.Camera();
  const mesh=new THREE.Mesh(geometry);
  scene.add(mesh);
  const materials=[];
  const stage = (fragmentShader, uniforms) => {
    const material=new THREE.ShaderMaterial({vertexShader:vertex, fragmentShader, uniforms, toneMapped:false, depthTest:false, depthWrite:false});
    materials.push(material);
    return material;
  };
  const uniforms = Object.fromEntries(Object.entries(state).map(([key,value])=>[key,{value}]));
  const masks = [];
  const receivers=Boolean(post.receiverMask);
  const receiverUniform={receiverMask:{value:post.receiverMask?.texture}};
  const reflected=post.reflection ? stage(reflection(receivers), {...uniforms,...receiverUniform,sceneDepth:{value:world.depthTexture},source:{value:world.texture}}) : null;
  const blurs = post.bloom.map((target,i) => stage(bloom(i===0), {
    source:{value:(i===0?world:post.bloom[i-1]).texture}, pixel:{value:new THREE.Vector2()},
  }));
  const output = stage(composite(Boolean(post.mask),blurs.length,Boolean(reflected),post.cameraFX,post.hasHeat,receivers), {
    ...uniforms, ...receiverUniform, source:{value:world.texture}, sceneDepth:{value:world.depthTexture}, mask:{value:post.mask?.texture},reflection:{value:post.reflection?.texture},
    ...Object.fromEntries(post.bloom.map((target,i)=>['bloom'+i,{value:target.texture}])),
  });
  function draw(target, material, profiler, pass) {
    mesh.material=material;
    renderer.setRenderTarget(target);
    renderTimed(renderer,scene,camera,profiler,pass);
  }
  return {
    render(target,profiler) {
      uniforms.atmosphereStrength.value=state.atmosphereStrength;
      uniforms.cameraY.value=state.cameraY;
      uniforms.bloomGain.value=state.bloomGain;
      uniforms.cameraX.value=state.cameraX;
      uniforms.cameraZ.value=state.cameraZ;
      uniforms.chromaticGain.value=state.chromaticGain;
      uniforms.time.value=state.time;
      uniforms.heatTime.value=state.heatTime;
      uniforms.reflectionSteps.value=state.reflectionSteps;
      uniforms.waterActive.value=state.waterActive;
      uniforms.receiverActive.value=state.receiverActive;
      if(reflected&&(state.waterActive||state.receiverActive))draw(post.reflection,reflected,profiler,'reflections');
      if(post.mask){
        const count=post.shadowMaps.length;
        const depth=masks[count]??=stage(mask(count),{...uniforms,sceneDepth:{value:world.depthTexture},
          ...Object.fromEntries(post.shadowMaps.map((map,i)=>['volumeMap'+i,{value:map}]))});
        for(let i=0;i<count;i++)depth.uniforms['volumeMap'+i].value=post.shadowMaps[i];
        draw(post.mask,depth,profiler,'depthEffects');
      }
      if(blurs.length){
        const timing=profiler?.beginPass('bloom');
        try{
          for(let i=0;i<blurs.length;i++){
            const src=i===0?world:post.bloom[i-1];
            blurs[i].uniforms.pixel.value.set(1/src.width,1/src.height);
            draw(post.bloom[i],blurs[i]);
          }
        }finally{if(timing)profiler.endPass();}
      }
      draw(target,output,profiler,'worldComposite');
    },
    dispose() { geometry.dispose(); for(const material of materials)material.dispose(); },
  };
}
