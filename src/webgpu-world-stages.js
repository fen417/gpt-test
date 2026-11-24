import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { texture, uv, uniform, wgslFn, vec2, vec4 } from 'three/tsl';

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
const viewAt = wgslFn(`
fn worldViewAt(sceneDepth: texture_depth_2d, inverseProjection: mat4x4f, at: vec2f, size: vec2f) -> vec3f {
  return worldViewPosition(inverseProjection, at, worldReadDepth(sceneDepth, at, size));
}`, [readDepth, viewPosition]);
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
        let sampleAt=at+direction*offset*vec2f(1.,-1.);
        if(any(sampleAt<=vec2f(0.))||any(sampleAt>=vec2f(1.))){continue;}
        let delta=worldViewAt(sceneDepth,inverseProjection,sampleAt,depthSize)-pos;
        let len=length(delta);
        let rise=dot(view,delta)/max(len,.001);
        let weight=smoothstep(.015,.07,len)*(1.-smoothstep(.22,.83,len));
        horizons[k]=max(horizons[k],mix(open[k],rise,weight));
      }
    }
    let exposure=dot(localNormal,worldIntegrateHorizon(open));
    let visible=dot(localNormal,worldIntegrateHorizon(horizons));
    occlusion+=clamp((exposure-visible)/max(.22,exposure),0.,1.);
  }
  return min(.72,occlusion*.45);
}`,[viewAt,integrateHorizon]);

const mask = wgslFn(`
fn worldEffectsMask(at: vec2f, sceneDepth: texture_depth_2d, projection: mat4x4f,
  inverseProjection: mat4x4f, depthSize: vec2f, steps: vec3f, sunView: vec3f,
  upView: vec3f, sunScreen: vec2f, effectPixel: vec2f, atmosphereStrength: f32, cameraY: f32) -> vec4f {
  let depth=worldReadDepth(sceneDepth,at,depthSize);
  let pos=worldViewPosition(inverseProjection,at,depth);
  let range=-pos.z;
  var ao=0.; var contact=0.; var shaft=0.;
  if (depth<.999999 && range<95. && (steps.x>0. || steps.y>0.)) {
    let dx=vec2f(1./depthSize.x,0.); let dy=vec2f(0.,1./depthSize.y);
    let left=pos-worldViewAt(sceneDepth,inverseProjection,at-dx,depthSize);
    let right=worldViewAt(sceneDepth,inverseProjection,at+dx,depthSize)-pos;
    let below=pos-worldViewAt(sceneDepth,inverseProjection,at+dy,depthSize);
    let above=worldViewAt(sceneDepth,inverseProjection,at-dy,depthSize)-pos;
    let n=normalize(cross(select(right,left,abs(left.z)<abs(right.z)),select(above,below,abs(below.z)<abs(above.z))));
    if (steps.x>0.) {
      let radius=.83;
      var sum=0.;
      let footprint=vec2f(projection[0][0],projection[1][1])*.5*radius/max(.1,range);
      let rotation=6.283185*fract(dot(floor(at/effectPixel),vec2f(.75487766,.56984029)));
      if(steps.x>12.){
        ao=worldHorizonOcclusion(at,sceneDepth,inverseProjection,depthSize,pos,n,footprint,rotation);
      }else{
      for(var i=0; i<12; i++){
        if(f32(i)>=steps.x){break;}
        let angle=f32(i)*2.399963+rotation;
        let spread=.18+.82*sqrt((f32(i)+.5)/steps.x);
        let sampleAt=at+vec2f(cos(angle),sin(angle))*footprint*spread;
        if(any(sampleAt<=vec2f(0.))||any(sampleAt>=vec2f(1.))){continue;}
        let d=worldViewAt(sceneDepth,inverseProjection,sampleAt,depthSize)-pos;
        let len=length(d);
        sum+=max(0.,dot(n,d)/max(.001,len)-.12)*(1.-smoothstep(.07,radius,len));
      }
      ao=clamp(sum*2.6/steps.x,0.,.65);
      }
      ao*=1.-smoothstep(58.,95.,range);
    }
    if(steps.y>0. && dot(n,sunView)>.08 && range<46.){
      for(var i=1; i<=12; i++){
        if(f32(i)>steps.y){break;}
        let t=f32(i)/steps.y;
        let rayLength=.055+.95*t*t;
        let ray=pos+n*.025+sunView*rayLength;
        let clip=projection*vec4f(ray,1.);
        if(clip.w<=0.){break;}
        let sampleAt=clip.xy/clip.w*vec2f(.5,-.5)+.5;
        if(any(sampleAt<=vec2f(0.))||any(sampleAt>=vec2f(1.))){break;}
        let hit=ray.z-worldViewAt(sceneDepth,inverseProjection,sampleAt,depthSize).z;
        if(hit>.024 && hit<.065+rayLength*.12){
          let margin=min(sampleAt,1.-sampleAt);
          contact=(1.-.7*t)*smoothstep(0.,.045,min(margin.x,margin.y))*(1.-smoothstep(26.,46.,range));
          break;
        }
      }
    }
  }
  if(steps.z>0. && atmosphereStrength>0. && sunView.z<-.07){
    let angular=pow(max(0.,dot(normalize(pos),sunView)),10.);
    var visible=0.;
    if(angular>.008){
      for(var i=1; i<=6; i++){
        if(f32(i)>steps.z){break;}
        let sampleAt=mix(at,sunScreen,f32(i)/steps.z);
        if(all(sampleAt>vec2f(0.))&&all(sampleAt<vec2f(1.))){
          visible+=smoothstep(.99999,.9999995,worldReadDepth(sceneDepth,sampleAt,depthSize));
        }
      }
    }
    let height=max(0.,cameraY+dot(pos,upView)*.4);
    let haze=.20*(1.-exp(-range*.006))*exp(-height*.021);
    shaft=(haze+.52*angular*visible/steps.z)*atmosphereStrength;
  }
  return vec4f(ao,contact,shaft,range);
}`,[viewAt,horizonOcclusion]);

const applyDepthEffects = wgslFn(`
fn worldCompositeDepth(at: vec2f, rgb: vec3f, sceneDepth: texture_depth_2d, effectsMask: texture_2d<f32>,
  inverseProjection: mat4x4f, depthSize: vec2f, effectPixel: vec2f, sunColor: vec3f, fogColor: vec3f) -> vec3f {
  let distance=-worldViewPosition(inverseProjection,at,worldReadDepth(sceneDepth,at,depthSize)).z;
  let grid=at/effectPixel-.5;
  let f=fract(grid);
  let base=vec2i(floor(grid));
  let size=vec2i(textureDimensions(effectsMask,0));
  var effects=vec3f(0.);
  var weights=0.;
  for(var i=0; i<4; i++){
    let c=vec2i(i%2,i/2);
    let v=textureLoad(effectsMask,clamp(base+c,vec2i(0),size-1),0);
    let s=mix(1.-f,f,vec2f(c));
    let w=s.x*s.y*exp(-abs(v.a-distance)/(.08+.021*distance));
    effects+=v.rgb*w;
    weights+=w;
  }
  effects/=max(.12,weights);
  return rgb*(1.-(.43*effects.x+.29*effects.y))+effects.z*mix(fogColor,sunColor,.44)*.24;
}`,[readDepth,viewPosition]);

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
  const depthParams=post.mask && {at, sceneDepth:texture(world.depthTexture), inverseProjection:params.inverseProjection, depthSize:params.depthSize};
  const depth=post.mask && make(mask({
    ...depthParams, projection:params.projection, steps:params.steps, sunView:params.sunView,
    upView:params.upView,sunScreen:params.sunScreen,effectPixel:params.effectPixel,atmosphereStrength:params.atmosphereStrength,cameraY:params.cameraY,
  }));
  const blurs=post.bloom.map((_,i)=>{
    const src=i===0?world:post.bloom[i-1];
    const tex=texture(src.texture), pixel=uniform(new THREE.Vector2());
    const shader=i===0?prefilter:downsample;
    return {scene:make(shader({source:tex,sourceSampler:tex,at,pixel})),pixel,src};
  });
  let rgb=source.sample(at).rgb;
  if(depth)rgb=applyDepthEffects({...depthParams,rgb,effectsMask:texture(post.mask.texture),
    effectPixel:params.effectPixel,sunColor:params.sunColor,fogColor:params.fogColor});
  for(let i=0;i<post.bloom.length;i++){
    rgb=rgb.add(texture(post.bloom[i].texture).sample(at).rgb.mul(params.bloomGain).mul([.62,.23,.1,.05][i]));
  }
  const composite=make(vec4(rgb,1));
  function draw(target,scene) {
    renderer.setRenderTarget(target);
    renderer.render(scene,camera);
  }
  return {
    render(target) {
      params.bloomGain.value=state.bloomGain;
      params.cameraY.value=state.cameraY;
      params.atmosphereStrength.value=state.atmosphereStrength;
      if(depth)draw(post.mask,depth);
      for(let i=0;i<blurs.length;i++){
        const {scene,pixel,src}=blurs[i];
        pixel.value.set(1/src.width,1/src.height);
        draw(post.bloom[i],scene);
      }
      draw(target,composite);
    },
    dispose() { for(const material of materials)material.dispose(); },
  };
}
