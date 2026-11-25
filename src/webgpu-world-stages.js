import {makeHeatDistortionWGSL} from './webgpu-heat-distortion.js';
import {makeCameraEffectsWGSL} from './webgpu-camera-effects.js';
import {volumeSunWGSL} from './volume-sun.js';
import {renderTimed} from './gpu-pass-timing.js';
import {puddleField} from './reflection-receivers.js';
import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { texture, uv, uniform, wgslFn, vec2, vec4, normalViewGeometry, positionView, positionWorld, faceDirection } from 'three/tsl';

const encodeReceiver=wgslFn(`
fn encodeReflectionReceiver(normal:vec3f, point:vec3f, range:f32, roughness:f32) -> vec4f {
  var kind=roughness;
  if(kind==1.){${puddleField('wgsl','point.xz','vec2f')} if(coverage<.04){discard;} kind=1.+coverage;}
  let n=normal/(abs(normal.x)+abs(normal.y)+abs(normal.z));
  let oct=select((1.-abs(n.yx))*select(vec2f(-1.),vec2f(1.),n.xy>=vec2f(0.)),n.xy,n.z>=0.);
  return vec4f(oct,kind,range);
}`);

export function makeGpuReflectionReceiver(roughness,side){
  const material=new MeshBasicNodeMaterial({side,toneMapped:false,fog:false});
  material.fragmentNode=encodeReceiver({normal:normalViewGeometry.mul(faceDirection),point:positionWorld,
    range:positionView.z.negate(),roughness:uniform(roughness)});
  return material;
}

const readDepth = wgslFn(`
fn worldReadDepth(sceneDepth: texture_depth_2d, at: vec2f, size: vec2f) -> f32 {
  let coord = vec2i(clamp(at * size, vec2f(0), size - 1.));
  return textureLoad(sceneDepth, coord, 0);
}`);
const viewPosition = wgslFn(`
fn worldViewPosition(inverseProjection: mat4x4f, at: vec2f, depth: f32) -> vec3f {
  let p = inverseProjection * vec4f(at.x * 2. - 1., 1. - at.y * 2., depth, 1.);
  return p.xyz / p.w;
}`);
const depthCenter = wgslFn(`
fn worldDepthCenter(at: vec2f, size: vec2f) -> vec2f {
  return (clamp(floor(at*size),vec2f(0.),size-1.)+.5)/size;
}`);
const viewAt = wgslFn(`
fn worldViewAt(sceneDepth: texture_depth_2d, inverseProjection: mat4x4f, at: vec2f, size: vec2f) -> vec3f {
  let center=worldDepthCenter(at,size);
  return worldViewPosition(inverseProjection, center, worldReadDepth(sceneDepth, center, size));
}`, [readDepth, viewPosition,depthCenter]);
const receiverNormal = wgslFn(`
fn worldReceiverNormal(sceneDepth: texture_depth_2d, inverseProjection: mat4x4f,
  center: vec2f, pos: vec3f, depthSize: vec2f) -> vec3f {
  let dx=vec2f(1./depthSize.x,0.); let dy=vec2f(0.,1./depthSize.y);
  let left=pos-worldViewAt(sceneDepth,inverseProjection,center-dx,depthSize);
  let right=worldViewAt(sceneDepth,inverseProjection,center+dx,depthSize)-pos;
  let below=pos-worldViewAt(sceneDepth,inverseProjection,center+dy,depthSize);
  let above=worldViewAt(sceneDepth,inverseProjection,center-dy,depthSize)-pos;
  let crossNormal=cross(select(right,left,abs(left.z)<abs(right.z)),select(above,below,abs(below.z)<abs(above.z)));
  let lengthSquared=dot(crossNormal,crossNormal);
  if(lengthSquared>1.e-20){return crossNormal*inverseSqrt(lengthSquared);}
  return normalize(-pos);
}`,[viewAt]);
const integrateHorizon = wgslFn(`
fn worldIntegrateHorizon(cosine: vec2f) -> vec2f {
  let h=clamp(cosine,vec2f(-1.),vec2f(1.));
  let s=sqrt(max(vec2f(0.),1.-h*h));
  return .5*vec2f(acos(h.y)-acos(h.x)+s.x*h.x-s.y*h.y,2.-dot(h,h));
}`);
const horizonOcclusion = wgslFn(`
fn worldHorizonOcclusion(at: vec2f, sceneDepth: texture_depth_2d, inverseProjection: mat4x4f,
  depthSize: vec2f, pos: vec3f, n: vec3f, foot: vec2f, rotation: f32) -> f32 {
  let view=normalize(-pos);
  var occlusion=0.;
  for(var i=0; i<3; i++){
    let angle=rotation+f32(i)*1.04719755;
    let axis=vec2f(cos(angle),sin(angle));
    let side=normalize(cross(vec3f(axis,0.),view));
    let tangent=cross(view,side);
    let planeNormal=normalize(n-side*dot(n,side)+.00001*view);
    let localNormal=vec2f(dot(planeNormal,tangent),dot(planeNormal,view));
    let open=vec2f(-localNormal.x,localNormal.x);
    var horizons=open;
    for(var j=1; j<=4; j++){
      let t=(f32(j)-.22)/4.;
      let offset=axis*foot*(.09+.91*t*t);
      for(var k=0; k<2; k++){
        let direction=select(-1.,1.,k==0);
        let sampleAt=worldDepthCenter(at,depthSize)+direction*offset*vec2f(1.,-1.);
        if(any(sampleAt<=vec2f(0.))||any(sampleAt>=vec2f(1.))){continue;}
        let delta=worldViewAt(sceneDepth,inverseProjection,sampleAt,depthSize)-pos;
        let len=length(delta);
        let rise=dot(view,delta)/max(len,.001);
        let planeTolerance=max(.012,.004*max(0.,-pos.z));
        let above=dot(n,delta);
        let weight=smoothstep(.015,.07,len)*(1.-smoothstep(.22,.83,len))*smoothstep(planeTolerance,planeTolerance*2.5,above);
        horizons[k]=max(horizons[k],mix(open[k],rise,weight));
      }
    }
    let exposure=dot(localNormal,worldIntegrateHorizon(open));
    let visible=dot(localNormal,worldIntegrateHorizon(horizons));
    occlusion+=clamp((exposure-visible)/max(.22,exposure),0.,1.);
  }
  return min(.72,occlusion*.45);
}`,[viewAt,integrateHorizon]);

