import { getWeapon, getPrimaryWeapon, getSidearm, EYE_HEIGHT } from './world.js';
import { VEHICLE_TYPES, vehicleShape } from './vehicles.js';
import { boxBounds, rayAffineBox, uprightBox } from './geometry.js';
import { rayCollider } from './asset-colliders.js';

export const CLASS_GADGET = { assault: 'ammo', medic: 'defibrillator', support: 'repair', recon: 'beacon' };
export const GADGET_NAMES = { ammo: 'ЯЩИК ПАТРОНОВ', defibrillator: 'ДЕФИБРИЛЛЯТОР', repair: 'РЕМОНТНАЯ ГОРЕЛКА',
  beacon: 'МАЯК ВЫСАДКИ', launcher: 'ПТ-90', medkit: 'АПТЕЧКА' };
export const BEACON_LIFETIME = 120;
const distance = (a,b) => Math.hypot(a.x-b.x,a.z-b.z);
const eye = p => ({x:p.x,y:p.y+EYE_HEIGHT,z:p.z});
const center = (value, height=.35) => ({x:value.x,y:(value.y??0)+height,z:value.z});

export function deployableBounds(item) {
  return boxBounds({x:item.x,z:item.z,baseY:item.y,w:item.kind==='beacon'?.55:.65,d:.5,h:item.kind==='beacon'?1.04:.45});
}

export function supportHeight(sim,x,z,height) {
  let y=sim.groundAt(x,z);
  const origin={x,y:height+.35,z},direction={x:0,y:-1,z:0};
  let closest=2;
  for(const box of sim.rayBoxes(origin,direction,closest)){
    const hit=rayCollider(origin,direction,box,closest);
    if(hit>1e-5&&hit<closest){closest=hit;y=origin.y-hit;}
  }
  return y;
}

export function liveBeacons(sim,team) {
  return sim.deployables.filter(item=>item.kind==='beacon'&&item.team===team&&item.hp>0&&item.expires>sim.time);
}

export function reviveTarget(sim,p) {
  let found=null,best=3.1;
  for(const ally of sim.players.values()){
    if(ally.alive||ally.team!==p.team||ally.id===p.id||ally.respawnIn<=0||sim.time>=(ally.downedUntil??0))continue;
    const d=Math.hypot(distance(p,ally),p.y-ally.y);
    if(d<best&&sim.lineClear(eye(p),center(ally,.35))){found=ally;best=d;}
  }
  return found;
}

export function repairTarget(sim,p,maxDistance=5) {
  let found=null,best=maxDistance;
  for(const vehicle of sim.vehicles){
    if(vehicle.hp<=0||vehicle.team!==p.team||vehicle.hp>=VEHICLE_TYPES[vehicle.type].maxHp)continue;
    const d=distance(p,vehicle);
    if(d<best&&sim.lineClear(eye(p),center(vehicle,.9))){found=vehicle;best=d;}
  }
  return found;
}

function beginAction(sim,p,kind,duration,targetId) {
  p.gadgetAction=kind;p.gadgetActionUntil=sim.time+duration;p.gadgetTargetId=targetId??null;
  p.reloading=false;p.reloadTime=0;
  sim.event('gadget',{playerId:p.id,classId:p.classId,kind,team:p.team,x:p.x,y:p.y,z:p.z,yaw:p.yaw,duration,targetId});
}

function place(sim,p,kind) {
  const x=p.x-Math.sin(p.yaw)*1.15,z=p.z-Math.cos(p.yaw)*1.15,y=supportHeight(sim,x,z,p.y);
  if(Math.abs(y-p.y)>1.2||sim.collides(x,z,y+.04,.35,.8)||!sim.lineClear(eye(p),{x,y:y+.4,z}))return false;
  sim.deployables=sim.deployables.filter(item=>item.ownerId!==p.id||item.kind!==kind);
  sim.deployables.push({id:`${kind==='beacon'?'beacon':'crate'}:${++sim.eventId}`,kind,ownerId:p.id,team:p.team,x,y,z,yaw:p.yaw,
    hp:kind==='beacon'?70:120,expires:sim.time+(kind==='beacon'?BEACON_LIFETIME:60),supplyAt:sim.time});
  beginAction(sim,p,kind,.75);
  p.gadgetTime=kind==='beacon'?35:18;
  return true;
}

