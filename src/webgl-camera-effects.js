export const cameraEffectsGLSL=`
uniform vec3 cameraEffects;
uniform float chromaticGain;
uniform vec2 sunScreen;
uniform vec3 sunView,sunColor;
uniform mat4 previousClipFromView;
float screenEdge(vec2 uv){
  vec2 edge=min(uv,1.-uv);
  return smoothstep(.0,.10,min(edge.x,edge.y));
}
vec3 applyCameraEffects(vec2 uv,vec3 color){
  float raw=readDepth(uv);
  vec3 pos=viewPosition(uv,raw);
  vec2 pixel=1./depthSize;
  vec2 edge=uv-.5;
  if(cameraEffects.x>0.){
    vec4 previous=previousClipFromView*vec4(pos,1.);
    if(previous.w>.01){
      vec2 history=previous.xy/previous.w*.5+.5;
      vec2 motion=(history-uv)*cameraEffects.x;
      motion*=min(1.,.010/max(length(motion),.00001));
      vec3 sum=color*2.;
      float weight=2.;
      for(int i=1;i<=4;i++){
        vec2 sampleUV=uv+motion*(float(i)*.25);
        float gap=abs(viewAt(sampleUV).z-pos.z);
        float w=1.-smoothstep(.4,1.5+abs(pos.z)*.06,gap);
        sum+=texture2D(source,sampleUV).rgb*w;
        weight+=w;
      }
      color=sum/weight;
    }
  }
  if(cameraEffects.y>0. && raw<.999999){
    float focus=clamp(-viewAt(vec2(.5)).z,2.5,64.);
    float radius=min(5.,abs(pos.z+focus)/max(2.5,-pos.z)*2.7);
    vec3 sum=color*2.;
    float weight=2.;
    for(int i=0;i<6;i++){
      float a=float(i)*1.04719755;
      vec2 at=uv+vec2(cos(a),sin(a))*radius*pixel;
      float depth=-viewAt(at).z;
      float w=1.-smoothstep(1.,4.+depth*.18,abs(depth+pos.z));
      sum+=texture2D(source,at).rgb*w;
      weight+=w;
    }
    color=mix(color,sum/weight,smoothstep(.6,2.3,radius));
  }
  if(chromaticGain>0.){
    vec2 separation=edge*dot(edge,edge)*pixel*8.*chromaticGain;
    color.r=mix(color.r,texture2D(source,uv+separation).r,.67);
    color.b=mix(color.b,texture2D(source,uv-separation).b,.67);
  }
  if(cameraEffects.z>0.&&sunView.z<-.10){
    float visible=0.;
    for(int i=0;i<4;i++){
      vec2 offset=vec2(i%2==0?-.002:.002,i/2==0?-.003:.003);
      visible+=step(.999999,readDepth(sunScreen+offset))*.25;
    }
    float glare=exp(-length((uv-sunScreen)*vec2(1.78,1.))*26.)*.60;
    vec2 axis=.5-sunScreen;
    float ghost=exp(-pow(length((uv-sunScreen-axis*1.55)*vec2(1.78,1.))/.047,2.))*.11;
    color+=sunColor*(glare+ghost)*visible*screenEdge(sunScreen)*cameraEffects.z;
  }
  return color;
}
`;
