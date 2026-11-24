import {wgslFn} from 'three/tsl';

export function makeHeatDistortionWGSL(viewAt){
  return wgslFn(`
fn s09HeatDistortion(at: vec2f, color: vec3f, source: texture_2d<f32>, sourceSampler: sampler,
  sceneDepth: texture_depth_2d, depthSize: vec2f, inverseProjection: mat4x4f,
  heatSources: mat4x4f, heatStrength: vec4f, heatTime: f32) -> vec3f{
  if(dot(heatStrength,vec4f(1.))<=0.){return color;}
  let aspect=depthSize.x/depthSize.y;
  var distortion=vec2f(0.);
  let depth=-worldViewAt(sceneDepth,inverseProjection,at,depthSize).z;
  for(var i=0;i<4;i++){
    if(heatStrength[i]<=0.){continue;}
    let heat=heatSources[i];
    if(depth<heat.w-.55){continue;}
    let p=(at-heat.xy)*vec2f(aspect,-1.)/heat.z;
    let envelope=1.-smoothstep(.16,1.,length(p));
    if(envelope<=0.){continue;}
    distortion+=vec2f(sin(p.y*26.-heatTime*24.+p.x*6.),-cos(p.y*19.-heatTime*17.+p.x*12.))*envelope*heatStrength[i];
  }
  if(dot(distortion,distortion)<.00001){return color;}
  let destination=at+clamp(distortion,vec2f(-1.),vec2f(1.))*4.5/depthSize;
  if(abs(worldViewAt(sceneDepth,inverseProjection,destination,depthSize).z+depth)>2.+depth*.035){return color;}
  return textureSampleLevel(source,sourceSampler,destination,0.).rgb;
}`,[viewAt]);
}
