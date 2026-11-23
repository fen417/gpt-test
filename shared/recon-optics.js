import {EYE_HEIGHT,CROUCH_EYE_HEIGHT} from './world.js';
import {rayInfantry} from './infantry-hitboxes.js';
import {rayVehicleArmor} from './vehicle-combat.js';
import {rayCollider} from './asset-colliders.js';
import {sameSquad} from './squads.js';

export const BINOCULAR_ZOOM=6;
export const BINOCULAR_RANGE=300;
export const RECON_MARK_LIFETIME=7;
const SCAN_INTERVAL=.10, ACQUIRE_TIME=.45, MARK_INTERVAL=.55;

export function canSeeReconMark(player,mark){
  return Boolean(player&&player.team===mark.team&&(player.id===mark.playerId||sameSquad(player,mark)));
}

export function binocularGroundRange(origin,direction,terrain){
  return terrain?.raycast(origin,direction,BINOCULAR_RANGE)??(direction.y<0?-origin.y/direction.y:Infinity);
}

// Use the same body and vehicle silhouettes for the range display and the
// authoritative scan. A nearer friendly body or wreck still blocks the view.
export function traceBinoculars(origin,direction,wallDistance,players,vehicles,observerId){
  let distance=Math.min(BINOCULAR_RANGE,wallDistance),target=null,kind=null;
  for(const vehicle of vehicles){
    if(vehicle.hp<=0&&!(vehicle.wreckTime>0))continue;
    const hit=rayVehicleArmor(origin,direction,vehicle,distance);
    if(hit<distance){distance=hit;target=vehicle;kind='vehicle';}
  }
  for(const player of players){
    if(!player.alive||player.vehicleId||player.id===observerId)continue;
    const dx=player.x-origin.x,dz=player.z-origin.z;
    const depth=dx*direction.x+dz*direction.z;
    if(depth<-1||depth>distance+2||Math.abs(dx*direction.z-dz*direction.x)>1.2)continue;
    const hit=rayInfantry(origin,direction,player,Boolean(player.crouch||player.crouching||player.slideTime>0)).distance;
    if(hit<distance){distance=hit;target=player;kind='infantry';}
  }
  return {distance:distance<BINOCULAR_RANGE?distance:null,target,kind};
}

export function updateBinocularScan(sim,player){
  if(player.heldGadget!=='binoculars'||!player.alive||player.vehicleId||!player.input.aim||player.input.sprint||player.equipTime>0){
    player.reconScan=null;
    return;
  }
  if(sim.time<(player.reconScanAt??0))return;
  player.reconScanAt=sim.time+SCAN_INTERVAL;
  const origin={x:player.x,y:player.y+(player.crouching?CROUCH_EYE_HEIGHT:EYE_HEIGHT),z:player.z};
  const cos=Math.cos(player.pitch);
  const direction={x:-Math.sin(player.yaw)*cos,y:Math.sin(player.pitch),z:-Math.cos(player.yaw)*cos};
  let limit=Math.min(BINOCULAR_RANGE,binocularGroundRange(origin,direction,sim.map.terrain));
  for(const box of sim.rayBoxes(origin,direction,limit))limit=Math.min(limit,rayCollider(origin,direction,box,limit));
  const {target,kind,distance}=traceBinoculars(origin,direction,limit,sim.players.values(),sim.vehicles,player.id);
  if(!target||target.team===player.team||target.team<0||target.hp<=0){
    player.reconScan=null;
    return;
  }
  const key=kind+'/'+target.id;
  if(player.reconScan?.key!==key)player.reconScan={key,nextAt:sim.time+ACQUIRE_TIME};
  if(sim.time<player.reconScan.nextAt)return;
  player.reconScan.nextAt=sim.time+MARK_INTERVAL;
  sim.event('reconMark',{playerId:player.id,team:player.team,squadId:player.squadId??0,
    targetId:target.id,kind,x:origin.x+direction.x*distance,y:origin.y+direction.y*distance+.35,z:origin.z+direction.z*distance});
}
