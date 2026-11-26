import * as THREE from 'three';
import { renderTimed } from './gpu-pass-timing.js';

const supportedMaps=new Set(['port','fy_pool_day','linden_estate','nahar']);
// Negative values describe translucent receivers; water has its own distinct code.
export const WATER_RECEIVER=-.12;
const surfaces={glazing:.28,glass:-.28,skylight:-.34,'city-glass':.33,metal:.61,asphalt:1};
const puddles=[[-108,30,2.7,3.6],[-108,-54,3.1,4.2],[6,-38,4.2,2.1]];

export function puddleField(type, position, vector) {
  const declaration=type==='glsl'?'float coverage=':'let coverage=';
  const terms=puddles.map(([x,z,rx,rz])=>
    `(1.-smoothstep(.68,1.,length((${position}-${vector}(${x}.,${z}.))/${vector}(${rx},${rz}))))`);
  return `${declaration}max(${terms[0]},max(${terms[1]},${terms[2]}));`;
}

export function makeGlReflectionReceiver(roughness, side) {
  return new THREE.ShaderMaterial({side,toneMapped:false,uniforms:{roughness:{value:roughness}},
    vertexShader:`varying vec3 viewNormal; varying vec3 worldPoint; varying float range;
      void main(){vec4 p=modelViewMatrix*vec4(position,1.);range=-p.z;
        viewNormal=normalMatrix*normal;worldPoint=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*p;}`,
    fragmentShader:`varying vec3 viewNormal; varying vec3 worldPoint; varying float range; uniform float roughness;
      void main(){
        float kind=roughness;
        if(kind==1.){${puddleField('glsl','worldPoint.xz','vec2')} if(coverage<.04)discard; kind=1.+coverage;}
        vec3 n=normalize(viewNormal)*(gl_FrontFacing?1.:-1.);
        n/=abs(n.x)+abs(n.y)+abs(n.z);
        vec2 oct=n.z>=0.?n.xy:(1.-abs(n.yx))*mix(vec2(-1.),vec2(1.),step(vec2(0.),n.xy));
        gl_FragColor=vec4(oct,kind,range);
      }`,
  });
}

export class ReflectionReceivers {
  scene=new THREE.Scene();
  entries=[];
  materials=new Map();
  frustum=new THREE.Frustum();
  projection=new THREE.Matrix4();
  sphere=new THREE.Sphere();
  clearColor=new THREE.Color();
  count=0;

  constructor(createMaterial) { this.createMaterial=createMaterial; }

  update(mapId,root,camera,enabled,extraWater) {
    extraWater=extraWater?.userData.waterReflection?extraWater:null;
    this.count=0;
    if(!enabled||!root||!supportedMaps.has(mapId)){
      if(this.root)this.invalidate();
      return false;
    }
    if(this.root!==root||this.extraWater!==extraWater){
      this.invalidate();this.root=root;this.extraWater=extraWater;
      const register=source=>{
        if(!source.isMesh||source.isInstancedMesh||!source.geometry.attributes.normal||Array.isArray(source.material))return;
        const tag=source.userData.portSurface??source.userData.architecturalSurface??source.userData.villageSurface;
        const roughness=source.userData.waterReflection?WATER_RECEIVER:surfaces[tag];
        if(!roughness||(roughness===1&&mapId!=='port')||(mapId==='nahar'&&tag!=='city-glass'&&roughness!==WATER_RECEIVER))return;
        const proxy=new THREE.Mesh(source.geometry,source.material);
        proxy.matrixAutoUpdate=false;
        this.scene.add(proxy);
        this.entries.push({proxy,source,roughness});
      };
      root.traverse(register);
      if(extraWater)register(extraWater);
    }
    if(!this.entries.length)return false;
    camera.updateMatrixWorld();
    this.projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projection,camera.coordinateSystem);
    for(const {proxy,source,roughness} of this.entries){
      proxy.visible=false;
      if(!source.material?.visible||(!source.material.isMeshStandardMaterial&&!source.material.isMeshPhysicalMaterial))continue;
      let visible=true;
      for(let node=source;node;node=node.parent)if(!node.visible){visible=false;break;}
      if(!visible)continue;
      if(roughness===WATER_RECEIVER&&!source.userData.waterReflection)continue;
      const geometry=source.geometry;proxy.geometry=geometry;
      if(!geometry.boundingSphere)geometry.computeBoundingSphere();
      this.sphere.copy(geometry.boundingSphere).applyMatrix4(source.matrixWorld);
      if(camera.position.distanceToSquared(this.sphere.center)>(this.sphere.radius+75)**2||!this.frustum.intersectsSphere(this.sphere))continue;
      const side=source.material.side;
      const id=roughness+'/'+side;
      if(!this.materials.has(id))this.materials.set(id,this.createMaterial(roughness,side));
      proxy.material=this.materials.get(id);
      if(!proxy.matrix.equals(source.matrixWorld)){proxy.matrix.copy(source.matrixWorld);proxy.matrixWorldNeedsUpdate=true;}
      proxy.visible=true;this.count++;
    }
    return true;
  }

  render(renderer,target,camera,profiler) {
    const alpha=renderer.getClearAlpha();
    renderer.getClearColor(this.clearColor);
    renderer.setClearColor(0,0);
    try{
      renderer.setRenderTarget(target);
      renderTimed(renderer,this.scene,camera,profiler,'reflectionMask');
    }finally{renderer.setClearColor(this.clearColor,alpha);}
  }

  invalidate() { this.root=this.extraWater=null;this.entries.length=0;this.scene.clear();this.count=0; }
  dispose() { this.invalidate();for(const material of this.materials.values())material.dispose();this.materials.clear(); }
}
