import test from 'node:test';
import assert from 'node:assert/strict';
import {createTankRig,tankModelStats,updateTankRig} from '../src/tank-model.js';
import * as THREE from 'three';import{tankMuzzle,TANK_MUZZLE_DISTANCE}from'../shared/tank.js';
test('tank articulated and distant models stay within geometry and draw budgets',()=>{
  const rig=createTankRig(),stats=tankModelStats(rig);for(const [i,row] of stats.entries()){assert.ok(row.triangles<=[6000,2200,600][i]);assert.ok(row.draws<=[8,5,2][i]);}
  assert.ok(rig.levels[0].gun.parent===rig.levels[0].turret);assert.equal(rig.material.type,'MeshLambertMaterial');assert.equal(rig.material.transparent,false);
  rig.group.traverse(o=>o.geometry?.dispose());rig.material.dispose();
});
test('authoritative tank muzzle matches visible barrel on tilted and scaled chassis',()=>{
  for(const [bodyPitch,bodyRoll,yaw,aimYaw,aimPitch]of [[0,0,0,0,0],[.12,-.08,.5,1,.2],[-.15,.08,-1,-.3,-.1]]){
    const rig=createTankRig(),v={id:'v',type:'tank',x:12,y:3,z:8,yaw,aimYaw,aimPitch,bodyPitch,bodyRoll,modelScale:{x:1.1,y:1,z:.9},hp:2400,maxHp:2400,speed:0,steer:0,cannonSeq:0};
    updateTankRig(rig,v,{x:12,z:8},0,1,{vehicleThirdPerson:true},false);rig.group.updateMatrixWorld(true);
    const actual=new THREE.Vector3(0,0,-TANK_MUZZLE_DISTANCE).applyMatrix4(rig.levels[0].gun.matrixWorld),expected=tankMuzzle(v);assert.ok(actual.distanceTo(new THREE.Vector3(expected.x,expected.y,expected.z))<1e-6);
  }
});

test('distant tank renders barrel pitch and turret yaw within two draws',()=>{
  const rig=createTankRig();
  const vehicle={id:'tank',type:'tank',x:200,y:3,z:0,yaw:.5,aimYaw:.5,aimPitch:0,
    bodyPitch:.12,bodyRoll:-.08,hp:2400,speed:5,cannonSeq:0};
  const player={x:0,z:0};
  const step=()=>updateTankRig(rig,vehicle,player,1/60,1,{vehicleThirdPerson:true},false);
  const point=new THREE.Vector3(),expected=new THREE.Vector3();
  step();
  for(const [yaw,pitch] of [[1,.2],[-.3,-.1]]){
    vehicle.aimYaw=yaw;vehicle.aimPitch=pitch;step();rig.group.updateMatrixWorld(true);
    assert.equal(rig.level,2);
    const turret=rig.levels[2].turretMesh,vertices=turret.geometry.attributes.position;
    const muzzle=tankMuzzle(vehicle);
    expected.set(muzzle.x,muzzle.y,muzzle.z);
    let closest=Infinity;
    for(let i=0;i<vertices.count;i++){
      point.fromBufferAttribute(vertices,i).applyMatrix4(turret.matrixWorld);
      closest=Math.min(closest,point.distanceTo(expected));
    }
    assert.ok(closest<.09,`far barrel missed muzzle by ${closest} m`);
  }
  assert.equal(tankModelStats(rig)[2].draws,2);
  assert.ok(rig.levels[2].hull.geometry.attributes.trackSide.array.some(side=>side!==0));
  rig.group.traverse(object=>object.geometry?.dispose());
  for(const material of rig.materialsToDispose)material.dispose();
});
