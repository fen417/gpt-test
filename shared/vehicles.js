import { affineBox, multiplyMatrix, rotationMatrix, transformVector } from './geometry.js';

const driver = { name: 'Водитель', role: 'driver' };
const passenger = { name: 'Пассажир', role: 'passenger' };
// Deck is 1.45 m high; the bottom of the turret ring must overlap it slightly.
export const TANK_TURRET_BASE_Y=1.53;

export const VEHICLE_TYPES = {
  tank:{name:'Танк Т-72 «Рубеж»',width:3.6,length:7,height:2.8,maxHp:2400,bulletImmune:true,bulletArmor:0,blastArmor:1,respawn:120,
    maxSpeed:13,reverseSpeed:4.5,acceleration:4.5,brake:9,turnRate:1,maxSlope:32*Math.PI/180,boardRange:5,
    armorZones:{front:.55,side:1,rear:1.6,top:1.6},
    seats:[{...driver,x:-.62,z:-1.9,height:2.0},{name:'Пулемётчик',role:'gunner',x:.45,z:-.4,height:TANK_TURRET_BASE_Y+1.18},
      {...passenger,x:-1.45,z:1.6,height:2.31},{...passenger,x:1.45,z:1.6,height:2.31},{...passenger,x:0,z:3.22,height:2.12}]},
  atv: {
    name: 'Квадроцикл', width: 1.38, length: 2.34, height: 1.17,
    maxHp: 425, bulletArmor: .48, blastArmor: 1, respawn: 32,
    maxSpeed: 19, reverseSpeed: 6, acceleration: 11.5, brake: 17, turnRate: 2.05,
    seats: [
      { ...driver, x: 0, z: -.22, height: 1.48 },
      { ...passenger, x: 0, z: .47, height: 1.52 },
    ],
  },
  humvee: {
    name: 'Хамви', width: 2.26, length: 4.9, height: 1.93,
    maxHp: 850, bulletArmor: .32, blastArmor: .86, respawn: 50,
    maxSpeed: 15.5, reverseSpeed: 5, acceleration: 8.5, brake: 14, turnRate: 1.45,
    seats: [
      { ...driver, x: -.54, z: -.52, height: 1.58 },
      { name: 'Пулемётчик', role: 'gunner', x: 0, z: .19, height: 2.38 },
      { ...passenger, x: .54, z: -.52, height: 1.58 },
      { ...passenger, x: -.54, z: .71, height: 1.6 },
      { ...passenger, x: .54, z: .71, height: 1.6 },
    ],
  },
};

export const HUMVEE_SIDE_WINDOWS = {
  x: .975, y: 1.54, height: .35,
  front: { z: -.53, width: 1.01 },
  rear: { z: .73, width: 1.16 },
};

export const VEHICLE_BOARD_RANGE = 3.5;
export function getVehicleDimensions(vehicle) {
  const spec = VEHICLE_TYPES[vehicle.type], scale = vehicle.modelScale ?? { x: 1, y: 1, z: 1 };
  return { width: spec.width * scale.x, length: spec.length * scale.z, height: spec.height * scale.y };
}
const M02_WRECK_HULL=Object.freeze({width:3.56,length:6.76,height:1.47});
export function vehicleCollisionSize(vehicle){
  return vehicle.compactWreck&&vehicle.hp<=0?M02_WRECK_HULL:VEHICLE_TYPES[vehicle.type];
}
export function vehicleBoardingRange(vehicle) {
  return (VEHICLE_TYPES[vehicle.type].boardRange??VEHICLE_BOARD_RANGE) * Math.max(1, vehicle.modelScale?.x ?? 1, vehicle.modelScale?.z ?? 1);
}
export function vehicleBodyTilt(vehicle, terrain) {
  const bodyPitch=vehicle.modelRotation?.x??0,bodyRoll=vehicle.modelRotation?.z??0;
  if (!terrain) return { bodyPitch,bodyRoll };
  const { width, length } = getVehicleDimensions(vehicle), sin = Math.sin(vehicle.yaw), cos = Math.cos(vehicle.yaw);
  const a = length * .35, b = width * .45;
  const front = terrain.heightAt(vehicle.x - sin * a, vehicle.z - cos * a);
  const rear = terrain.heightAt(vehicle.x + sin * a, vehicle.z + cos * a);
  const right = terrain.heightAt(vehicle.x + cos * b, vehicle.z - sin * b);
  const left = terrain.heightAt(vehicle.x - cos * b, vehicle.z + sin * b);
  return { bodyPitch:bodyPitch+Math.atan2(front - rear, a * 2), bodyRoll:bodyRoll+Math.atan2(right - left, b * 2) };
}

