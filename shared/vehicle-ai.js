import { VEHICLE_BOARD_RANGE, VEHICLE_TYPES, getVehicleSeatPose } from './vehicles.js';

const routeGraphs = new WeakMap();
const vehiclePreferences = ['specialist', 'driver', 'crew', null, null, null];
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const yawToward = (a, b) => Math.atan2(a.x - b.x, a.z - b.z);
const angleDifference = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

function clearance(type) {
  const { width, length } = VEHICLE_TYPES[type];
  return Math.hypot(width, length) / 2 + .35;
}

function roadClear(sim, a, b, radius) {
  const steps = Math.max(1, Math.ceil(distance(a, b) / 1.2));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (sim.collides(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, undefined, radius)) return false;
  }
  return true;
}

function roadGraph(sim, type) {
  let graphs = routeGraphs.get(sim.map);
  if (!graphs) {
    graphs = new Map();
    routeGraphs.set(sim.map, graphs);
  }
  if (graphs.has(type)) return graphs.get(type);

  const routes = sim.map.vehicleRoutes;
  const nodes = new Map(routes.nodes.map(node => [node.id, { ...node, neighbors: [] }]));
  const radius = clearance(type);
  for (const [from, to] of routes.edges) {
    const a = nodes.get(from), b = nodes.get(to);
    if (a && b && roadClear(sim, a, b, radius)) {
      a.neighbors.push(b);
      b.neighbors.push(a);
    }
  }
  const graph = { nodes, radius, objectives: routes.objectives };
  graphs.set(type, graph);
  return graph;
}

function planJourney(sim, p, vehicle, avoidNodeId) {
  const { nodes, radius, objectives } = roadGraph(sim, vehicle.type);
  const entries = [...nodes.values()].filter(node => node.id !== avoidNodeId && node.neighbors.length && distance(vehicle, node) < 48)
    .sort((a, b) => distance(vehicle, a) - distance(vehicle, b))
    .filter(node => roadClear(sim, vehicle, node, radius)).slice(0, 4);
  if (!entries.length) return null;

  const costs = new Map(), previous = new Map(), pending = new Set();
  for (const entry of entries) {
    const length = distance(vehicle, entry);
    const turn = length > 3 ? Math.abs(angleDifference(yawToward(vehicle, entry), vehicle.yaw)) : 0;
    costs.set(entry, length + turn * 6);
    pending.add(entry);
  }
  while (pending.size) {
    let current = null;
    for (const candidate of pending) {
      if (!current || costs.get(candidate) < costs.get(current)) current = candidate;
    }
    pending.delete(current);
    for (const neighbor of current.neighbors) {
      if (neighbor.id === avoidNodeId) continue;
      const nextCost = costs.get(current) + distance(current, neighbor);
      if (nextCost >= (costs.get(neighbor) ?? Infinity)) continue;
      costs.set(neighbor, nextCost);
      previous.set(neighbor, current);
      pending.add(neighbor);
    }
  }

  let destination = null, bestScore = Infinity;
  for (const point of sim.points) {
    const stop = nodes.get(objectives[point.id]);
    if (!stop || !costs.has(stop) || distance(vehicle, stop) < 22) continue;
    let alliedDrivers = 0;
    for (const ally of sim.players.values()) {
      if (ally !== p && ally.alive && ally.team === p.team && ally.vehicleSeat === 0
        && ally.botJourney?.destination === point.id) alliedDrivers++;
    }
    const score = costs.get(stop) + (point.owner === p.team && !point.contested ? 100 : 0)
      + alliedDrivers * 85 + sim.random() * 28;
    if (score < bestScore) {
      bestScore = score;
      destination = point;
    }
  }
  if (!destination) return null;

  const path = [];
  for (let node = nodes.get(objectives[destination.id]); node; node = previous.get(node)) path.push(node);
  path.reverse();
  return { destination: destination.id, path, startedAt: sim.time, blockedAt: null, reversingUntil: 0, trips: 1 };
}

function vehiclePreference(p) {
  // Each side has transport specialists, optional crew, and infantry.
  return vehiclePreferences[Math.floor((p.botSlot ?? 0) / 2) % vehiclePreferences.length];
}

