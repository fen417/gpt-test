import * as THREE from 'three';
import { BLACK_HAWK_GUN, blackHawkGunAngles } from '../shared/vehicles.js';
import { blackHawkModel } from './light-vehicle-models.js';

const burnt = new WeakMap();
const flashGeometry = new THREE.SphereGeometry(1,8,5);
flashGeometry.userData.sharedVehicleGeometry = true;
const rotorGeometry = new THREE.RingGeometry(.7,8.15,44);
rotorGeometry.rotateX(-Math.PI/2);
rotorGeometry.userData.sharedVehicleGeometry = true;
const wreckColor = new THREE.Color(0x322b25);

function wreckMaterial(base) {
  if(!burnt.has(base)){
    const material = base.clone();
    material.color.lerp(wreckColor,.74);
    material.emissive?.setHex(0);
    burnt.set(base,material);
  }
  return burnt.get(base);
}

export function createBlackHawkRig() {
  const group = new THREE.Group(), body = new THREE.Group(), controls = new THREE.Group();
  body.rotation.order='YXZ';
  group.add(body);
  controls.position.set(-.59,1.77,-2.45);
  body.add(controls);
  const model = blackHawkModel.clone();
  body.add(model);
  const lods = [0,1,2].map(i=>{
    const prefix=`LOD${i}`;
    const root=model.getObjectByName(prefix);
    const parts=Object.fromEntries(['Cabin','MainRotor','TailRotor','Minigun'].map(part=>[
      part,model.getObjectByName(prefix+'_'+part),
    ]));
    const meshes=[];
    root.traverse(mesh=>{if(mesh.isMesh)meshes.push({mesh,base:mesh.material});});
    return {root,meshes,...parts};
  });
  const mount = new THREE.Group(), gun = new THREE.Group();
  mount.position.set(BLACK_HAWK_GUN.x,BLACK_HAWK_GUN.y,BLACK_HAWK_GUN.z);
  mount.add(gun);
  body.add(mount);
  const grips = new THREE.Group();
  grips.position.z=.25;
  gun.add(grips);
  const flash = new THREE.Mesh(flashGeometry,new THREE.MeshBasicMaterial({color:0xffbd65,transparent:true,depthWrite:false,toneMapped:false}));
  flash.position.z=-1.22;
  flash.scale.set(.11,.11,.30);
  flash.visible=false;
  gun.add(flash);
  const rotorDisk = new THREE.Mesh(rotorGeometry,new THREE.MeshBasicMaterial({
    color:0x535449,transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide,
  }));
  rotorDisk.position.set(0,4.39,.08);
  body.add(rotorDisk);
  return {
    blackHawk:true,assetReady:true,group,body,controls,lods,rotorDisk,wheels:[],riders:[],
    turret:{gun,grips},mount,flash,rotorSpeed:0,rotorAngle:0,tailAngle:0,
    materialsToDispose:new Set([flash.material,rotorDisk.material]),
  };
}

export function updateBlackHawkRig(rig,vehicle,player,dt,blend,view,terrain) {
  const {group,body,controls,rotorDisk,lods,mount,turret,flash}=rig;
  const reset=!rig.initialized||Math.hypot(group.position.x-vehicle.x,group.position.z-vehicle.z)>9;
  const t=reset?1:Math.min(blend,1-Math.exp(-dt*18)), mix=THREE.MathUtils.lerp;
  group.position.set(mix(group.position.x,vehicle.x,t),mix(group.position.y,vehicle.y,t),mix(group.position.z,vehicle.z,t));
  const delta=vehicle.yaw-group.rotation.y;
  group.rotation.y+=Math.atan2(Math.sin(delta),Math.cos(delta))*t;
  group.scale.set(vehicle.modelScale?.x??1,vehicle.modelScale?.y??1,vehicle.modelScale?.z??1);
  body.rotation.x=mix(body.rotation.x,vehicle.bodyPitch??0,t);
  body.rotation.z=mix(body.rotation.z,vehicle.bodyRoll??0,t);
  controls.rotation.z=(vehicle.steer??0)*.19;
  rig.initialized=true;
  const occupied=player?.vehicleId===vehicle.id;
  const quality=view.quality??'high', detail=view.gfx?.detail==='auto'||!view.gfx?.detail?quality:view.gfx.detail;
  const dist=occupied?0:Math.hypot((player?.x??vehicle.x)-vehicle.x,(player?.y??vehicle.y)-vehicle.y,(player?.z??vehicle.z)-vehicle.z);
  const lod=quality==='high'&&detail==='high'&&dist<72?0:quality!=='low'&&detail!=='low'&&dist<155?1:2;
  const wrecked=vehicle.hp<=0;
  const ground=terrain?.heightAt(vehicle.x,vehicle.z)??0;
  const powered=!wrecked&&(vehicle.seats[0]!=null||vehicle.y-ground>1);
  rig.rotorSpeed=mix(rig.rotorSpeed,powered?27:0,1-Math.exp(-dt*(powered?1.5:2.3)));
  rig.rotorAngle=(rig.rotorAngle+rig.rotorSpeed*dt)%(Math.PI*2);
  rig.tailAngle=(rig.tailAngle+rig.rotorSpeed*dt*3.3)%(Math.PI*2);
  rotorDisk.visible=rig.rotorSpeed>19;
  rotorDisk.material.opacity=Math.min(.095,Math.max(0,rig.rotorSpeed-19)*.014);
  const ownGun=occupied&&player.vehicleSeat===BLACK_HAWK_GUN.index;
  const pose={...vehicle,yaw:group.rotation.y,bodyPitch:body.rotation.x,bodyRoll:body.rotation.z};
  const aim=blackHawkGunAngles(pose,ownGun?(view.yaw??vehicle.aimYaw):vehicle.aimYaw??vehicle.yaw+BLACK_HAWK_GUN.restYaw,
    ownGun?(view.pitch??vehicle.aimPitch):vehicle.aimPitch??0);
  mount.rotation.y=aim.yaw;
  turret.gun.rotation.x=aim.pitch;
  rig.turretYaw=aim.yaw;
  if(rig.gunSeq!==undefined&&rig.gunSeq!==vehicle.gunSeq&&!wrecked)rig.flashTime=.046;
  rig.gunSeq=vehicle.gunSeq;
  rig.flashTime=Math.max(0,(rig.flashTime??0)-dt);
  flash.visible=!wrecked&&rig.flashTime>0;
  flash.material.opacity=rig.flashTime/.046;
  const low=quality!=='high';
  for(let i=0;i<lods.length;i++){
    const level=lods[i];
    level.root.visible=i===lod;
    level.Cabin.visible=occupied||dist<120;
    level.MainRotor.rotation.y=rig.rotorAngle;
    level.TailRotor.rotation.x=rig.tailAngle;
    level.Minigun.rotation.set(aim.pitch,aim.yaw,0,'YXZ');
    const fast=rig.rotorSpeed>19;
    if(rig.fastRotor!==fast)for (const rotor of [level.MainRotor,level.TailRotor]){
      rotor.traverse(mesh=>{if(mesh.isMesh)mesh.castShadow=!fast;});
    }
    if(rig.wrecked!==wrecked||rig.low!==low){
      for(const {mesh,base} of level.meshes){
        const mat=low?(base._lowMaterial??base):base;
        mesh.material=wrecked?wreckMaterial(mat):mat;
      }
    }
  }
  rig.wrecked=wrecked;
  rig.low=low;
  rig.fastRotor=rig.rotorSpeed>19;
}
