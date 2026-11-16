import {getAssetColliders,rayCollider} from '../asset-colliders.js';
import {rayVehicleArmor} from '../vehicle-combat.js';

export const M02_BINDINGS={tankAP:'Digit1',tankHE:'Digit2',tankMG:'Digit3',tankCruise:'KeyR',tankRepair:'KeyH',tankLock:'KeyX',tankZoom:'ShiftLeft',tankHold:'ControlLeft',tankBrake:'Space',tankForward:'F1',tankFire:'F2',tankPosition:'F3',tankHelp:'F4'};

// Use the same sight ray for the camera, rangefinder, lock and fire order.
export function campaignTankSight(map,vehicles,origin,yaw,pitch,ownId){
  const direction={x:-Math.sin(yaw)*Math.cos(pitch),y:Math.sin(pitch),z:-Math.cos(yaw)*Math.cos(pitch)};
  let range=Math.min(1000,map.terrain?.raycast(origin,direction,1000)??1000),targetId=null;
  for(const box of getAssetColliders(map))range=Math.min(range,rayCollider(origin,direction,box,range));
  for(const v of vehicles){
    if(v.id===ownId||v.hp<=0&&!(v.wreckTime>0))continue;
    const hit=rayVehicleArmor(origin,direction,v,range);
    if(hit<range){range=hit;targetId=v.hp>0?v.id:null;}
  }
  return {x:origin.x+direction.x*range,y:origin.y+direction.y*range,z:origin.z+direction.z*range,range,targetId};
}
