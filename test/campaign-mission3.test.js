import test from 'node:test';
import assert from 'node:assert/strict';
import mission from '../public/campaign/m03/mission.json' with {type:'json'};
import locale from '../public/campaign/m03/ru.json' with {type:'json'};
import {Mission3Simulation,validMission3Save} from '../shared/campaign/mission3.js';
import {m03ConvoyPose,panelState} from '../shared/campaign/tel-mazin.js';
import {findBotPath} from '../shared/bot-navigation.js';
import {columnMusicCue} from '../src/campaign/column-music.js';

const create=(carry={})=>new Mission3Simulation(mission,{seed:918,lines:locale.lines,campaignProgress:{carry}});
const dt=1/60;
function ticks(sim,count,input={yaw:-Math.PI/2}){
  for(let n=0;n<count;n++){sim.setInput('local',input);sim.step(dt);}
}
function put(sim,[x,z]){Object.assign(sim.campaign.player,{x,z,y:sim.groundAt(x,z),grounded:true,vy:0});}
function settle(sim){
  const c=sim.campaign;
  while(c.pending.length||c.enemies.length){
    c.flushEnemies();
    assert.ok(c.enemies.length<=14);
    assert.ok(c.enemies.length>0,'authored reserve can spawn from cover');
    for(const e of c.enemies){e.invulnerableUntil=0;sim.damage(e,1e4,c.player,{explosive:true});}
  }
}
function walk(sim,[x,z]){
  const p=sim.campaign.player,goal={x,y:0,z},path=findBotPath(sim,p,goal);
  const distance=({x,z})=>Math.hypot(p.x-x,p.z-z);
  assert.ok(path.length&&Math.hypot(path.at(-1).x-x,path.at(-1).z-z)<3,`route to ${x},${z}`);
  for(const node of path){
    for(let n=0;n<420&&distance(node)>.34;n++){
      ticks(sim,1,{yaw:Math.atan2(p.x-node.x,p.z-node.z),forward:Math.min(1,distance(node)*7)});
      if(n%15===0)settle(sim);
    }
    assert.ok(distance(node)<.6,`stalled on the way to ${x},${z}`);
  }
}

test('the convoy ambush repeats at tick 7080 with two losses and a protected dismount',()=>{
  const run=()=>{
    const s=create({tanks_alive:7,kane_alive:false}),c=s.campaign;
    assert.equal(s.vehicles.length,7);assert.equal(c.player.vehicleId,'sokol-7');
    assert.ok(s.players.has('stand-in-kane'));
    ticks(s,7079,{yaw:-Math.PI/2,fire:true});
    assert.ok(s.vehicles.every(v=>v.hp>0));assert.equal(c.player.shotSeq,0);
    ticks(s,1);const first=s.events.find(e=>e.type==='m03AmbushHit');
    assert.ok(Math.abs(first.missionTime-118)<1e-7);
    const frozen=s.vehicles.map(v=>[v.x,v.z]);
    ticks(s,48);assert.equal(s.vehicles.filter(v=>v.hp<=0).length,2);
    assert.equal(c.flags.tanks_alive,5);
    ticks(s,192);assert.equal(c.stage,0);assert.equal(c.enemies.length,8);
    assert.equal(c.player.vehicleId,null);assert.equal(c.player.hp,100);
    assert.ok(s.vehicles.find(v=>v.id==='sokol-7').hp>0);
    for(const [i,v] of s.vehicles.entries())assert.ok(Math.hypot(v.x-frozen[i][0],v.z-frozen[i][1])<1e-6&&v.speed===0);
    return [first.vehicleId,first.missionTime,c.player.x,c.player.z];
  };
  assert.deepEqual(run(),run());
});