const maskVariants=[];
function mask(cascadeCount){
  if(maskVariants[cascadeCount])return maskVariants[cascadeCount];
  const volume=volumeSunWGSL(cascadeCount);
  const includes=[viewAt,horizonOcclusion,receiverNormal];
  if(cascadeCount){
    const [tap,sun]=volume.source.trim().split(/\n(?=fn worldVolumeSun)/);
    includes.push(wgslFn(sun,[wgslFn(tap)]));
  }
  return maskVariants[cascadeCount]=wgslFn(`
fn worldEffectsMask(at: vec2f, sceneDepth: texture_depth_2d, projection: mat4x4f,
  inverseProjection: mat4x4f, depthSize: vec2f, steps: vec3f, sunView: vec3f,
  upView: vec3f, sunScreen: vec2f, effectPixel: vec2f, atmosphereStrength: f32, cameraY: f32, airProfile:vec3f${volume.parameters}) -> vec4f {
  let center=worldDepthCenter(at,depthSize);
  let depth=worldReadDepth(sceneDepth,center,depthSize);
  let pos=worldViewPosition(inverseProjection,center,depth);
  let range=-pos.z;
  var ao=0.; var contact=0.; var shaft=0.;
  if (depth<.999999 && ((steps.x>0. && range<48.) || (steps.y>0. && range<36.))) {
    let n=worldReceiverNormal(sceneDepth,inverseProjection,center,pos,depthSize);
    if (steps.x>0. && range<48.) {
      let radius=.83;
      var sum=0.;
      let footprint=vec2f(projection[0][0],projection[1][1])*.5*radius/max(.1,range);
      let parity=vec2f(vec2i(floor(at/effectPixel))%vec2i(2));
      let order=2.*parity.x+3.*parity.y-4.*parity.x*parity.y;
      let rotation=.35+select(order*select(1.570796327,.261799388,steps.x>12.),0.,steps.x<=4.);
      if(steps.x>12.){
        ao=worldHorizonOcclusion(at,sceneDepth,inverseProjection,depthSize,pos,n,footprint,rotation);
      }else{
      for(var i=0; i<12; i++){
        if(f32(i)>=steps.x){break;}
        let angle=f32(i)*2.399963+rotation;
        let spread=.18+.82*sqrt((f32(i)+.5)/steps.x);
        let sampleAt=center+vec2f(cos(angle),sin(angle))*footprint*spread;
        if(any(sampleAt<=vec2f(0.))||any(sampleAt>=vec2f(1.))){continue;}
        let d=worldViewAt(sceneDepth,inverseProjection,sampleAt,depthSize)-pos;
        let len=length(d);
        let planeTolerance=max(.012,.004*range);
        sum+=max(0.,dot(n,d)/max(.001,len)-.12)*(1.-smoothstep(.07,radius,len))*smoothstep(planeTolerance,planeTolerance*2.5,dot(n,d));
      }
      ao=clamp(sum*2.6/steps.x,0.,.65);
      }
      ao*=1.-smoothstep(27.,48.,range);
    }
    let sunFacing=dot(n,sunView);
    if(steps.y>0. && sunFacing>.08 && range<36.){
      let pixelWorld=2.*range/(projection[1][1]*depthSize.y);
      let bias=clamp(pixelWorld*2.0,.025,.11);
      let origin=pos+n*bias;
      for(var i=0; i<12; i++){
        if(f32(i)>=steps.y){break;}
        let t=(f32(i)+.5)/steps.y;
        let rayLength=.035+.88*t*t;
        let ray=origin+sunView*rayLength;
        let clip=projection*vec4f(ray,1.);
        if(clip.w<=0.){break;}
        let sampleAt=clip.xy/clip.w*vec2f(.5,-.5)+.5;
        if(any(sampleAt<=vec2f(0.))||any(sampleAt>=vec2f(1.))){break;}
        let surface=worldViewAt(sceneDepth,inverseProjection,sampleAt,depthSize);
        let hit=surface.z-ray.z;
        let thickness=.045+.11*rayLength+min(pixelWorld,.045);
        let above=dot(surface-pos,n);
        let overlap=smoothstep(.003,max(.012,bias*.8),hit)*(1.-smoothstep(thickness*.6,thickness,hit));
        let blocker=smoothstep(bias*1.2,bias*2.5,above);
        let margin=min(sampleAt,1.-sampleAt);
        let edge=smoothstep(0.,.04,min(margin.x,margin.y));
        contact=max(contact,overlap*blocker*edge*(1.-smoothstep(.12,.91,rayLength)));
        if(contact>.96){break;}
      }
      contact*=smoothstep(.08,.27,sunFacing)*(1.-smoothstep(18.,36.,range));
    }
  }
  if(steps.z>0. && atmosphereStrength>0.){
    let direction=normalize(pos);
    let mu=max(0.,dot(direction,sunView));
    let angular=mix(pow(mu,10.),pow(mu,5.),airProfile.z*.45);
    var visible=0.;
    if(angular>.008 && sunView.z<-.07){
      for(var i=1; i<=12; i++){
        if(f32(i)>steps.z){break;}
        let sampleAt=mix(at,sunScreen,f32(i)/steps.z);
        if(all(sampleAt>vec2f(0.))&&all(sampleAt<vec2f(1.))){
          visible+=smoothstep(.99999,.9999995,worldReadDepth(sceneDepth,sampleAt,depthSize));
        }
      }
    }
    var haze=0.;
    if(steps.z>1. ${cascadeCount ? '' : '&& depth<.999999'}){
      let stepSize=min(length(pos),${cascadeCount ? `volumeSplits[${cascadeCount-1}]` : '165.'})/steps.z;
      var density=0.;
      let slope=dot(direction,upView);
      for(var i=0; i<12; i++){
        if(f32(i)>=steps.z){break;}
        let distance=stepSize*(f32(i)+.5);
        let height=max(0.,cameraY+distance*slope);
        let light=${cascadeCount ? `.22+.78*${volume.sample}` : '1.'};
        density+=light*exp(-height/max(1.,airProfile.y))*stepSize;
      }
      haze=${cascadeCount ? '(.18+.33*angular)' : '.18'}*(1.-exp(-density*airProfile.x));
    }
    shaft=(haze+.52*angular*visible/steps.z)*atmosphereStrength;
  }
  return vec4f(ao,contact,shaft,range);
}`,includes);
}

