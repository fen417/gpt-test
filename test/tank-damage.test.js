import test from 'node:test';import assert from 'node:assert/strict';
import {Simulation} from '../shared/simulation.js';import {createVehicle} from '../shared/vehicles.js';import {blast,updateEquipment} from '../shared/gadgets.js';
function setup(){const sim=new Simulation({bots:0,mapId:'quarry'}),v=sim.vehicles.find(v=>v.type==='tank'&&v.team===0),enemy=sim.addPlayer('enemy','Enemy',1);sim.vehicles=[v];return{sim,v,enemy};}
test('only tank rejects rifle bullets; light vehicles retain existing bullet armour',()=>{
  const {sim,v,enemy}=setup();for(let i=0;i<1000;i++)assert.equal(sim.damageVehicle(v,92,enemy,'bullet').ricochet,true);assert.equal(v.hp,2400);
  for(const type of ['atv','humvee']){const car=createVehicle({id:type,type,team:0,x:50,y:0,z:50,yaw:0});const before=car.hp;sim.damageVehicle(car,92,enemy,'bullet');assert.ok(car.hp<before);}
});
test('PT90 needs four side hits or two rear hits; frontal armour remains stronger',()=>{
  for(const [side,count] of [['side',4],['rear',2]]){const{sim,v,enemy}=setup();const origin=side==='side'?{x:v.x+2,y:v.y+1.5,z:v.z}:{x:v.x,y:v.y+1.5,z:v.z+4};for(let i=0;i<count-1;i++){sim.damageVehicle(v,760,enemy,'blast',origin);assert.ok(v.hp>0);}sim.damageVehicle(v,760,enemy,'blast',origin);assert.equal(v.hp,0);assert.equal(v.wreckTime,20);}
  const{sim,v,enemy}=setup();sim.damageVehicle(v,760,enemy,'blast',{x:v.x,y:v.y+1.5,z:v.z-4});assert.equal(v.hp,1982);
});
test('grenades damage tracks, broken tracks constrain movement and engineer repairs both',()=>{
  const{sim,v,enemy}=setup();blast(sim,{x:v.x+3,y:v.y+.8,z:v.z},enemy);assert.ok(Math.abs(v.hp-2136)<.01);assert.ok(v.rightTrack>=40);
  v.leftTrack=90;v.rightTrack=0;const yaw=v.yaw;sim.moveVehicle(v,{forward:1,strafe:1},1/60);assert.equal(v.speed,0);assert.equal(v.yaw,yaw);sim.moveVehicle(v,{forward:0,strafe:-1},1/60);assert.notEqual(v.yaw,yaw);
  const engineer=sim.addPlayer('engineer','Engineer',0,'support');Object.assign(engineer,{x:v.x+2.6,z:v.z,y:sim.groundAt(v.x+2.6,v.z),yaw:Math.PI/2,heldGadget:'repair',gadgetAction:'repair',gadgetActionUntil:sim.time+1});engineer.input.fire=true;v.hp=550;v.burning=true;const track=v.leftTrack;updateEquipment(sim,1);assert.ok(v.hp>550&&v.leftTrack<track);assert.equal(v.burning,false);
});
test('a concrete wall stops tank blast damage',()=>{
  const{sim,v,enemy}=setup();v.x=0;v.z=-115;v.y=sim.groundAt(0,-115);const before=v.hp;blast(sim,{x:0,y:sim.groundAt(0,-125)+.8,z:-125},enemy,'rocket');assert.equal(v.hp,before);
});