export function vehicleShape(vehicle){
  const spec=vehicleCollisionSize(vehicle),s=vehicle.modelScale??{x:1,y:1,z:1};
  const matrix=multiplyMatrix(rotationMatrix({y:vehicle.yaw??0}),
    multiplyMatrix([s.x,0,0,0,s.y,0,0,0,s.z],rotationMatrix({x:vehicle.bodyPitch??0,z:vehicle.bodyRoll??0})));
  const offset=transformVector(matrix,{x:0,y:spec.height/2,z:0});
  return affineBox({x:vehicle.x+offset.x,y:(vehicle.y??0)+offset.y,z:vehicle.z+offset.z},
    [spec.width/2,spec.height/2,spec.length/2],matrix);
}

export function vehicleAimDirection(vehicle, yaw, pitch, out={}) {
  const scale = vehicle.modelScale ?? { x: 1, y: 1, z: 1 };
  const dx = -Math.sin(yaw) * Math.cos(pitch), dy = Math.sin(pitch), dz = -Math.cos(yaw) * Math.cos(pitch);
  const s = Math.sin(vehicle.yaw), c = Math.cos(vehicle.yaw);
  const x = (dx * c - dz * s) / scale.x, y = dy / scale.y, z = (dx * s + dz * c) / scale.z;
  const cp = Math.cos(vehicle.bodyPitch ?? 0), sp = Math.sin(vehicle.bodyPitch ?? 0);
  const cr = Math.cos(vehicle.bodyRoll ?? 0), sr = Math.sin(vehicle.bodyRoll ?? 0);
  const py = y * cp + z * sp, pz = -y * sp + z * cp;
  out.x=x*cr+py*sr;out.y=-x*sr+py*cr;out.z=pz;return out;
}
export const TURRET_MIN_PITCH = -.25;
export const TURRET_MAX_PITCH = .85;
export const TURRET_WEAPON = {
  weapon: 'ПУЛЕМЁТ ХАМВИ', range: 220, damage: 38, interval: .096, spread: .018, projectileSpeed: 410,
  minPitch: TURRET_MIN_PITCH, maxPitch: TURRET_MAX_PITCH,
  heatPerShot: .048,
};

export function vehicleLocalPoint(vehicle, x, z) {
  const sin = Math.sin(vehicle.yaw), cos = Math.cos(vehicle.yaw);
  return { x: vehicle.x + x * cos + z * sin, z: vehicle.z - x * sin + z * cos };
}

export function getVehicleSeatPose(vehicle, index) {
  const seat = VEHICLE_TYPES[vehicle.type]?.seats[index];
  if (!seat) return null;
  return vehiclePartPose(vehicle,seat.x,seat.height,seat.z);
}
export function vehiclePartPose(vehicle,px,height,pz,out={}){
  const cp = Math.cos(vehicle.bodyPitch ?? 0), sp = Math.sin(vehicle.bodyPitch ?? 0);
  const cr = Math.cos(vehicle.bodyRoll ?? 0), sr = Math.sin(vehicle.bodyRoll ?? 0);
  const x = px * cr - height * sr, y = px * sr + height * cr;
  const localX=x*(vehicle.modelScale?.x??1),localZ=(y*sp+pz*cp)*(vehicle.modelScale?.z??1),s=Math.sin(vehicle.yaw),c=Math.cos(vehicle.yaw);
  out.x=vehicle.x+localX*c+localZ*s;out.z=vehicle.z-localX*s+localZ*c;out.y=(vehicle.y??0)+(y*cp-pz*sp)*(vehicle.modelScale?.y??1);return out;
}

