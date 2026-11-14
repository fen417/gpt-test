import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';
import{placeTankDriverCamera}from'../src/tank-camera.js';
test('tank orbit camera stops before walls without modifying the vehicle heading',()=>{
  const vehicle={id:'tank',x:0,y:0,z:0,yaw:.4},rig={group:new THREE.Group()},owner={camera:new THREE.PerspectiveCamera(),map:{size:896,boxes:[{id:'wall',x:0,z:5,w:10,d:.4,h:8,kind:'wall',baseY:0}]},updateSunShadow(){}};
  placeTankDriverCamera(owner,{vehicle,rig},{vehicleCameraYaw:0,pitch:0},1/60);
  assert.ok(owner.camera.position.z<4.8&&owner.camera.position.z>3);assert.equal(vehicle.yaw,.4);
  const yaw=.8;placeTankDriverCamera(owner,{vehicle,rig},{vehicleCameraYaw:yaw,pitch:0},1/60);assert.equal(owner.camera.rotation.y,yaw,'mouse rotation has no spring delay');
});