export function shouldSpawnVehicleBotAtBase(sim, p) {
  return Boolean(sim.map.vehicleRoutes && vehiclePreference(p) === 'specialist'
    && sim.vehicles?.some(v => v.team === p.team && v.hp >= v.maxHp * .22 && v.seats[0] === null
      && distance(v, sim.map.spawns[p.team]) < 45));
}

function resetControls(p) {
  const input = p.input;
  input.forward = 0;
  input.strafe = 0;
  input.sprint = false;
  input.crouch = false;
  input.jump = false;
  input.fire = false;
  input.aim = false;
  input.reload = false;
  input.gadget = false;
  input.grenade = false;
  input.yaw = p.yaw;
  input.pitch = p.pitch;
}

function stopRiding(sim, p, destinationId) {
  if (!sim.dismountVehicle(p)) return;
  p.botJourney = null;
  p.botBoarding = null;
  p.botVehicleSince = null;
  p.botDriverSeenAt = null;
  p.botVehicleRetryAt = sim.time + 18 + sim.random() * 20;
  p.botPath = [];
  p.botGoal = null;
  p.botProbeAt = 0;
  p.nextThink = 0;
  const destination = sim.points.find(point => point.id === destinationId);
  if (destination && sim.botPathBudget > 0) {
    sim.botPathBudget--;
    p.botObjective = destination;
    p.botGoal = sim.pickObjectiveSpot(p, destination);
    p.botPath = sim.pathfind(p, p.botGoal);
    p.nextThink = 4;
  }
}

function findBoardingTarget(sim, p) {
  const preference = vehiclePreference(p);
  const specialist = preference === 'specialist';
  if (!specialist && sim.time > 5 && sim.random() > .72) return null;
  let choice = null, bestScore = Infinity;
  for (const vehicle of sim.vehicles) {
    if (vehicle.team !== p.team || vehicle.hp < vehicle.maxHp * .22 || Math.abs(vehicle.speed) > 2.5) continue;
    const length = distance(p, vehicle);
    if (length > (specialist ? 48 : 36)) continue;
    const reserved = new Set();
    for (const ally of sim.players.values()) {
      if (ally !== p && ally.alive && ally.botBoarding?.vehicleId === vehicle.id) reserved.add(ally.botBoarding.seat);
    }
    const available = index => vehicle.seats[index] === null && !reserved.has(index);
    let seat = -1, penalty = 0;
    if (available(0)) seat = 0;
    else if (vehicle.type === 'humvee' && available(1)) {
      seat = 1;
      penalty = preference === 'crew' ? -12 : 14;
    } else if (preference === 'crew' && vehicle.seats.slice(1).every(rider => rider === null)) {
      seat = vehicle.seats.findIndex((rider, index) => index > 0 && available(index));
      penalty = 18;
    }
    if (seat < 0) continue;
    const score = length + penalty;
    if (score < bestScore) {
      bestScore = score;
      choice = { vehicleId: vehicle.id, seat, path: null, expires: sim.time + (specialist ? 12 : 9) };
    }
  }
  return choice;
}

function approachVehicle(sim, p, dt) {
  const boarding = p.botBoarding;
  const vehicle = sim.vehicles.find(v => v.id === boarding.vehicleId);
  if (!vehicle || vehicle.hp <= 0 || vehicle.team !== p.team || vehicle.seats[boarding.seat] !== null
    || sim.time >= boarding.expires || distance(p, vehicle) > 52 || Math.abs(vehicle.speed) > 4) {
    p.botBoarding = null;
    return false;
  }
  if (distance(p, vehicle) <= VEHICLE_BOARD_RANGE && sim.mountVehicle(p, vehicle, boarding.seat)) {
    p.botBoarding = null;
    p.botVehicleSince = sim.time;
    p.botDriverSeenAt = null;
    resetControls(p);
    return true;
  }

  if (!boarding.path || sim.time >= boarding.replanAt) {
    if (sim.botPathBudget <= 0) return false;
    sim.botPathBudget--;
    boarding.path = sim.pathfind(p, vehicle);
    boarding.replanAt = sim.time + 1.2;
  }
  while (boarding.path.length && distance(p, boarding.path[0]) < 1.35) boarding.path.shift();
  const next = boarding.path[0] || vehicle;
  resetControls(p);
  const wantedYaw = yawToward(p, next);
  const turn = sim.botSettings.turnSpeed * dt;
  p.input.yaw += clamp(angleDifference(wantedYaw, p.yaw), -turn, turn);
  const facing = Math.abs(angleDifference(wantedYaw, p.input.yaw));
  p.input.forward = facing < .55 ? 1 : facing < 1.05 ? .4 : 0;
  p.input.sprint = facing < .3 && distance(p, vehicle) > 9;
  return true;
}

