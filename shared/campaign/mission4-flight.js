import {BLACK_HAWK_GUN,blackHawkGroundHeight,blackHawkGunPose,canFirePassengerWeapon,getVehicleSeatPose} from '../vehicles.js';

const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
const angle=a=>Math.atan2(Math.sin(a),Math.cos(a));
const mix=(a,b,t)=>a+(b-a)*t;
const smooth=t=>t*t*(3-2*t);
const fraction=(time,length)=>clamp(time/length,0,1);

function position(path,time){
  const i=path.findIndex(node=>node[0]>time);
  if(i<0)return path.at(-1).slice(1);
  if(i===0)return path[0].slice(1);
  const a=path[i-1],b=path[i],before=path[Math.max(0,i-2)],after=path[Math.min(path.length-1,i+1)];
  const seconds=b[0]-a[0],t=(time-a[0])/seconds,t2=t*t,t3=t2*t;
  return [1,2,3].map(axis=>{
    const m0=(b[axis]-before[axis])/(b[0]-before[0])*seconds;
    const m1=(after[axis]-a[axis])/(after[0]-a[0])*seconds;
    return (2*t3-3*t2+1)*a[axis]+(t3-2*t2+t)*m0+(-2*t3+3*t2)*b[axis]+(t3-t2)*m1;
  });
}

export function flightPath(path,time){
  const before=Math.max(path[0][0],time-.1),after=Math.min(path.at(-1)[0],time+.1);
  const [x,z,y]=position(path,time),[ax,az,ay]=position(path,before),[bx,bz,by]=position(path,after);
  const span=Math.max(.1,after-before),distance=Math.hypot(bx-ax,bz-az);
  return {x,y,z,yaw:Math.atan2(ax-bx,az-bz),speed:distance/span,verticalSpeed:(by-ay)/span,
    bodyPitch:clamp(Math.atan2(ay-by,Math.max(1,distance))*.22,-.11,.13),bodyRoll:0};
}

export function orbitPose(config,time){
  const rate=Math.PI*2/config.seconds,theta=-Math.max(0,time)*rate;
  const vx=config.rx*Math.sin(theta)*rate,vz=-config.rz*Math.cos(theta)*rate;
  return {x:config.x+config.rx*Math.cos(theta),z:config.z+config.rz*Math.sin(theta),y:config.height,
    yaw:Math.atan2(-vx,-vz),speed:Math.hypot(vx,vz),verticalSpeed:0,bodyPitch:.06,bodyRoll:.12};
}

export const LANDING_SECONDS=19;
export function landingPose(landing,time,terrain){
  const {pad,from}=landing;
  // The last part of the descent is over the clear yard at zero lateral speed.
  const yaw=0,ground=blackHawkGroundHeight({...pad,yaw},terrain);
  const t=fraction(time,LANDING_SECONDS),arrive=smooth(fraction(t,.76));
  const descent=smooth(fraction(t-.52,.48));
  const turning=smooth(fraction(t,.68));
  return {x:mix(from.x,pad.x,arrive),z:mix(from.z,pad.z,arrive),y:mix(from.y,ground,descent),
    yaw:from.yaw+angle(yaw-from.yaw)*turning,speed:Math.hypot(from.x-pad.x,from.z-pad.z)*6*arrive*(1-arrive)/16,
    bodyPitch:mix(from.bodyPitch??0,.05,turning)*(1-descent),bodyRoll:(from.bodyRoll??0)*(1-turning),
    verticalSpeed:-from.y*6*descent*(1-descent)/(LANDING_SECONDS*.48)};
}

export function departingPose(pad,time,terrain){
  const start={...pad,yaw:0},ground=blackHawkGroundHeight(start,terrain);
  const lift=smooth(fraction(time,6.5)),departure=fraction(time-3.5,21);
  return {x:pad.x-182*departure**2,z:pad.z-392*departure**2,y:ground+55*lift+42*departure,
    yaw:.44*smooth(fraction(time-1.5,5)),speed:39*departure,verticalSpeed:5*(1-departure),
    bodyPitch:.13*departure,bodyRoll:-.12*Math.sin(departure*Math.PI)};
}

export function aimAt(from,target){
  return {yaw:Math.atan2(from.x-target.x,from.z-target.z),
    pitch:Math.atan2(target.y-from.y,Math.hypot(from.x-target.x,from.z-target.z))};
}

export function targetInArc(sim,vehicle,seat,target){
  const eye=getVehicleSeatPose(vehicle,seat);
  const point={x:target.x,y:target.y+1.08,z:target.z};
  if(!eye||Math.hypot(eye.x-point.x,eye.y-point.y,eye.z-point.z)>BLACK_HAWK_GUN.range-5)return false;
  const {yaw,pitch}=aimAt(eye,point);
  if(seat===BLACK_HAWK_GUN.index){
    const gun=blackHawkGunPose(vehicle,yaw,pitch),wanted=aimAt(gun.muzzle,point);
    if(Math.abs(angle(wanted.yaw-gun.yaw))>.1||Math.abs(wanted.pitch-gun.pitch)>.09)return false;
    return sim.lineClear(gun.muzzle,point);
  }
  return canFirePassengerWeapon(vehicle,seat,yaw,pitch)&&sim.lineClear(eye,point);
}
