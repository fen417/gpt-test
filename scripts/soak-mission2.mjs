import assert from 'node:assert/strict';
import mission from '../public/campaign/m02/mission.json' with {type:'json'};
import {Mission2Simulation} from '../shared/campaign/mission2.js';

const sim=new Mission2Simulation(mission,{seed:737,difficulty:'regular'});
sim.campaign.command({type:'skip'});
const start=sim.vehicles.map(v=>({id:v.id,x:v.x,z:v.z}));
const seconds=600,dt=1/60;
let minEnemy=Infinity,maxshots=0,shots=0,ricochets=0,aliveEnd=0;
const cannonShots=[],blastPositions=[],destroyed=[];

const logs=[];
function diagnose(v){
  const xx=v.x-Math.sin(v.yaw)*.6,zz=v.z-Math.cos(v.yaw)*.6;
  const all=sim.vehicles;
  const withOthers=sim.vehicleCollides(v,xx,zz,v.yaw);
  sim.vehicles=[v];
  const withoutOthers=sim.vehicleCollides(v,xx,zz,v.yaw);
  sim.vehicles=all;
  const rise=sim.groundAt(v.x-Math.sin(v.yaw)*2,v.z-Math.cos(v.yaw)*2)-sim.groundAt(v.x,v.z);
  const person=sim.players.get(v.seats[0]);
  return {id:v.id,x:Math.round(v.x),z:Math.round(v.z),
    wp:v.m02Waypoint,forward:person?.input?.forward,
    speed:Number(v.speed.toFixed(2)),yaw:Number(v.yaw.toFixed(2)),
    nextCollision:withOthers,staticCollision:withoutOthers,
    rise:Number(rise.toFixed(2))};
}
for(let n=0;n<seconds*60;n++){
  sim.setInput('local',{yaw:sim.vehicles.find(v=>v.id==='sokol-7')?.aimYaw??0});
  sim.step(dt);
  for(const event of sim.events){
    if(event.id<=(sim.lastSoakEventId??-1))continue;
    if(event.type==='cannonShot'){shots++;if(cannonShots.length<15)cannonShots.push({time:Math.round(sim.time),by:event.playerId,x:Math.round(event.x),y:Math.round(event.y),z:Math.round(event.z)});}
    if(event.type==='explosion'&&event.kind?.startsWith('cannon')&&blastPositions.length<15)
      blastPositions.push({time:Math.round(sim.time),kind:event.kind,x:Math.round(event.x),y:Math.round(event.y),z:Math.round(event.z)});
    if(event.type==='vehicleDestroyed')destroyed.push([Math.round(sim.time),event.vehicleId]);
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
      positions:current.slice(0,5).map(v=>[v.id,Math.round(v.x),Math.round(v.z),
        Number(v.speed.toFixed(2)),Number(v.yaw.toFixed(2)),v.m02Waypoint,
        Number(sim.map.terrain.heightAt(v.x,v.z).toFixed(1))])});
    if([120,240,360].includes((n+1)/60)){
      logs.at(-1).diagnostic={
        friendly:sim.vehicles.filter(v=>v.team===0&&v.hp>0).slice(0,4).map(diagnose),
        enemy:sim.vehicles.filter(v=>v.team===1&&v.hp>0).slice(0,4).map(diagnose),
      };
    }
    if(sim.campaign.failed||sim.campaign.complete)break;
  }
}
console.log(JSON.stringify({logs,cannonShots,blastPositions,destroyed},null,2));
assert.equal(sim.campaign.enemySerial,10,'second wave must spawn as scripted');
assert.ok(shots>=20,`tank AI never really fought: only ${shots} shots`);
assert.ok(sim.vehicles.some(v=>v.team===1&&v.hp<=0),'no opposing tanks were damaged enough to destroy');
assert.ok(sim.vehicles.filter(v=>v.team===0&&v.hp>0).some(v=>v.x>-350),'company did not reach approach to village');