function steeringClear(sim, vehicle, throttle, steer, dt) {
  const type = VEHICLE_TYPES[vehicle.type];
  const speed = Math.abs(vehicle.speed);
  const travel = .65 + speed * .24 + speed ** 2 / 32;
  const direction = Math.sign(throttle);
  const steeringTime = Math.max(dt, Math.min(.38, travel / Math.max(4, speed)));
  const yaw = vehicle.yaw - steer * type.turnRate * steeringTime * direction;
  for (const t of [.35, .7, 1]) {
    const heading = vehicle.yaw + (yaw - vehicle.yaw) * t;
    const mid = (vehicle.yaw + heading) / 2;
    const x = vehicle.x - Math.sin(mid) * travel * t * direction;
    const z = vehicle.z - Math.cos(mid) * travel * t * direction;
    if (sim.vehicleCollides(vehicle, x, z, heading)) return false;
  }
  return true;
}

function drive(sim, p, vehicle, dt) {
  p.input.yaw = vehicle.yaw;
  p.input.pitch = 0;
  if (sim.time - p.botVehicleSince < 2.6 && [...sim.players.values()].some(ally =>
    ally.alive && ally.botBoarding?.vehicleId === vehicle.id && ally.botBoarding.seat > 0)) return;
  if (!p.botJourney) p.botJourney = planJourney(sim, p, vehicle);
  const journey = p.botJourney;
  if (!journey || vehicle.hp < vehicle.maxHp * .22 || sim.time - journey.startedAt > 48) {
    if (Math.abs(vehicle.speed) < 1.3) stopRiding(sim, p);
    return;
  }
  while (journey.path.length > 1 && distance(vehicle, journey.path[0]) < 3.4) journey.path.shift();
  const next = journey.path[0];
  const remaining = distance(vehicle, next);
  if (journey.path.length === 1 && remaining < 3.6) {
    if (Math.abs(vehicle.speed) >= 1.3) return;
    const patrol = journey.trips === 1 && vehicle.hp > vehicle.maxHp * .6 && vehiclePreference(p) === 'specialist';
    const onward = patrol ? planJourney(sim, p, vehicle) : null;
    if (onward) p.botJourney = { ...onward, trips: journey.trips + 1 };
    else stopRiding(sim, p, journey.destination);
    return;
  }

  const error = angleDifference(yawToward(vehicle, next), vehicle.yaw);
  const speed = Math.abs(vehicle.speed);
  if (next !== journey.lastNode || remaining < journey.bestRemaining - .55) {
    journey.lastNode = next;
    journey.bestRemaining = remaining;
    journey.lastProgressAt = sim.time;
  }
  const stalledFor = sim.time - Math.min(journey.lastProgressAt, journey.blockedAt ?? Infinity);
  if (stalledFor > 4 && speed < 1.3 && !journey.replanned) {
    const alternate = planJourney(sim, p, vehicle, next.id);
    journey.replanned = true;
    if (alternate) {
      p.botJourney = { ...alternate, startedAt: journey.startedAt, replanned: true, trips: journey.trips };
      return;
    }
  }
  if (stalledFor > 7) {
    if (speed < 1.3) stopRiding(sim, p);
    return;
  }
  if (journey.blockedAt !== null && sim.time - journey.blockedAt > 1.2 && speed < .8
    && sim.time >= journey.reversingUntil && sim.time >= (journey.nextReverseAt ?? 0)) {
    journey.reversingUntil = sim.time + 1.25;
    journey.nextReverseAt = sim.time + 2.4;
  }
  const reverse = sim.time < journey.reversingUntil || (Math.abs(error) > 1.8 && vehicle.speed < .9);
  const steer = clamp(-error * 1.8 * (reverse ? -1 : 1), -1, 1);
  const wantedSpeed = reverse ? 2.6 : Math.abs(error) > .65 ? 4
    : Math.min(VEHICLE_TYPES[vehicle.type].maxSpeed * .78, 3 + remaining * .46);
  if (!steeringClear(sim, vehicle, reverse ? -1 : 1, steer, dt)) {
    journey.blockedAt ??= sim.time;
    return;
  }
  if (!reverse && vehicle.speed > 1.2) journey.blockedAt = null;
  p.input.forward = speed > wantedSpeed ? 0 : reverse ? -.53 : Math.abs(error) > .65 ? .55 : 1;
  p.input.strafe = steer;
}

