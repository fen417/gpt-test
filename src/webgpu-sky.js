import * as THREE from 'three';
import {atmosphereProfile,CLOUD_LEVEL,makeCloudTexture,ensureCloudTexture} from './atmosphere-profile.js';
import { MeshBasicNodeMaterial, PMREMGenerator, CubeRenderTarget } from 'three/webgpu';
export { PMREMGenerator, CubeRenderTarget } from 'three/webgpu';
import { Fn, vec2, vec3, vec4, uniform, positionLocal, cubeTexture, texture,
  floor, fract, dot, sin, mix, pow, max, smoothstep, normalize, exp, clamp, If } from 'three/tsl';

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
  const cubeTarget=new CubeRenderTarget(256);
  cubeTarget.texture.colorSpace=THREE.SRGBColorSpace;
  new THREE.CubeCamera(.1,200,cubeTarget).update(renderer,environmentScene);
  const generator=new PMREMGenerator(renderer);
  const pmremTarget=generator.fromCubemap(cubeTarget.texture);
  scene.environment=pmremTarget.texture;
  scene.environmentIntensity=.45;
  generator.dispose();envMesh.geometry.dispose();sourceMaterial.dispose();
  const advancedSky=uniform(0), liveSun=uniform(new THREE.Vector3()), skyTime=uniform(0);
  const cloudMap=makeCloudTexture(),cloudParams=uniform(new THREE.Vector4()),airTint=uniform(new THREE.Color()),airMix=uniform(0);
  const baked=new MeshBasicNodeMaterial({side:THREE.BackSide,depthWrite:false,fog:false});
  baked.toneMapped=false;
  baked.fragmentNode=Fn(()=>{
    const direction=normalize(positionLocal);
    const sampled=vec3(0).toVar();
    If(advancedSky.greaterThan(0),()=>{
      const daylight=smoothstep(-.03,.34,liveSun.y);
      const mu=max(0,dot(direction,liveSun)).toVar();
      const zenith=mix(vec3(.12,.19,.33),vec3(.071,.225,.48),daylight);
      const horizon=mix(mix(vec3(.50,.325,.27),vec3(.54,.65,.73),daylight),airTint,airMix);
      const air=exp(max(0,direction.y).mul(-5.5));
      const sky=mix(zenith,horizon,air).toVar();
      const sunlight=mix(vec3(1,.48,.23),vec3(1,.86,.64),daylight);
      sky.addAssign(sunlight.mul(pow(mu,12).mul(air.mul(.17).add(.12)).add(pow(mu,36).mul(.035))));
      const cloud=vec2(0).x.toVar();
      If(cloudParams.w.greaterThan(0),()=>{
        const p=direction.xz.div(max(.13,direction.y.add(.13))).mul(.22).add(cloudParams.yz.mul(skyTime));
        const cell=texture(cloudMap).sample(p).toVar(),field=cell.r.toVar(),edge=vec2(.10).x.toVar();
        const horizonFade=smoothstep(.018,.20,direction.y);
        If(cloudParams.w.greaterThan(2.5),()=>{
          const offset=texture(cloudMap).sample(p.add(liveSun.xz.mul(.022))).r;
          const fine=texture(cloudMap).sample(p.mul(2.7).add(vec2(.37,.11))).b;
          field.assign(field.mul(.83).add(fine.mul(.17)));edge.assign(offset.sub(cell.r));
        });
        cloud.assign(smoothstep(cloudParams.x.sub(.095),cloudParams.x.add(.12),field).mul(horizonFade));
        If(cloudParams.w.greaterThan(1.5),()=>{
          const p2=direction.xz.div(max(.18,direction.y.add(.18))).mul(vec2(.33,.12)).sub(cloudParams.zy.mul(skyTime).mul(.58)).add(vec2(.51,.12));
          const wisps=smoothstep(.52,.76,texture(cloudMap).sample(p2).g).mul(horizonFade);
          sky.assign(mix(sky,mix(vec3(.37,.43,.50),vec3(.87,.86,.81),daylight),wisps.mul(.37)));
          cloud.assign(max(cloud,wisps.mul(.26)));
        });
        const shadow=mix(vec3(.20,.18,.22),vec3(.30,.37,.44),daylight),lit=mix(vec3(.94,.49,.27),vec3(.91,.93,.91),daylight);
        const shade=mix(shadow,lit,clamp(edge.mul(4.5).add(mu.mul(.34)).add(field.mul(.14)).add(.40),0,1)).add(sunlight.mul(pow(mu,48)).mul(cloud.oneMinus()).mul(.17));
        sky.assign(mix(sky,shade,cloud.mul(.94)));
      });
      const disk=smoothstep(.999984,.999991,mu);
      sky.addAssign(sunlight.mul(disk.mul(8).add(pow(mu,110).mul(.20))).mul(cloud.oneMinus()));
      sampled.assign(mix(horizon,sky,smoothstep(-.09,.035,direction.y)));
    }).Else(()=>{sampled.assign(cubeTexture(cubeTarget.texture,direction).rgb);});
    const haze=hazeAmount.mul(vec2(1).x.sub(max(direction.y,0)));
    return vec4(mix(sampled,hazeTint,haze),1);
  })();
  const sky=new THREE.Mesh(new THREE.SphereGeometry(700,20,12),baked);
  sky.renderOrder=1000;sky.frustumCulled=false;sky.userData.noBatch=true;scene.add(sky);
  return {sky,hazeAmount,hazeTint,environmentTarget:pmremTarget,envTexture:pmremTarget.texture,
    update(mode, direction, time,cloudQuality,map,fogColor) {
      advancedSky.value=mode==='high'?1:0;
      if(mode==='high'){
        const p=atmosphereProfile(map),level=CLOUD_LEVEL[cloudQuality]??0;
        if(level)ensureCloudTexture(cloudMap);
        liveSun.value.copy(direction).normalize();skyTime.value=time;
        cloudParams.value.set(p[0],p[1],p[2],level);airMix.value=p[3];if(fogColor)airTint.value.copy(fogColor);
      }
    },
    target:{dispose(){pmremTarget.dispose();cubeTarget.dispose();baked.dispose();cloudMap.dispose();}}};
}
