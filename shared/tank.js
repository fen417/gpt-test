import {VEHICLE_TYPES,vehicleAimDirection,vehiclePartPose,TANK_TURRET_BASE_Y} from './vehicles.js';
import {BULLET_GRAVITY} from './ballistics.js';
import {shotRandom} from './fire-control.js';
import {rayCollider} from './asset-colliders.js';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),angle=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
const muzzleDirection={x:0,y:0,z:0};
const gunHeight=TANK_TURRET_BASE_Y+.34;
export const TANK_MUZZLE_DISTANCE=4.15;
export const TANK_CANNON={speed:190,reload:3.2,ammo:24,gravity:BULLET_GRAVITY,radius:7,damage:150,vehicleDamage:900};
export const TANK_MG={weapon:'СПАРЕННЫЙ ПУЛЕМЁТ',range:280,damage:26,interval:.09,spread:.014,projectileSpeed:410,heatPerShot:.045,minPitch:-.15,maxPitch:.35};
export function tankDropAngle(distance,weapon=0){const speed=weapon===1?TANK_MG.projectileSpeed:TANK_CANNON.speed;return .5*Math.asin(clamp(TANK_CANNON.gravity*distance/(speed**2),-1,1));}
// Campaign-only AP shells: calculate deterministic grazing-angle ricochets
// against the struck hull face. Normal multiplayer cannon rules are unchanged.
export function tankShellRicochets(vehicle,impact,direction){
  if(vehicle?.type!=='tank'||!impact||!direction)return false;
  const c=Math.cos(vehicle.yaw),s=Math.sin(vehicle.yaw);
  const dx=impact.x-vehicle.x,dz=impact.z-vehicle.z;
  const side=Math.abs(dx*c-dz*s)/(VEHICLE_TYPES.tank.width*.5);
  const end=Math.abs(dx*s+dz*c)/(VEHICLE_TYPES.tank.length*.5);
  const top=(impact.y-(vehicle.y??0))/VEHICLE_TYPES.tank.height;
  let normal={x:s,y:0,z:c};
  if(top>.85&&top>=Math.max(side,end)*.85)normal={x:0,y:1,z:0};
  else if(side>end)normal={x:c,y:0,z:-s};
  const length=Math.hypot(direction.x,direction.y,direction.z);
  if(length<1e-6)return false;
  const incidence=Math.abs((normal.x*direction.x+normal.y*direction.y+
    normal.z*direction.z)/length);
  return incidence<Math.cos(72*Math.PI/180);
}
export function tankArmorZone(v,origin){
  if(!origin)return'side';const dx=origin.x-v.x,dz=origin.z-v.z,c=Math.cos(v.yaw),s=Math.sin(v.yaw),x=dx*c-dz*s,z=dx*s+dz*c,y=origin.y-(v.y??0);
  if(y>2.25)return'top';
  return Math.abs(z)/3.5>Math.abs(x)/1.8?(z<0?'front':'rear'):'side';
}
export function tankMuzzle(v,out={}){const d=vehicleAimDirection(v,v.aimYaw,v.aimPitch??0,muzzleDirection),length=Math.hypot(d.x,d.y,d.z),yaw=Math.atan2(-d.x,-d.z);return vehiclePartPose(v,-Math.sin(yaw)*.9+d.x/length*TANK_MUZZLE_DISTANCE,gunHeight+d.y/length*TANK_MUZZLE_DISTANCE,-.4-Math.cos(yaw)*.9+d.z/length*TANK_MUZZLE_DISTANCE,out);}
export function moveTank(sim,v,input,dt){
  const spec=VEHICLE_TYPES.tank,throttle=clamp(input?.forward??0,-1,1);let steer=clamp(input?.strafe??0,-1,1);
  v.steer=steer;
  const target=throttle*(throttle>=0?spec.maxSpeed:spec.reverseSpeed);
  const brake=Math.abs(target)<Math.abs(v.speed)||Math.sign(target)!==Math.sign(v.speed),acceleration=brake?spec.brake:spec.acceleration;
  v.speed+=clamp(target-v.speed,-acceleration*dt,acceleration*dt);
  const turn=steer*(Math.abs(v.speed)<1?1.3:1-Math.min(.6,Math.abs(v.speed)/22));
  const yaw=angle(v.yaw-turn*dt,0),mid=v.yaw-turn*dt*.5,x=v.x-Math.sin(mid)*v.speed*dt,z=v.z-Math.cos(mid)*v.speed*dt;
  const ground=sim.groundAt(x,z),ahead=sim.groundAt(x-Math.sin(yaw)*2,z-Math.cos(yaw)*2),grade=Math.atan2((ahead-ground)*Math.sign(v.speed||1),2);
  if(grade>spec.maxSlope||sim.vehicleCollides(v,x,z,yaw)){v.speed=0;return;}
  if(grade>0)v.speed*=Math.max(.96,1-grade*dt);Object.assign(v,{x,y:ground,z,yaw});
}
export function advanceTankSystems(sim,v,gunner,dt){
  v.wantedYaw=gunner?.input.yaw??v.yaw;v.wantedPitch=clamp(gunner?.input.pitch??0,-.15,.35);
  v.aimYaw=angle(v.aimYaw+clamp(angle(v.wantedYaw,v.aimYaw),-.9*dt,.9*dt),0);v.aimPitch+=clamp(v.wantedPitch-v.aimPitch,-.6*dt,.6*dt);
  const requested=gunner?.input.weaponSlot===2?1:gunner?.input.weaponSlot===1?0:v.weapon;
  if(requested!==v.weapon&&sim.time>=v.weaponReadyAt){v.weapon=requested;v.weaponReadyAt=sim.time+.35;}
  if(v.controlScheme!=='wot'&&Math.abs(v.speed)<1&&sim.map.spawns.some((p,team)=>team===v.team&&Math.hypot(v.x-p.x,v.z-p.z)<35)&&sim.time>=(v.nextShellSupply??0)){
    v.cannonAmmo=Math.min(24,v.cannonAmmo+1);v.nextShellSupply=sim.time+5;
  }
}
export function fireTank(sim,p,v,dt){
  if(!p.input.fire||sim.time<(v.weaponReadyAt??0))return;
  const campaign=v.controlScheme==='wot'&&v.campaignWeapons;
  if(v.weapon===1){
    if(v.overheated||v.gunCooldown>0)return;
    const gun=campaign?{...TANK_MG,...campaign.mg,projectileSpeed:20000}:TANK_MG;
    v.gunCooldown=Math.max(-dt,v.gunCooldown)+gun.interval;
    v.heat=Math.min(1,v.heat+TANK_MG.heatPerShot);v.overheated=v.heat>=1;v.gunSeq++;
    const random=shotRandom(p.id,v.gunSeq,'tank-mg'),a=random()*Math.PI*2,r=Math.sqrt(random())*gun.spread;
    sim.launchBullet(p,gun,tankMuzzle(v),v.aimYaw+Math.cos(a)*r,v.aimPitch+Math.sin(a)*r,v);
    return;
  }
  const kind=campaign&&v.m02Shell==='he'?'he':'ap';
  const spec=campaign?campaign[kind]:TANK_CANNON;
  const ammo=campaign?v.shellAmmo[kind]:v.cannonAmmo;
  if(ammo<=0||sim.time<(v.cannonReadyAt??0))return;
  if(campaign){
    v.shellAmmo[kind]--;v.cannonAmmo=v.shellAmmo[kind];
  }else v.cannonAmmo--;
  v.cannonSeq++;v.cannonReadyAt=sim.time+(spec.reload??TANK_CANNON.reload);
  const origin=tankMuzzle(v),speed=spec.speed??TANK_CANNON.speed,c=Math.cos(v.aimPitch),id='shell-'+v.id+'-'+v.cannonSeq;
  const shell={id,kind:1,ownerId:p.id,vehicleId:v.id,team:p.team,...origin,
    vx:-Math.sin(v.aimYaw)*c*speed,vy:Math.sin(v.aimPitch)*speed,vz:-Math.cos(v.aimYaw)*c*speed,
    life:campaign?5:6,
    ...(campaign?{campaignShell:kind,campaignShellProfile:{damage:spec.damage,
      blastRadius:spec.blastRadius??(kind==='he'?5:1.5)}}:{})};
  const seat={x:v.x,y:(v.y??0)+gunHeight,z:v.z};
  if(!sim.lineClear(seat,origin)){
    const length=Math.hypot(origin.x-seat.x,origin.y-seat.y,origin.z-seat.z),
      dir={x:(origin.x-seat.x)/length,y:(origin.y-seat.y)/length,z:(origin.z-seat.z)/length};
    let hit=sim.map.terrain?.raycast(seat,dir,length)??length;
    for(const box of sim.rayBoxes(seat,dir,length))
      hit=Math.min(hit,rayCollider(seat,dir,box,length));
    hit=Math.max(0,Math.min(length,hit)-.08);
    shell.x=seat.x+dir.x*hit;shell.y=seat.y+dir.y*hit;shell.z=seat.z+dir.z*hit;
    shell.life=.001;shell.vx=shell.vy=shell.vz=0;
  }
  sim.rockets.push(shell);
  sim.event('cannonShot',{playerId:p.id,vehicleId:v.id,weaponId:'tank-cannon',
    shotSeq:v.cannonSeq,shellType:campaign?kind:undefined,...origin});
}
