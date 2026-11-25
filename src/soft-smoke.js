import * as THREE from 'three';
import { renderTimed } from './gpu-pass-timing.js';

export const SOFT_PARTICLE_LAYER=2;

export class SoftSmokePass {
  constructor(owner, depth) {
    const base=owner.effectBatches.smoke.material;
    if(owner.webgpu){
      this.material=owner.webgpu.createSmokeMaterial(owner.activeSmokeTexture??owner.smokeTexture,depth,base.userData.smokeUniforms);
      this.uniforms=this.material.userData.softSmokeUniforms;
    }else{
      const material=this.material=base.clone();
      this.uniforms={worldDepth:{value:depth},frameSize:{value:new THREE.Vector2()},clipRange:{value:new THREE.Vector2()}};
      material.uniforms={...base.uniforms,...this.uniforms};
      material.fragmentShader=`
        uniform sampler2D worldDepth;
        uniform vec2 frameSize,clipRange;
        float viewDistance(float depth){
          return (clipRange.x*clipRange.y)/(clipRange.y-depth*(clipRange.y-clipRange.x));
        }
      `+material.fragmentShader.replace('#include <tonemapping_fragment>',`
        float world=viewDistance(texture2D(worldDepth,gl_FragCoord.xy/frameSize).r);
        float particle=viewDistance(gl_FragCoord.z);
        gl_FragColor.a*=smoothstep(.01,.48,world-particle);
        if(gl_FragColor.a<.002)discard;
        #include <tonemapping_fragment>
      `);
    }
    this.material.depthTest=false;
  }

  render(owner, target, profiler) {
    const {renderer,scene,camera}=owner, smoke=owner.effectBatches.smoke;
    const mask=camera.layers.mask, background=scene.background;
    const autoClear=renderer.autoClear, shadows=renderer.shadowMap.enabled;
    const base=smoke.material;
    const u=this.uniforms;
    u.worldDepth.value=target.depthTexture;
    u.frameSize.value.set(target.width,target.height);
    u.clipRange.value.set(camera.near,camera.far);
    try{
      camera.layers.set(SOFT_PARTICLE_LAYER);
      scene.background=null;
      renderer.autoClear=false;
      renderer.shadowMap.enabled=false;
      smoke.material=this.material;
      renderTimed(renderer,scene,camera,profiler,'softParticles');
    }finally{
      smoke.material=base;
      camera.layers.mask=mask;
      scene.background=background;
      renderer.autoClear=autoClear;
      renderer.shadowMap.enabled=shadows;
    }
  }

  dispose() { this.material.dispose(); }
}
