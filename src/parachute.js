import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { pairMaterials } from './visuals.js';

const url=new URL('./assets/parachute/parachute.glb',import.meta.url).href;
const riserHeight=1.42;

export class Parachutes {
  constructor(prepare) {
    this.prepare=prepare;
    this.rigs=new Map();
  }

  load() {
    return this.loading??=new GLTFLoader().loadAsync(url).then(({scene})=>{
      scene.traverse(mesh=>{
        if(!mesh.isMesh)return;
        const high=mesh.material;
        pairMaterials(high,new THREE.MeshLambertMaterial({color:high.color,side:high.side}));
        mesh.castShadow=high.name.includes('ripstop');
        mesh.receiveShadow=false;
        this.prepare(mesh);
        this.prepare({material:high._lowMaterial});
      });
      if(this.disposed)this.release(scene);
      else this.asset=scene;
    }).catch(error=>{
      this.loading=null;
      console.error('Parachute model:',error);
    });
  }

  update(parent,players,dt,low) {
    const active=new Set();
    for(const player of players){
      if(!player.alive||!player.parachuteOpen||player.vehicleId)continue;
      if(!this.asset){this.load();continue;}
      const {id,x,y,z}=player;
      active.add(id);
      let rig=this.rigs.get(id);
      if(!rig){
        const group=this.asset.clone(true);
        const meshes=[];
        group.traverse(mesh=>{if(mesh.isMesh)meshes.push({mesh,high:mesh.material});});
        parent.add(group);
        rig={group,meshes,x,z,yaw:player.yaw??0,age:0,phase:0,travelX:0,travelZ:0};
        group.position.set(x,y+riserHeight,z);
        this.rigs.set(id,rig);
      }
      rig.group.position.set(x,y+riserHeight,z);
      const motion=1-Math.exp(-dt*7);
      rig.travelX=THREE.MathUtils.lerp(rig.travelX,(x-rig.x)/dt,motion);
      rig.travelZ=THREE.MathUtils.lerp(rig.travelZ,(z-rig.z)/dt,motion);
      if(Math.hypot(rig.travelX,rig.travelZ)>.9){
        const turn=Math.atan2(-rig.travelX,-rig.travelZ)-rig.yaw;
        rig.yaw+=Math.atan2(Math.sin(turn),Math.cos(turn))*motion;
      }
      rig.x=x;
      rig.z=z;
      rig.age+=dt;
      rig.phase+=dt*2.45;
      rig.group.rotation.set(Math.sin(rig.phase)*.030,rig.yaw,Math.cos(rig.phase*.77)*.037,'YXZ');
      const scale=THREE.MathUtils.smoothstep(rig.age,0,.5);
      rig.group.scale.set(.24+.76*scale,.45+.55*scale,.34+.66*scale);
      if(rig.low!==low){
        for(const {mesh,high} of rig.meshes)mesh.material=low?high._lowMaterial:high;
        rig.low=low;
      }
    }
    for(const [id,rig] of this.rigs){
      if(active.has(id))continue;
      rig.group.removeFromParent();
      this.rigs.delete(id);
    }
  }

  clear() {
    for(const {group} of this.rigs.values())group.removeFromParent();
    this.rigs.clear();
  }

  release(asset) {
    asset.traverse(mesh=>{
      if(!mesh.isMesh)return;
      mesh.geometry.dispose();
      mesh.material._lowMaterial?.dispose();
      mesh.material.dispose();
    });
  }

  dispose() {
    this.disposed=true;
    this.clear();
    if(this.asset)this.release(this.asset);
    this.asset=null;
  }
}