export function activateGadget(sim,p,secondary=false) {
  if(!p.alive||p.vehicleId||p.equipTime>0)return false;
  if(p.gadgetActionUntil>sim.time&&p.gadgetAction!=='repair')return false;
  if(secondary){
    if(p.secondaryCooldown>0)return false;
    if(p.classId==='assault'&&p.rockets>0){
      p.rockets--;p.secondaryCooldown=5;
      beginAction(sim,p,'launcher',1.05);
      p.pendingGadget={kind:'launcher',at:sim.time+.4};
      return true;
    }
    if(p.classId==='medic'){
      beginAction(sim,p,'medkit',.85);p.secondaryCooldown=15;
      for(const ally of sim.players.values()){
        if(!ally.alive||ally.team!==p.team||distance(p,ally)>5.5||!sim.lineClear(eye(p),center(ally,1)))continue;
        const amount=Math.min(45,100-ally.hp);ally.hp+=amount;
        if(ally!==p&&amount>0)sim.awardScore(p,25,'ЛЕЧЕНИЕ СОЮЗНИКА',{kind:'heal'});
      }
      return true;
    }
    return false;
  }
  if(p.gadgetTime>0)return false;
  if(p.classId==='medic'){
    const ally=reviveTarget(sim,p);
    if(!ally)return false;
    beginAction(sim,p,'defibrillator',.7,ally.id);
    p.pendingGadget={kind:'defibrillator',targetId:ally.id,at:sim.time+.55};
    p.gadgetTime=1.5;
    return true;
  }
  if(p.classId==='support'){
    const vehicle=repairTarget(sim,p);
    if(!vehicle)return false;
    if(p.gadgetAction!=='repair'||p.gadgetActionUntil<=sim.time)beginAction(sim,p,'repair',.25,vehicle.id);
    p.gadgetAction='repair';p.gadgetTargetId=vehicle.id;p.gadgetActionUntil=sim.time+.25;
    return true;
  }
  return place(sim,p,CLASS_GADGET[p.classId]);
}

function finishRevive(sim,p,job) {
  const ally=sim.players.get(job.targetId);
  if(!ally||ally.alive||ally.team!==p.team||ally.respawnIn<=0||sim.time>=ally.downedUntil||
      Math.hypot(distance(p,ally),p.y-ally.y)>3.1||!sim.lineClear(eye(p),center(ally,.35)))return;
  if(sim.collides(ally.x,ally.z,ally.y,.4,1.05))return;
  Object.assign(ally,{alive:true,hp:65,respawnIn:0,downedUntil:0,reloading:false,reloadTime:0,vy:0,
    grounded:true,crouching:true,slideTime:0,invulnerableUntil:sim.time+.8,lastHurt:sim.time,fireHeld:false,botJob:null,
    gadgetAction:null,gadgetActionUntil:0,pendingGadget:null});
  ally.input={...ally.input,forward:0,strafe:0,fire:false,grenade:false,gadget:false,secondaryGadget:false,crouch:true};
  ally.deaths=Math.max(0,ally.deaths-1);
  ally.damagers?.clear();
  sim.tickets[ally.team]=Math.min(sim.maxTickets,sim.tickets[ally.team]+1);
  sim.awardScore(p,100,'ВОСКРЕШЕНИЕ СОЮЗНИКА',{kind:'revive',victimId:ally.id});
  sim.event('revive',{playerId:ally.id,medicId:p.id,x:ally.x,y:ally.y,z:ally.z});
}

