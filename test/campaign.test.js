import test from 'node:test';
import assert from 'node:assert/strict';
import mission from '../public/campaign/m01/mission.json' with {type:'json'};
import locale from '../public/campaign/m01/ru.json' with {type:'json'};
import {CampaignSimulation,validCampaignSave} from '../shared/campaign/simulation.js';
import {MissionRuntime} from '../shared/campaign/mission-runtime.js';
import {MAPS,PROTOCOL_VERSION} from '../shared/world.js';

function create(loadout='silent',difficulty='regular'){
  const sim=new CampaignSimulation(mission,{loadout,difficulty,seed:14,lines:locale.lines}),c=sim.campaign;
  c.command({type:'skip'});assert.equal(c.awaitingLoadout,true);c.command({type:'loadout',loadout});c.command({type:'skip'});
  // Tests exercise mission conditions, not random enemy marksmanship.
  sim.thinkBot=()=>{};
  return sim;
}
function tick(sim,seconds=1/60,input={}){for(let n=0;n<Math.ceil(seconds*60);n++){sim.setInput('local',input);sim.step(1/60);}}
function eliminate(sim,group){
  const c=sim.campaign;
  for(let attempts=0;attempts<20;attempts++){
    c.flushSpawns();
    for(const p of sim.players.values())if(p.team===1&&p.alive&&(!group||p.campaignGroup===group)){p.invulnerableUntil=0;sim.damage(p,1000,c.player,{silent:true,explosive:true});}
    if(group?c.allDead(group):!c.pending.length)break;
  }
}
function reach(sim,x,z){sim.campaign.place(sim.campaign.player,x,z);tick(sim);}

