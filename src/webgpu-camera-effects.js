import {wgslFn} from 'three/tsl';

export function makeCameraEffectsWGSL(viewAt,readDepth) {
  return wgslFn(`
fn s09CameraEffects(at: vec2f, original: vec3f, source: texture_2d<f32>, sourceSampler: sampler,
  sceneDepth: texture_depth_2d, depthSize: vec2f, inverseProjection: mat4x4f,
  previousClipFromView: mat4x4f, cameraEffects: vec3f, chromaticGain: f32,
  sunScreen: vec2f, sunView: vec3f, sunColor: vec3f) -> vec3f {
  var color=original;
  let raw=worldReadDepth(sceneDepth,at,depthSize);
  let pos=worldViewAt(sceneDepth,inverseProjection,at,depthSize);
  let pixel=1./depthSize;
  let edge=at-.5;
  if(cameraEffects.x>0.){
    let previous=previousClipFromView*vec4f(pos,1.);
    if(previous.w>.01){
      let history=previous.xy/previous.w*vec2f(.5,-.5)+.5;
      var motion=(history-at)*cameraEffects.x;
      motion*=min(1.,.010/max(length(motion),.00001));
      var sum=color*2.;
      var weight=2.;
      for(var i=1;i<=4;i++){
        let sampleAt=at+motion*(f32(i)*.25);
        let gap=abs(worldViewAt(sceneDepth,inverseProjection,sampleAt,depthSize).z-pos.z);
        let w=1.-smoothstep(.4,1.5+abs(pos.z)*.06,gap);
        sum+=textureSampleLevel(source,sourceSampler,sampleAt,0.).rgb*w;
        weight+=w;
      }
      color=sum/weight;
    }
  }
  if(cameraEffects.y>0.&&raw<.999999){
    let focus=clamp(-worldViewAt(sceneDepth,inverseProjection,vec2f(.5),depthSize).z,2.5,64.);
    let radius=min(5.,abs(pos.z+focus)/max(2.5,-pos.z)*2.7);
    var sum=color*2.;
    var weight=2.;
    for(var i=0;i<6;i++){
      let angle=f32(i)*1.04719755;
      let sampleAt=at+vec2f(cos(angle),sin(angle))*radius*pixel;
      let depth=-worldViewAt(sceneDepth,inverseProjection,sampleAt,depthSize).z;
      let w=1.-smoothstep(1.,4.+depth*.18,abs(depth+pos.z));
      sum+=textureSampleLevel(source,sourceSampler,sampleAt,0.).rgb*w;
      weight+=w;
    }
    color=mix(color,sum/weight,smoothstep(.6,2.3,radius));
  }
  if(chromaticGain>0.){
    let separation=edge*dot(edge,edge)*pixel*8.*chromaticGain;
    color.r=mix(color.r,textureSampleLevel(source,sourceSampler,at+separation,0.).r,.67);
    color.b=mix(color.b,textureSampleLevel(source,sourceSampler,at-separation,0.).b,.67);
  }
  if(cameraEffects.z>0.&&sunView.z<-.10){
    var visible=0.;
    for(var i=0;i<4;i++){
      let offset=vec2f(select(.002,-.002,i%2==0),select(.003,-.003,i/2==0));
      visible+=step(.999999,worldReadDepth(sceneDepth,sunScreen+offset,depthSize))*.25;
    }
    let glare=exp(-length((at-sunScreen)*vec2f(1.78,1.))*26.)*.60;
    let axis=.5-sunScreen;
    let ghost=exp(-pow(length((at-sunScreen-axis*1.55)*vec2f(1.78,1.))/.047,2.))*.11;
    let margin=min(sunScreen,1.-sunScreen);
    color+=sunColor*(glare+ghost)*visible*smoothstep(0.,.10,min(margin.x,margin.y))*cameraEffects.z;
  }
  return color;
}`,[viewAt,readDepth]);
}
