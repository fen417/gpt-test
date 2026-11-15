import test from 'node:test';
import assert from 'node:assert/strict';
import mission from '../public/campaign/m01/mission.json' with {type:'json'};
import locale from '../public/campaign/m01/ru.json' with {type:'json'};
import {CampaignSimulation} from '../shared/campaign/simulation.js';
import {ALHADRA} from '../shared/campaign/alhadra.js';

function create({bots=false}={}){
  const sim=new CampaignSimulation(mission,{loadout:'silent',difficulty:'regular',seed:14,lines:locale.lines}),c=sim.campaign;
  c.command({type:'skip'});c.command({type:'loadout',loadout:'silent'});c.command({type:'skip'});
  if(!bots)sim.thinkBot=()=>{};
  return {sim,c};
}
function tick(sim,seconds,input={}){
  for(let i=0;i<Math.ceil(seconds*60);i++){sim.setInput('local',input);sim.step(1/60);}
}
test('rescuing a wounded ally pauses death timer only while the player holds use',()=>{
  const {sim,c}=create(),ally=sim.players.get('kane');
  c.place(ally,c.player.x+1,c.player.z);c.down(ally);ally.downedTimer=.7;
  tick(sim,1.6,{use:true});
  assert.equal(ally.alive,true);
  assert.equal(ally.downed,true);
  assert.equal(ally.reviver,'local');
  assert.ok(ally.reviveProgress>.25,'first aid really is underway');
  assert.ok(ally.downedTimer>.65,'bleedout is frozen during active rescue');
  tick(sim,.25,{});
  assert.equal(ally.reviver,null,'release cancels resuscitation');
  assert.ok(ally.downedTimer<.5,'countdown resumes after release');
  tick(sim,.6,{});
  assert.equal(ally.alive,false,'interrupted rescue does not make casualty immortal');
});

test('the local self-revive syringe also freezes the remaining death countdown',()=>{
  const {sim,c}=create(),player=c.player;
  c.down(player);player.downedTimer=.6;
  tick(sim,1.5,{selfRevive:true});
  assert.ok(player.downed&&player.alive);
  assert.ok(player.downedTimer>.58,'syringe use holds the death timer');
  tick(sim,.3,{});
  assert.ok(player.downedTimer<.4,'letting go resumes the countdown');
});

test('medic can revive downed player without bleedout finishing mid-treatment',()=>{
  const {sim,c}=create({bots:true});
  c.pending=[];for(const [id,p] of sim.players)if(p.team===1)sim.players.delete(id);
  const player=c.player,medic=sim.players.get('lasko');
  c.place(medic,player.x+1.7,player.z);
  c.down(player);player.downedTimer=3;
  tick(sim,1.1);
  assert.equal(player.reviver,medic.id,'medic starts first aid');
  const paused=player.downedTimer;
  tick(sim,2);
  assert.ok(player.downed&&player.alive,'player lives during treatment');
  assert.ok(Math.abs(player.downedTimer-paused)<.06,'remaining time is paused');
  tick(sim,3.5);
  assert.ok(!player.downed&&player.alive,'medic completes the revive');
});

test('abandoned or incapacitated bot rescuers cannot freeze a casualty forever',()=>{
  const {sim,c}=create({bots:true});
  c.pending=[];for(const [id,p] of sim.players)if(p.team===1)sim.players.delete(id);
  const player=c.player,medic=sim.players.get('lasko');
  c.place(medic,player.x+1.7,player.z);c.down(player);player.downedTimer=3;
  tick(sim,.6);assert.equal(player.reviver,medic.id);
  const remaining=player.downedTimer;
  medic.alive=false;
  tick(sim,.5);
  assert.ok(player.downedTimer<remaining-.3,'death timer restarts after rescuer is lost');
});

test('first-stage shelter foundations meet terrain at every footprint corner',()=>{
  const tent=ALHADRA.boxes.find(b=>b.kind==='tent'&&b.x===-78&&b.z===-15);
  assert.ok(tent,'ridge shelter exists near the opening approach');
  for(const dx of [-tent.w/2,0,tent.w/2])
    for(const dz of [-tent.d/2,0,tent.d/2]){
      const ground=ALHADRA.terrain.heightAt(tent.x+dx,tent.z+dz);
      assert.ok(Math.abs(ground-tent.baseY)<.07,
        `floating shelter at (${tent.x+dx},${tent.z+dz}): ground=${ground} base=${tent.baseY}`);
    }
});