const applyHeightFog=wgslFn(`
fn worldHeightFog(at:vec2f,rgb:vec3f,sceneDepth:texture_depth_2d,inverseProjection:mat4x4f,depthSize:vec2f,
 fogLayer:vec4f,fogLayerUp:vec3f,fogLayerTint:vec3f,fogEyeY:f32)->vec3f{
 let raw=worldReadDepth(sceneDepth,at,depthSize);
 if(raw>=.999999||fogLayer.x<=0.){return rgb;}
 let pos=worldViewPosition(inverseProjection,at,raw);let len=length(pos);
 let h0=max(0.,fogEyeY-fogLayer.z)/fogLayer.y;
 let h1=max(0.,fogEyeY+dot(pos,fogLayerUp)-fogLayer.z)/fogLayer.y;
 let dh=abs(h1-h0);var mean=exp(-min(h0,h1));
 if(dh>=.001){mean*=(1.-exp(-dh))/dh;}
 let amount=min(fogLayer.w,1.-exp(-fogLayer.x*min(len,500.)*mean))*smoothstep(3.,18.,len);
 return mix(rgb,fogLayerTint,amount);
}`,[readDepth,viewPosition]);

const applyDepthEffects = wgslFn(`
fn worldCompositeDepth(at: vec2f, rgb: vec3f, sceneDepth: texture_depth_2d, effectsMask: texture_2d<f32>,
  inverseProjection: mat4x4f, depthSize: vec2f, effectPixel: vec2f, sunColor: vec3f, fogColor: vec3f, steps: vec3f) -> vec3f {
  let center=worldDepthCenter(at,depthSize);
  let raw=worldReadDepth(sceneDepth,center,depthSize);
  let pos=worldViewPosition(inverseProjection,center,raw);
  let distance=-pos.z;
  let grid=at/effectPixel-.5;
  let f=fract(grid);
  let base=vec2i(floor(grid));
  let size=vec2i(textureDimensions(effectsMask,0));
  var effects=vec2f(0.);
  var weights=0.;
  var contact=0.;
  var contactWeights=0.;
  for(var i=0; i<4; i++){
    let c=vec2i(i%2,i/2);
    let v=textureLoad(effectsMask,clamp(base+c,vec2i(0),size-1),0);
    let s=mix(1.-f,f,vec2f(c));
    let depthWeight=exp(-abs(v.a-distance)/(.08+.021*distance));
    let w=s.x*s.y*depthWeight;
    let contactWeight=w*depthWeight*depthWeight*depthWeight;
    effects+=v.rb*w;
    weights+=w;
    contact+=v.g*contactWeight;
    contactWeights+=contactWeight;
  }
  effects/=max(.12,weights);
  var ao=effects.x;
  // Resolve AO independently of shafts/contact, with the same receiver
  // plane and 3x3 ordered-kernel filter as WebGL.
  if(steps.x>4. && raw<.999999 && distance<48.){
    let n=worldReceiverNormal(sceneDepth,inverseProjection,center,pos,depthSize);
    let nearest=vec2i(floor(at/effectPixel));
    let tolerance=max(.018,.004*distance);
    var aoSum=0.;
    var aoWeights=0.;
    for(var y=-1;y<=1;y++){
      for(var x=-1;x<=1;x++){
        let coord=nearest+vec2i(x,y);
        if(any(coord<vec2i(0))||any(coord>=size)){continue;}
        let sampleAt=(vec2f(coord)+.5)*effectPixel;
        let sampleCenter=worldDepthCenter(sampleAt,depthSize);
        let sampleDepth=worldReadDepth(sceneDepth,sampleCenter,depthSize);
        if(sampleDepth>=.999999){continue;}
        let delta=worldViewPosition(inverseProjection,sampleCenter,sampleDepth)-pos;
        let planeWeight=1.-smoothstep(tolerance,3.*tolerance,abs(dot(n,delta)));
        let offset=(sampleAt-at)/effectPixel;
        let w=exp(-.8*dot(offset,offset))*planeWeight;
        aoSum+=textureLoad(effectsMask,coord,0).r*w;
        aoWeights+=w;
      }
    }
    ao=aoSum/max(.12,aoWeights);
  }
  return rgb*(1.-.43*ao)*(1.-.23*contact/max(.12,contactWeights))+effects.y*mix(fogColor,sunColor,.44)*.24;
}`,[readDepth,viewPosition,depthCenter,receiverNormal]);

