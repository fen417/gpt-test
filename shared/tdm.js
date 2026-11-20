// Server/solo authoritative world weapons. No client-supplied pickup acknowledgement.
import { WEAPONS } from './world.js';
const near=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const valid=id=>Object.hasOwn(WEAPONS,id);
export const TDM_PICKUP_RADIUS=1.05;
export function createWeaponItems(sim){
  sim.weaponItems=(sim.map.tdmLoadout==='class'?[]:sim.map.weaponSpawns??[]).filter(s=>valid(s.weaponId)).map(s=>({
    ...s, y:s.y??sim.groundAt(s.x,s.z)+.16,ammo:WEAPONS[s.weaponId].mag,
    reserve:WEAPONS[s.weaponId].reserve,home:true,active:true,respawnAt:0,
    vx:0,vy:0,vz:0,expiresAt:0,
  }));
  sim.nextWeaponItem=0;
}
export function dropWeapon(sim,p,slot=p.weaponSlot,atDeath=false){
  if(sim.gameMode!=='tdm'||sim.map.tdmLoadout==='class'||!p||!p.alive&&!atDeath)return false;
  const weaponId=slot===2?p.sidearmId:p.primaryWeaponId;
  if(!valid(weaponId))return false;
  const held=slot===p.weaponSlot,stash=held?{ammo:p.ammo,reserve:p.reserve}:p.stowedAmmo??{ammo:0,reserve:0};
  const yaw=p.yaw??0,dirX=-Math.sin(yaw),dirZ=-Math.cos(yaw);
  const x=p.x+dirX*.48,z=p.z+dirZ*.48,y=(p.y??sim.groundAt(p.x,p.z))+1;
  sim.weaponItems.push({
    id:'dropped-'+(++sim.nextWeaponItem),weaponId,x,y,z,yaw,ammo:stash.ammo??0,reserve:stash.reserve??0,
    home:false,active:true,respawnAt:0,vx:dirX*(atDeath?1.2:4),vy:atDeath?1.2:2.7,vz:dirZ*(atDeath?1.2:4),
    expiresAt:sim.time+45,ownerLock:p.id,ownerLockUntil:sim.time+.65,
  });
  if(slot===1)p.primaryWeaponId='';else p.sidearmId='';
  if(held){
    const other=slot===1?2:1,otherId=other===1?p.primaryWeaponId:p.sidearmId;
    if(otherId){
      p.weaponSlot=other;p.weaponId=otherId;p.ammo=p.stowedAmmo?.ammo??0;p.reserve=p.stowedAmmo?.reserve??0;
    }else{
      p.weaponSlot=0;p.weaponId='';p.ammo=0;p.reserve=0;
    }
    p.stowedAmmo={ammo:0,reserve:0};
  }else p.stowedAmmo={ammo:0,reserve:0};
  p.reloading=false;p.reloadTime=0;p.equipTime=.15;p.heldGadget=null;
  return true;
}
export function takeWeapon(sim,p,item){
  if(sim.gameMode!=='tdm'||sim.map.tdmLoadout==='class'||!p.alive||!item?.active||!valid(item.weaponId))return false;
  if(item.ownerLock===p.id&&sim.time<item.ownerLockUntil)return false;
  if(near(p,item)>TDM_PICKUP_RADIUS||Math.abs((p.y??0)-item.y)>2.1)return false;
  const slot=WEAPONS[item.weaponId].sidearm?2:1;
  if(slot===1?p.primaryWeaponId:p.sidearmId)return false;
  // Atomic: once this synchronous authority function flips active, no second
  // actor in the same tick or retransmitted input can acquire the same item.
  item.active=false;
  if(item.home)item.respawnAt=sim.time+(sim.weaponRespawnSeconds??15);
  else item.expiresAt=sim.time;
  if(slot!==p.weaponSlot&&p.weaponId){
    p.stowedAmmo={ammo:p.ammo,reserve:p.reserve};
  }
  p.weaponSlot=slot;p.weaponId=item.weaponId;
  if(slot===1)p.primaryWeaponId=item.weaponId;else p.sidearmId=item.weaponId;
  p.ammo=item.ammo;p.reserve=item.reserve;
  p.reloading=false;p.reloadTime=0;p.cooldown=.18;p.equipTime=.18;
  return true;
}
export function updateWeaponItems(sim,dt){
  if(sim.gameMode!=='tdm'||sim.map.tdmLoadout==='class')return;
  for(const item of sim.weaponItems){
    if(!item.active){
      if(item.home&&sim.time>=item.respawnAt){
        item.active=true;item.ammo=WEAPONS[item.weaponId].mag;item.reserve=WEAPONS[item.weaponId].reserve;
      }
      continue;
    }
    if(!item.home&&sim.time>=item.expiresAt){item.active=false;continue;}
    if(!item.home&&(Math.abs(item.vx)+Math.abs(item.vy)+Math.abs(item.vz)>.02)){
      const length=Math.hypot(item.vx,item.vy,item.vz),steps=Math.max(1,Math.ceil(length*dt/.17));
      for(let k=0;k<steps;k++){
        item.vy-=18*dt/steps;
        const dx=item.vx*dt/steps,dy=item.vy*dt/steps,dz=item.vz*dt/steps;
        const floor=sim.groundAt(item.x+dx,item.z+dz)+.14;
        if(!sim.collides(item.x+dx,item.z+dz,Math.max(floor,item.y+dy)-.14,.14,.28)){
          item.x+=dx;item.z+=dz;
        }else{item.vx*=-.25;item.vz*=-.25;}
        item.y+=dy;
        if(item.y<=floor){item.y=floor;item.vy=0;item.vx*=.75;item.vz*=.75;}
      }
      if(item.vy===0){item.vx*=Math.exp(-dt*6);item.vz*=Math.exp(-dt*6);}
    }
  }
  // Stable iteration order: a pickup can only be granted once.
  for(const p of sim.players.values()){
    if(!p.alive)continue;
    for(const item of sim.weaponItems){
      if(item.active&&near(p,item)<=TDM_PICKUP_RADIUS&&
          !(WEAPONS[item.weaponId].sidearm?p.sidearmId:p.primaryWeaponId))takeWeapon(sim,p,item);
    }
  }
  sim.weaponItems=sim.weaponItems.filter(i=>i.home||i.active);
}
export function weaponTarget(sim,p){
  if(sim.map.tdmLoadout==='class')return null;
  const possible=sim.weaponItems.filter(i=>i.active&&
    !(WEAPONS[i.weaponId].sidearm?p.sidearmId:p.primaryWeaponId));
  return possible.sort((a,b)=>near(p,a)-near(p,b))[0]??null;
}
