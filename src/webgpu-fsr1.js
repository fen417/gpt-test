// FSR 1.0 spatial EASU and RCAS for Three.js TSL/WebGPU.
// Mathematically mirrors the 12-tap / 5-tap GLSL paths in fsr1.js.
// Both stages use unfiltered integer pixel loads, not bilinear shortcuts.
import { Fn, vec2, vec3, vec4, ivec2, float, uv, texture,
  floor, fract, clamp, min, max, mix, dot, inversesqrt, abs, select } from 'three/tsl';

function source(tex, pixel, size) {
  return (tex.isNode ? tex : texture(tex)).load(ivec2(clamp(pixel, vec2(0), size.sub(1)))).rgb;
}
const lum = c => c.g.add(c.r.add(c.b).mul(0.5));

export function easuNode(input, inputSize, outputSize) {
  return Fn(() => {
    const coord = uv().mul(inputSize).sub(0.5);
    const base = floor(coord), pp = fract(coord);
    const at = (x, y) => source(input, base.add(vec2(x, y)), inputSize);
    const b=at(0,-1), c=at(1,-1), e=at(-1,0), f=at(0,0);
    const g=at(1,0), h=at(2,0), i=at(-1,1), j=at(0,1);
    const k=at(1,1), l=at(2,1), n=at(0,2), o=at(1,2);
    const [bl,cl,el,fl,gl,hl,il,jl,kl,ll,nl,ol] =
      [b,c,e,f,g,h,i,j,k,l,n,o].map(lum);
    const dir=vec2(0).toVar(), edgeLen=float(0).toVar();
    const setEdge=(weight,a,bb,cc,d,ee)=>{
      const dx=d.sub(bb), dy=ee.sub(a);
      const gx=clamp(abs(dx).div(max(max(abs(d.sub(cc)),abs(cc.sub(bb))),1e-6)),0,1);
      const gy=clamp(abs(dy).div(max(max(abs(ee.sub(cc)),abs(cc.sub(a))),1e-6)),0,1);
      dir.addAssign(vec2(dx,dy).mul(weight));
      edgeLen.addAssign(gx.mul(gx).add(gy.mul(gy)).mul(weight));
    };
    setEdge(float(1).sub(pp.x).mul(float(1).sub(pp.y)),bl,el,fl,gl,jl);
    setEdge(pp.x.mul(float(1).sub(pp.y)),cl,fl,gl,hl,kl);
    setEdge(float(1).sub(pp.x).mul(pp.y),fl,il,jl,kl,nl);
    setEdge(pp.x.mul(pp.y),gl,jl,kl,ll,ol);
    const dirSq=dot(dir,dir);
    dir.assign(select(dirSq.lessThan(1/32768),vec2(1,0),dir.mul(inversesqrt(max(dirSq,1e-8)))));
    edgeLen.mulAssign(0.5);edgeLen.mulAssign(edgeLen);
    const stretch=dot(dir,dir).div(max(max(abs(dir.x),abs(dir.y)),1e-6));
    const extent=vec2(float(1).add(stretch.sub(1).mul(edgeLen)),float(1).sub(edgeLen.mul(0.5)));
    const lobe=mix(0.5,0.21,edgeLen), clipDist=float(1).div(lobe);
    const min4=min(min(f,g),min(j,k)), max4=max(max(f,g),max(j,k));
    const color=vec3(0).toVar(), weight=float(0).toVar();
    const accum=(offset,sample)=>{
      const pos=offset.sub(pp);
      const rotated=vec2(dot(pos,dir),dot(pos,vec2(dir.y.negate(),dir.x))).mul(extent);
      const d2=min(dot(rotated,rotated),clipDist);
      const aa=lobe.mul(d2).sub(1),bb=float(0.4).mul(d2).sub(1);
      const w=bb.mul(bb).mul(25/16).sub(9/16).mul(aa.mul(aa));
      color.addAssign(sample.mul(w));weight.addAssign(w);
    };
    accum(vec2(0,-1),b);accum(vec2(1,-1),c);
    accum(vec2(-1,1),i);accum(vec2(0,1),j);
    accum(vec2(0,0),f);accum(vec2(-1,0),e);
    accum(vec2(1,1),k);accum(vec2(2,1),l);
    accum(vec2(2,0),h);accum(vec2(1,0),g);
    accum(vec2(1,2),o);accum(vec2(0,2),n);
    return vec4(clamp(color.div(max(weight,1e-6)),min4,max4),1);
  })();
}

export function rcasNode(input, outputSize, sharpness) {
  return Fn(() => {
    const p=floor(uv().mul(outputSize));
    const at=(x,y)=>source(input,p.add(vec2(x,y)),outputSize);
    const b=at(0,-1),d=at(-1,0),e=at(0,0),f=at(1,0),h=at(0,1);
    const mn=min(min(b,d),min(f,h)), mx=max(max(b,d),max(f,h));
    const hitMin=min(mn,e).div(max(mx,vec3(1e-6)).mul(4));
    const hitMax=vec3(1).sub(max(mx,e)).div(min(mn.mul(4).sub(4),vec3(-1e-6)));
    const lobes=max(hitMin.negate(),hitMax);
    const lobe=clamp(max(max(lobes.r,lobes.g),lobes.b),-0.1875,0).mul(sharpness);
    const result=e.add(lobe.mul(b.add(d).add(f).add(h))).div(float(1).add(lobe.mul(4)));
    return vec4(clamp(result,0,1),1);
  })();
}
