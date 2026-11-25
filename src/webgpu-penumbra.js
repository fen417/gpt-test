import {texture,reference,renderGroup,wgslFn} from 'three/tsl';
import {PCSS_SETTINGS as p} from './directional-penumbra.js';

const diskPoints=(n,turn,vec)=>Array.from({length:n},(_,i)=>{const a=i*2.3999632+turn,r=Math.sqrt((i+.5)/n);return vec+'('+ (Math.cos(a)*r).toFixed(8)+','+(Math.sin(a)*r).toFixed(8)+')';}).join(',');

const sampleDepth=wgslFn(`
fn s09DepthAt(depthMap: texture_depth_2d, uv: vec2f, size: vec2f) -> f32 {
  let at=vec2i(clamp(uv*size,vec2f(0.),size-1.));
  return textureLoad(depthMap,at,0);
}`);
const filter=wgslFn(`
fn s09ShadowPcss(depthMap: texture_depth_2d, point: vec3f, size: vec2f, spread: f32) -> f32 {
  let texel=1./size;
  let searchDisk=array<vec2f,${p.blockerTaps}>(${diskPoints(p.blockerTaps,.73,'vec2f')});
  let filterDisk=array<vec2f,${p.filterTaps}>(${diskPoints(p.filterTaps,1.83,'vec2f')});
  let smallDisk=array<vec2f,8>(${diskPoints(8,1.83,'vec2f')});
  let depthPerTexel=.024/max(spread,.01);
  var blockers=0.;
  var average=0.;
  for(var i=0;i<${p.blockerTaps};i++){
    let offset=searchDisk[i]*${p.searchRadius};
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
  if(penumbra<=1.35){
    for(var i=0;i<8;i++){
      let offset=smallDisk[i]*penumbra;
      visibility+=step(point.z-depthPerTexel*(.28+.22*length(offset)),s09DepthAt(depthMap,point.xy+offset*texel,size));
    }
    return visibility/8.;
  }
  for(var i=0;i<${p.filterTaps};i++){
    let offset=filterDisk[i]*penumbra;
    let uv=point.xy+offset*texel;
    visibility+=step(point.z-depthPerTexel*(.28+.22*length(offset)),s09DepthAt(depthMap,uv,size));
  }
  return visibility/${p.filterTaps}.;
}`,[sampleDepth]);

export const webGpuPcss=({depthTexture,shadowCoord,shadow})=>filter({
  depthMap:texture(depthTexture),
  point:shadowCoord,
  size:reference('mapSize','vec2',shadow).setGroup(renderGroup),
  spread:reference('radius','float',shadow).setGroup(renderGroup),
});
