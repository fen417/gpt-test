import assert from 'node:assert/strict';
import mission from '../public/campaign/m02/mission.json' with {type:'json'};
import {Mission2Simulation} from '../shared/campaign/mission2.js';

const sim=new Mission2Simulation(mission,{seed:737,difficulty:'regular'});
sim.campaign.command({type:'skip'});
const start=sim.vehicles.map(v=>({id:v.id,x:v.x,z:v.z}));
const seconds=600,dt=1/60;
let minEnemy=Infinity,maxshots=0,shots=0,ricochets=0,aliveEnd=0;
const logs=[];
for(let n=0;n<seconds*60;n++){
  sim.setInput('local',{yaw:sim.vehicles.find(v=>v.id==='sokol-7')?.aimYaw??0});
  sim.step(dt);
  for(const event of sim.events){
    if(event.id<=(sim.lastSoakEventId??-1))continue;
    if(event.type==='cannonShot')shots++;
    if(event.type==='ricochet')ricochets++;
    sim.lastSoakEventId=Math.max(sim.lastSoakEventId??-1,event.id);
  }
  if((n+1)%(60*60)===0){
    const current=sim.vehicles.filter(v=>v.team===0&&v.hp>0);
    const opponent=sim.vehicles.filter(v=>v.team===1&&v.hp>0);
    minEnemy=Math.min(minEnemy,opponent.length);
    logs.push({time:(n+1)/60,allies:current.length,enemies:opponent.length,
      alliedNearVillage:current.filter(v=>Math.hypot(v.x,v.z)<165).length,
      shots,ricochets,
      avgAlliedProgress:current.length?Math.round(current.reduce((sum,v)=>sum+(v.x+v.z)/2,0)/current.length):0,
      enemyHp:opponent.map(v=>Math.round(v.hp)).slice(0,10),
      enemyPos:opponent.slice(0,3).map(v=>[v.id,Math.round(v.x),Math.round(v.z)]),
      tankAmmo:current.slice(0,3).map(v=>[v.id,v.shellAmmo.ap,Math.round(v.aimYaw*100)/100]),
      positions:current.slice(0,3).map(v=>[v.id,Math.round(v.x),Math.round(v.z)])});
    if(sim.campaign.failed||sim.campaign.complete)break;
  }
}
console.log(JSON.stringify(logs,null,2));
assert.equal(sim.campaign.enemySerial,10,'second wave must spawn as scripted');
assert.ok(shots>=20,`tank AI never really fought: only ${shots} shots`);
assert.ok(sim.vehicles.some(v=>v.team===1&&v.hp<=0),'no opposing tanks were damaged enough to destroy');
assert.ok(sim.vehicles.filter(v=>v.team===0&&v.hp>0).some(v=>v.x>-350),'company did not reach approach to village');
