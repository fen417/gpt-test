import * as THREE from 'three';
import { CSM } from 'three/addons/csm/CSM.js';
import { CSMShader } from 'three/addons/csm/CSMShader.js';
import {setWebGlShaderPatch} from './webgl-shader-patches.js';
import { directionalPenumbraScale,applyCascadeShadowBias } from './directional-penumbra.js';
import { CachedShadows } from './cached-shadows.js';
import {StaticMaterialVisitor} from './render-work.js';
import {cascadePolicy,cascadeDue} from './cascade-schedule.js';

export function shadowCascadeOptions(level, distance) {
  const count = level === 'ultra' ? 3 : 2;
  const maxFar = distance === 'near' ? 78 : distance === 'far' ? 145 : 109;
  const sizes = count === 3 ? [2048, 1024, 1024] : [1024, 1024];
  return {
    sizes,
    data: {
      cascades: count, maxFar, mode: 'custom', lightMargin: 88,
      customSplitsCallback(amount, _near, far, breaks) {
        breaks.push(...(amount === 3 ? [Math.min(.25, 14 / far), Math.min(.58, 42 / far)] : [.29]), 1);
      },
    },
  };
}

// Scope the Three.js CSM chunks to the game's materials. The library's global
// ShaderChunk override would also affect previews and the legacy renderer.
class ScopedCsm extends CSM {
  _injectInclude() {}
}

export class WebGlCascades {
  constructor(owner, options) {
    this.owner=owner;
    this.csm=new ScopedCsm({
      ...options.data, camera:owner.camera, parent:owner.scene, lightNear:1, lightFar:295, shadowBias:-.00025,
    });
    this.csm.fade=true;
    this.materials=new Set();this.materialVisitor=new StaticMaterialVisitor();
    this.uniforms={CSM_cascades:{value:[]},cameraNear:{value:0},shadowFar:{value:0}};
    this.axis=new THREE.Vector3();
    this.right=new THREE.Vector3();
    this.up=new THREE.Vector3();
    this.vertical=new THREE.Vector3(0,1,0);
    this.caches=this.csm.lights.map((light,index)=>{
      light.layers.mask=owner.sun.layers.mask;
      light.shadow.mapSize.setScalar(options.sizes[index]);
      applyCascadeShadowBias(light.shadow,owner.pcssShadows);
      light.shadow.autoUpdate=false;
      return new CachedShadows();
    });
    owner.sun.removeFromParent();
    this.lastProjection=new THREE.Matrix4().multiplyScalar(0);
    this.records=[];this.previousDirection=new THREE.Vector3();this.invalidated=true;
    this.counters={rendered:0,reused:0,frames:0,lastMask:0};
    this.visitMaterial=object=>{
      if(!object.material)return;
      if(Array.isArray(object.material)){
        for(const material of object.material)this.bind(material);
      }else this.bind(object.material);
    };
  }

  bind(material) {
    if(!(material.isMeshStandardMaterial||material.isMeshLambertMaterial||material.isMeshPhongMaterial)||this.materials.has(material))return;
    const defs=material.defines??(material.defines={});
    defs.USE_CSM=1;
    defs.CSM_CASCADES=this.csm.cascades;
    defs.CSM_FADE='';
    setWebGlShaderPatch(material,'cascades',shader=>{
      Object.assign(shader.uniforms,this.uniforms);
      shader.fragmentShader=shader.fragmentShader
        .replace('#include <lights_pars_begin>',CSMShader.lights_pars_begin)
        .replace('#include <lights_fragment_begin>',CSMShader.lights_fragment_begin);
    });
    this.materials.add(material);
  }

