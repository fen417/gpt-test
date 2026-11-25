import * as THREE from 'three';
import {collectStaticCasters,withoutCasters} from './render-work.js';

// Keep the stock Three depth materials (skinning, alpha tests and sidedness).
// Merge packed depths BEFORE PCF, so overlapping static/dynamic shadows retain
// exactly the normal shadow filtering rather than multiplying two soft shadows.
export class CachedShadows {
  constructor() {
    this.staticLight=new THREE.DirectionalLight();this.staticLight.shadow.autoUpdate=false;
    this.quadScene=new THREE.Scene();this.quadCamera=new THREE.Camera();
    this.material=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,toneMapped:false,
      uniforms:{staticDepth:{value:null},dynamicDepth:{value:null}},
      vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader:'#include <packing>\nuniform sampler2D staticDepth; uniform sampler2D dynamicDepth; varying vec2 vUv; void main(){vec4 a=texture2D(staticDepth,vUv),b=texture2D(dynamicDepth,vUv);gl_FragColor=unpackRGBAToDepth(a)<unpackRGBAToDepth(b)?a:b;}' });
    this.quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.material);this.quadScene.add(this.quad);
  }
  invalidate(rebuildCasters=false){this.key=null;if(rebuildCasters){this.root=null;this.mediumRoot=null;}}
  install(owner){
    if(this.installed===owner.renderer.shadowMap)return;
    this.uninstall();this.installed=owner.renderer.shadowMap;
    const native=owner.renderer.shadowMap.render.bind(owner.renderer.shadowMap);
    this.native=owner.renderer.shadowMap.render;
    owner.renderer.shadowMap.render=(lights,scene,camera)=>{
      if(scene!==owner.scene||!owner.worldRoot?.visible||!owner.renderer.shadowMap.enabled)return native(lights,scene,camera);
      const timer=owner.perfEnabled?owner.gpuTimer:null;
      const timing=timer?.beginPass('shadows');
      try{
        if(owner.shadowDynamicOnly){
          if(this.mediumRoot!==owner.staticRoot||this.mediumRevision!==owner.staticMaterialRevision){this.mediumRoot=owner.staticRoot;this.mediumRevision=owner.staticMaterialRevision;this.mediumCasters=collectStaticCasters(owner.staticRoot);}
          return withoutCasters(this.mediumCasters,()=>native(lights,scene,camera));
        }
        // Run inside WebGLRenderer.render, with its render-state stack active.
        const hidden=owner.interiorVisibility.hidden;
        for(const mesh of hidden)mesh.visible=true;
        try{if(owner.cascades)owner.cascades.render(native);else this.render(owner,native);}finally{for(const mesh of hidden)mesh.visible=false;}
      }finally{if(timing)timer.endPass();}
    };
  }
  uninstall(){if(this.installed){this.installed.render=this.native;this.installed=null;}}
  render(owner,renderShadow,sun=owner.sun) {
    const {renderer,scene,camera,staticRoot,flags}=owner;
    if(!renderer.shadowMap.enabled||!staticRoot)return;
    const size=sun.shadow.mapSize.x;
    if(this.size!==size){
      this.disposeTargets();this.size=size;
      this.combined=new THREE.WebGLRenderTarget(size,size,{minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,depthBuffer:false});
      this.invalidate();
    }
    if(this.root!==staticRoot||this.staticRevision!==owner.staticMaterialRevision){
      this.root=staticRoot;this.staticRevision=owner.staticMaterialRevision;this.casters=[];const flagGroups=new Set([...flags.values()].map(f=>f.group));
      staticRoot.traverse(o=>{if(!o.isMesh||!o.castShadow)return;
        for(let p=o;p;p=p.parent)if(flagGroups.has(p))return;
        this.casters.push(o);
      });this.casterSet=new Set(this.casters);this.invalidate();
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
        scene.traverse(o=>{if(o.isMesh&&o.castShadow&&!this.casterSet.has(o)){hidden.push(o);o.castShadow=false;}});
        try{renderer.shadowMap.needsUpdate=true;light.shadow.needsUpdate=true;renderShadow([light],scene,camera);}
        finally{for(const o of hidden)o.castShadow=true;}
        this.key=key;
      }
      // The public sun samples the combined map; native rendering writes only
      // to its private dynamic target on the next frame.
      sun.shadow.map=this.dynamic??null;
      withoutCasters(this.casters,()=>{renderer.shadowMap.needsUpdate=true;sun.shadow.needsUpdate=true;renderShadow([sun],scene,camera);this.dynamic=sun.shadow.map;});
      this.material.uniforms.staticDepth.value=this.staticLight.shadow.map.texture;
      this.material.uniforms.dynamicDepth.value=this.dynamic.texture;
      renderer.setRenderTarget(this.combined);renderer.autoClear=false;
      renderer.render(this.quadScene,this.quadCamera);
      sun.shadow.map=this.combined;sun.shadow.needsUpdate=false;renderer.shadowMap.needsUpdate=false;
    } finally {renderer.setRenderTarget(target);renderer.autoClear=autoClear;camera.layers.mask=mask;}
  }
  disposeTargets(){this.dynamic?.dispose();this.combined?.dispose();this.staticLight.shadow.map?.dispose();this.staticLight.shadow.map=null;this.dynamic=null;}
  dispose(){this.uninstall();this.disposeTargets();this.quad.geometry.dispose();this.material.dispose();}
}
