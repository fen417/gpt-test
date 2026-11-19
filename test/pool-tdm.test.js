import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, sanitizeInput } from '../shared/simulation.js';
import { takeWeapon, dropWeapon, updateWeaponItems } from '../shared/tdm.js';
import { WEAPONS } from '../shared/world.js';
import { SnapshotEncoder, SnapshotDecoder, prepareSnapshot, quantizedInput, encodeInput, decodeInput } from '../shared/snapshot-codec.js';

function create(){
  const sim=new Simulation({bots:0,mapId:'fy_pool_day',gameMode:'tdm',killLimit:5,random:()=>.4});
  const red=sim.addPlayer('red','Красный',0),blue=sim.addPlayer('blue','Синий',1);
  return {sim,red,blue};
}
test('pool TDM spawns with zero weapons, grenades, rockets and ammo',()=>{
  const {sim,red,blue}=create();
  for(const p of [red,blue]){
    assert.equal(p.weaponId,'');assert.equal(p.primaryWeaponId,'');
    assert.equal(p.sidearmId,'');assert.equal(p.weaponSlot,0);
    assert.equal(p.ammo,0);assert.equal(p.reserve,0);
    assert.equal(p.grenades,0);assert.equal(p.rockets,0);
  }
  assert.equal(sim.weaponItems.length,20);
  assert.equal(sim.points.length,0);
});
test('atomic pickup and respawn with independent primary and pistol slots',()=>{
  const {sim,red,blue}=create();
  const rifle=sim.weaponItems.find(i=>i.weaponId==='ar416');
  Object.assign(red,{x:rifle.x,z:rifle.z,y:rifle.y});
  Object.assign(blue,{x:rifle.x,z:rifle.z,y:rifle.y});
  assert.equal(takeWeapon(sim,red,rifle),true);
  assert.equal(takeWeapon(sim,blue,rifle),false);
  assert.equal(red.primaryWeaponId,'ar416');
  assert.equal(red.ammo,WEAPONS.ar416.mag);
  assert.equal(rifle.active,false);
  const pistol=sim.weaponItems.find(i=>i.weaponId==='p19');
  Object.assign(red,{x:pistol.x,z:pistol.z,y:pistol.y});
  assert.equal(takeWeapon(sim,red,pistol),true);
  assert.equal(red.sidearmId,'p19');assert.equal(red.primaryWeaponId,'ar416');
  assert.equal(red.weaponSlot,2);assert.equal(red.stowedAmmo.ammo,WEAPONS.ar416.mag);
  assert.equal(takeWeapon(sim,red,pistol),false);
  assert.equal(rifle.active,false);
  sim.time+=sim.weaponRespawnSeconds+.01;
  updateWeaponItems(sim,1/60);
  assert.equal(rifle.active,true);assert.equal(pistol.active,true);
});
test('dropped weapons retain ammo and have no repeated pickup dupes',()=>{
  const {sim,red,blue}=create();
  const rifle=sim.weaponItems.find(i=>i.weaponId==='ak12');
  Object.assign(red,{x:rifle.x,z:rifle.z,y:rifle.y});
  assert.equal(takeWeapon(sim,red,rifle),true);
  red.ammo=7;red.reserve=13;
  assert.equal(dropWeapon(sim,red),true);
  assert.equal(red.weaponId,'');assert.equal(red.ammo,0);
  const dropped=sim.weaponItems.find(i=>!i.home&&i.weaponId==='ak12');
  assert.equal(dropped.ammo,7);assert.equal(dropped.reserve,13);
  Object.assign(blue,{x:dropped.x,z:dropped.z,y:dropped.y});
  assert.equal(takeWeapon(sim,blue,dropped),true);
  assert.equal(blue.ammo,7);assert.equal(blue.reserve,13);
  assert.equal(takeWeapon(sim,red,dropped),false);
});
test('TDM win limit increments on enemy kills, not friendly kills',()=>{
  const {sim,red,blue}=create();
  sim.killLimit=1;sim.maxTickets=1;
  sim.damage(blue,999,red,{weapon:'AR-416'});
  assert.deepEqual(sim.tickets,[1,0]);
  assert.equal(sim.winner,0);
  assert.equal(blue.respawnIn,3);
});
test('empty ammo inventory round-trips through compressed snapshot',()=>{
  const {sim,red}=create(), state=sim.snapshot();
  const encoder=new SnapshotEncoder(sim.map.size),decoder=new SnapshotDecoder({size:sim.map.size,mapId:sim.map.id,gameMode:'tdm'});
  const {bytes}=encoder.encode(prepareSnapshot(state,sim.map.size),{localId:'red',full:true});
  const decoded=decoder.decode(bytes);
  const p=decoded.state.players.find(p=>p.id===red.id);
  assert.equal(p.weaponId,null);
  assert.equal(p.ammo,0);
  assert.equal(decoded.state.weaponItems.length,20);
});
test('drop input is encoded and decoded without activating grenade flag',()=>{
  const command=sanitizeInput({drop:true,grenade:false});
  const frame=quantizedInput(1,command);
  const packet=decodeInput(encodeInput([frame]));
  assert.equal(packet.frames[0].input.drop,true);
  assert.equal(packet.frames[0].input.grenade,false);
});
