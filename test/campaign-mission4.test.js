import test from 'node:test';
import assert from 'node:assert/strict';
import mission from '../public/campaign/m04/mission.json' with {type:'json'};
import locale from '../public/campaign/m04/ru.json' with {type:'json'};
import {Mission4Simulation,validMission4Save} from '../shared/campaign/mission4.js';
import {SAFRA,SAFRA_GUN,SAFRA_MINES,SAFRA_NEST,SAFRA_SAPPERS,SAFRA_WATER} from '../shared/campaign/safra.js';
import {activateGadget} from '../shared/gadgets.js';

const dt=1/60;
function create(options={}){
  const sim=new Mission4Simulation(mission,{lines:locale.lines,...options});
  sim.thinkBot=()=>{};
  return sim;
}
function step(sim,n=1){for(let i=0;i<n;i++)sim.step(dt);}
function kill(sim,p){sim.damage(p,10000,sim.campaign.player,{fatal:true,weapon:'ПТ-90'});}
function destroy(sim,t){sim.damageVehicle(t,5000,sim.campaign.player,'blast',{x:t.x,y:t.y+2.6,z:t.z});}
function go(c,x,z){c.place(c.player,{x,z});}
function skip(c,n=3){for(let i=0;i<n;i++)c.command({type:'skip'});}
function jump(sim,time){sim.time=time;step(sim);}

test('Safra has a continuous one-lane crossing, real river depth and walkable bunker',()=>{
  const sim=create(),c=sim.campaign;
  skip(c);const tank=c.fieldTanks[0];
  assert.equal(SAFRA.width,760);
  assert.ok(Math.abs(SAFRA_WATER.y-SAFRA.terrain.heightAt(0,35)-.4)<.03);
  for(let x=-45;x<=45;x+=.5){
    assert.ok(!sim.vehicleCollides(tank,x,0,-Math.PI/2),`convoy lane blocked at ${x}`);
    assert.ok(SAFRA.terrain.heightAt(x,0)>SAFRA_WATER.y);
  }
  assert.ok(!sim.collides(SAFRA_GUN.x,SAFRA_GUN.z,3));
  const {x,y,z}=c.gunOrigin();
  for(const side of [-1,1])assert.ok(sim.lineClear({x,y,z},{x:x+3.42,y:y-.25,z:z+side*9.397}),
    'the aperture admits the entire 70-degree machine-gun sector');
  assert.ok(sim.lineClear({x:73,y:4.58,z:-10},{x:82,y:4.49,z:-10}));
  assert.equal(sim.lineClear({x:73,y:3.55,z:-10},{x:82,y:3.55,z:-10}),false);
  for(const [x,z] of SAFRA_SAPPERS)assert.equal(sim.collides(x,z),false);
  for(const mine of SAFRA_MINES)for(const side of [-1,1]){
    const sign=SAFRA.boxes.find(b=>b.id===`mine-warning-${mine.id}-${side}`);
    const x=sign.x,z=sign.z+side*8;
    assert.ok(sim.lineClear({x,y:sim.groundAt(x,z)+1.6,z},{x,y:sign.baseY+.2,z:sign.z}));
  }
});

test('the complete mission reaches four checkpoints, five timed waves and the carried convoy',()=>{
  const sim=create({campaignProgress:{carry:{m3_documents:true,harranti_alive:false,tanks_alive:5,bruno_alive:false}}});
  const c=sim.campaign;
  assert.equal(sim.snapshot().campaign.radio.key,'orlov.brief');
  jump(sim,70);assert.equal(c.stage,'issue');
  jump(sim,c.stageAt+20);assert.equal(c.stage,'ridgeScene');
  assert.equal(c.fieldTanks.length,4);
  jump(sim,c.stageAt+15);assert.equal(c.stage,'ridge');
  jump(sim,c.combatAt+90);assert.equal(c.stage,'field');
  assert.ok(sim.events.some(e=>e.type==='cannonShot'));
  assert.ok(c.hostile.length<=16);
  destroy(sim,c.fieldTanks[0]);destroy(sim,c.fieldTanks[1]);step(sim);
  assert.equal(c.checkpoint,1);
  assert.ok(validMission4Save(c.latestSave,mission));
  const fieldSave=JSON.parse(JSON.stringify(c.latestSave));
  const restarted=create();
  assert.ok(restarted.campaign.restore(fieldSave));
  assert.equal(restarted.campaign.fieldTanks.filter(t=>t.hp===0).length,2);
  assert.ok(restarted.campaign.graceUntil>=restarted.time+8);
  destroy(sim,c.fieldTanks[2]);destroy(sim,c.fieldTanks[3]);step(sim);
  assert.equal(c.checkpoint,2);assert.equal(c.stage,'assault');
  assert.equal(c.smoke.length,4);
  jump(sim,c.smokeAt);
  assert.ok(c.smoke.some(s=>s.radius===8));
  go(c,SAFRA_NEST.x,SAFRA_NEST.z);
  while(c.stage==='assault'){
    for(const e of c.hostile)kill(sim,e);
    step(sim);
  }
  assert.equal(c.checkpoint,3);assert.equal(c.stage,'prepare');
  go(c,65.7,-10);sim.setInput('local',{use:true});step(sim);
  assert.equal(c.flags.m4_radio_code,true);
  const wounded=sim.players.get('black');
  assert.ok(wounded.downed);
  c.revive(wounded);
  jump(sim,c.prepareUntil);assert.equal(c.stage,'defence');
  const zero=c.defenceAt;
  jump(sim,zero+20);assert.deepEqual(c.warning.directions,['road']);
  for(const [i,wave] of mission.defence.waves.entries()){
    jump(sim,zero+wave.at);
    assert.equal(c.waves.at(-1),i+1);
    assert.ok(c.hostile.length<=16);
    for(const v of c.defenceTanks.filter(t=>t.hp>0))destroy(sim,v);
    while(c.hostile.length||c.pending.length){for(const e of c.hostile)kill(sim,e);step(sim);}
    if(i===2){
      assert.equal(c.checkpoint,4);
      assert.ok(validMission4Save(JSON.parse(JSON.stringify(c.latestSave)),mission));
      const afterWave=create();
      assert.ok(afterWave.campaign.restore(JSON.parse(JSON.stringify(c.latestSave))));
      assert.deepEqual(afterWave.campaign.waves,[1,2,3]);
      assert.equal(afterWave.campaign.defenceAt,zero);
    }
  }
  assert.equal(c.defenceLimit,480);
  assert.equal(c.flags.m4_tanks_killed,8);
  assert.equal(sim.vehicles.filter(v=>v.technical).length,2);
  jump(sim,zero+481);
  assert.equal(c.stage,'finale');
  assert.equal(sim.vehicles.filter(v=>v.bridgeConvoy!==undefined).length,5);
  step(sim,180);
  assert.ok(sim.vehicles.find(v=>v.bridgeConvoy===0).x>-46);
  jump(sim,c.stageAt+40);
  assert.equal(c.complete,true);
  assert.equal(c.flags.m4_done,true);
});

