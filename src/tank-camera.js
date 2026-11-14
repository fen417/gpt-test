import * as THREE from 'three';
import {getAssetColliders,rayCollider} from '../shared/asset-colliders.js';
export function placeTankDriverCamera(owner,{vehicle,rig},view,dt){
  const cache=owner.tankCamera??={pivot:new THREE.Vector3(),desired:new THREE.Vector3(),direction:new THREE.Vector3(),initialized:false};
  const yaw=view.vehicleCameraYaw??view.yaw??vehicle.yaw,pitch=Math.max(-.65,Math.min(.5,view.pitch??0));
  cache.pivot.set(rig.group.position.x,rig.group.position.y+2.2,rig.group.position.z);
  cache.direction.set(Math.sin(yaw)*Math.cos(pitch),-Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch));
  let distance=9;for(const box of getAssetColliders(owner.map))distance=Math.min(distance,rayCollider(cache.pivot,cache.direction,box,distance));
  distance=Math.min(distance,owner.map.terrain?.raycast(cache.pivot,cache.direction,9)??9);
  // Three metres is a preferred minimum, not permission to clip a closer wall.
  distance=Math.max(.35,distance-.25);cache.desired.copy(cache.pivot).addScaledVector(cache.direction,distance);
  const reset=!cache.initialized||cache.vehicleId!==vehicle.id;
  owner.camera.position.lerp(cache.desired,reset?1:1-Math.exp(-dt*10));cache.vehicleId=vehicle.id;cache.initialized=true;
  cache.direction.copy(owner.camera.position).sub(cache.pivot);const length=cache.direction.length();cache.direction.normalize();
  let clear=length;for(const box of getAssetColliders(owner.map))clear=Math.min(clear,rayCollider(cache.pivot,cache.direction,box,clear));
  clear=Math.min(clear,owner.map.terrain?.raycast(cache.pivot,cache.direction,length)??length);
  if(clear<length)owner.camera.position.copy(cache.pivot).addScaledVector(cache.direction,Math.max(.25,clear-.25));
  owner.camera.position.y=Math.max(owner.camera.position.y,(owner.map.terrain?.heightAt(owner.camera.position.x,owner.camera.position.z)??0)+.35);
  owner.camera.rotation.set(pitch,yaw,0,'YXZ');owner.cameraPlayerId=null;owner.cameraAlive=true;owner.updateSunShadow(vehicle.x,vehicle.z);
}
