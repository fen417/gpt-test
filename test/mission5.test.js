import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {Mission5Simulation,validMission5Save} from '../shared/campaign/mission5.js';
import {M05_SITES,QUARRY_M05} from '../shared/campaign/quarry-m05.js';
import {MAPS} from '../shared/world.js';

const data=name=>JSON.parse(readFileSync(new URL('../public/campaign/m05/'+name+'.json',import.meta.url)));
const definition=data('mission'),{lines}=data('ru');
const mission=(options={})=>new Mission5Simulation(definition,{lines,...options});

test('M05 is local, respects carried losses and retains the selected weapons',()=>{
  const s=mission({loadout:{primary:'mg36',sidearm:'m50'},campaignProgress:{carry:{duran_alive:false,lasko_alive:false}}});
  const m=s.campaign,p=m.player;
  assert.equal(s.map,QUARRY_M05);
  assert.notEqual(s.map,MAPS.quarry);
  assert.equal(MAPS[s.map.id],undefined);
  assert.equal(p.weaponId,'mg36');
  assert.equal(p.sidearmId,'m50');
  assert.ok(p.rockets>0);
  assert.equal(m.actor('duran'),undefined);
  assert.equal(m.actor('lasko'),undefined);
  assert.ok(m.actor('wing').alive);
  assert.ok(m.actor('medic').alive);
  m.say('duran.ready');assert.equal(m.queue.at(-1),'wing.ready');
  assert.ok(validMission5Save(m.initialSave,definition));
});

test('M05 changes control without moving the infantry hero or changing his loadout',()=>{
  const s=mission(),m=s.campaign;
  const marten=m.actor('marten'),vos=m.actor('vos'),epoch=m.epoch;
  marten.ammo=13;marten.reserve=66;marten.hp=72;
  const before=[marten.x,marten.y,marten.z,marten.ammo,marten.reserve,marten.hp];
  m.switchHero('vos');
  const state=s.snapshot(),local=state.players.find(p=>p.id==='local');
  assert.equal(state.campaign.controlledActorId,'vos');
  assert.equal(local.actorId,'vos');
  assert.equal(state.vehicles.find(v=>v.id===local.vehicleId).seats[local.vehicleSeat],'local');
  assert.equal(vos.bot,false);assert.equal(marten.bot,true);
  assert.ok(m.epoch>epoch);
  m.switchHero('marten');
  assert.deepEqual([marten.x,marten.y,marten.z,marten.ammo,marten.reserve,marten.hp],before);
  assert.equal(s.snapshot().players.find(p=>p.id==='local').actorId,'marten');
});

test('M05 checkpoints round-trip actors, gate, fire and convoy without replaying the blast',()=>{
  const s=mission(),m=s.campaign;
  m.cutscene=null;m.setStage('fuel','evacuate');m.blastAt=5;s.time=13;
  m.openGate('fuel');m.convoy.B.status='saved';m.actor('marten').ammo=11;
  m.save(8);
  const save=JSON.parse(JSON.stringify(m.latestSave));
  assert.ok(validMission5Save(save,definition));
  assert.ok(!validMission5Save({...save,mission:{...save.mission,checkpoint:6}},definition));
  m.actor('marten').ammo=0;m.convoy.B.status='lost';m.failed='failure';
  const epoch=m.epoch;
  assert.ok(m.restore(save));
  assert.equal(m.actor('marten').ammo,11);assert.equal(m.blastAt,5);
  assert.equal(m.convoy.B.status,'saved');assert.equal(m.failed,null);
  assert.ok(m.epoch>epoch);assert.ok(!s.events.some(e=>e.type==='explosion'));
});

test('M05 requires actual loss of every tanker for fuel failure and preserves each success count',()=>{
  for(let saved=0;saved<=3;saved++){
    const s=mission(),m=s.campaign;
    m.cutscene=null;m.setStage('fuel','evacuate');m.blastAt=s.time;
    for(const [index,[id,record]] of Object.entries(m.convoy).entries()){
      if(index<saved)record.status='saved';
      else s.damageVehicle(m.vehicle('fuel-'+id),1e4,m.actor('defense-driver'),'blast');
    }
    m.updateFuel();
    if(!saved){assert.equal(m.failed,'Все заправщики потеряны.');assert.equal(m.complete,false);continue;}
    assert.equal(m.phase,'withdraw');
    Object.assign(m.player,M05_SITES.finale);
    m.updateFuel();
    assert.equal(m.checkpoint,9);
    m.startScene('C4');m.finishScene();
    assert.equal(m.flags.m5_fuel_saved,saved);
    assert.equal(m.flags.m5_fuel_reserve,['','minimal','limited','full'][saved]);
    assert.equal(m.flags.m5_mayak_compromised,true);assert.ok(m.complete);
  }
});