export function canFirePassengerWeapon(vehicle, seatIndex, yaw, pitch) {
  const seat = VEHICLE_TYPES[vehicle.type]?.seats[seatIndex];
  if (seat?.role !== 'passenger') return false;
  if (vehicle.type === 'atv') return true;
  if(vehicle.type==='tank'){const d=vehicleAimDirection(vehicle,yaw,pitch);return seat.x===0?d.z>.25:Math.sign(seat.x)*d.x>.35&&d.z>-.75;}
  // Fire out of the side window on this seat’s side of the cabin.
  const direction = vehicleAimDirection(vehicle, yaw, pitch);
  const slope=.23/.49,denominator=direction.z-slope*direction.y;
  const frontDistance=(-1.34+slope*(seat.height-1.26)-seat.z)/denominator;
  if(frontDistance>0&&direction.z<0){
    const x=seat.x+direction.x*frontDistance,y=seat.height+direction.y*frontDistance;
    if(Math.abs(x)<.942&&Math.abs(x)>.024&&y>1.303&&y<1.707)return true;
  }
  if (direction.x * Math.sign(seat.x) <= 0) return false;
  const windows = HUMVEE_SIDE_WINDOWS;
  const window = seat.z < 0 ? windows.front : windows.rear;
  const distance = (Math.sign(seat.x) * windows.x - seat.x) / direction.x;
  const z = seat.z + direction.z * distance, y = seat.height + direction.y * distance;
  return Math.abs(z - window.z) <= window.width / 2 && Math.abs(y - windows.y) <= windows.height / 2;
}

// The tank has two enclosed crew stations; troop seats and light vehicles do not.
export function isEnclosedTankCrew(vehicle,index){
  return vehicle?.type==='tank'&&(index===0||index===1);
}

// When a tank already has a driver, the gunner seat is always boarded first.
export function preferredVehicleSeat(vehicle,reserved=new Set(),allowDriver=true){
  const free=i=>vehicle.seats[i]===null&&!reserved.has(i);
  if(allowDriver&&free(0))return 0;
  if(vehicle.type==='tank'&&free(1))return 1;
  for(let i=1;i<vehicle.seats.length;i++)if(free(i))return i;
  return -1;
}

export function getVehicleBoardingSeat(player, vehicles) {
  let nearest = Infinity;
  let result = null;
  for (const vehicle of vehicles) {
    if (vehicle.hp <= 0 || (vehicle.team !== player.team && vehicle.seats.some(Boolean))) continue;
    // The campaign extraction transport is reserved for the wounded courier.
    if(vehicle.campaignEvacuation&&player.id!=='courier')continue;
    const distance = Math.hypot(player.x - vehicle.x, player.z - vehicle.z);
    const seat = preferredVehicleSeat(vehicle);
    if (seat >= 0 && distance <= vehicleBoardingRange(vehicle) && distance < nearest && Math.abs(vehicle.speed) <= 3) {
      nearest = distance;
      result = { vehicle, seat };
    }
  }
  return result;
}

export function createVehicle(spawn) {
  const spec = VEHICLE_TYPES[spawn.type];
  return {
    ...spawn, home: spawn, hp: spec.maxHp, maxHp: spec.maxHp,
    speed: 0, steer: 0, seats: spec.seats.map(() => null), respawnIn: 0, wreckTime: 0,
    aimYaw: spawn.yaw, aimPitch: 0, heat: 0, overheated: false, gunCooldown: 0, gunSeq: 0, glassBroken:0,
    ...(spawn.type==='tank'?{wantedYaw:spawn.yaw,wantedPitch:0,gunAimYaw:spawn.yaw,gunAimPitch:0,weapon:0,weaponReadyAt:0,cannonAmmo:24,cannonReadyAt:0,cannonSeq:0,burning:false}:{}),
  };
}
