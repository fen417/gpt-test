import test from 'node:test';import assert from 'node:assert/strict';
import {Simulation} from '../shared/simulation.js';import {createVehicle,VEHICLE_TYPES} from '../shared/vehicles.js';import {blast,updateEquipment} from '../shared/gadgets.js';
import {rayVehicleCrew} from '../shared/vehicle-combat.js';
import {getWeapon} from '../shared/world.js';
function setup(){const sim=new Simulation({bots:0,mapId:'quarry'}),v=sim.vehicles.find(v=>v.type==='tank'&&v.team===0),enemy=sim.addPlayer('enemy','Enemy',1);sim.vehicles=[v];return{sim,v,enemy};}

test('tank driver ignores direct damage until the tank is destroyed',()=>{
  const {sim,v,enemy}=setup(),driver=sim.addPlayer('driver','Driver',0);
  Object.assign(driver,{vehicleId:v.id,vehicleSeat:0,invulnerableUntil:0});v.seats[0]=driver.id;sim.syncVehicleSeat(driver,v);
  sim.damage(driver,300,enemy,{weapon:'RIFLE',headshot:true});sim.damage(driver,300,enemy,{explosive:true});
  assert.equal(driver.hp,100);assert.equal(driver.alive,true);
  assert.equal(rayVehicleCrew({x:driver.x+5,y:driver.y+1,z:driver.z},{x:-1,y:0,z:0},v,0,10).distance,Infinity);
  sim.damageVehicle(v,10000,enemy,'blast');assert.equal(v.hp,0);assert.equal(driver.alive,false);assert.equal(driver.vehicleId,null);
});

test('tank shell kills award 25 points to each other living crew member only',()=>{
  const {sim,v,enemy}=setup(),crew=[];
  for(let i=0;i<5;i++){const p=sim.addPlayer('crew'+i,'Crew',0);Object.assign(p,{vehicleId:v.id,vehicleSeat:i,invulnerableUntil:0});v.seats[i]=p.id;sim.syncVehicleSeat(p,v);crew.push(p);}
  const outsider=sim.addPlayer('outsider','Outsider',0),gunner=crew[1];
  Object.assign(enemy,{x:60,y:50,z:60,invulnerableUntil:0});
  sim.rockets.push({id:'crew-shell',kind:1,ownerId:gunner.id,vehicleId:v.id,team:0,x:57,y:50.8,z:60,vx:190,vy:0,vz:0,life:6});
  updateEquipment(sim,.02);assert.equal(enemy.alive,false);assert.equal(gunner.kills,1);assert(gunner.score>=200);
  for(const p of crew.filter(p=>p!==gunner)){assert.equal(p.score,25);assert.equal(p.kills,0);}
  assert.equal(outsider.score,0);
  const other=sim.addPlayer('other','Other',1);other.invulnerableUntil=0;sim.damage(other,200,gunner);
  assert.equal(crew[0].score,25,'boarding a tank must not share kills from a shot fired outside it');
});

test('all vehicles permit exits at full forward and reverse speed',()=>{
  const {sim}=setup();
  for(const type of ['tank','humvee','atv'])for(const speed of [VEHICLE_TYPES[type].maxSpeed,-VEHICLE_TYPES[type].reverseSpeed]){
    const v=createVehicle({id:type,type,team:0,x:-180,z:-150,y:sim.groundAt(-180,-150),yaw:0}),p=sim.addPlayer(type+speed,'Driver',0);
    sim.vehicles=[v];Object.assign(p,{vehicleId:v.id,vehicleSeat:0});v.seats[0]=p.id;sim.syncVehicleSeat(p,v);v.speed=speed;
    assert.equal(sim.dismountVehicle(p),true,`${type} at ${speed}`);assert.equal(p.vehicleId,null);assert.equal(v.seats[0],null);assert.equal(sim.collides(p.x,p.z,p.y),false);
  }
});
test('only tank rejects rifle bullets; light vehicles retain existing bullet armour',()=>{
  const {sim,v,enemy}=setup(),weapon=getWeapon('recon','sv98');Object.assign(enemy,{classId:'recon',weaponId:'sv98'});
  for(let i=0;i<1000;i++){
    sim.launchBullet(enemy,weapon,{x:v.x+4,y:v.y+1.1,z:v.z},Math.PI/2,0);const shot=sim.eventId;sim.time+=.02;sim.updateBullets();
    const impact=sim.events.find(e=>e.type==='bulletImpact'&&e.shotId===shot);assert.equal(impact?.impactVehicleId,v.id,'actual projectile strikes the tank');assert.equal(impact.vehicleHit,false);assert.equal(v.hp,2400);
  }
  for(const type of ['atv','humvee']){const car=createVehicle({id:type,type,team:0,x:50,y:0,z:50,yaw:0});const before=car.hp;sim.damageVehicle(car,92,enemy,'bullet');assert.ok(car.hp<before);}
});
test('PT90 needs four side hits or two rear hits; frontal armour remains stronger',()=>{
  for(const [side,count] of [['side',4],['rear',2]]){const{sim,v,enemy}=setup();const origin=side==='side'?{x:v.x+2,y:v.y+1.5,z:v.z}:{x:v.x,y:v.y+1.5,z:v.z+4};for(let i=0;i<count-1;i++){sim.damageVehicle(v,760,enemy,'blast',origin);assert.ok(v.hp>0);}sim.damageVehicle(v,760,enemy,'blast',origin);assert.equal(v.hp,0);assert.equal(v.wreckTime,20);}
  const{sim,v,enemy}=setup();sim.damageVehicle(v,760,enemy,'blast',{x:v.x,y:v.y+1.5,z:v.z-4});assert.equal(v.hp,1982);
});
test('grenades damage the tank as a whole and engineer restores its common health',()=>{
  const{sim,v,enemy}=setup();blast(sim,{x:v.x+3,y:v.y+.8,z:v.z},enemy);assert.ok(Math.abs(v.hp-2136)<.01);assert.equal(v.rightTrack,undefined);
  const yaw=v.yaw;sim.moveVehicle(v,{forward:1,strafe:1},1/60);assert.ok(v.speed>0);assert.notEqual(v.yaw,yaw);
  const engineer=sim.addPlayer('engineer','Engineer',0,'support');Object.assign(engineer,{x:v.x+2.6,z:v.z,y:sim.groundAt(v.x+2.6,v.z),yaw:Math.PI/2,heldGadget:'repair',gadgetAction:'repair',gadgetActionUntil:sim.time+1});engineer.input.fire=true;v.hp=550;v.burning=true;updateEquipment(sim,1);assert.ok(v.hp>550);assert.equal(v.burning,false);
});
test('a concrete wall stops tank blast damage',()=>{
  const{sim,v,enemy}=setup();v.x=0;v.z=-115;v.y=sim.groundAt(0,-115);const before=v.hp;blast(sim,{x:0,y:sim.groundAt(0,-125)+.8,z:-125},enemy,'rocket');assert.equal(v.hp,before);
});
