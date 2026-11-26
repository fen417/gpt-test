import * as THREE from 'three';
import {collectStaticCasters,withoutCasters,staticShadowPrunePlan,withStaticShadowPruned,frameShadowCandidates} from './render-work.js';

// Keep the stock Three depth materials (skinning, alpha tests and sidedness).
// r187 stores native depth textures, not RGBA-packed shadow colors.
// Merge the nearest depth BEFORE applying the game's PCF/PCSS filters.
export class CachedShadows {
  constructor() {
    this.staticLight=new THREE.DirectionalLight();this.staticLight.shadow.autoUpdate=false;
    this.quadScene=new THREE.Scene();this.quadCamera=new THREE.Camera();
    this.material=new THREE.ShaderMaterial({depthTest:true,depthWrite:true,depthFunc:THREE.AlwaysDepth,colorWrite:false,toneMapped:false,blending:THREE.NoBlending,
      uniforms:{staticDepth:{value:null},dynamicDepth:{value:null}},
      vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader:'uniform sampler2D staticDepth; uniform sampler2D dynamicDepth; varying vec2 vUv; void main(){float a=texture2D(staticDepth,vUv).r,b=texture2D(dynamicDepth,vUv).r;gl_FragDepth=min(a,b);gl_FragColor=vec4(0.);}' });
    this.counters={staticRefresh:0,staticReuse:0,dynamicRefresh:0,combined:0,prunedBranches:0};
    this.quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.material);this.quad.frustumCulled=false;this.quadScene.add(this.quad);
  }
  invalidate(rebuildCasters=false){this.key=null;if(rebuildCasters){this.root=null;this.mediumRoot=null;this.casters=[];this.casterSet=null;this.prunePlan=null;this.mediumCasters=[];}}
  install(owner){
    if(this.installed===owner.renderer.shadowMap)return;
    this.uninstall();this.installed=owner.renderer.shadowMap;
    const native=owner.renderer.shadowMap.render.bind(owner.renderer.shadowMap);
    this.native=owner.renderer.shadowMap.render;
    owner.renderer.shadowMap.render=(lights,scene,camera)=>{
      if(scene!==owner.scene||!owner.worldRoot?.visible||!owner.renderer.shadowMap.enabled)return native(lights,scene,camera);
      if(owner.shadowMenuIdle&&!owner.renderer.shadowMap.needsUpdate)return;
      const timer=owner.perfEnabled?owner.gpuTimer:null;
      const timing=timer?.beginPass('shadows');
      const hidden=owner.interiorVisibility.hidden;
      for(const mesh of hidden)mesh.visible=true;
      try{
        if(owner.shadowDynamicOnly){
          if(this.mediumRoot!==owner.staticRoot||this.mediumRevision!==owner.staticMaterialRevision){this.mediumRoot=owner.staticRoot;this.mediumRevision=owner.staticMaterialRevision;this.mediumCasters=collectStaticCasters(owner.staticRoot);}
          return withoutCasters(this.mediumCasters,()=>native(lights,scene,camera));
        }
        // Run inside WebGLRenderer.render, with its render-state stack active.
        if(owner.cascades)owner.cascades.render(native);else this.render(owner,native);
      }finally{for(const mesh of hidden)mesh.visible=false;if(timing)timer.endPass();}
    };
  }
  uninstall(){if(this.installed){this.installed.render=this.native;this.installed=null;}}
  render(owner,renderShadow,sun=owner.sun) {
    const {renderer,scene,camera,staticRoot,flags}=owner;
    if(!renderer.shadowMap.enabled||!staticRoot)return;
    const size=sun.shadow.mapSize.x;
    if(this.size!==size){
      this.disposeTargets();this.size=size;
      const depthTexture=new THREE.DepthTexture(size,size,THREE.UnsignedIntType);
      depthTexture.minFilter=depthTexture.magFilter=THREE.NearestFilter;
      depthTexture.compareFunction=null;
      this.combined=new THREE.WebGLRenderTarget(size,size,{minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,depthBuffer:true,depthTexture});
      this.invalidate();
    }
    if(this.root!==staticRoot||this.staticRevision!==owner.staticMaterialRevision){
      this.root=staticRoot;this.staticRevision=owner.staticMaterialRevision;this.casters=[];const flagGroups=new Set([...flags.values()].map(f=>f.group));
      staticRoot.traverse(o=>{if(!o.isMesh||!o.castShadow)return;
        for(let p=o;p;p=p.parent)if(flagGroups.has(p))return;
        this.casters.push(o);
      });this.casterSet=new Set(this.casters);
      this.prunePlan=staticShadowPrunePlan(staticRoot,this.casterSet,flagGroups);this.invalidate();
    }
    const key=[sun.position.x,sun.position.y,sun.position.z,sun.target.position.x,sun.target.position.y,sun.target.position.z,size,...sun.shadow.camera.projectionMatrix.elements].join('/');
    const mask=camera.layers.mask;camera.layers.set(0);
    const target=renderer.getRenderTarget(),autoClear=renderer.autoClear;
    try {
      if(this.key!==key){
        const light=this.staticLight;
        light.position.copy(sun.position);light.target.position.copy(sun.target.position);
        light.updateMatrixWorld();light.target.updateMatrixWorld();
        light.shadow.camera.copy(sun.shadow.camera);light.shadow.mapSize.copy(sun.shadow.mapSize);
        light.shadow.bias=sun.shadow.bias;light.shadow.normalBias=sun.shadow.normalBias;
        const hidden=[];
        for(const o of frameShadowCandidates(owner))if(o.castShadow&&!this.casterSet.has(o)){hidden.push(o);o.castShadow=false;}
        try{renderer.shadowMap.needsUpdate=true;light.shadow.needsUpdate=true;renderShadow([light],scene,camera);}
        finally{for(const o of hidden)o.castShadow=true;}
        this.key=key;this.counters.staticRefresh++;
      }else this.counters.staticReuse++;
      // The public sun samples the combined map; native rendering writes only
      // to its private dynamic target on the next frame.
      sun.shadow.map=this.dynamic??null;
      withStaticShadowPruned(this.prunePlan,()=>{renderer.shadowMap.needsUpdate=true;sun.shadow.needsUpdate=true;renderShadow([sun],scene,camera);this.dynamic=sun.shadow.map;});
      this.counters.prunedBranches=this.prunePlan.branches.length;
      this.counters.dynamicRefresh++;
      this.material.uniforms.staticDepth.value=this.staticLight.shadow.map.depthTexture;
      this.material.uniforms.dynamicDepth.value=this.dynamic.depthTexture;
      renderer.setRenderTarget(this.combined);renderer.autoClear=false;
      renderer.render(this.quadScene,this.quadCamera);
      this.counters.combined++;
      sun.shadow.map=this.combined;sun.shadow.needsUpdate=false;renderer.shadowMap.needsUpdate=false;
    } finally {renderer.setRenderTarget(target);renderer.autoClear=autoClear;camera.layers.mask=mask;}
  }
  stats(){return {...this.counters};}
  disposeTargets(){this.dynamic?.dispose();this.combined?.dispose();this.staticLight.shadow.map?.dispose();this.staticLight.shadow.map=null;this.dynamic=null;this.combined=null;}
  dispose(){this.uninstall();this.disposeTargets();this.quad.geometry.dispose();this.material.dispose();}
}
