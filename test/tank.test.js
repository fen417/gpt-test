import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../shared/simulation.js';
import {createVehicle,VEHICLE_TYPES} from '../shared/vehicles.js';
import {advanceTankSystems,fireTank,tankDropAngle} from '../shared/tank.js';
import {SnapshotEncoder,SnapshotDecoder,prepareSnapshot,encodeEvents,decodeEvents} from '../shared/snapshot-codec.js';
function setup(){const sim=new Simulation({bots:0,mapId:'quarry'}),v=sim.vehicles.find(v=>v.type==='tank'&&v.team===0);sim.vehicles=[v];return{sim,v};}
test('tank seats five and driver loss leaves a usable free seat',()=>{
  const {sim,v}=setup(),crew=[];for(let i=0;i<5;i++){const p=sim.addPlayer('crew'+i,'Crew',0);Object.assign(p,{x:v.x+2.6,z:v.z,y:sim.groundAt(v.x+2.6,v.z),invulnerableUntil:0});assert.ok(sim.mountVehicle(p,v,i));crew.push(p);}
  const enemy=sim.addPlayer('enemy','Enemy',1);sim.damage(crew[0],200,enemy);assert.equal(v.seats[0],null);
  crew[4].input.switchSeat=true;sim.updateVehicleActions(crew[4]);assert.equal(crew[4].vehicleSeat,0);
  assert.equal(sim.dismountVehicle(crew[4]),true);
});
test('tank pivots at rest, turret slews and shell cooldown is authoritative',()=>{
  const {sim,v}=setup(),p=sim.addPlayer('gunner','Gunner',0);Object.assign(p,{vehicleId:v.id,vehicleSeat:1});v.seats[1]=p.id;
  const yaw=v.yaw;sim.moveVehicle(v,{forward:0,strafe:1},1/60);assert.notEqual(v.yaw,yaw);assert.equal(v.speed,0);
  p.input={yaw:1,pitch:.2,weaponSlot:1,fire:true};advanceTankSystems(sim,v,p,1/60);assert.ok(Math.abs(v.aimYaw)<.02);assert.ok(v.aimPitch<=.011);
  fireTank(sim,p,v,1/60);assert.equal(v.cannonAmmo,23);assert.equal(sim.rockets.length,1);assert.equal(sim.rockets[0].kind,1);
  sim.time=3.19;fireTank(sim,p,v,1/60);assert.equal(v.cannonAmmo,23);sim.time=3.2;fireTank(sim,p,v,1/60);assert.equal(v.cannonAmmo,22);
  p.input.weaponSlot=2;advanceTankSystems(sim,v,p,1/60);const seq=v.gunSeq;fireTank(sim,p,v,1/60);assert.equal(v.gunSeq,seq);
  assert.ok(tankDropAngle(500)>tankDropAngle(100));
});
test('tank state and shell type survive full snapshots and cannon events',()=>{
  const {sim,v}=setup();Object.assign(v,{cannonSeq:17,cannonAmmo:9,weapon:1,weaponReadyAt:2.4,cannonReadyAt:5.2,leftTrack:45,rightTrack:83,burning:true,wantedYaw:.5,wantedPitch:.2});
  sim.rockets.push({id:'shell',kind:1,vehicleId:v.id,ownerId:'p',team:0,x:0,y:2,z:0,vx:0,vy:0,vz:-190,life:4});
  sim.deployables.push({id:'neutral-ammo',kind:'ammo',team:-1,x:0,y:0,z:0,hp:255,expires:1e9});
  const encoder=new SnapshotEncoder(sim.map.size),decoder=new SnapshotDecoder({size:sim.map.size,mapId:'quarry'}),packet=encoder.encode(prepareSnapshot(sim.snapshot(),sim.map.size)),out=decoder.decode(packet.bytes).state;
  assert.equal(out.vehicles[0].cannonAmmo,9);assert.equal(out.vehicles[0].rightTrack,83);assert.equal(out.rockets[0].kind,1);assert.equal(out.vehicles[0].burning,1);
  assert.equal(out.deployables[0].team,-1);
  const bytes=encodeEvents([{id:1,time:0,type:'cannonShot',playerId:'p',vehicleId:v.id,weaponId:'tank-cannon',shotSeq:2,x:0,y:2,z:0}],1,encoder.dict);
  assert.equal(decodeEvents(bytes,decoder.dict).events[0].type,'cannonShot');
});