test('all 28 interiors and their roofs are connected after opening a door',()=>{
  const s=create(),c=s.campaign;
  assert.equal(s.map.structures.length,90);assert.equal(s.navigationHouses.length,28);
  for(const h of s.navigationHouses)for(const side of [-1,1])c.setPanel(`${h.id}-door-${side}`,'open');
  c.refreshGeometry();
  for(const h of s.navigationHouses){
    const room={x:h.x,y:0,z:h.z-2};
    assert.ok([-1,1].some(side=>{
      const last=findBotPath(s,{x:h.x,y:0,z:h.z+side*(h.d/2+1.25)},room).at(-1);
      return last?.x===room.x&&last.z===room.z;
    }),h.id);
    const roof={x:h.x,y:h.h,z:h.z};
    assert.equal(findBotPath(s,room,roof).at(-1)?.y,roof.y,h.id);
  }
});

test('street cover stops fire only at solid pieces and keeps the convoy road clear',()=>{
  const s=create(),parts=s.map.boxes;
  const byId=id=>parts.find(box=>box.id===`street-dressing-${id}`);
  const clear=(x,y,z)=>s.lineClear({x,y,z:z-1.12},{x,y,z:z+1.1});
  const counter=byId('stall-0-counter'),post=byId('stall-0-post-1');
  assert.equal(clear(counter.x,.46,counter.z),true,'shots pass between the legs');
  assert.equal(clear(counter.x,.88,counter.z),false,'the tabletop itself stops a shot');
  assert.equal(clear(counter.x,1.18,counter.z),true,'decorative goods add no solid volume');
  assert.equal(clear(counter.x,2.5,counter.z),true,'the fabric canopy is penetrable');
  assert.equal(clear(post.x,1.38,counter.z),false,'visible wood posts have their own collider');
  const crate=byId('crate-1');
  assert.equal(clear(crate.x,.44,crate.z),false);
  assert.equal(clear(crate.x,1.42,crate.z),true);
  const palm=byId('palm-6');
  assert.equal(clear(palm.x,1.2,palm.z),false);
  assert.equal(clear(palm.x+.245,palm.h-.7,palm.z),true,'the collision tapers with the trunk');
  assert.equal(clear(palm.x+.7,palm.h-.7,palm.z),true,'the crown adds no collider');
  const convoy=s.vehicles.splice(0);
  for(const tank of convoy)for(let t=95;t<=118;t+=.1){
    const {x,z,yaw}=m03ConvoyPose(mission,tank.convoyIndex,t);
    assert.equal(s.vehicleCollides(tank,x,z,yaw),false,`${tank.id} at ${t.toFixed(1)} s`);
  }
});

test('a checkpoint from before the street update cannot leave the player inside new cover',()=>{
  const s=create(),c=s.campaign;c.rideTime=122;s.time=122;c.updateRide();
  const crate=s.map.boxes.find(box=>box.id==='street-dressing-crate-1');
  put(s,[crate.x,crate.z]);
  const saved=c.serialize();
  assert.ok(c.restore(saved));
  assert.ok(!s.collides(c.player.x,c.player.z,c.player.y+.025));
});

