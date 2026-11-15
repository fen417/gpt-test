import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation,sanitizeInput} from '../shared/simulation.js';
import {INPUT_STEP} from '../shared/snapshot-codec.js';
import {Prediction} from '../src/network.js';

test('network driver follows 60 Hz input frames at 45 Hz authority, without duplicate motion',()=>{
  for(const type of ['tank','atv','humvee']){
    const sim=new Simulation({bots:0,mapId:'quarry'});
    const vehicle=sim.vehicles.find(v=>v.type===type&&v.team===0);
    assert.ok(vehicle,`${type} exists`);
    sim.vehicles=[vehicle];
    const driver=sim.addPlayer('driver','Driver',0);
    Object.assign(driver,{x:vehicle.x+2.6,z:vehicle.z,y:sim.groundAt(vehicle.x+2.6,vehicle.z),invulnerableUntil:0});
    assert.equal(sim.mountVehicle(driver,vehicle,0),true);
    driver.networkControlled=true;driver.networkIdle=false;
    const initial={x:vehicle.x,z:vehicle.z};
    const snapshot=sim.snapshot(),prediction=new Prediction('quarry');
    prediction.reconcile(snapshot.players.find(p=>p.id===driver.id),0,snapshot.vehicles,snapshot.time);
    let sequence=0;
    for(let tick=0;tick<90;tick++){
      const frames=[],count=Math.floor((tick+1)*60/45)-Math.floor(tick*60/45);
      for(let n=0;n<count;n++){
        const input=sanitizeInput({forward:sequence<85?1:.5,strafe:sequence%32<16?.4:-.35,yaw:0,pitch:0});
        const frame={sequence:++sequence,dt:INPUT_STEP,input};
        frames.push(frame);prediction.add(frame);
      }
      driver.networkFrames=frames;driver.input=frames.at(-1).input;
      sim.updateVehicles(1/45);
    }
    const expected=prediction.world.vehicles.find(v=>v.id===vehicle.id);
    const difference=Math.hypot(vehicle.x-expected.x,vehicle.z-expected.z);
    assert.ok(Math.hypot(vehicle.x-initial.x,vehicle.z-initial.z)>.5,`${type} moved`);
    assert.ok(difference<.001,`${type} mismatch: ${difference} m`);
    assert.ok(Math.abs(Math.atan2(Math.sin(vehicle.yaw-expected.yaw),Math.cos(vehicle.yaw-expected.yaw)))<.0001);
    driver.networkFrames=[];
    const before={x:vehicle.x,z:vehicle.z,yaw:vehicle.yaw};
    sim.updateVehicles(1/45);
    assert.deepEqual({x:vehicle.x,z:vehicle.z,yaw:vehicle.yaw},before);
    driver.networkControlled=false;driver.input=sanitizeInput({forward:1,strafe:0});
    sim.updateVehicles(1/45);
    assert.ok(Math.hypot(vehicle.x-before.x,vehicle.z-before.z)>.001,`${type} non-network driver moves`);
  }
});
