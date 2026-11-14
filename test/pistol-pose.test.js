import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {applyPistolSprintPose} from '../src/pistol-pose.js';

test('pistol sprint raises the held rig toward high ready with bounded sway',()=>{
  for(const phase of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
    const weapon=new THREE.Group();weapon.position.set(.15,-.105,-.5);
    applyPistolSprintPose(weapon,1,0,0,0,phase);weapon.updateMatrixWorld();
    const barrelDirection=new THREE.Vector3(0,0,-1).applyQuaternion(weapon.quaternion);
    assert.ok(barrelDirection.y>.8,'barrel points upward while sprinting');
    assert.ok(weapon.position.y>0&&weapon.position.x<.3,'hand is raised without moving into the centre of the sight');
    assert.ok(Math.abs(weapon.rotation.z)<.2,'wrist roll remains modest');
  }
});

test('aim, reload and firing cancel the high-ready pose without changing their own framing',()=>{
  for(const [sprint,aim,reload,kick] of [[0,0,0,0],[1,1,0,0],[1,0,1,0],[1,0,0,1]]){
    const weapon=new THREE.Group();weapon.position.set(0,-.05,-.46);weapon.rotation.set(.1,.02,-.03);
    const position=weapon.position.clone(),rotation=weapon.quaternion.clone();
    assert.equal(applyPistolSprintPose(weapon,sprint,aim,reload,kick,1),0);
    assert.ok(weapon.position.equals(position));assert.ok(weapon.quaternion.angleTo(rotation)<1e-7);
  }
});
