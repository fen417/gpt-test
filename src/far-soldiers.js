import * as THREE from 'three';

export class FarSoldiers {
  constructor(root){this.root=root;this.batches=new Map();this.time={value:0};}
  begin(time){this.time.value=time;for(const batch of this.batches.values())batch.mesh.count=0;}
  add(rig){
    const geometry=rig.distantGeometry,key=geometry.uuid;let batch=this.batches.get(key);
    if(!batch){
      const material=new THREE.MeshLambertMaterial({map:rig.body.material.map,vertexColors:true});material.onBeforeCompile=shader=>{
        shader.uniforms.farTime=this.time;shader.vertexShader='uniform float farTime;attribute float farMotion;\n'+shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
          float stride=sin(farTime*7.0+instanceMatrix[3].x*0.7+sign(position.x)*1.5708);
          transformed.z+=stride*0.055*farMotion*max(0.0,0.85-position.y);`);
      };
      const instancedGeometry=geometry.clone(),motion=new THREE.InstancedBufferAttribute(new Float32Array(128),1);motion.setUsage(THREE.DynamicDrawUsage);instancedGeometry.setAttribute('farMotion',motion);
      const mesh=new THREE.InstancedMesh(instancedGeometry,material,128);mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.count=0;mesh.frustumCulled=false;mesh.castShadow=false;this.root.add(mesh);batch={mesh,material,motion};this.batches.set(key,batch);
    }
    if(batch.mesh.count>=128)return false;
    rig.group.updateMatrix();batch.motion.setX(batch.mesh.count,Math.min(1,(rig.motion?.speed??0)/2));batch.mesh.setMatrixAt(batch.mesh.count++,rig.group.matrix);return true;
  }
  end(){for(const {mesh,motion} of this.batches.values()){mesh.visible=mesh.count>0;mesh.instanceMatrix.needsUpdate=true;motion.needsUpdate=true;}}
  clear(){for(const {mesh,material} of this.batches.values()){mesh.removeFromParent();mesh.dispose();mesh.geometry.dispose();material.dispose();}this.batches.clear();}
}
