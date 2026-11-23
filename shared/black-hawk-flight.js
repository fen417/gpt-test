import { boxBounds, overlapsAffine } from './geometry.js';
import { overlapsCollider } from './asset-colliders.js';
import { BLACK_HAWK, VEHICLE_TYPES, blackHawkGroundHeight, vehicleShape } from './vehicles.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const approach = (value, target, step) => value + clamp(target - value, -step, step);
const HULL = [
  [{width:2.65,height:2.94,length:7.49},{x:0,y:2.4,z:-.27}],
  [{width:1.01,height:1.22,length:4.22},{x:0,y:2.21,z:5.53}],
  [{width:.55,height:2.27,length:1.17},{x:-.29,y:3.44,z:7.04}],
  [{width:4.11,height:.14,length:.78},{x:0,y:2.44,z:6.9}],
  ...[-1,1].map(x=>[{width:.55,height:1.32,length:.87},{x:x*1.32,y:.66,z:-1.91}]),
  [{width:.44,height:1.28,length:.65},{x:0,y:.64,z:6.26}],
];

export function blackHawkShapes(vehicle) {
  return HULL.map(([size,center])=>vehicleShape(vehicle,size,center));
}

export function blackHawkCollides(world, vehicle, pose) {
  const limit = world.map.size/2 - 2;
  const area = world.map.playArea;
  const shapes = blackHawkShapes(pose);
  const bounds = shapes.map(obb=>boxBounds({obb}));
  for (const b of bounds) {
    if (b.minX < Math.max(-limit,area?.minX??-limit) || b.maxX > Math.min(limit,area?.maxX??limit) ||
        b.minZ < Math.max(-limit,area?.minZ??-limit) || b.maxZ > Math.min(limit,area?.maxZ??limit)) return true;
  }
  const boxes = world.floorBoxes(pose.x,pose.z,8.8);
  for (const box of boxes) {
    for (let i=0;i<shapes.length;i++) {
      const b = bounds[i];
      if (b.maxX <= box.minX || b.minX >= box.maxX || b.maxZ <= box.minZ || b.minZ >= box.maxZ ||
          b.minY >= box.maxY || b.maxY <= box.minY) continue;
      if (overlapsCollider(shapes[i],box,b)) return true;
    }
  }
  return world.vehicles.some(other=>{
    if (other===vehicle || other.id===vehicle.id || (other.hp<=0 && !(other.wreckTime>0))) return false;
    if (Math.hypot(other.x-pose.x,other.z-pose.z)>19 || Math.abs(other.y-pose.y)>8) return false;
    const solid = other.type===BLACK_HAWK ? blackHawkShapes(other) : [vehicleShape(other)];
    return shapes.some(shape=>solid.some(target=>overlapsAffine(shape,target)));
  });
}

export function moveBlackHawk(world, vehicle, input, dt) {
  const spec = VEHICLE_TYPES[BLACK_HAWK];
  const floor = blackHawkGroundHeight(vehicle,world.map.terrain);
  const rise = Number(input?.jump===true)-Number(input?.crouch===true);
  if(rise<=0&&vehicle.speed===0&&vehicle.y<=floor+.02&&
    Math.abs(vehicle.bodyPitch??0)<.001&&Math.abs(vehicle.bodyRoll??0)<.001)return;
  const lift = input ? rise*(rise>=0?8:6) : -3.2;
  const airborne = vehicle.y>floor+.24 || rise>0;
  const throttle = airborne ? input?.forward??0 : 0;
  const steer = airborne ? input?.strafe??0 : 0;
  const speed = approach(vehicle.speed,throttle*(throttle<0?spec.reverseSpeed:spec.maxSpeed),
    (throttle===0?spec.brake:spec.acceleration)*dt);
  const heading = vehicle.yaw-steer*spec.turnRate*dt;
  const yaw = Math.atan2(Math.sin(heading),Math.cos(heading));
  const dx = -Math.sin(yaw)*speed*dt, dz = -Math.cos(yaw)*speed*dt;
  const steps = Math.max(1,Math.ceil(Math.hypot(dx,dz,lift*dt)/.40));
  let blocked = false;
  for (let i=0;i<steps;i++) {
    const next = {...vehicle,yaw,x:vehicle.x+dx/steps,z:vehicle.z+dz/steps};
    const ground = blackHawkGroundHeight(next,world.map.terrain);
    const ceiling = Math.min(220,Math.max(ground+18,world.groundAt(next.x,next.z)+105));
    const y = clamp(vehicle.y+lift*dt/steps,ground,ceiling);
    // A translating aircraft cannot climb through terrain on a horizontal input.
    const clearTerrain = ground<=vehicle.y+Math.max(0,lift)*dt/steps+.24;
    const flying = y>ground+.18;
    const bodyPitch = approach(vehicle.bodyPitch??0,flying ? clamp(-speed*.005,-.22,.10):0,dt*1.7/steps);
    const bodyRoll = approach(vehicle.bodyRoll??0,flying ? -steer*.24:0,dt*2/steps);
    Object.assign(next,{y,bodyPitch,bodyRoll});
    if (clearTerrain && !blackHawkCollides(world,vehicle,next)) {
      Object.assign(vehicle,{x:next.x,y,z:next.z,yaw,bodyPitch,bodyRoll});
    } else {
      blocked = true;
      const vertical = {...vehicle,y:clamp(vehicle.y+lift*dt/steps,floor,ceiling)};
      if (!blackHawkCollides(world,vehicle,vertical)) vehicle.y=vertical.y;
      break;
    }
  }
  vehicle.speed=blocked||vehicle.y<=blackHawkGroundHeight(vehicle,world.map.terrain)+.18?0:speed;
  vehicle.steer=steer;
}

export function fallBlackHawk(world, vehicle, dt) {
  const floor = blackHawkGroundHeight(vehicle,world.map.terrain);
  if (vehicle.y<=floor+.02) return false;
  vehicle.wreckFallSpeed = (vehicle.wreckFallSpeed??0)+14*dt;
  const next = {...vehicle,y:Math.max(floor,vehicle.y-vehicle.wreckFallSpeed*dt),
    bodyRoll:approach(vehicle.bodyRoll,.44,dt*.6),bodyPitch:approach(vehicle.bodyPitch,-.24,dt*.45)};
  if (!blackHawkCollides(world,vehicle,next)) {
    Object.assign(vehicle,{y:next.y,bodyRoll:next.bodyRoll,bodyPitch:next.bodyPitch});
    if (next.y>floor+.02) return true;
  }
  vehicle.wreckFallSpeed=0;
  return false;
}
