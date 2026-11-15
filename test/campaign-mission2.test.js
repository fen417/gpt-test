import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../shared/campaign/catalog.json' with {type:'json'};
import mission from '../public/campaign/m02/mission.json' with {type:'json'};
import locale from '../public/campaign/m02/ru.json' with {type:'json'};
import {ALHADRA} from '../shared/campaign/alhadra.js';
import {ALHADRA_DESERT,ALHADRA_OFFSET} from '../shared/campaign/alhadra-desert.js';
import {Mission2Simulation,validMission2Save} from '../shared/campaign/mission2.js';
import {TANK_CANNON} from '../shared/tank.js';

function create(){return new Mission2Simulation(mission,{difficulty:'regular',seed:113,lines:locale.lines});}
function step(sim,n){for(let i=0;i<n;i++)sim.step(1/60);}
test('catalog defines eight sequential missions across three acts',()=>{
  assert.equal(catalog.title,'Песок и сталь');assert.equal(catalog.missions.length,8);
  assert.deepEqual(catalog.acts.map(a=>a.missionIds.length),[2,3,3]);
  assert.deepEqual(catalog.missions.filter(m=>m.implemented).map(m=>m.id),['m01','m02']);
});
test('extended Al-Hadra tank map preserves old village terrain and geometry',()=>{
  assert.equal(ALHADRA_DESERT.width,2000);assert.equal(ALHADRA_DESERT.depth,1200);
  assert.equal(ALHADRA_DESERT.playArea.minZ,-600);
  const coords=[[-80,-30],[20,30],[150,105],[175,145]];
  for(const [x,z] of coords){
    const preserved=ALHADRA.terrain.heightAt(x,z);
    const carried=ALHADRA_DESERT.terrain.heightAt(x-ALHADRA_OFFSET.x,z-ALHADRA_OFFSET.z);
    assert.ok(Math.abs(carried-preserved)<.025,`terrain changed at (${x},${z}): ${carried} vs ${preserved}`);
  }
  assert.equal(ALHADRA.boxes.length+25,ALHADRA_DESERT.boxes.length);
  assert.ok(ALHADRA_DESERT.terrain.heightAt(-450,-200)>0);
});
test('ten allied tanks and player commander share one seat and controls',()=>{
  const sim=create(),v=sim.vehicles.find(v=>v.id==='sokol-7'),p=sim.players.get('local');
  assert.equal(sim.vehicles.filter(v=>v.team===0&&v.type==='tank').length,10);
  assert.equal(p.vehicleId,v.id);assert.equal(p.vehicleSeat,0);
  assert.equal(v.controlScheme,'wot');assert.equal(v.shellAmmo.ap,50);assert.equal(v.shellAmmo.he,30);
  assert.equal(sim.map.id,'alhadra-desert');
  assert.equal(sim.campaign.cutscene.id,'briefing');
});
test('skipping briefing never shifts the exact 13-second first-enemy trigger',()=>{
  const sim=create();step(sim,120);assert.equal(sim.vehicles.filter(v=>v.team===1).length,0);
  sim.campaign.command({type:'skip'});
  assert.equal(sim.campaign.elapsed,0);
  step(sim,12*60);
  assert.equal(sim.vehicles.filter(v=>v.team===1).length,0);
  step(sim,60);
  assert.equal(sim.vehicles.filter(v=>v.team===1).length,6);
  assert.ok(Math.abs(sim.campaign.elapsed-13)<.0001);
  assert.equal(sim.campaign.enemySerial,6);
});
test('commander can select AP, HE and MG without modifying multiplayer tank physics',()=>{
  const sim=create(),c=sim.campaign,v=sim.vehicles.find(v=>v.id==='sokol-7');
  c.command({type:'skip'});
  c.command({type:'weapon',mode:'he'});
  assert.equal(v.m02Shell,'he');assert.equal(v.weapon,0);
  // Weapon swap has a short 0.22s safety lock before the first shot.
  step(sim,15);
  sim.setInput('local',{yaw:v.yaw,pitch:0,fire:true});
  step(sim,1);
  assert.equal(v.shellAmmo.he,29);assert.equal(v.shellAmmo.ap,50);
  assert.equal(sim.rockets[0]?.campaignShell,'he');
  assert.equal(sim.rockets[0]?.campaignShellProfile?.damage,450);
  c.command({type:'weapon',mode:'ap'});
  assert.equal(v.cannonAmmo,50);
  c.command({type:'weapon',mode:'mg'});
  assert.equal(v.weapon,1);
  assert.equal(TANK_CANNON.speed,190,'multiplayer tank weapon must remain unchanged');
});
test('mission 2 checkpoint can restore enemy tanks and timing',()=>{
  const sim=create();sim.campaign.command({type:'skip'});
  step(sim,13*60);
  const save=sim.campaign.serialize();
  assert.equal(validMission2Save(save,mission),true);
  const restored=create();
  assert.equal(restored.campaign.restore(save),true);
  assert.equal(restored.campaign.enemySerial,6);
  assert.equal(restored.vehicles.filter(v=>v.team===1).length,6);
  assert.ok(Math.abs(restored.campaign.elapsed-13)<.0001);
});
test('the timeline and dialogue are editable external resources',()=>{
  assert.equal(mission.timeline.find(e=>e.id==='enemyVanguard').at,13);
  assert.equal(mission.music.introSeconds,188);
  assert.equal(mission.friendlyCompany.count,10);
  assert.equal(locale.lines['holt.hold'].text,'«Сокол», держать строй!');
});