const waterSurface = wgslFn(`
fn worldWaterSurface(pos: vec3f, shore: vec2f, upView: vec3f, worldXView: vec3f,
  cameraY: f32,cameraX: f32,waterActive:f32) -> bool {
  return waterActive>0. && cameraX+dot(pos,worldXView)<shore.x-.12 && abs(cameraY+dot(pos,upView)-shore.y)<.075;
}`);

const decodeReflectionNormal=wgslFn(`
fn decodeReflectionNormal(oct:vec2f) -> vec3f {
  let z=1.-abs(oct.x)-abs(oct.y);
  let xy=oct+select(vec2f(1.),vec2f(-1.),oct>=vec2f(0.))*max(0.,-z);
  return normalize(vec3f(xy,z));
}`);

const readReceiver=wgslFn(`
fn readReflectionReceiver(receiverMask:texture_2d<f32>, at:vec2f, range:f32, receiverActive:f32) -> vec4f {
  if(receiverActive<.5){return vec4f(0.);}
  let size=vec2f(textureDimensions(receiverMask,0));
  let receiver=textureLoad(receiverMask,vec2i(clamp(at*size,vec2f(0.),size-1.)),0);
  let tolerance=.045+.005*receiver.a;
  let difference=range-receiver.a;
  if(receiver.a<=0.||receiver.a>75.||difference < -tolerance || (receiver.b>0.&&difference>tolerance)){return vec4f(0.);}
  return receiver;
}`);

