import { getWeapon,EYE_HEIGHT,CROUCH_EYE_HEIGHT } from './world.js';
import { zeroedBulletPitch } from './ballistics.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function shotRandom(id,sequence,salt=''){
  let seed=2166136261;for(const ch of `${id}/${sequence}/${salt}`)seed=Math.imul(seed^ch.charCodeAt(0),16777619);
  return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
}
export function weaponSpread(player){
  const weapon=getWeapon(player.classId,player.weaponId),input=player.input??{};
  const movement=clamp((player.moveSpeed??0)/weapon.speed,0,1),crouch=player.crouching||player.crouch||player.slideTime>0||input.crouch;
  return weapon.spread*(input.aim?.24:.66)*(crouch?.81:1)*(1+movement*(input.aim?.85:1.3))*(player.slideTime>0?1.45:1)*(player.grounded?1:2)*(1+(player.bloom??0))*(player.bot?1.45:1);
}
export function shotTrajectory(player){
  const weapon=getWeapon(player.classId,player.weaponId),input=player.input??{},random=shotRandom(player.id,player.shotSeq,weapon.id);
  const angle=random()*Math.PI*2,radius=Math.sqrt(random())*weaponSpread(player),scoped=Boolean(weapon.zeroRange&&input.aim&&!player.bot);
  const yaw=player.yaw+Math.cos(angle)*radius,pitch=(scoped?zeroedBulletPitch(player.pitch,weapon.zeroRange,weapon.projectileSpeed):player.pitch)+Math.sin(angle)*radius;
  return {yaw,pitch,scoped};
}
export function advanceFireClock(player,weapon,input,dt,time){
  const pressed=input.fire&&!player.fireHeld;player.fireHeld=input.fire;
  const firing=!player.heldGadget&&input.fire&&!input.sprint&&player.equipTime===0&&!input.gadget&&!input.secondaryGadget&&!(player.gadgetActionUntil>time);
  const continuous=firing&&(player.bot||!weapon.semiAuto)&&!pressed&&!player.reloading;
  player.cooldown=Math.max(continuous?-dt:0,(player.cooldown??0)-dt);
  player.bloom=Math.max(0,(player.bloom??0)-dt*(time-(player.lastShotAt??-100)>.16?3.6:.4));
  return {pressed,firing};
}
export function predictPersonalFire(player,input,dt,time){
  const weapon=getWeapon(player.classId,player.weaponId);player.equipTime=Math.max(0,(player.equipTime??0)-dt);
  const {pressed,firing}=advanceFireClock(player,weapon,input,dt,time);
  if(player.reloading){player.reloadTime-=dt;if(player.reloadTime<=0){const count=Math.min(weapon.mag-player.ammo,player.reserve);player.ammo+=count;player.reserve-=count;player.reloading=false;}}
  if((input.reload||player.ammo===0)&&!player.reloading&&player.reserve>0&&player.ammo<weapon.mag){player.reloading=true;player.reloadTime=weapon.reload;}
  if(!firing||player.reloading||player.cooldown>0||player.ammo<=0||weapon.semiAuto&&!pressed||input.toolSlot||input.weaponSlot&&input.weaponSlot!==player.weaponSlot)return null;
  player.ammo--;player.shotSeq++;player.cooldown+=weapon.interval;
  const trajectory=shotTrajectory(player);player.lastShotAt=time;player.bloom=Math.min(1.25,player.bloom+(input.aim?.16:.23));
  const horizontal=weapon.projectileSpeed*Math.cos(trajectory.pitch),crouch=player.crouching||player.crouch||input.crouch;
  return {type:'shot',id:`predicted-${player.id}-${player.weaponId}-${player.shotSeq}`,playerId:player.id,classId:player.classId,weaponId:player.weaponId,team:player.team,shotSeq:player.shotSeq,time,x:player.x,y:player.y+(crouch?CROUCH_EYE_HEIGHT:EYE_HEIGHT),z:player.z,
    ...(trajectory.scoped||player.shotSeq%3===0?{vx:-Math.sin(trajectory.yaw)*horizontal,vy:Math.sin(trajectory.pitch)*weapon.projectileSpeed,vz:-Math.cos(trajectory.yaw)*horizontal,life:weapon.range/weapon.projectileSpeed}:{})};
}
