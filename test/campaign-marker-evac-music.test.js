import test from 'node:test';
import assert from 'node:assert/strict';
import {placeCampaignMarker} from '../src/campaign/markers.js';
import {campaignMusicMix} from '../src/campaign/audio.js';
import {CampaignSimulation,COURIER_PARK,COURIER_ESCAPE_ROUTE} from '../shared/campaign/simulation.js';
import mission from '../public/campaign/m01/mission.json' with {type:'json'};
import locale from '../public/campaign/m01/ru.json' with {type:'json'};

function create(){
  const sim=new CampaignSimulation(mission,{loadout:'silent',difficulty:'regular',seed:17,lines:locale.lines});
  const c=sim.campaign;
  c.command({type:'skip'});c.command({type:'loadout',loadout:'silent'});c.command({type:'skip'});
  return {sim,c};
}
function tick(sim,seconds){
  for(let i=0;i<Math.ceil(seconds*60);i++)sim.step(1/60);
}

test('campaign objective markers never cover the aiming region',()=>{
  const width=1920,height=1080,cx=width/2,cy=height/2;
  const pairs=[[cx,cy],[cx+60,cy-42],[cx-110,cy+70],[cx+170,cy-30],[cx-180,cy+100]];
  for(const [x,y] of pairs){
    const placed=placeCampaignMarker({x,y,visible:true},width,height);
    assert.ok(placed,'visible marker kept');
    assert.ok(Math.abs(placed.x-cx)>=200||Math.abs(placed.y-cy)>=138,
      `marker at ${x},${y} obscures reticle: ${JSON.stringify(placed)}`);
  }
  const edge=placeCampaignMarker({x:6,y:31,visible:true},width,height);
  assert.ok(edge.x>=22&&edge.y>=70);
  assert.equal(placeCampaignMarker({x:cx,y:cy,visible:false},width,height),null);
});

test('radio defence music is audible at defaults, follows music slider and preserves fallback stems',()=>{
  const volume=.62,normal=campaignMusicMix({volume,defence:false,subtitle:false,radioReady:true});
  const combat=campaignMusicMix({volume,defence:true,subtitle:false,radioReady:true});
  const dialogue=campaignMusicMix({volume,defence:true,subtitle:true,radioReady:true});
  const fallback=campaignMusicMix({volume,defence:true,subtitle:false,radioReady:false});
  assert.ok(combat.bus>normal.bus*3,'defence stage should be louder than normal ambience');
  assert.ok(dialogue.bus>normal.bus*1.8,'the cue must remain audible during radio subtitles');
  assert.equal(combat.radio,1);
  assert.ok(combat.stems<1,'backing music ducks under the dedicated cue');
  assert.equal(fallback.stems,1,'missing OGG must not mute original combat soundtrack');
  assert.ok(fallback.bus>normal.bus*3);
  for(const ready of [false,true]){
    const muted=campaignMusicMix({volume:0,defence:true,subtitle:false,radioReady:ready});
    assert.equal(muted.bus,0,'music mute remains authoritative');
  }
});

test('courier evacuation starts on village road, away from rock wall',()=>{
  const {sim,c}=create(),v=sim.vehicles.find(v=>v.id==='campaign-evac-car');
  assert.ok(v,'evac car exists');
  assert.equal(v.x,COURIER_PARK.x);assert.equal(v.z,COURIER_PARK.z);
  assert.equal(sim.vehicleCollides(v,v.x,v.z,v.yaw),false,'evac parking is drivable');
  assert.ok(COURIER_ESCAPE_ROUTE[0].x<v.x,'courier heads toward expedition spawn, not east cliff');
  assert.ok(COURIER_ESCAPE_ROUTE.every(p=>p.x<220&&p.z<180));
});

test('rescued courier travels down the road rather than stopping against cliffs',()=>{
  const {sim,c}=create(),v=sim.vehicles.find(v=>v.id==='campaign-evac-car'),courier=sim.players.get('courier');
  sim.time=15;c.runtime.state.stage=4;c.flags.courierSaved=true;
  c.place(c.player,195,140);c.revive(courier);
  c.place(courier,v.x+2,v.z);
  sim.thinkBot(courier,1/60);
  assert.equal(v.seats[0],courier.id);
  sim.thinkBot=()=>{}; // route is controlled by the real vehicle physics
  const start={x:v.x,z:v.z};
  tick(sim,11);
  const travelled=Math.hypot(v.x-start.x,v.z-start.z);
  assert.ok(travelled>27,
    `evac car stuck after 11 s: moved ${travelled.toFixed(2)}m, at ${v.x.toFixed(2)},${v.z.toFixed(2)}, speed ${v.speed}, route ${JSON.stringify(v.campaignRoute)}`);
  assert.ok(v.x<184||v.z<107,'the car must be westbound or southbound along the road');
  assert.ok(Math.abs(v.y-sim.groundAt(v.x,v.z))<1.5,'car must stay on the terrain');
  tick(sim,33);
  const after=sim.vehicles.find(vehicle=>vehicle.id==='campaign-evac-car');
  // By the time the courier has followed the south/west road out of the
  // village, the car should have disappeared behind the town. It must not
  // remain stuck at a wall or at the map boundary.
  assert.ok(!after||Math.hypot(after.x-start.x,after.z-start.z)>93,
    `courier still stuck after 44 s: ${after?.x},${after?.z}, yaw ${after?.yaw}, speed ${after?.speed}, waypoint ${after?.campaignRoute?.index}, nearby ${JSON.stringify(sim.map.boxes.filter(box=>Math.hypot(box.x-(after?.x??0),box.z-(after?.z??0))<15).map(box=>({kind:box.kind,x:box.x,z:box.z,w:box.w,d:box.d})).slice(0,25))}`);
});

test('old checkpoint evacuation car is relocated from rocky route to safe road',()=>{
  const {sim,c}=create(),save=c.serialize();
  const old=save.vehicles.find(v=>v.id==='campaign-evac-car');
  old.x=215;old.z=156;old.yaw=-2.3;
  old.campaignRoute={points:[{x:226,z:166},{x:234,z:173}],index:0,speed:.66};
  assert.equal(c.restore(save),true);
  const repaired=sim.vehicles.find(v=>v.id==='campaign-evac-car');
  assert.equal(repaired.x,COURIER_PARK.x);
  assert.equal(repaired.z,COURIER_PARK.z);
  assert.ok(!repaired.campaignRoute,'unoccupied car should stay parked after migration');
});
