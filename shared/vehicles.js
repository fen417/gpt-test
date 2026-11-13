import { affineBox, multiplyMatrix, rotationMatrix, transformVector } from './geometry.js';

const driver = { name: 'Водитель', role: 'driver' };
const passenger = { name: 'Пассажир', role: 'passenger' };

export const VEHICLE_TYPES = {
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
export function vehicleBoardingRange(vehicle) {
  return VEHICLE_BOARD_RANGE * Math.max(1, vehicle.modelScale?.x ?? 1, vehicle.modelScale?.z ?? 1);
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
  const spec=VEHICLE_TYPES[vehicle.type],s=vehicle.modelScale??{x:1,y:1,z:1};
  const matrix=multiplyMatrix(rotationMatrix({y:vehicle.yaw??0}),
    multiplyMatrix([s.x,0,0,0,s.y,0,0,0,s.z],rotationMatrix({x:vehicle.bodyPitch??0,z:vehicle.bodyRoll??0})));
  const offset=transformVector(matrix,{x:0,y:spec.height/2,z:0});
  return affineBox({x:vehicle.x+offset.x,y:(vehicle.y??0)+offset.y,z:vehicle.z+offset.z},
    [spec.width/2,spec.height/2,spec.length/2],matrix);
}

export function vehicleAimDirection(vehicle, yaw, pitch) {
  const scale = vehicle.modelScale ?? { x: 1, y: 1, z: 1 };
  const dx = -Math.sin(yaw) * Math.cos(pitch), dy = Math.sin(pitch), dz = -Math.cos(yaw) * Math.cos(pitch);
  const s = Math.sin(vehicle.yaw), c = Math.cos(vehicle.yaw);
  const x = (dx * c - dz * s) / scale.x, y = dy / scale.y, z = (dx * s + dz * c) / scale.z;
  const cp = Math.cos(vehicle.bodyPitch ?? 0), sp = Math.sin(vehicle.bodyPitch ?? 0);
  const cr = Math.cos(vehicle.bodyRoll ?? 0), sr = Math.sin(vehicle.bodyRoll ?? 0);
  const py = y * cp + z * sp, pz = -y * sp + z * cp;
  return { x: x * cr + py * sr, y: -x * sr + py * cr, z: pz };
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
  const cp = Math.cos(vehicle.bodyPitch ?? 0), sp = Math.sin(vehicle.bodyPitch ?? 0);
  const cr = Math.cos(vehicle.bodyRoll ?? 0), sr = Math.sin(vehicle.bodyRoll ?? 0);
  const x = seat.x * cr - seat.height * sr, y = seat.x * sr + seat.height * cr;
  return { ...vehicleLocalPoint(vehicle, x * (vehicle.modelScale?.x ?? 1), (y * sp + seat.z * cp) * (vehicle.modelScale?.z ?? 1)),
    y: (vehicle.y ?? 0) + (y * cp - seat.z * sp) * (vehicle.modelScale?.y ?? 1) };
}

export function canFirePassengerWeapon(vehicle, seatIndex, yaw, pitch) {
  const seat = VEHICLE_TYPES[vehicle.type]?.seats[seatIndex];
  if (seat?.role !== 'passenger') return false;
  if (vehicle.type === 'atv') return true;
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

export function getVehicleBoardingSeat(player, vehicles) {
  let nearest = Infinity;
  let result = null;
  for (const vehicle of vehicles) {
    if (vehicle.hp <= 0 || (vehicle.team !== player.team && vehicle.seats.some(Boolean))) continue;
    const distance = Math.hypot(player.x - vehicle.x, player.z - vehicle.z);
    const seat = vehicle.seats.indexOf(null);
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
  };
}