function launchRocket(sim,p) {
  const direction={x:-Math.sin(p.yaw)*Math.cos(p.pitch),y:Math.sin(p.pitch),z:-Math.cos(p.yaw)*Math.cos(p.pitch)};
  const origin=eye(p);
  // Start at the player, sweeping from here so nearby cover intercepts the shot.
  sim.rockets.push({id:'rocket:'+ ++sim.eventId,ownerId:p.id,team:p.team,...origin,
    vx:direction.x*85,vy:direction.y*85,vz:direction.z*85,life:4});
  p.invulnerableUntil=0;
  sim.event('rocketLaunch',{playerId:p.id,team:p.team,...origin,yaw:p.yaw,pitch:p.pitch});
}

export function damageDeployable(sim,item,amount,attacker) {
  if(item.hp<=0||attacker?.team===item.team)return;
  item.hp=Math.max(0,item.hp-amount);
  if(item.hp===0){
    if(attacker)sim.awardScore(attacker,item.kind==='beacon'?100:35,item.kind==='beacon'?'УНИЧТОЖЕН МАЯК':'УНИЧТОЖЕНО СНАРЯЖЕНИЕ',{kind:'equipment'});
    sim.event('equipmentDestroyed',{equipmentId:item.id,kind:item.kind,x:item.x,y:item.y,z:item.z});
  }
}

export function blast(sim,origin,owner,kind='grenade',directVehicle=null,team=owner?.team) {
  const rocket=kind==='rocket',radius=rocket?8:10;
  sim.event('explosion',{...origin,kind,playerId:owner?.id});
  for(const vehicle of sim.vehicles){
    if(vehicle.hp<=0||vehicle.team===team)continue;
    const d=Math.hypot(distance(origin,vehicle),origin.y-vehicle.y-.8);
    if(vehicle===directVehicle)sim.damageVehicle(vehicle,760,owner,'blast');
    else if(d<radius&&sim.lineClear(origin,center(vehicle,.8)))sim.damageVehicle(vehicle,(rocket?480:240)*(1-d/radius),owner,'blast');
  }
  for(const player of sim.players.values()){
    if(!player.alive||(player.team===team&&player.id!==owner?.id))continue;
    const d=Math.hypot(distance(origin,player),origin.y-player.y-.8);
    const vehicle=sim.vehicles.find(v=>v.id===player.vehicleId);
    const enclosed=vehicle?.type==='humvee'&&player.vehicleSeat!==1;
    if(d<radius&&sim.lineClear(origin,center(player,.8)))sim.damage(player,(rocket?150:140)*(1-d/radius)*(enclosed?.28:1),owner,{weapon:rocket?'ПТ-90':'ГРАНАТА'});
  }
  for(const item of sim.deployables){
    const d=Math.hypot(distance(origin,item),origin.y-item.y-.3);
    if(item.hp>0&&item.team!==team&&d<radius&&sim.lineClear(origin,center(item)))damageDeployable(sim,item,180*(1-d/radius),owner);
  }
}

function updateRockets(sim,dt) {
  for(const rocket of sim.rockets){
    const dx=rocket.vx*dt,dy=(rocket.vy-1.4*dt)*dt,dz=rocket.vz*dt,length=Math.hypot(dx,dy,dz);
    const direction={x:dx/length,y:dy/length,z:dz/length};
    let nearest=length,hit=false,direct=null;
    const ground=sim.map.terrain?.raycast(rocket,direction,length)??(direction.y<0?-rocket.y/direction.y:Infinity);
    if(ground>=0&&ground<nearest){nearest=ground;hit=true;}
    for(const box of sim.rayBoxes(rocket,direction,nearest)){
      const d=rayCollider(rocket,direction,box,nearest);
      if(d<nearest){nearest=d;hit=true;direct=null;}
    }
    for(const vehicle of sim.vehicles){
      if(vehicle.hp<=0)continue;
      const d=rayAffineBox(rocket,direction,vehicleShape(vehicle),nearest);
      if(d<nearest){nearest=d;direct=vehicle;hit=true;}
    }
    for(const player of sim.players.values()){
      if(!player.alive||player.id===rocket.ownerId||player.team===rocket.team)continue;
      const d=rayAffineBox(rocket,direction,uprightBox(player.x,player.y,player.z,.28,1.5),nearest);
      if(d<nearest){nearest=d;direct=null;hit=true;}
    }
    for(const item of sim.deployables){
      if(item.hp<=0||item.team===rocket.team)continue;
      const d=rayCollider(rocket,direction,deployableBounds(item),nearest);
      if(d<nearest){nearest=d;direct=null;hit=true;}
    }
    rocket.x+=direction.x*Math.max(0,nearest-(hit?.08:0));rocket.y+=direction.y*Math.max(0,nearest-(hit?.08:0));
    rocket.z+=direction.z*Math.max(0,nearest-(hit?.08:0));rocket.vy-=2.8*dt;rocket.life-=dt;
    if(hit||rocket.life<=0){
      const owner=sim.players.get(rocket.ownerId);
      blast(sim,{x:rocket.x,y:rocket.y,z:rocket.z},owner?.team===rocket.team?owner:null,'rocket',direct,rocket.team);
      rocket.life=0;
    }
  }
  sim.rockets=sim.rockets.filter(rocket=>rocket.life>0);
}

