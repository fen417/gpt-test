import { BLACK_HAWK, VEHICLE_TYPES, blackHawkGroundHeight, blackHawkParked } from './vehicles.js';

const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const turn=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const yawTo=(a,b)=>Math.atan2(a.x-b.x,a.z-b.z);
const LOAD_SECONDS=12;

function steer(input,vehicle,yaw){
  const error=turn(yaw,vehicle.yaw);
  input.strafe=clamp(-error*2.7,-1,1);
  return Math.abs(error);
}

function position(input,vehicle,target,speedLimit){
  const range=distance(vehicle,target);
  if(range<.6)return;
  const heading=steer(input,vehicle,yawTo(vehicle,target));
  const speed=Math.min(speedLimit,range*.73)*clamp(1-heading/.85,0,1);
  input.forward=speed/VEHICLE_TYPES[BLACK_HAWK].maxSpeed;
}

function altitude(input,vehicle,target){
  input.jump=vehicle.y<target-.55;
  input.crouch=vehicle.y>target+.55;
}

export function blackHawkPatrolFor(sim,vehicle){
  return vehicle.home?.team===vehicle.team?sim.map.airPatrols?.[vehicle.id]:null;
}

export function driveBlackHawkPatrol(sim,p,vehicle,plan){
  if(!plan)return false;
  const home=vehicle.home;
  const terrain=sim.map.terrain;
  const {input}=p;
  const parked=blackHawkParked(vehicle,terrain)&&distance(vehicle,home)<4;
  if(parked&&vehicle.hp<vehicle.maxHp*.27){
    vehicle.botPatrol=null;
    return false;
  }
  let patrol=vehicle.botPatrol;
  if(patrol?.pilot!==p.id){
    patrol=vehicle.botPatrol={pilot:p.id,phase:parked?'wait':'return',index:0,waypoint:0,
      departAt:sim.time+LOAD_SECONDS,progressAt:sim.time,closest:Infinity};
  }
  const passengers=vehicle.seats.slice(1).filter(id=>sim.players.get(id)?.alive).length;
  const altitudeTarget=plan.altitude;
  const route=plan.routes[patrol.index];
  if(patrol.phase==='wait'){
    if(passengers===0&&sim.time>patrol.departAt+26){
      vehicle.botPatrol=null;
      return false;
    }
    if(!passengers||sim.time<patrol.departAt+(passengers<2?7:0))return true;
    patrol.phase='climb';
    return true;
  }
  if(patrol.phase==='climb'){
    altitude(input,vehicle,altitudeTarget);
    if(vehicle.y>=altitudeTarget-1){
      patrol.phase='patrol';
      patrol.progressAt=sim.time;
      patrol.closest=Infinity;
    }
    return true;
  }
  if(patrol.phase==='patrol'){
    if(vehicle.hp<vehicle.maxHp*.27||passengers===0){
      patrol.phase='return';
      return true;
    }
    const target=route[patrol.waypoint];
    const range=distance(vehicle,target);
    if(range<patrol.closest-2){patrol.closest=range;patrol.progressAt=sim.time;}
    if(range<17||sim.time-patrol.progressAt>11){
      patrol.waypoint++;
      patrol.progressAt=sim.time;
      patrol.closest=Infinity;
      if(patrol.waypoint>=route.length)patrol.phase='return';
    }
    altitude(input,vehicle,altitudeTarget);
    position(input,vehicle,target,26);
    return true;
  }
  if(patrol.phase==='return'){
    altitude(input,vehicle,altitudeTarget);
    if(vehicle.y>=altitudeTarget-2)position(input,vehicle,home,23);
    if(distance(vehicle,home)<1.35&&Math.abs(vehicle.speed)<1.6)patrol.phase='land';
    return true;
  }
  const heading=steer(input,vehicle,home.yaw);
  const floor=blackHawkGroundHeight(vehicle,terrain);
  if(heading<.12||vehicle.y<floor+1)input.crouch=true;
  if(parked){
    patrol.phase='wait';
    patrol.index=(patrol.index+1)%plan.routes.length;
    patrol.waypoint=0;
    patrol.departAt=sim.time+LOAD_SECONDS;
  }
  return true;
}