test('the full objective sequence rolls through four valid checkpoints and 66 opponents',()=>{
  const s=create(),c=s.campaign;
  // The precise ride timing is exercised separately, so begin on the ambush tick.
  c.rideTime=122;s.time=122;for(const v of s.vehicles)s.moveVehicle(v,{},dt);
  c.updateRide();c.player.invulnerableUntil=1e7;
  for(const p of s.players.values())if(p.team===0)p.invulnerableUntil=1e7;
  settle(s);c.rideTime=145;ticks(s,100);settle(s);
  for(const h of s.navigationHouses)for(const side of [-1,1])c.setPanel(`${h.id}-door-${side}`,'open');
  c.refreshGeometry();
  walk(s,mission.stages[0].target);ticks(s,1);
  assert.equal(c.stage,1);
  for(let stage=1;stage<=3;stage++){
    settle(s);walk(s,mission.stages[stage].target);ticks(s,1);
    assert.equal(c.stage,stage+1);assert.equal(c.checkpoint,stage);
    assert.ok(validMission3Save(c.latestSave,mission));
  }
  settle(s);
  for(const site of mission.breach.charges){walk(s,site);ticks(s,365,{use:true,yaw:-Math.PI/2});ticks(s,1);}
  assert.deepEqual(c.charges,[true,true]);assert.ok(c.fuseAt>s.time);
  for(const id of mission.breach.opens)assert.equal(c.interactives[id],'closed');
  settle(s);s.time=c.fuseAt+.01;ticks(s,1);assert.ok(c.flags.breached);
  for(const id of mission.breach.opens)assert.equal(c.interactives[id],'destroyed');
  walk(s,[146,1]);ticks(s,1);assert.equal(c.stage,5);assert.equal(c.checkpoint,4);
  assert.ok(s.time-118<12*60,'all traversal and breach finish within the 12-minute simulation budget');
  const saved=c.latestSave;assert.ok(validMission3Save(saved,mission));
  const restored=create(),r=restored.campaign;
  assert.ok(r.restore(saved));assert.equal(restored.colliders.some(b=>b.id==='barrier'),false);
  const snapshot=restored.snapshot().campaign,barrier=restored.map.interactives.findIndex(p=>p.id==='barrier');
  assert.equal(panelState(snapshot.doorStates,barrier),'destroyed');
  const p=r.player;p.invulnerableUntil=Infinity;
  put(restored,mission.stages[5].target);ticks(restored,1);assert.equal(r.defenceWave,1);
  settle(restored);ticks(restored,1);assert.equal(r.finale,null);
  restored.time=r.defenceAt+90;ticks(restored,1);assert.equal(r.defenceWave,2);settle(restored);
  assert.equal(r.enemySerial,66);
  restored.time=r.defenceAt+90;ticks(restored,1);assert.ok(r.finale);
  ticks(restored,14*60);assert.equal(r.complete,true);assert.equal(r.flags.harranti_alive,true);assert.equal(r.flags.m3_done,true);
});

test('the score follows approach, ambush, room clearing and finale without audio assets',()=>{
  const cue=(rideTime,extra={})=>columnMusicCue({campaign:{rideTime,ride:true,alert:0,...extra}},mission);
  assert.deepEqual(cue(60),{tracks:{convoy:.65},offset:60});
  assert.equal(cue(90).tracks.convoy,.325);
  assert.deepEqual(cue(100).tracks,{});
  assert.deepEqual(cue(117.9).tracks,{ambush:1});
  assert.deepEqual(cue(118.2).tracks,{});
  assert.ok(cue(118.5).tracks.combat>0);
  assert.ok(cue(207,{ride:false,alert:3}).tracks.drums>0);
  assert.ok(cue(207,{ride:false,inside:true,alert:1}).tracks.interior>0);
  assert.deepEqual(cue(700,{ride:false,cutscene:{id:'finale',elapsed:2}}),{tracks:{finale:1},offset:2});
});
test('column answers appear after the spoken question and the driver introduction plays once',()=>{
  const sim=create(),c=sim.campaign;
  c.command({type:'talk'});c.command({type:'answer',index:0});
  assert.equal(c.presentation().choices,null);
  c.radio=null;c.queue=[];
  sim.time=c.rideTime=13;c.updateRide();c.updateRide();
  assert.deepEqual(c.queue,['timo.road']);
  sim.time=c.rideTime=26;c.queue=[];c.updateRide();c.updateRadio();
  assert.equal(c.radio.key,'lasko.wound');
  assert.equal(c.presentation().choices,null);
  sim.time=c.radioEnd;c.updateRadio();
  assert.deepEqual(c.presentation().choices,['marten.choiceFine','marten.choiceHonest']);
  c.command({type:'answer',index:1});
  c.updateRadio();
  assert.equal(c.radio.key,'marten.choiceHonest');
});

test('ambush infantry is already placed before the first convoy hit',()=>{
  const sim=create(),c=sim.campaign;
  c.rideTime=mission.convoy.villageAt-14;sim.time=c.rideTime;
  c.updateRide();c.flushEnemies();
  const ids=c.enemies.map(enemy=>enemy.id);
  assert.equal(ids.length,mission.stages[0].first.length);
  for(const p of c.enemies){sim.thinkBot(p,1/60);assert.equal(p.input.fire,false);}
  c.rideTime=mission.convoy.ambushAt+1.5;sim.time=c.rideTime;c.updateRide();c.flushEnemies();
  assert.deepEqual(c.enemies.map(enemy=>enemy.id),ids);
});