function reflectionShaders(receivers){
  const fields=receivers?', receiverMask:texture_2d<f32>, receiverActive:f32':'';
  const read=receivers?'readReflectionReceiver(receiverMask,at,-pos.z,receiverActive)':'vec4f(0.)';
  const includes=receivers?[viewAt,waterSurface,readReceiver]:[viewAt,waterSurface];
  const reflection = wgslFn(`
fn worldReflection(at: vec2f, source: texture_2d<f32>, sourceSampler: sampler, sceneDepth: texture_depth_2d,
  inverseProjection: mat4x4f, projection: mat4x4f, depthSize: vec2f, waterPixel: vec2f,
  shore: vec2f, upView: vec3f, worldXView: vec3f, cameraY: f32, cameraX: f32, cameraZ:f32, waterActive:f32, time: f32, reflectionSteps: f32${fields}) -> vec4f {
  var pos=worldViewAt(sceneDepth,inverseProjection,at,depthSize);
  let receiver=${read};
  let water=worldWaterSurface(pos,shore,upView,worldXView,cameraY,cameraX,waterActive)||(receiver.b>-.15&&receiver.b<-.10);
  if(receiver.b<0.){pos*=receiver.a/max(.001,-pos.z);}
  if((!water && receiver.b==0.)||(water&&-pos.z>145.)){return vec4f(0.);}
  let wet=receiver.b>1.;
  let roughness=select(select(abs(receiver.b),mix(.38,.15,receiver.b-1.),wet),.21,water);
  let worldZView=cross(worldXView,upView);
  let wx=cameraX+dot(pos,worldXView);let wz=cameraZ+dot(pos,worldZView);
  let fadeWave=1.-smoothstep(28.,130.,-pos.z);
  let wave=worldXView*(sin(wx*.71+wz*.37+time*1.5)*.038+sin(wx*2.2-wz*.9-time*2.1)*.018)
    +worldZView*(cos(wz*.81-wx*.46+time*1.2)*.04+sin(wz*2.3+wx*.77-time*1.8)*.012);
  let normal=select(decodeReflectionNormal(receiver.rg),normalize(upView+wave*fadeWave),water);
  let ray=reflect(normalize(pos),normal);
  let noV=max(0.,-dot(normalize(pos),normal));
  let fresnel=select(pow(1.-noV,3.),.0204+.9796*pow(1.-noV,5.),water);
  if(water&&(fresnel<.035 || dot(ray,upView)<=.001)){return vec4f(0.);}
  let reach=select(mix(48.,24.,roughness),85.,water);
  let bias=select(.045,.12,water);
  var lastTravel=bias;
  for(var i=1;i<=32;i++){
    if(f32(i)>reflectionSteps){break;}
    let t=f32(i)/reflectionSteps;
    let travel=.15+(reach-1.)*t*t;
    let point=pos+normal*bias+ray*travel;
    let clip=projection*vec4f(point,1.);
    if(clip.w<=0.){break;}
    var sampleAt=clip.xy/clip.w*vec2f(.5,-.5)+.5;
    if(any(sampleAt<=vec2f(0.))||any(sampleAt>=vec2f(1.))){break;}
    let hit=worldViewAt(sceneDepth,inverseProjection,sampleAt,depthSize);
    let delta=hit.z-point.z;
    if(delta>0. && delta<select(.35,1.3,water)+travel*.084 && !worldWaterSurface(hit,shore,upView,worldXView,cameraY,cameraX,waterActive)
        && select(dot(hit-pos,normal)>.06,dot(hit-pos,upView)>.06,water)){
      var lo=lastTravel;
      var hi=travel;
      for(var j=0;j<3;j++){
        let mid=(lo+hi)*.5;
        let samplePoint=pos+normal*bias+ray*mid;
        let p=projection*vec4f(samplePoint,1.);
        sampleAt=p.xy/p.w*vec2f(.5,-.5)+.5;
        if(worldViewAt(sceneDepth,inverseProjection,sampleAt,depthSize).z>samplePoint.z){hi=mid;}else{lo=mid;}
      }
      let margin=min(sampleAt,1.-sampleAt);
      let refined=worldViewAt(sceneDepth,inverseProjection,sampleAt,depthSize);
      if(select(dot(refined-pos,normal)<.045,dot(refined-pos,upView)<.04,water)||abs(refined.z-(pos+normal*bias+ray*hi).z)>select(.4,.8,water)+travel*.044){
        lastTravel=travel;
        continue;
      }
      let fade=smoothstep(0.,.11,min(margin.x,margin.y))*(1.-smoothstep(reach*.58,reach,travel));
      let blur=waterPixel*(.58+roughness*2.+travel*.023);
      let color=textureSampleLevel(source,sourceSampler,sampleAt,0.).rgb*.5
        +(textureSampleLevel(source,sourceSampler,sampleAt+blur,0.).rgb+textureSampleLevel(source,sourceSampler,sampleAt-blur,0.).rgb)*.25;
      let gain=select((.19+.57*fresnel)*(1.-roughness*.8),fresnel*.82,water)*(1.-smoothstep(85.,145.,-pos.z));
      let opacity=fade*gain*select(1.,receiver.b-1.,wet&&!water);
      return vec4f(color*opacity,opacity);
    }
    lastTravel=travel;
  }
  return vec4f(0.);
}`,[...includes,decodeReflectionNormal]);

  const applyReflection = wgslFn(`
fn worldApplyReflection(at: vec2f, rgb: vec3f, reflected: vec4f, sceneDepth: texture_depth_2d,
  inverseProjection: mat4x4f, depthSize: vec2f, shore: vec2f, upView: vec3f,
  worldXView: vec3f, cameraY: f32, cameraX: f32, waterActive:f32${fields}) -> vec3f {
  if(waterActive==0. ${receivers?'&& receiverActive==0.':''}){return rgb;}
  let pos=worldViewAt(sceneDepth,inverseProjection,at,depthSize);
  let receiver=${read};
  if(receiver.b==0.&&!worldWaterSurface(pos,shore,upView,worldXView,cameraY,cameraX,waterActive)){return rgb;}
  return rgb*(1.-.17*max(0.,receiver.b-1.))*(1.-reflected.a)+reflected.rgb;
}`,includes);
  return {reflection,applyReflection};
}
const onlyWater=reflectionShaders(false), withReceivers=reflectionShaders(true);

