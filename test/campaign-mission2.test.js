import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../shared/campaign/catalog.json' with {type:'json'};
import mission from '../public/campaign/m02/mission.json' with {type:'json'};
import locale from '../public/campaign/m02/ru.json' with {type:'json'};
import {ALHADRA} from '../shared/campaign/alhadra.js';
import {ALHADRA_DESERT,ALHADRA_OFFSET} from '../shared/campaign/alhadra-desert.js';
import {Mission2Simulation,validMission2Save} from '../shared/campaign/mission2.js';
import {TANK_CANNON,tankShellRicochets} from '../shared/tank.js';

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
  const oldVillage=ALHADRA.boxes
    .filter(b=>Math.abs(b.x-ALHADRA_OFFSET.x)<255&&Math.abs(b.z-ALHADRA_OFFSET.z)<185);
  assert.equal(ALHADRA_DESERT.boxes.length,oldVillage.length+25,
    'retain village buildings without importing mission-1 outer cliff colliders');
  assert.ok(ALHADRA_DESERT.terrain.heightAt(-450,-200)>0);
});
test('the tank road does not form a cliff at the reused village edge',()=>{
  for(const x of [-290,-285,-280,-275]){
    const h0=ALHADRA_DESERT.terrain.heightAt(x,-287);
    const h1=ALHADRA_DESERT.terrain.heightAt(x,-285);
    const h2=ALHADRA_DESERT.terrain.heightAt(x,-283);
    assert.ok(Math.abs(h0-h1)<1,
      `tank road jumps at outer map seam: ${x}, -287 to -285 (${h0} / ${h1})`);
    assert.ok(Math.abs(h1-h2)<1,
      `tank road jumps inside original village transition: ${x} (${h1} / ${h2})`);
  }
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
  step(sim,6);
  const first=sim.events.find(e=>e.type==='cannonShot');
  assert.ok(first&&Math.abs(first.time-sim.campaign.combatStartedAt-13)<=.1,'contact must include actual gunfire');
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
  restored.rockets.push({id:'old-shot'});
  assert.equal(restored.campaign.restore(save),true);
  assert.deepEqual(restored.rockets,save.rockets);
  assert.equal(restored.rngState,save.rngState);
  assert.equal(restored.campaign.enemySerial,6);
  assert.equal(restored.vehicles.filter(v=>v.team===1).length,6);
  assert.ok(Math.abs(restored.campaign.elapsed-13)<.0001);
});
test('all ten crew members are alive and tanks leave their starting formation',()=>{
  const sim=create(),c=sim.campaign;
  const initial=sim.vehicles.filter(v=>v.team===0).map(v=>({id:v.id,x:v.x,z:v.z}));
  for(const v of sim.vehicles.filter(v=>v.team===0)){
    const crew=sim.players.get(v.seats[0]);
    assert.equal(crew?.alive,true,`dead or missing crew in ${v.id}`);
    assert.equal(crew.vehicleId,v.id);
  }
  c.command({type:'skip'});
  step(sim,65*60);
  const positions=initial.map(p=>{
    const now=sim.vehicles.find(v=>v.id===p.id);
    return {id:p.id,travel:Math.hypot(now.x-p.x,now.z-p.z),x:now.x,z:now.z};
  });
  assert.ok(positions.filter(p=>p.travel>45).length>=6,
    `friendly tank column failed to drive: ${JSON.stringify(positions)}`);
});
test('healthy enemy tanks survive a hit and stay as wrecks after repeated hits',()=>{
  const sim=create();sim.campaign.command({type:'skip'});step(sim,13*60);sim.campaign.spawnEnemy(4);
  const enemies=sim.vehicles.filter(v=>v.team===1);
  assert.equal(enemies.length,10);
  for(const tank of enemies){
    assert.ok(tank.home.x<996&&tank.home.x>-996,`enemy tank started beyond map at ${tank.home.x}`);
  }
  const target=enemies[0],attacker=sim.players.get('local');
  const hit=()=>sim.damageVehicle(target,900,attacker,'blast',{x:target.x+1,y:target.y+.6,z:target.z});
  hit();hit();assert.ok(target.hp>0&&target.hp<target.maxHp);
  for(let i=0;i<10&&target.hp>0;i++)hit();
  assert.equal(target.hp,0);
  assert.ok(target.respawnIn>10000&&target.wreckTime>10000);
});
test('campaign AP shells ricochet beyond 72 degrees but hit head-on',()=>{
  const tank={type:'tank',x:0,y:0,z:0,yaw:0};
  assert.equal(tankShellRicochets(tank,{x:0,y:1,z:-3.5},{x:0,y:0,z:1}),false);
  assert.equal(tankShellRicochets(tank,{x:0,y:1,z:-3.5},{x:1,y:0,z:.1}),true);
  assert.equal(tankShellRicochets(tank,{x:1.8,y:1,z:0},{x:-1,y:0,z:0}),false);
  assert.equal(tankShellRicochets(tank,{x:1.8,y:1,z:0},{x:-.1,y:0,z:1}),true);
});
test('mission 2 requires a surviving platoon and explicit recovery of the order',()=>{
  const sim=create(),c=sim.campaign;
  c.command({type:'skip'});
  step(sim,85*60);
  assert.equal(c.enemySerial,10);
  for(const tank of sim.vehicles.filter(v=>v.team===1&&v.hp>0)){
    for(let i=0;i<4;i++)sim.damageVehicle(tank,99999,sim.players.get('local'),'blast',
      {x:tank.x,y:tank.y+1,z:tank.z});
  }
  const v=sim.vehicles.find(v=>v.id==='sokol-7');
  v.x=17;v.z=-45;v.y=sim.groundAt(v.x,v.z);
  step(sim,1);assert.equal(c.phase,'village');assert.equal(c.complete,false);
  for(let i=0;i<4;i++){
    sim.time=c.villageStartedAt+i*30;
    c.update(0);
    for(const p of sim.players.values())if(p.team===1&&!p.vehicleId)p.alive=false;
  }
  assert.equal(c.phase,'debrief');assert.equal(c.flags.enemyOrder,undefined);
  c.command({type:'interact'});assert.equal(c.flags.enemyOrder,undefined);
  const wreck=sim.vehicles.find(v=>v.id==='east-tank-10');
  v.x=wreck.x;v.z=wreck.z+10;v.y=sim.groundAt(v.x,v.z);v.speed=0;
  c.command({type:'interact'});
  sim.time+=Math.max(6,locale.lines['dargo.final'].duration)+.1;c.update(0);
  assert.equal(c.complete,true);
  assert.equal(c.flags.enemyOrder,true);
  assert.equal(c.checkpoint,5);
  assert.equal(c.latestSave?.mission.checkpoint,5);
  assert.equal(sim.snapshot().campaign.complete,true);
});
test('the timeline and dialogue are editable external resources',()=>{
  assert.equal(mission.timeline.find(e=>e.id==='enemyVanguard').at,13);
  assert.equal(mission.music.introSeconds,187.5735);
  assert.equal(mission.friendlyCompany.count,10);
  assert.equal(locale.lines['holt.hold'].text,'«Сокол», держать строй!');
});