export function updateEquipment(sim,dt) {
  for(const p of sim.players.values()){
    p.secondaryCooldown=Math.max(0,(p.secondaryCooldown??0)-dt);
    if(!p.alive){p.pendingGadget=null;p.gadgetAction=null;continue;}
    const job=p.pendingGadget;
    if(job&&sim.time>=job.at){
      p.pendingGadget=null;
      if(!p.vehicleId){if(job.kind==='defibrillator')finishRevive(sim,p,job);else launchRocket(sim,p);}
    }
    if(p.gadgetAction==='repair'&&p.input.gadget&&!p.vehicleId){
      const vehicle=repairTarget(sim,p);
      if(vehicle&&vehicle.id===p.gadgetTargetId){
        const amount=Math.min(65*dt,VEHICLE_TYPES[vehicle.type].maxHp-vehicle.hp);
        vehicle.hp+=amount;p.gadgetActionUntil=sim.time+.25;
        if(sim.time>=(p.nextRepairScore??0)){sim.awardScore(p,15,'РЕМОНТ ТЕХНИКИ',{kind:'repair'});p.nextRepairScore=sim.time+1.5;}
      }
    }
    if(sim.time>=p.gadgetActionUntil)p.gadgetAction=null;
  }
  for(const item of sim.deployables){
    if(item.hp<=0||item.expires<=sim.time||item.kind!=='ammo'||item.supplyAt>sim.time)continue;
    item.supplyAt=sim.time+1;
    const owner=sim.players.get(item.ownerId);
    for(const ally of sim.players.values()){
      if(!ally.alive||ally.team!==item.team||distance(ally,item)>5.5||!sim.lineClear(center(item,.4),center(ally,.8)))continue;
      const current=getWeapon(ally.classId,ally.weaponId),stowed=ally.weaponSlot===1?getSidearm(ally.sidearmId):getPrimaryWeapon(ally.classId,ally.primaryWeaponId);
      const before=ally.reserve+ally.stowedAmmo.reserve;
      ally.reserve=Math.min(current.reserve,ally.reserve+20);ally.stowedAmmo.reserve=Math.min(stowed.reserve,ally.stowedAmmo.reserve+20);
      if(sim.time>=(ally.nextExplosiveSupply??0)){
        ally.grenades=Math.min(2,ally.grenades+1);
        if(ally.classId==='assault')ally.rockets=Math.min(2,(ally.rockets??0)+1);
        ally.nextExplosiveSupply=sim.time+25;
      }
      if(owner?.team===item.team&&ally!==owner&&before<ally.reserve+ally.stowedAmmo.reserve&&sim.time>=(ally.nextSupplyScore??0)){
        sim.awardScore(owner,15,'ПОПОЛНЕНИЕ БОЕПРИПАСОВ',{kind:'resupply'});ally.nextSupplyScore=sim.time+5;
      }
    }
  }
  sim.deployables=sim.deployables.filter(item=>item.hp>0&&item.expires>sim.time);
  updateRockets(sim,dt);
}

