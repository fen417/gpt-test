import { Vector3 } from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { attribute, materialColor, uv, vec2, vec3, uniform, Fn, If, sin, normalize, dot, max } from 'three/tsl';

// The WebGL path uses a GLSL camera-facing vertex shader. WebGPU uses the
// identical instancing/sorting buffers but rotates quads on CPU at write time.
export function createWebGpuSmokeMaterial(texture) {
  const material=new MeshBasicNodeMaterial({
    map:texture,transparent:true,depthWrite:false,fog:true,
  });
  const smokeLight=uniform(new Vector3()),smokeMotion=uniform(0),smokeTime=uniform(0);
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
    If(dot(smokeLight,smokeLight).greaterThan(.001),()=>{
      const puff=normalize(vec3(uv().sub(.5).mul(2),.64));
      rgba.rgb.mulAssign(max(0,dot(puff,smokeLight)).mul(.37).add(.84));
    });
    return rgba;
  })();
  material.opacityNode=attribute('instanceAlpha','float');
  material.toneMapped=true;
  return material;
}
