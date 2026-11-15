import test from 'node:test';
import assert from 'node:assert/strict';
import mission from '../public/campaign/m01/mission.json' with {type:'json'};
import locale from '../public/campaign/m01/ru.json' with {type:'json'};
import {CampaignSimulation} from '../shared/campaign/simulation.js';

function create(){
  const sim=new CampaignSimulation(mission,{loadout:'silent',difficulty:'regular',seed:17,lines:locale.lines});
  const c=sim.campaign;
  c.command({type:'skip'});c.command({type:'loadout',loadout:'silent'});c.command({type:'skip'});
  return {sim,c};
}
function tick(sim,seconds){for(let n=0;n<Math.ceil(seconds*60);n++)sim.step(1/60);}

test('sunrise advances stage by stage, with no instant bright-dawn jump',()=>{
  const {sim,c}=create();
  let last=-1;
  for(let stage=1;stage<=7;stage++){
    c.runtime.state.stage=stage;c.runtime.state.stageAt=sim.time;
    const target=c.presentation().sunriseTarget;
    assert.ok(target>=last && target<=1,`sunrise stage ${stage}`);
    if(stage<7)assert.ok(target<.9,'the full dawn comes only at finale');
    last=target;
  }
});
test('enemy reinforcements spawn outside the camera and not on top of the player',()=>{
  const {sim,c}=create();
  const p=c.player;c.place(p,148,96);p.yaw=0;
  c.runtime.state.stage=6;
  const unit={id:'alarm-response',role:'assault',group:'wave3',zone:'village',x:p.x,z:p.z-11};
  c.pending=[unit];c.flushSpawns();
  const enemy=sim.players.get('alarm-response');
  assert.ok(enemy,'an off-camera approach should be found');
  assert.equal(c.spawnVisible(enemy),false,'enemy must not materialize in view');
  assert.ok(Math.hypot(enemy.x-p.x,enemy.z-p.z)>=24);
});
test('scripted enemy Humvee actually drives in from the road',()=>{
  const {sim,c}=create();
  sim.thinkBot=()=>{};
  c.runtime.state.stage=6;
  c.spawnVehicle();
  const v=sim.vehicles.find(v=>v.id==='campaign-mg-car'),x=v.x,z=v.z;
  assert.ok(sim.players.get('car-driver')?.vehicleId===v.id,'visible driver in the approaching Humvee');
  assert.ok(v.campaignRoute,'Humvee has an arrival route');
  tick(sim,3);
  assert.ok(Math.hypot(v.x-x,v.z-z)>7,`enemy car must travel on real physics: at ${v.x.toFixed(1)},${v.z.toFixed(1)}, speed ${v.speed?.toFixed(2)}, route ${JSON.stringify(v.campaignRoute)}, blocked ${sim.vehicleCollides(v,v.x-1,v.z,.7)}`);
  assert.ok([v.x,v.y,v.z,v.yaw].every(Number.isFinite));
});
test('wounded courier boards parked extraction transport and starts driving away',()=>{
  const {sim,c}=create();
  // Story rescue occurs after the opening vehicle grace period has ended.
  sim.time=15;
  const courier=sim.players.get('courier');
  c.revive(courier);c.flags.courierSaved=true;
  const vehicle=sim.vehicles.find(v=>v.id==='campaign-evac-car');
  assert.ok(vehicle,'extraction transport exists from the beginning');
  c.place(courier,vehicle.x+2,vehicle.z);
  sim.thinkBot(courier,1/60);
  assert.equal(courier.vehicleId,vehicle.id);
  assert.ok(vehicle.campaignRoute,'the courier immediately departs after boarding');
  const x=vehicle.x,z=vehicle.z;
  sim.thinkBot=()=>{};
  tick(sim,2.5);
  assert.ok(Math.hypot(vehicle.x-x,vehicle.z-z)>4);
});
test('regular grenades do not detonate reinforced depot trucks and barrels',()=>{
  const {sim,c}=create();
  c.runtime.state.stage=3;
  sim.event('explosion',{x:20,y:1,z:30,kind:'grenade',playerId:'local'});
  c.consumeEvents();
  assert.equal(c.flags.depotBlastStarted,undefined);
  assert.ok(c.fuel.every(f=>!f.destroyed));
  assert.ok(c.trucks.every(t=>!t.destroyed));
});
test('final screen statistics count soldier kills, mission time and allied revivals',()=>{
  const {sim,c}=create();c.player.kills=11;sim.time=153;c.revives=3;
  assert.deepEqual(c.presentation().stats,{kills:11,elapsedSeconds:153,revives:3});
});
test('optional radio holdout music has a named soundtrack slot',()=>{
  assert.equal(mission.music.radioDefence,'music/radio-defence.ogg');
});
