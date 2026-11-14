import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {applyPistolSprintPose} from '../src/pistol-pose.js';
import {createWeaponRig} from '../src/weapons.js';
import {loadFPSHands} from '../src/fps-hands.js';
import {readFile} from 'node:fs/promises';

test('pistol sprint raises the held rig toward high ready with bounded sway',()=>{
  for(const phase of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
    const weapon=new THREE.Group();weapon.position.set(.15,-.105,-.5);
    applyPistolSprintPose(weapon,1,0,0,0,phase);weapon.updateMatrixWorld();
    const barrelDirection=new THREE.Vector3(0,0,-1).applyQuaternion(weapon.quaternion);
    assert.ok(barrelDirection.y>.8,'barrel points upward while sprinting');
    assert.ok(weapon.position.y>0&&weapon.position.x>.3&&weapon.position.x<.45,'hand is raised near the right edge, clear of the centre');
    assert.ok(Math.abs(weapon.rotation.z)<.2,'wrist roll remains modest');
  }
});

test('the real pistol sleeve stays offscreen at the shoulder through the sprint transition',async()=>{
  const originalFetch=globalThis.fetch,originalLoad=THREE.TextureLoader.prototype.load;
  let rig;
  globalThis.fetch=async()=>new Response(await readFile(new URL('../src/assets/fps-hands.bin.gz',import.meta.url)));
  THREE.TextureLoader.prototype.load=()=>new THREE.Texture();
  try{
    await loadFPSHands();rig=createWeaponRig();
    const arm=rig.weapon.getObjectByName('right-articulated-forearm');
    const sleeve=arm.children.find(object=>object.material?.name==='sleeve-ripstop-cloth');
    const vertices=sleeve.geometry.attributes.position;
    const camera=new THREE.PerspectiveCamera(85,16/9,.045,100);
    camera.add(rig.weapon);
    for(const weaponId of ['p19','m50'])for(const fov of [65,85,105]){
      camera.fov=fov+6;camera.updateProjectionMatrix();
      for(const sprint of [0,.25,.5,.75,1])for(const cycle of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
        rig.update({classId:'assault',weaponId,aim:0,reloadMotion:0,reloadPhase:0,kick:0,clock:0});
        rig.weapon.position.set(.15,-.105,-.5);rig.weapon.rotation.set(0,0,0);
        const weight=applyPistolSprintPose(rig.weapon,sprint,0,0,0,cycle);
        rig.anchorPistolArm(weight);camera.updateMatrixWorld(true);
        const cuff=new THREE.Vector3().fromBufferAttribute(vertices,vertices.count-1).applyMatrix4(sleeve.matrixWorld);
        const gloveWrist=new THREE.Vector3(.002,-.195,.175).applyMatrix4(rig.weapon.matrixWorld);
        assert.ok(cuff.distanceTo(gloveWrist)<.018,'sleeve cuff stays attached to the fitted pistol glove');
        // The first ring is the actual cut edge, including its full thickness;
        // checking only the cap centre would miss a visible rim at wide FOV.
        for(let vertex=0;vertex<19;vertex++){
          const point=new THREE.Vector3().fromBufferAttribute(vertices,vertex).applyMatrix4(sleeve.matrixWorld);
          const projected=point.clone().project(camera);
          const inFrame=point.z<-.045&&Math.abs(projected.x)<=1&&Math.abs(projected.y)<=1;
          assert.equal(inFrame,false,`${weaponId}, FOV ${fov}, sprint ${sprint}: sleeve cut edge must remain outside the frame`);
        }
      }
    }
  }finally{
    rig?.dispose();globalThis.fetch=originalFetch;THREE.TextureLoader.prototype.load=originalLoad;
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
