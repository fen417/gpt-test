import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MAPS, getMap, PROTOCOL_VERSION } from '../shared/world.js';
import { Simulation } from '../shared/simulation.js';
import { dropWeapon, weaponTarget } from '../shared/tdm.js';

test('Linden Estate has valid GLBs for the base and detail layers',()=>{
  for(const layer of ['base','detail']){
    const bytes=readFileSync(new URL(`../src/assets/estate/${layer}.glb`,import.meta.url));
    assert.equal(bytes.toString('ascii',0,4),'glTF');
    assert.equal(bytes.readUInt32LE(4),2);
    assert.equal(bytes.readUInt32LE(8),bytes.length);
  }
});

test('new TDM arena retains standard class loadouts, no conquest objects or weapon pickups',()=>{
  const map=getMap('linden_estate');
  assert.equal(PROTOCOL_VERSION,31);
  assert.equal(map.id,'linden_estate');
  assert.equal(map.tdmLoadout,'class');
  assert.equal(map.theme,'linden-estate');
  assert.deepEqual(map.points,[]);
  assert.deepEqual(map.vehicleSpawns,[]);
  assert.deepEqual(map.weaponSpawns,[]);
  assert.ok(map.boxes.length>=200,'Geometry must include manor walls/floors and stairs');
  assert.ok(map.boxes.some(x=>x.kind==='village-stair'),'Both flights require game colliders');
  assert.ok(map.boxes.some(x=>x.kind==='village-floor'),'Second story requires floor colliders');
  assert.ok(map.spawnPoints[0].length>=3&&map.spawnPoints[1].length>=3,
    'Both sides need distinct valid respawn locations');
  for(const [team,points] of map.spawnPoints.entries()){
    for(const point of points){
      assert.ok(Number.isFinite(point.x)&&Number.isFinite(point.z));
      assert.ok(team===0?point.x<0:point.x>0,'Spawns must be team-separated');
      assert.ok(point.z>=map.playArea.minZ&&point.z<=map.playArea.maxZ);
    }
  }
});

test('authority grants normal class kit and cannot spawn/drop floor guns on Linden Estate',()=>{
  const sim=new Simulation({mapId:'linden_estate',gameMode:'tdm',bots:0,random:()=>.5});
  assert.equal(sim.gameMode,'tdm');
  assert.equal(sim.vehicles.length,0);
  assert.equal(sim.weaponItems.length,0);
  const a=sim.addPlayer('human0','Player A',0,'assault','ak12','m50');
  const b=sim.addPlayer('human1','Player B',1,'recon','sv98','p19');
  assert.equal(a.alive,true,'First team must successfully spawn');
  assert.equal(b.alive,true,'Second team must successfully spawn');
  assert.equal(a.weaponId,'ak12');
  assert.equal(a.primaryWeaponId,'ak12');
  assert.equal(a.sidearmId,'m50');
  assert.equal(a.weaponSlot,1);
  assert.ok(a.ammo>0&&a.reserve>0);
  assert.equal(b.weaponId,'sv98');
  assert.equal(b.sidearmId,'p19');
  assert.equal(a.grenades,0, 'All deathmatch maps keep grenades disabled');
  assert.equal(dropWeapon(sim,a),false,'G must not spawn weapons on class-TDM map');
  assert.equal(sim.weaponItems.length,0);
  assert.equal(weaponTarget(sim,a),null);
  sim.step(1/60);
  assert.equal(sim.weaponItems.length,0);
  a.alive=false;a.respawnIn=0;
  sim.step(1/60);
  assert.equal(a.alive,false,'Class TDM requires player deployment to pick a new class');
  assert.equal(sim.respawn(a.id,'medic','', 'mcx9', 'p19'),true);
  assert.equal(a.alive,true);
  assert.equal(a.classId,'medic');
  assert.equal(a.weaponId,'mcx9');
});

test('older Laguna arena keeps empty inventory and floor-gun rules',()=>{
  const map=MAPS.fy_pool_day;
  assert.equal(map.tdmLoadout,'pickup');
  assert.ok(map.weaponSpawns.length>0);
  const sim=new Simulation({mapId:'fy_pool_day',gameMode:'tdm',bots:0,random:()=>.5});
  const p=sim.addPlayer('lagunaPlayer','Laguna',0,'assault','ak12','p19');
  assert.equal(sim.gameMode,'tdm');
  assert.equal(p.alive,true);
  assert.equal(p.weaponId,'');
  assert.equal(p.primaryWeaponId,'');
  assert.equal(p.sidearmId,'');
  assert.equal(p.grenades,0);
  assert.ok(sim.weaponItems.length>0);
});

test('non-TDM maps still use conquest',()=>{
  const sim=new Simulation({mapId:'port',gameMode:'tdm',bots:0,random:()=>.5});
  assert.equal(sim.gameMode,'conquest');
});