function blurShader(first) {
  const tap = wgslFn(`
fn ${first?'bloomBrightTap':'bloomBlurTap'}(source: texture_2d<f32>, sourceSampler: sampler, at: vec2f) -> vec3f {
  let color=textureSampleLevel(source,sourceSampler,at,0.).rgb;
  ${first ? 'let lum=max(color.r,max(color.g,color.b)); let knee=clamp(lum-1.1,0.,.7); let scale=max(lum-1.8,knee*knee/.7)/max(lum,.001); return min(color,vec3f(12.))*scale;' : 'return color;'}
}`);
  const name = first ? 'bloomBrightTap' : 'bloomBlurTap';
  return wgslFn(`
fn ${first?'bloomPrefilter':'bloomDownsample'}(source: texture_2d<f32>, sourceSampler: sampler, at: vec2f, pixel: vec2f) -> vec4f {
  let d=pixel*${first?'1.35':'.8'};
  var rgb=${name}(source,sourceSampler,at)*.28;
  for (var j=-1; j<=1; j+=2){
    for (var i=-1; i<=1; i+=2){
      rgb+=.12*${name}(source,sourceSampler,at+d*vec2f(f32(i),f32(j)));
    }
    rgb+=.06*(${name}(source,sourceSampler,at+vec2f(d.x*f32(j),0.))+${name}(source,sourceSampler,at+vec2f(0.,d.y*f32(j))));
  }
  return vec4f(rgb,1.);
}`,[tap]);
}