  update() {
    const {owner,csm,uniforms}=this, camera=owner.camera;
    camera.updateMatrixWorld();
    if(!this.lastProjection.equals(camera.projectionMatrix)){
      this.lastProjection.copy(camera.projectionMatrix);
      csm.updateFrustums();
      csm._getExtendedBreaks(uniforms.CSM_cascades.value);
      uniforms.cameraNear.value=camera.near;
      uniforms.shadowFar.value=Math.min(csm.maxFar,camera.far);
      for(let i=0;i<csm.lights.length;i++){
        const light=csm.lights[i],c=light.shadow.camera;
        const guard=cascadePolicy(i,(c.right-c.left)/light.shadow.mapSize.x).guard;
        c.left-=guard;c.right+=guard;c.top+=guard;c.bottom-=guard;c.updateProjectionMatrix();
        applyCascadeShadowBias(light.shadow,owner.pcssShadows);
        if(owner.pcssShadows)light.shadow.radius=directionalPenumbraScale(light.shadow);
      }
      this.invalidate();
    }
    csm.lightDirection.copy(owner.sunOffset).negate().normalize();
    const sunChanged=this.previousDirection.distanceToSquared(csm.lightDirection)>1e-8;
    csm.update();
    let mask=0;
    // Snap all three light-space axes to a coarser grid than one texel.
    // This keeps the cached static pass useful through small camera movements.
    const axis=this.axis.copy(csm.lightDirection);
    const right=this.right.crossVectors(axis,this.vertical).normalize();
    const up=this.up.crossVectors(right,axis).normalize();
    for(let i=0;i<csm.lights.length;i++){
      const light=csm.lights[i], snap=[.45,1.1,2.8][i];
      const x=light.position.dot(right), y=light.position.dot(up), z=light.position.dot(axis);
      light.position.copy(right).multiplyScalar(Math.round(x/snap)*snap)
        .addScaledVector(up,Math.round(y/snap)*snap).addScaledVector(axis,Math.round(z/snap)*snap);
      light.target.position.copy(light.position).add(axis);
      const c=light.shadow.camera,texel=(c.right-c.left)/light.shadow.mapSize.x,record=this.records[i];
      const displacement=record?record.position.distanceTo(light.position):Infinity;
      const due=cascadeDue({index:i,frame:owner.frameCount,lastFrame:record?.frame,displacement,texel,invalidated:this.invalidated||!this.caches[i].key,sunChanged});
      if(due){mask|=1<<i;}
      else{light.position.copy(record.position);light.target.position.copy(record.target);}
      light.color.copy(owner.sun.color);
      light.intensity=owner.sun.intensity;
      light.updateMatrixWorld();
      light.target.updateMatrixWorld();
    }
    this.pendingMask=mask;this.previousDirection.copy(csm.lightDirection);
    this.materialVisitor.visit(owner.scene,owner.staticRoot,owner.staticMaterialRevision,this.visitMaterial);
  }

  render(native) {
    const {owner,csm}=this;
    let mask=0;
    for(let i=0;i<csm.lights.length;i++){
      const light=csm.lights[i], cache=this.caches[i];
      if(!(this.pendingMask&(1<<i))&&cache.key){this.counters.reused++;continue;}
      cache.render(owner,native,light);
      this.records[i]={position:light.position.clone(),target:light.target.position.clone(),frame:owner.frameCount};
      mask|=1<<i;this.counters.rendered++;
    }
    this.counters.frames++;this.counters.lastMask=mask;this.invalidated=false;
  }

  stats(){return {...this.counters,cascades:this.csm.cascades};}
  invalidate(rebuildCasters=false) {
    this.invalidated=true;
    if(rebuildCasters)this.materialVisitor.invalidate();
    for(const cache of this.caches)cache.invalidate(rebuildCasters);
  }

  dispose() {
    this.csm.remove();
    for(const light of this.csm.lights)light.dispose();
    for(const cache of this.caches)cache.dispose();
    for(const material of this.materials){
      setWebGlShaderPatch(material,'cascades',null);
      delete material.defines.USE_CSM;
      delete material.defines.CSM_CASCADES;
      delete material.defines.CSM_FADE;
      material.needsUpdate=true;
    }
    this.materials.clear();
    this.owner.scene.add(this.owner.sun);
  }
}
