import {VEHICLE_TYPES} from './vehicles.js';
import {BULLET_GRAVITY} from './ballistics.js';
import {shotRandom} from './fire-control.js';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),angle=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
export const TANK_CANNON={speed:190,reload:3.2,ammo:24,gravity:BULLET_GRAVITY,radius:7,damage:150,vehicleDamage:900};
export const TANK_MG={weapon:'СПАРЕННЫЙ ПУЛЕМЁТ',range:280,damage:26,interval:.09,spread:.014,projectileSpeed:410,heatPerShot:.045,minPitch:-.15,maxPitch:.35};
export function tankDropAngle(distance){return .5*Math.asin(clamp(TANK_CANNON.gravity*distance/(TANK_CANNON.speed**2),-1,1));}
export function tankArmorZone(v,origin){
  if(!origin)return'side';const dx=origin.x-v.x,dz=origin.z-v.z,c=Math.cos(v.yaw),s=Math.sin(v.yaw),x=dx*c-dz*s,z=dx*s+dz*c,y=origin.y-(v.y??0);
  if(y>2.25)return'top';if(Math.abs(x)>1.2&&y<1.15)return x<0?'leftTrack':'rightTrack';
  return Math.abs(z)/3.5>Math.abs(x)/1.8?(z<0?'front':'rear'):'side';
}
export function tankMuzzle(v){const pitch=v.aimPitch??0,c=Math.cos(pitch),range=4.27;return{x:v.x-Math.sin(v.aimYaw)*c*range,y:(v.y??0)+2.06+Math.sin(pitch)*range,z:v.z-Math.cos(v.aimYaw)*c*range};}
export function moveTank(sim,v,input,dt){
  const spec=VEHICLE_TYPES.tank,throttle=clamp(input?.forward??0,-1,1);let steer=clamp(input?.strafe??0,-1,1);
  const left=v.leftTrack??0,right=v.rightTrack??0,broken=Math.max(left,right)>=80;
  if(broken)steer=left>=80&&right>=80?0:left>=80?Math.min(0,steer):Math.max(0,steer);
  v.steer=steer;
  const factor=broken?0:Math.max(left,right)>=40?.6:1,target=throttle*(throttle>=0?spec.maxSpeed:spec.reverseSpeed)*factor;
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
  if(Math.abs(v.speed)<1&&sim.map.spawns.some((p,team)=>team===v.team&&Math.hypot(v.x-p.x,v.z-p.z)<35)&&sim.time>=(v.nextShellSupply??0)){v.cannonAmmo=Math.min(24,v.cannonAmmo+1);v.nextShellSupply=sim.time+5;}
}
export function fireTank(sim,p,v,dt){
  if(!p.input.fire||sim.time<v.weaponReadyAt)return;
  if(v.weapon===1){if(v.overheated||v.gunCooldown>0)return;v.gunCooldown=Math.max(-dt,v.gunCooldown)+TANK_MG.interval;v.heat=Math.min(1,v.heat+TANK_MG.heatPerShot);v.overheated=v.heat>=1;v.gunSeq++;
    const random=shotRandom(p.id,v.gunSeq,'tank-mg'),a=random()*Math.PI*2,r=Math.sqrt(random())*TANK_MG.spread;
    sim.launchBullet(p,TANK_MG,tankMuzzle(v),v.aimYaw+Math.cos(a)*r,v.aimPitch+Math.sin(a)*r,v);return;}
  if(v.cannonAmmo<=0||sim.time<v.cannonReadyAt)return;
  v.cannonAmmo--;v.cannonSeq++;v.cannonReadyAt=sim.time+TANK_CANNON.reload;
  const origin=tankMuzzle(v),speed=TANK_CANNON.speed,c=Math.cos(v.aimPitch),id='shell-'+v.id+'-'+v.cannonSeq;
  const shell={id,kind:1,ownerId:p.id,vehicleId:v.id,team:p.team,...origin,vx:-Math.sin(v.aimYaw)*c*speed,vy:Math.sin(v.aimPitch)*speed,vz:-Math.cos(v.aimYaw)*c*speed,life:6};
  const seat={x:v.x,y:(v.y??0)+2.06,z:v.z};
  if(!sim.lineClear(seat,origin)){shell.x=v.x;shell.y=seat.y;shell.z=v.z;shell.life=.001;shell.vx=shell.vy=shell.vz=0;}
  sim.rockets.push(shell);sim.event('cannonShot',{playerId:p.id,vehicleId:v.id,weaponId:'tank-cannon',shotSeq:v.cannonSeq,...origin});
}
