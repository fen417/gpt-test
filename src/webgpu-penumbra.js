import {texture,reference,renderGroup,wgslFn} from 'three/tsl';
import {PCSS_SETTINGS as p} from './directional-penumbra.js';

const disk=wgslFn(`
fn s09ShadowDisk(i: i32, n: f32, turn: f32) -> vec2f {
  let angle=f32(i)*2.3999632+turn;
  return vec2f(cos(angle),sin(angle))*sqrt((f32(i)+.5)/n);
}`);
const sampleDepth=wgslFn(`
fn s09DepthAt(depthMap: texture_depth_2d, uv: vec2f, size: vec2f) -> f32 {
  let at=vec2i(clamp(uv*size,vec2f(0.),size-1.));
  return textureLoad(depthMap,at,0);
}`);
const filter=wgslFn(`
fn s09ShadowPcss(depthMap: texture_depth_2d, point: vec3f, size: vec2f, spread: f32) -> f32 {
  let texel=1./size;
  let turn=6.283185*fract(dot(floor(point.xy*size),vec2f(.754877666,.569840296)));
  var blockers=0.;
  var average=0.;
  for(var i=0;i<${p.blockerTaps};i++){
    let uv=point.xy+s09ShadowDisk(i,${p.blockerTaps}.,turn)*texel*${p.searchRadius};
    let depth=s09DepthAt(depthMap,uv,size);
    if(depth<point.z){average+=depth;blockers+=1.;}
  }
  let center=s09DepthAt(depthMap,point.xy,size);
  if(center<point.z){average+=center;blockers+=1.;}
  if(blockers==0.){return 1.;}
  let penumbra=clamp((point.z-average/blockers)*spread,${p.minRadius},${p.maxRadius}.);
  var visibility=0.;
  for(var i=0;i<${p.filterTaps};i++){
    let uv=point.xy+s09ShadowDisk(i,${p.filterTaps}.,turn+1.1)*texel*penumbra;
    visibility+=step(point.z,s09DepthAt(depthMap,uv,size));
  }
  return visibility/${p.filterTaps}.;
}`,[disk,sampleDepth]);

export const webGpuPcss=({depthTexture,shadowCoord,shadow})=>filter({
  depthMap:texture(depthTexture),
  point:shadowCoord,
  size:reference('mapSize','vec2',shadow).setGroup(renderGroup),
  spread:reference('radius','float',shadow).setGroup(renderGroup),
});
