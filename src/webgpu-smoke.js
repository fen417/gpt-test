import { Vector2, Vector3 } from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { attribute, materialColor, uv, vec2, vec3, uniform, Fn, If, sin, normalize, dot, max, texture as textureNode, screenUV, positionView, wgslFn } from 'three/tsl';

// The WebGL path uses a GLSL camera-facing vertex shader. WebGPU uses the
// identical instancing/sorting buffers but rotates quads on CPU at write time.
const softSmokeFade=wgslFn(`
fn softSmokeFade(depth: texture_depth_2d, uv: vec2f, screen: vec2f, clip: vec2f, particle: f32) -> f32 {
  let at=vec2i(clamp(uv*screen,vec2f(0.),screen-1.));
  let nativeDepth=textureLoad(depth,at,0);
  let surface=(clip.x*clip.y)/(clip.y-nativeDepth*(clip.y-clip.x));
  return smoothstep(.01,.48,surface-particle);
}`);
export function createWebGpuSmokeMaterial(texture, depth=null, shared=null) {
  const material=new MeshBasicNodeMaterial({
    map:texture,transparent:true,depthWrite:false,fog:true,
  });
  const {smokeLight,smokeMotion,smokeTime}=shared??{
    smokeLight:uniform(new Vector3()),smokeMotion:uniform(0),smokeTime:uniform(0),
  };
  material.userData.smokeUniforms={smokeLight,smokeMotion,smokeTime};
  const sampleUV=Fn(()=>{
    const st=uv().toVar();
    If(smokeMotion.greaterThan(0),()=>{
      const wobble=sin(st.sub(.5).yx.mul(vec2(11,8)).add(vec2(smokeTime.mul(1.3),smokeTime.mul(-.8))));
      st.addAssign(wobble.mul(.038));
    });
    return st;
  })();
  material.colorNode=Fn(()=>{
    const rgba=materialColor.context({getUV:()=>sampleUV}).toVar();
    If(smokeMotion.greaterThan(1.5),()=>{
      const at=sampleUV.sub(.5).mul(1.42).add(.5).add(vec2(sin(smokeTime.mul(.37)),sin(smokeTime.mul(.29).add(1.5708))).mul(.065));
      const d=textureNode(texture).sample(at);
      rgba.rgb.assign(rgba.rgb.mul(d.a.mul(-.20).add(1)).add(d.rgb.mul(d.a.mul(.20))));
      rgba.a.mulAssign(d.a.mul(.24).add(.76));
    });
    If(dot(smokeLight,smokeLight).greaterThan(.001),()=>{
      const puff=normalize(vec3(uv().sub(.5).mul(2),.64));
      rgba.rgb.mulAssign(max(0,dot(puff,smokeLight)).mul(.37).add(.84));
    });
    return rgba;
  })();
  const alpha=attribute('instanceAlpha','float');
  material.opacityNode=alpha;
  if(depth){
    const worldDepth=textureNode(depth),frameSize=uniform(new Vector2()),clipRange=uniform(new Vector2());
    material.userData.softSmokeUniforms={worldDepth,frameSize,clipRange};
    material.opacityNode=alpha.mul(softSmokeFade({
      depth:worldDepth,uv:screenUV,screen:frameSize,clip:clipRange,particle:positionView.z.negate(),
    }));
  }
  material.toneMapped=true;
  return material;
}