const prefilter = blurShader(true), downsample = blurShader(false);
const cameraEffects=makeCameraEffectsWGSL(viewAt,readDepth);
const heatDistortion=makeHeatDistortionWGSL(viewAt);

export function webGpuWorldStages(post, geometry, camera) {
  const { renderer, world, state } = post;
  const materials=[];
  const make = fragmentNode => {
    const material=new MeshBasicNodeMaterial({depthTest:false,depthWrite:false,fog:false});
    material.toneMapped=false;
    material.fragmentNode=fragmentNode;
    const scene=new THREE.Scene();
    scene.add(new THREE.Mesh(geometry,material));
    materials.push(material);
    return scene;
  };
  const params=Object.fromEntries(Object.entries(state).map(([key,value])=>[key,uniform(value)]));
  const at=uv(), source=texture(world.texture);
  const depthParams=world.depthTexture && {at, sceneDepth:texture(world.depthTexture), inverseProjection:params.inverseProjection, depthSize:params.depthSize};
  const masks=post.mask && [];
  const maskParams=post.mask && {
    ...depthParams, projection:params.projection, steps:params.steps, sunView:params.sunView,
    upView:params.upView,sunScreen:params.sunScreen,effectPixel:params.effectPixel,atmosphereStrength:params.atmosphereStrength,cameraY:params.cameraY,airProfile:params.airProfile,
  };
  const {reflection,applyReflection}=post.receiverMask?withReceivers:onlyWater;
  const receiverParams=post.receiverMask?{receiverMask:texture(post.receiverMask.texture),receiverActive:params.receiverActive}:{};
  const waterParams={...receiverParams,shore:params.shore,upView:params.upView,worldXView:params.worldXView,
    cameraY:params.cameraY,cameraX:params.cameraX,waterActive:params.waterActive};
  const reflected=post.reflection && make(reflection({...depthParams,...waterParams,source,sourceSampler:source,
    projection:params.projection,waterPixel:params.waterPixel,time:params.time,cameraZ:params.cameraZ,reflectionSteps:params.reflectionSteps}));
  const blurs=post.bloom.map((_,i)=>{
    const src=i===0?world:post.bloom[i-1];
    const tex=texture(src.texture), pixel=uniform(new THREE.Vector2());
    const shader=i===0?prefilter:downsample;
    return {scene:make(shader({source:tex,sourceSampler:tex,at,pixel})),pixel,src,tex};
  });
  let rgb=source.sample(at).rgb;
  if(post.cameraFX)rgb=cameraEffects({...depthParams,original:rgb,source,sourceSampler:source,
    previousClipFromView:params.previousClipFromView,cameraEffects:params.cameraEffects,chromaticGain:params.chromaticGain,
    sunScreen:params.sunScreen,sunView:params.sunView,sunColor:params.sunColor});
  if(post.hasHeat)rgb=heatDistortion({...depthParams,color:rgb,source,sourceSampler:source,
    heatSources:params.heatSources,heatStrength:params.heatStrength,heatTime:params.heatTime});
  if(post.mask)rgb=applyDepthEffects({...depthParams,rgb,effectsMask:texture(post.mask.texture),
    effectPixel:params.effectPixel,sunColor:params.sunColor,fogColor:params.fogColor,steps:params.steps});
  if(reflected)rgb=applyReflection({...depthParams,...waterParams,rgb,reflected:texture(post.reflection.texture).sample(at)});
  if(post.heightFog)rgb=applyHeightFog({...depthParams,rgb,fogLayer:params.fogLayer,fogLayerUp:params.fogLayerUp,fogLayerTint:params.fogLayerTint,fogEyeY:params.fogEyeY});
  const composite=make(vec4(rgb,1));
  const bloomSource=texture(world.texture);
  let bloomRgb=bloomSource.sample(at).rgb;
  for(let i=0;i<post.bloom.length;i++)bloomRgb=bloomRgb.add(texture(post.bloom[i].texture).sample(at).rgb.mul(params.bloomGain).mul([.62,.23,.1,.05][i]));
  const bloomComposite=blurs.length?make(vec4(bloomRgb,1)):null;
  function draw(target,scene,profiler,pass) {
    renderer.setRenderTarget(target);
    renderTimed(renderer,scene,camera,profiler,pass);
  }
  return {
    render(target,profiler) {
      params.bloomGain.value=state.bloomGain;
      params.cameraY.value=state.cameraY;
      params.fogEyeY.value=state.fogEyeY;
      params.cameraX.value=state.cameraX;
      params.cameraZ.value=state.cameraZ;
      params.chromaticGain.value=state.chromaticGain;
      params.time.value=state.time;
      params.heatTime.value=state.heatTime;
      params.reflectionSteps.value=state.reflectionSteps;
      params.waterActive.value=state.waterActive;
      params.receiverActive.value=state.receiverActive;
      if(reflected&&(state.waterActive||state.receiverActive))draw(post.reflection,reflected,profiler,'reflections');
      params.atmosphereStrength.value=state.atmosphereStrength;
      if(masks){
        const count=post.shadowMaps.length;
        const entry=masks[count]??=(()=>{
          const maps=post.shadowMaps.map(map=>texture(map));
          const values={...maskParams};
          if(count)values.volumeSplits=params.volumeSplits;
          for(let i=0;i<count;i++){
            values['volumeMap'+i]=maps[i];
            values['volumeMatrix'+i]=params['volumeMatrix'+i];
          }
          return {scene:make(mask(count)(values)),maps};
        })();
        for(let i=0;i<count;i++)entry.maps[i].value=post.shadowMaps[i];
        draw(post.mask,entry.scene,profiler,'depthEffects');
      }
      draw(target,composite,profiler,'worldComposite');
    },
    renderBloom(input,profiler,composite=true){
      if(!blurs.length)return input.texture;
      params.bloomGain.value=state.bloomGain;
      bloomSource.value=input.texture;blurs[0].tex.value=input.texture;
      {
        const timing=profiler?.beginPass('bloom');
        try{
          for(let i=0;i<blurs.length;i++){
            const {scene,pixel,src}=blurs[i];
            const sourceSize=i===0?input:src;
            pixel.value.set(1/sourceSize.width,1/sourceSize.height);
            draw(post.bloom[i],scene);
          }
        }finally{if(timing)profiler.endPass();}
      }
      if(!composite)return input.texture;
      draw(world,bloomComposite,profiler,'bloomComposite');
      return world.texture;
    },
    dispose() { for(const material of materials)material.dispose(); },
  };
}