export function thinkEquipment(sim,p,dt) {
  if(p.vehicleId)return false;
  const input=p.input;
  if(p.gadgetActionUntil>sim.time&&p.pendingGadget){
    input.forward=input.strafe=0;input.fire=input.grenade=false;input.gadget=false;return true;
  }
  if(!p.botUtilityThinkAt||sim.time>=p.botUtilityThinkAt){
    p.botUtilityThinkAt=sim.time+.2;
    p.botJob=null;
    if(p.classId==='medic'){
      let best=14;
      for(const ally of sim.players.values()){
        const d=distance(p,ally);
        if(!ally.alive&&ally.team===p.team&&ally.respawnIn>.65+d/8&&Math.abs(ally.y-p.y)<1.7&&d<best){best=d;p.botJob={kind:'revive',id:ally.id};}
      }
    }else if(p.classId==='support'){
      const vehicle=repairTarget(sim,p,20);
      if(vehicle)p.botJob={kind:'repair',id:vehicle.id};
    }else if(p.classId==='assault'&&p.rockets>0&&p.secondaryCooldown<=0){
      let best=130;
      for(const vehicle of sim.vehicles){
        const d=distance(p,vehicle);
        if(vehicle.hp>0&&vehicle.team!==p.team&&vehicle.team>=0&&d>10&&d<best&&sim.lineClear(eye(p),center(vehicle,.9))){best=d;p.botJob={kind:'launcher',id:vehicle.id};}
      }
    }
  }
  const job=p.botJob;
  if(!job)return false;
  const target=job.kind==='revive'?sim.players.get(job.id):sim.vehicles.find(v=>v.id===job.id);
  if(!target||(job.kind==='revive'?target.alive||target.respawnIn<=.55:target.hp<=0)){p.botJob=null;return false;}
  input.fire=input.grenade=input.secondaryGadget=input.gadget=false;input.aim=false;input.jump=false;input.crouch=false;input.sprint=false;
  if(job.kind==='launcher'){
    input.forward=input.strafe=0;
    const flight=distance(p,target)/85;
    const x=target.x-Math.sin(target.yaw)*target.speed*flight,z=target.z-Math.cos(target.yaw)*target.speed*flight;
    const wanted=Math.atan2(-(x-p.x),-(z-p.z)),delta=Math.atan2(Math.sin(wanted-p.yaw),Math.cos(wanted-p.yaw));
    input.yaw=p.yaw+Math.max(-dt*2.5,Math.min(dt*2.5,delta));
    input.pitch=Math.atan2(target.y+.9-(p.y+EYE_HEIGHT)+1.4*flight*flight,distance(p,{x,z}));
    if(Math.abs(delta)<.08)input.secondaryGadget=true;
    return true;
  }
  const reach=job.kind==='revive'?2.65:4.2;
  if(distance(p,target)>reach){
    if(sim.botPathBudget>0&&sim.time>=(p.botJobPathAt??0)){
      sim.botPathBudget--;p.botPath=sim.pathfind(p,target);p.botJobPathAt=sim.time+.65;
    }
    while(p.botPath.length&&distance(p,p.botPath[0])<1.1)p.botPath.shift();
    const next=p.botPath[0]??target;
    const wanted=Math.atan2(-(next.x-p.x),-(next.z-p.z)),delta=Math.atan2(Math.sin(wanted-p.yaw),Math.cos(wanted-p.yaw));
    input.yaw=p.yaw+Math.max(-dt*3.5,Math.min(dt*3.5,delta));input.pitch=0;
    input.forward=Math.abs(delta)<.7?1:0;input.strafe=0;input.sprint=job.kind==='revive';
  }else{
    input.forward=input.strafe=0;input.sprint=false;
    input.yaw=Math.atan2(-(target.x-p.x),-(target.z-p.z));
    input.pitch=Math.max(-1.45,Math.min(1.45,Math.atan2(target.y+.3-p.y-EYE_HEIGHT,distance(p,target))));
    input.gadget=true;
  }
  return true;
}