function aimTurret(sim, p, vehicle, dt) {
  const seat = getVehicleSeatPose(vehicle, 1);
  let target = null, best = sim.botSettings.awareness * 1.35;
  for (const enemy of sim.players.values()) {
    if (!enemy.alive || enemy.team === p.team || sim.time < enemy.invulnerableUntil) continue;
    const length = distance(seat, enemy);
    if (length >= best) continue;
    const aim = { x: enemy.x, y: enemy.y + (enemy.input.crouch ? .72 : 1.08), z: enemy.z };
    if (!sim.lineClear(seat, aim)) continue;
    target = aim;
    best = length;
  }
  if (!target) p.botVehicleReactAt = sim.time + .32;
  const phase = sim.time * 1.6 + (p.botSlot ?? 0) * .75;
  const error = sim.botSettings.aimError;
  const wantedYaw = target ? yawToward(seat, target) + Math.sin(phase) * error : vehicle.yaw + Math.sin(phase * .45) * 1.45;
  const wantedPitch = target ? Math.atan2(target.y - seat.y, best) : -.03;
  const turn = sim.botSettings.turnSpeed * dt;
  p.input.yaw += clamp(angleDifference(wantedYaw, p.yaw), -turn, turn);
  p.input.pitch += clamp(wantedPitch - p.pitch, -turn, turn);
  p.input.fire = Boolean(target) && sim.time >= (p.botVehicleReactAt ?? 0)
    && (phase % 3.2) < 2.05 && Math.abs(angleDifference(wantedYaw, p.input.yaw)) < .12;
}

export function thinkVehicleBot(sim, p, dt) {
  if (!sim.map.vehicleRoutes || !sim.vehicles?.length) return false;
  const vehicle = p.vehicleId == null ? null : sim.vehicles.find(v => v.id === p.vehicleId);
  if (vehicle) {
    resetControls(p);
    p.botVehicleSince ??= sim.time;
    if (p.vehicleSeat === 0) drive(sim, p, vehicle, dt);
    else {
      const driver = sim.players.get(vehicle.seats[0]);
      const emptySince = driver?.alive ? sim.time : (p.botDriverSeenAt ?? p.botVehicleSince);
      p.botDriverSeenAt = emptySince;
      if (Math.abs(vehicle.speed) < 1.3 && (vehicle.hp < vehicle.maxHp * .22 || sim.time - emptySince > 3.5
        || sim.time - p.botVehicleSince > 55)) stopRiding(sim, p);
      else if (vehicle.type === 'humvee' && p.vehicleSeat === 1) aimTurret(sim, p, vehicle, dt);
      else p.input.yaw = vehicle.yaw;
    }
    return true;
  }

  if (p.botVehicleSince != null) {
    p.botVehicleSince = null;
    p.botDriverSeenAt = null;
    p.botJourney = null;
    p.botVehicleRetryAt = sim.time + 12;
  }
  if (!vehiclePreference(p)) return false;
  if (p.hp < 70 && sim.time - p.lastHurt < 2) {
    p.botBoarding = null;
    return false;
  }
  if (!p.botBoarding && sim.time >= (p.botVehicleRetryAt ?? 0)) {
    p.botBoarding = findBoardingTarget(sim, p);
    p.botVehicleRetryAt = sim.time + 7 + sim.random() * 6;
  }
  return p.botBoarding ? approachVehicle(sim, p, dt) : false;
}