test('campaign does not enter multiplayer map catalog or change protocol',()=>{
  assert.equal(PROTOCOL_VERSION,28);assert.equal(MAPS.alhadra,undefined);assert.deepEqual(Object.keys(MAPS),['port','quarry','village']);
});
test('compound trigger conditions respect stage, flags and timers together',()=>{
  let time=0;const host={get time(){return time;},inZone:()=>true,allDead:()=>true,alertLevel:3,action:()=>{}};
  const r=new MissionRuntime({triggers:[]},host);r.state.stage=2;r.state.flags.ready=true;
  assert.equal(r.condition({stage:3,all:[{flag:'ready'}]}),false);
  time=20;assert.equal(r.condition({stage:2,all:[{flag:'ready'},{timer:10}],not:{flag:'missing'}}),true);
});
test('downed player can self-revive, spends one syringe and cannot sprint',()=>{
  const sim=create(),c=sim.campaign,p=c.player;tick(sim);c.down(p);const before=p.syringes;
  tick(sim,4.1,{selfRevive:true,sprint:true,forward:1});assert.equal(p.downed,false);assert.equal(p.syringes,before-1);assert.equal(p.hp,40);
});
test('reviving a wounded ally cancels on release and succeeds after five seconds',()=>{
  const sim=create(),c=sim.campaign,p=c.player,k=sim.players.get('kane');c.place(k,p.x+1,p.z);c.down(k,true);
  tick(sim,2,{use:true});assert(k.downed);tick(sim,.1,{});assert.equal(k.reviveProgress,0);
  tick(sim,5.1,{use:true});assert.equal(k.downed,false);assert.equal(c.flags.kaneSaved,true);
});
test('alert suspicion decays and each zone calls reinforcements only once',()=>{
  const sim=create(),c=sim.campaign;tick(sim);c.raise('depot',1,{x:20,z:30});tick(sim,16);assert.equal(c.alerts.depot.level,0);
  c.raise('depot',3,c.player);const n=c.pending.filter(u=>u.group==='reserve-depot').length;c.reinforce('depot');assert.equal(c.pending.filter(u=>u.group==='reserve-depot').length,n);assert(n<=6);
});
test('JSON checkpoint roundtrip restores inventory, wounds, enemies and RNG',()=>{
  const sim=create(),c=sim.campaign;tick(sim);c.player.ammo=7;c.player.syringes=1;c.down(sim.players.get('kane'),true);c.save(1);
  const save=JSON.parse(JSON.stringify(c.latestSave));assert(validCampaignSave(save,mission));
  c.player.ammo=0;c.player.syringes=0;sim.random();assert(c.restore(save));assert.equal(c.player.ammo,7);assert.equal(c.player.syringes,1);assert.equal(sim.players.get('kane').downed,true);assert.equal(sim.rngState,save.rngState);
  assert.equal(validCampaignSave({...save,version:99},mission),false);assert.equal(validCampaignSave({...save,players:[{id:'local',x:NaN}]},mission),false);
});
test('enemy spawn queue honors the combat cap and does not mark pending units dead',()=>{
  const sim=create(),c=sim.campaign;c.enqueue('depotGuards');c.enqueue('villageGuards');c.flushSpawns();
  assert([...sim.players.values()].filter(p=>p.alive&&p.team===1).length<=14);assert(c.pending.length>0);assert.equal(c.allDead('villageGuards'),false);
});
for(const loadout of ['silent','loud'])test(`${loadout}: all six stages, four checkpoints, final vehicle and retry`,()=>{
  const sim=create(loadout),c=sim.campaign;tick(sim);assert.equal(c.stage,1);
  reach(sim,-119,-63);assert.equal(c.stage,2);eliminate(sim,'ridgeGuards');tick(sim);assert.equal(c.stage,3);assert.equal(c.checkpoint,1);
  // Exercise both depot solutions: planted charges versus explosive barrel chain.
  eliminate(sim);
  if(loadout==='silent'){
    for(const site of c.chargeSites){reach(sim,site.x,site.z);tick(sim,3.1,{use:true});}
    assert(c.fuseUntil>sim.time);reach(sim,-15,-3);tick(sim,25.1);
  }else{
    c.raise('depot',3,c.player);
    for(const f of [...c.fuel])if(!f.destroyed)c.depotExplosion(f);
    for(const truck of c.trucks)if(!truck.destroyed)c.depotExplosion(truck);
    tick(sim);
  }
  assert.equal(c.stage,4);assert.equal(c.checkpoint,2);assert.equal(c.cutscene.id,'midpoint');c.command({type:'skip'});
  reach(sim,131,104);assert.equal(c.stage,5);assert.equal(c.checkpoint,3);
  eliminate(sim);reach(sim,150,104);assert.equal(c.stage,6);
  // Restore after failure at a real checkpoint; subsequent objectives must still fire.
  c.fail('test');c.command({type:'retry'});assert.equal(c.failed,null);assert.equal(c.stage,5);
  eliminate(sim);reach(sim,150,104);assert.equal(c.stage,6);
  eliminate(sim);tick(sim,23);eliminate(sim);tick(sim,29);eliminate(sim);tick(sim);
  assert.equal(c.checkpoint,4);const v=sim.vehicles.find(v=>v.campaignArmor);assert(v);
  const hp=v.hp;sim.damageVehicle(v,9999,c.player,'bullet');assert.equal(v.hp,hp);
  sim.damageVehicle(v,9999,c.player,'blast',{x:v.x,y:v.y,z:v.z});eliminate(sim);tick(sim,40);
  assert.equal(c.flags.vehicleDestroyed,true);assert.equal(c.stage,7);assert.equal(c.cutscene.id,'finale');c.command({type:'skip'});assert.equal(c.complete,true);
});
test('a cutscene consumes ticks without player movement or combat',()=>{
  const sim=new CampaignSimulation(mission,{lines:locale.lines});const p=sim.campaign.player,x=p.x,z=p.z;
  tick(sim,1,{forward:1,fire:true,grenade:true});assert.equal(p.x,x);assert.equal(p.z,z);assert.equal(p.ammo,30);assert.equal(sim.time,0);assert.equal(sim.campaign.cutscene.elapsed>0,true);
});
test('an unwitnessed suppressed kill does not sound a global alarm',()=>{
  const sim=create(),c=sim.campaign;tick(sim);const target=sim.players.get('wadiPatrol-0');
  target.invulnerableUntil=0;sim.damage(target,1000,c.player,{weapon:'AR-416'});
  assert.equal(target.alive,false);assert.equal(c.alerts.wadi.level,0);assert.equal(c.flags.earlyAlarm,undefined);
});
test('killing the station officer before his call prevents that reserve',()=>{
  const sim=create(),c=sim.campaign;c.runtime.state.stage=5;c.enqueue('stationGuards');c.flushSpawns();c.raise('village',3,c.player);
  const officer=[...sim.players.values()].find(p=>p.campaignRole==='officer');officer.invulnerableUntil=0;sim.damage(officer,1000,c.player,{silent:true});
  c.senses(1/60);assert.equal(c.alerts.village.reinforced,false);assert.equal(c.pending.some(p=>p.group==='reserve-village'),false);
});
test('ordinary shared AI runs patrols, follow orders and armored gunner without invalid state',()=>{
  const sim=new CampaignSimulation(mission,{lines:locale.lines,seed:19}),c=sim.campaign;
  c.command({type:'skip'});c.command({type:'loadout'});c.command({type:'skip'});tick(sim,2);
  c.runtime.state.stage=6;reach(sim,150,104);c.spawnVehicle();c.enqueue('wave3');c.raise('village',3,c.player);tick(sim,3);
  const gunner=sim.players.get('car-gunner');assert.equal(gunner.vehicleId,'campaign-mg-car');assert.equal(gunner.vehicleSeat,1);
  assert([...sim.players.values()].every(p=>[p.x,p.y,p.z,p.hp].every(Number.isFinite)));
  assert([...sim.players.values()].filter(p=>p.team===1&&p.alive).length<=14);
});
