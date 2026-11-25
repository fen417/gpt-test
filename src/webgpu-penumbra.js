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
  let turn=.73;
  let depthPerTexel=.024/max(spread,.01);
  var blockers=0.;
  var average=0.;
  for(var i=0;i<${p.blockerTaps};i++){
    let offset=s09ShadowDisk(i,${p.blockerTaps}.,turn)*${p.searchRadius};
    let uv=point.xy+offset*texel;
    let depth=s09DepthAt(depthMap,uv,size);
    // No screen derivatives inside a possibly divergent CSM branch in WGSL.
    // Use a conservative texel-scaled tolerance instead.
    if(depth<point.z-depthPerTexel*(.45+.22*length(offset))){average+=depth;blockers+=1.;}
  }
  let center=s09DepthAt(depthMap,point.xy,size);
  if(center<point.z-.45*depthPerTexel){average+=center;blockers+=1.;}
  if(blockers==0.){return 1.;}
  let penumbra=clamp((point.z-average/blockers)*spread,${p.minRadius},${p.maxRadius}.);
  var visibility=0.;
  for(var i=0;i<${p.filterTaps};i++){
    let offset=s09ShadowDisk(i,${p.filterTaps}.,turn+1.1)*penumbra;
    let uv=point.xy+offset*texel;
    visibility+=step(point.z-depthPerTexel*(.28+.22*length(offset)),s09DepthAt(depthMap,uv,size));
  }
  return visibility/${p.filterTaps}.;
}`,[disk,sampleDepth]);

export const webGpuPcss=({depthTexture,shadowCoord,shadow})=>filter({
  depthMap:texture(depthTexture),
  point:shadowCoord,
  size:reference('mapSize','vec2',shadow).setGroup(renderGroup),
  spread:reference('radius','float',shadow).setGroup(renderGroup),
});
