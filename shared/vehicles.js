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
export const TURRET_MIN_PITCH = -.25;
export const TURRET_MAX_PITCH = .85;
export const TURRET_WEAPON = {
  weapon: 'ПУЛЕМЁТ ХАМВИ', range: 220, damage: 38, interval: .096, spread: .018,
  minPitch: TURRET_MIN_PITCH, maxPitch: TURRET_MAX_PITCH,
};

export function vehicleLocalPoint(vehicle, x, z) {
  const sin = Math.sin(vehicle.yaw), cos = Math.cos(vehicle.yaw);
  return { x: vehicle.x + x * cos + z * sin, z: vehicle.z - x * sin + z * cos };
}

export function getVehicleSeatPose(vehicle, index) {
  const seat = VEHICLE_TYPES[vehicle.type]?.seats[index];
  return seat && { ...vehicleLocalPoint(vehicle, seat.x, seat.z), y: (vehicle.y ?? 0) + seat.height };
}

export function canFirePassengerWeapon(vehicle, seatIndex, yaw, pitch) {
  const seat = VEHICLE_TYPES[vehicle.type]?.seats[seatIndex];
  if (seat?.role !== 'passenger') return false;
  if (vehicle.type === 'atv') return true;
  // Fire out of the side window on this seat’s side of the cabin.
  const angle = yaw - vehicle.yaw;
  const outward = -Math.sin(angle) * Math.sign(seat.x);
  if (outward <= 0) return false;
  const windows = HUMVEE_SIDE_WINDOWS;
  const window = seat.z < 0 ? windows.front : windows.rear;
  const distance = (windows.x - Math.abs(seat.x)) / outward;
  const z = seat.z - Math.cos(angle) * distance;
  const y = seat.height + Math.tan(pitch) * distance;
  return Math.abs(z - window.z) <= window.width / 2 && Math.abs(y - windows.y) <= windows.height / 2;
}

export function getVehicleBoardingSeat(player, vehicles) {
  let nearest = VEHICLE_BOARD_RANGE;
  let result = null;
  for (const vehicle of vehicles) {
    if (vehicle.hp <= 0 || (vehicle.team !== player.team && vehicle.seats.some(Boolean))) continue;
    const distance = Math.hypot(player.x - vehicle.x, player.z - vehicle.z);
    const seat = vehicle.seats.indexOf(null);
    if (seat >= 0 && distance <= nearest && Math.abs(vehicle.speed) <= 3) {
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
    aimYaw: spawn.yaw, aimPitch: 0, heat: 0, overheated: false, gunCooldown: 0, gunSeq: 0,
  };
}
