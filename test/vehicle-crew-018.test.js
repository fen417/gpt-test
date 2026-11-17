import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../shared/simulation.js';
import {createVehicle,getVehicleBoardingSeat,getVehicleSeatPose,isEnclosedTankCrew,preferredVehicleSeat,VEHICLE_TYPES} from '../shared/vehicles.js';
import {rayVehicleCrew} from '../shared/vehicle-combat.js';
import {fallbackRiderVisible} from '../src/vehicles.js';
import {GAME_VERSION,PATCH_NOTES} from '../shared/releases.js';

test('0.18 prioritizes tank gunner after the driver and preserves light-vehicle seating',()=>{
  const tank=createVehicle({id:'tank',type:'tank',team:0,x:0,y:0,z:0,yaw:0});
  const infantry={x:1,z:0,team:0};
  assert.equal(VEHICLE_TYPES.tank.seats[1].role,'gunner');
  assert.equal(getVehicleBoardingSeat(infantry,[tank])?.seat,0);
  tank.seats[0]='driver';
  assert.equal(getVehicleBoardingSeat(infantry,[tank])?.seat,1);
  assert.equal(preferredVehicleSeat(tank,new Set([1])),2);
  tank.seats[1]='gunner';
  assert.equal(getVehicleBoardingSeat(infantry,[tank])?.seat,2);
  for(const type of ['atv','humvee']){
    const vehicle=createVehicle({id:type,type,team:0,x:0,y:0,z:0,yaw:0});
    assert.equal(getVehicleBoardingSeat(infantry,[vehicle])?.seat,0);
    vehicle.seats[0]='driver';
    assert.equal(getVehicleBoardingSeat(infantry,[vehicle])?.seat,1);
  }
});

test('tank driver and gunner remain protected while exposed troops can be hit',()=>{
  const sim=new Simulation({bots:0,mapId:'quarry'});
  const tank=sim.vehicles.find(v=>v.type==='tank'&&v.team===0);
  const attacker=sim.addPlayer('enemy','Enemy',1);
  sim.vehicles=[tank];
  const crew=[];
  for(const index of [0,1,2]){
    const p=sim.addPlayer('crew-'+index,'Crew',0);
    Object.assign(p,{vehicleId:tank.id,vehicleSeat:index,invulnerableUntil:0});
    tank.seats[index]=p.id;sim.syncVehicleSeat(p,tank);
    sim.damage(p,40,attacker,{weapon:'rifle'});
    sim.damage(p,20,attacker,{weapon:'grenade',explosive:true});
    assert.equal(p.hp,index<=1?100:40,`tank seat ${index} damage`);
    assert.equal(isEnclosedTankCrew(tank,index),index<=1);
    const pose=getVehicleSeatPose(tank,index);
    const hit=rayVehicleCrew({x:pose.x+5,y:pose.y,z:pose.z},{x:-1,y:0,z:0},tank,index,10);
    assert.equal(Number.isFinite(hit.distance),index===2,`tank seat ${index} ray protection`);
    crew.push(p);
  }
  sim.damageVehicle(tank,10000,attacker,'blast');
  assert.equal(tank.hp,0);
  for(const p of crew)assert.equal(p.alive,false,'tank destruction still kills occupants');
});

test('Humvee and ATV riders remain visible as fallback and damageable behind actual armour',()=>{
  for(const type of ['humvee','atv']){
    const sim=new Simulation({bots:0,mapId:'quarry'});
    const v=createVehicle({id:'light',type,team:0,x:10,y:sim.groundAt(10,10),z:10,yaw:0});
    sim.vehicles=[v];
    const enemy=sim.addPlayer('enemy','Enemy',1);
    for(const index of [0,1]){
      const rider=sim.addPlayer(type+'-'+index,'Rider',0);
      Object.assign(rider,{vehicleId:v.id,vehicleSeat:index,invulnerableUntil:0});
      v.seats[index]=rider.id;sim.syncVehicleSeat(rider,v);
      assert.equal(fallbackRiderVisible(v,index,'observer'),true,'remote fallback stays visible');
      assert.equal(fallbackRiderVisible(v,index,rider.id),false,'own first-person view must not be obscured');
      assert.equal(fallbackRiderVisible(v,index,'observer',true),false,'detailed model replaces fallback');
      assert.equal(isEnclosedTankCrew(v,index),false);
      sim.damage(rider,20,enemy,{weapon:'rifle'});
      assert.equal(rider.hp,80,`${type} seat ${index} must remain vulnerable`);
    }
  }
});

test('the visible game release is the latest patch',()=>{
  assert.equal(PATCH_NOTES[0]?.version,GAME_VERSION);
});
