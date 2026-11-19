import * as THREE from 'three';
import { MeshBasicNodeMaterial, PMREMGenerator } from 'three/webgpu';
import { Fn, vec2, vec3, vec4, uniform, positionLocal, cubeTexture,
  floor, fract, dot, sin, mix, pow, max, smoothstep, normalize } from 'three/tsl';

const hash = Fn(([p]) => fract(sin(dot(p, vec2(127.1,311.7))).mul(43758.5453)));
const noise = Fn(([p]) => {
  const i = floor(p);
  const f = fract(p).mul(fract(p)).mul(vec2(3).sub(fract(p).mul(2)));
  return mix(mix(hash(i),hash(i.add(vec2(1,0))),f.x),
    mix(hash(i.add(vec2(0,1))),hash(i.add(vec2(1,1))),f.x),f.y);
});
const fbm = Fn(([coordinates]) => {
  let p=coordinates, amplitude=0.5;
  const result=vec2(0).x.toVar();
  for(let k=0;k<5;k++){
    result.addAssign(noise(p).mul(amplitude));
    p=p.mul(2.03).add(vec2(4.2,7.8));
    amplitude*=0.5;
  }
  return result;
});

export function makeWebGpuSky(scene, renderer) {
  const sunDirection=uniform(new THREE.Vector3(-.65,.42,.5).normalize());
  const hazeAmount=uniform(0);
  const hazeTint=uniform(new THREE.Color(.79,.68,.51));
  const directionalSky=Fn(()=>{
    const d=normalize(positionLocal);
    const up=max(d.y,0);
    let sky=mix(vec3(.65,.70,.70),vec3(.20,.32,.43),pow(up,.5));
    const coords=d.xz.div(max(d.y.add(.14),.12)).mul(1.5);
    const cloud=fbm(coords.mul(.7));
    const mask=smoothstep(.40,.68,cloud).mul(smoothstep(-.02,.2,d.y));
    const light=pow(max(dot(d,sunDirection),0),5);
    const cloudColor=mix(vec3(.37,.43,.46),vec3(.91,.85,.70),light.mul(.65).add(cloud.mul(.25)));
    sky=mix(sky,cloudColor,mask.mul(.85));
    const sun=pow(max(dot(d,sunDirection),0),850);
    const halo=pow(max(dot(d,sunDirection),0),16);
    sky=sky.add(vec3(1,.77,.46).mul(sun.mul(2).add(halo.mul(.14))));
    return vec4(mix(vec3(.60,.65,.65),sky,smoothstep(-.12,.02,d.y)),1);
  })();
  const sourceMaterial=new MeshBasicNodeMaterial({ side:THREE.BackSide, depthWrite:false, fog:false });
  sourceMaterial.fragmentNode=directionalSky;
  sourceMaterial.toneMapped=false;
  const environmentScene=new THREE.Scene();
  const envMesh=new THREE.Mesh(new THREE.SphereGeometry(100,24,12),sourceMaterial);
  environmentScene.add(envMesh);
  // Cubemap is computed once per world, just like the WebGL path.
  const cubeTarget=new THREE.WebGLCubeRenderTarget(256);
  cubeTarget.texture.colorSpace=THREE.SRGBColorSpace;
  new THREE.CubeCamera(.1,200,cubeTarget).update(renderer,environmentScene);
  const generator=new PMREMGenerator(renderer);
  const pmremTarget=generator.fromCubemap(cubeTarget.texture);
  scene.environment=pmremTarget.texture;
  scene.environmentIntensity=.45;
  generator.dispose();envMesh.geometry.dispose();sourceMaterial.dispose();
  const baked=new MeshBasicNodeMaterial({side:THREE.BackSide,depthWrite:false,fog:false});
  baked.toneMapped=false;
  baked.fragmentNode=Fn(()=>{
    const direction=normalize(positionLocal);
    const sampled=cubeTexture(cubeTarget.texture,direction).rgb;
    const haze=hazeAmount.mul(vec2(1).x.sub(max(direction.y,0)));
    return vec4(mix(sampled,hazeTint,haze),1);
  })();
  const sky=new THREE.Mesh(new THREE.SphereGeometry(700,20,12),baked);
  sky.renderOrder=1000;sky.frustumCulled=false;sky.userData.noBatch=true;scene.add(sky);
  return {sky,hazeAmount,envTexture:pmremTarget.texture,
    target:{dispose(){pmremTarget.dispose();cubeTarget.dispose();baked.dispose();}}};
}