test('the unseen flanker arrives at ninety seconds and the PT-90 uses the new launcher profile',()=>{
  const sim=create(),c=sim.campaign;
  skip(c);assert.equal(c.fieldTanks.length,3);
  go(c,-190,0);step(sim);
  jump(sim,c.flankAt-.2);assert.equal(c.fieldTanks.length,3);
  jump(sim,c.flankAt);assert.equal(c.fieldTanks.length,4);
  const t=c.fieldTanks[3],p=c.player;
  go(c,-101,-107);
  assert.equal(activateGadget(sim,p,true),true);
  assert.equal(p.rockets,5);
  assert.equal(p.secondaryCooldown,3.5);
  const shot=sim.events.findLast(e=>e.type==='rocketLaunch');
  assert.ok(Math.abs(Math.hypot(shot.vx,shot.vy,shot.vz)-160)<.01);
  Object.assign(t,{x:-69,y:0,z:20,yaw:-Math.PI/2});
  sim.damageVehicle(t,700,p,'blast',{x:-72.5,y:.9,z:20});
  assert.ok(Math.abs(t.hp-520)<.00001);
  sim.damageVehicle(t,700,p,'blast',{x:-72.5,y:.9,z:20});
  assert.equal(t.hp,0);assert.equal(t.cookoffAt,sim.time+6);
  jump(sim,t.cookoffAt-.2);assert.equal(t.exploded,undefined);
  jump(sim,t.cookoffAt);assert.equal(t.exploded,true);
});

test('stationary gun, delayed mortar and the sapper penalty use simulation time',()=>{
  const sim=create(),c=sim.campaign,p=c.player;
  skip(c);c.startPreparation();
  go(c,SAFRA_GUN.x,SAFRA_GUN.z);sim.setInput('local',{use:true,yaw:0,pitch:-.5});step(sim);
  assert.equal(c.mg.occupant,p.id);
  sim.setInput('local',{fire:true,yaw:Math.PI,pitch:-.5});step(sim,60);
  assert.ok(c.mg.rounds<=191&&c.mg.rounds>=189);
  assert.ok(c.mg.heat>.07&&c.mg.heat<.11);
  assert.ok(c.mg.pitch>=-.08727);
  sim.setInput('local',{reload:true});step(sim);
  assert.equal(c.mg.action,'reload');
  const belts=c.mg.belts;
  jump(sim,c.mg.readyAt);
  assert.equal(c.mg.rounds,200);assert.equal(c.mg.belts,belts-1);
  c.mg.heat=.9;c.command({type:'barrel'});
  jump(sim,c.mg.readyAt);assert.equal(c.mg.heat,0);assert.equal(c.mg.barrels,2);
  c.startDefence();
  const victim=sim.players.get('black');
  sim.damage(victim,500,null,{fatal:true,weapon:'Миномёт'});
  assert.equal(c.defenceLimit,520);
  c.queueMortar();step(sim,3);
  const alert=sim.events.find(e=>e.type==='safraWarning');
  assert.ok(alert&&alert.impactAt-alert.time>1.96);
  assert.ok(c.presentation().mortars.length);
});

test('the nest is lost only after three attackers hold its perimeter for five seconds',()=>{
  const sim=create(),c=sim.campaign;
  skip(c);c.startPreparation();c.revive(sim.players.get('black'));c.startDefence();
  for(let i=0;i<3;i++)c.enqueue('defence',{x:72,z:-10+i},'rifle',{wave:1,goal:SAFRA_NEST});
  c.spawnInfantry();
  step(sim,295);
  assert.equal(c.failed,null);
  step(sim,8);
  assert.match(c.failed,/гнездо/);
});
