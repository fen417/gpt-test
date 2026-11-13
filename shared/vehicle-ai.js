import { rayVehicleArmor } from './vehicle-combat.js';
import { TURRET_WEAPON, VEHICLE_TYPES, canFirePassengerWeapon, getVehicleSeatPose, getVehicleDimensions, vehicleBoardingRange } from './vehicles.js';
import { aimBullet } from './ballistics.js';
import { getWeapon, EYE_HEIGHT } from './world.js';

const routeGraphs = new WeakMap();
const BASE_RANGE = 55;
const vehiclePreferences = ['specialist', 'driver', 'crew', null, null, null];
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const yawToward = (a, b) => Math.atan2(a.x - b.x, a.z - b.z);
const angleDifference = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

function clearance(vehicle) {
  const { width, length } = getVehicleDimensions(vehicle);
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

function roadGraph(sim, vehicle) {
  let graphs = routeGraphs.get(sim.map);
  if (!graphs) {
    graphs = new Map();
    routeGraphs.set(sim.map, graphs);
  }
  const key = [vehicle.type, vehicle.modelScale?.x ?? 1, vehicle.modelScale?.z ?? 1].join('/');
  if (graphs.has(key)) return graphs.get(key);

  const routes = sim.map.vehicleRoutes;
  const nodes = new Map(routes.nodes.map(node => [node.id, { ...node, neighbors: [] }]));
  const radius = clearance(vehicle);
  for (const [from, to] of routes.edges) {
    const a = nodes.get(from), b = nodes.get(to);
    if (a && b && roadClear(sim, a, b, radius)) {
      a.neighbors.push(b);
      b.neighbors.push(a);
    }
  }
  const landmarks = (sim.map.landmarks ?? []).flatMap(site => {
    const parking = nodes.get(routes.stops?.[site.name]);
    return parking ? [{ site, parking }] : [];
  });
  const graph = { nodes, radius, objectives: routes.objectives, landmarks };
  graphs.set(key, graph);
  return graph;
}

function planJourney(sim, p, vehicle, avoidNodeId, avoidDestinationId) {
  const { nodes, radius, objectives, landmarks } = roadGraph(sim, vehicle);
  const entries = [...nodes.values()].filter(node => node.id !== avoidNodeId && node.neighbors.length && distance(vehicle, node) < 85)
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
    if(p.ai?.squad?.order?.pointId&&point.id!==p.ai.squad.order.pointId)continue;
    if (point.id === avoidDestinationId) continue;
    const stop = nodes.get(objectives[point.id]);
    if (!stop || !costs.has(stop) || distance(vehicle, stop) < 22) continue;
    let alliedDrivers = 0;
    for (const ally of sim.players.values()) {
      if (ally !== p && ally.alive && ally.team === p.team && ally.vehicleSeat === 0
        && ally.botJourney?.destination === point.id) alliedDrivers++;
    }
    const score = costs.get(stop) + (vehicle.hp<vehicle.maxHp*.45?(point.owner===p.team?-180:250):point.owner === p.team && !point.contested ? 100 : 0)
      + alliedDrivers * 85 - (p.botObjective?.id === point.id ? 50 : 0) + sim.random() * 28;
    if (score < bestScore) {
      bestScore = score;
      destination = point;
    }
  }
  if (!destination) return null;

  let parking = nodes.get(objectives[destination.id]);
  const threat=p.ai?.memory??vehicle.seats.map(id=>sim.players.get(id)?.botCrewTarget).find(Boolean);
  if(threat){
    const alternatives=[...nodes.values()].filter(node=>costs.has(node)&&distance(node,destination)<38&&distance(node,vehicle)>12);
    alternatives.sort((a,b)=>{
      const score=node=>costs.get(node)+distance(node,destination)*2+(sim.lineClear({x:threat.x,y:threat.y+1.2,z:threat.z},{x:node.x,y:sim.groundAt(node.x,node.z)+1,z:node.z})?65:0);
      return score(a)-score(b);
    });
    if(alternatives.length)parking=alternatives[0];
  }
  // A nearby landmark can serve as covered access to the same combat objective.
  if (!threat&&!destination.contested && sim.random() < .32) {
    const directCost = costs.get(parking);
    const sideStop = landmarks
      .filter(({ site, parking: stop }) => {
        const walk = distance(site, destination);
        return distance(vehicle, stop) > 30 && walk < 235 && walk + 32 < distance(vehicle, destination)
          && costs.get(stop) < directCost + 220;
      })
      .sort((a, b) => costs.get(a.parking) - costs.get(b.parking))[0];
    if (sideStop) parking = sideStop.parking;
  }
  const path = [];
  for (let node = parking; node; node = previous.get(node)) path.push(node);
  path.reverse();
  return { destination: destination.id, path, startedAt: sim.time, avoidDestinationId,
    timeLimit: Math.max(48, costs.get(parking) / 9 + 20), blockedAt: null, reversingUntil: 0 };
}

function vehiclePreference(p) {
  // Each side has transport specialists, optional crew, and infantry.
  return vehiclePreferences[Math.floor((p.botSlot ?? 0) / 2) % vehiclePreferences.length];
}

export function shouldSpawnVehicleBotAtBase(sim, p) {
  if (!sim.map.vehicleRoutes || vehiclePreference(p) !== 'specialist') return false;
  let available = 1;
  for (const ally of sim.players.values()) {
    if (ally.bot && ally.alive && ally.team === p.team && !ally.vehicleId
      && distance(ally, sim.map.spawns[p.team]) < BASE_RANGE) available++;
  }
  return sim.vehicles.some(vehicle => {
    if (!canBoard(p, vehicle) || !atBase(sim, vehicle)) return false;
    const needed = departureCrew(vehicle) - vehicle.seats.filter(Boolean).length;
    return needed > 0 && (vehicle.seats[0] ? needed === 1 : available >= needed);
  });
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
  if (!sim.dismountVehicle(p)) return false;
  p.botJourney = null;
  p.botBoarding = null;
  p.botVehicleSince = null;
  p.botDriverSeenAt = null;
  p.botStopSince = null;
  p.botBoardedFrom = null;
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
  return true;
}

function atBase(sim, vehicle) {
  return distance(vehicle, sim.map.spawns[vehicle.team]) < BASE_RANGE;
}

function departureCrew(vehicle) {
  return vehicle.type === 'humvee' ? 3 : 2;
}

function reservationsFor(sim, vehicle, candidate) {
  const seats = new Set();
  for (const ally of sim.players.values()) {
    const booking = ally.botBoarding;
    if (ally !== candidate && ally.alive && ally.team === candidate.team && !ally.vehicleId
      && booking?.vehicleId === vehicle.id && booking.expires > sim.time
      && vehicle.seats[booking.seat] === null) seats.add(booking.seat);
  }
  return seats;
}

function canBoard(p, vehicle) {
  return vehicle.team === p.team && vehicle.hp >= vehicle.maxHp * .22 && Math.abs(vehicle.speed) <= 2.5;
}

function booking(sim, vehicle, seat) {
  return { vehicleId: vehicle.id, seat, path: null, expires: sim.time + 12 };
}

export function honkVehicle(sim,p){
  const vehicle=sim.vehicles.find(v=>v.id===p.vehicleId);
  if(!vehicle||p.vehicleSeat!==0||vehicle.hp<=0||sim.time<(vehicle.nextHornAt??0))return;
  vehicle.nextHornAt=sim.time+1.2;
  sim.event('horn',{playerId:p.id,vehicleId:vehicle.id,x:vehicle.x,y:vehicle.y+1,z:vehicle.z});
  if(p.bot)return;
  const origin=sim.points.find(point=>distance(vehicle,point)<22)?.id??null;
  const reserved=reservationsFor(sim,vehicle,p);
  const candidates=[...sim.players.values()].filter(ally=>ally.bot&&ally.alive&&ally.team===p.team&&!ally.vehicleId&&distance(ally,vehicle)<26&&!ally.pendingGadget)
    .sort((a,b)=>distance(a,vehicle)-distance(b,vehicle));
  for(let seat=1;seat<vehicle.seats.length;seat++){
    const occupant=sim.players.get(vehicle.seats[seat]);
    if(occupant?.bot){occupant.botRideOrder={driverId:p.id,vehicleId:vehicle.id,origin,holdUntil:sim.time+8};continue;}
    if(vehicle.seats[seat]||reserved.has(seat))continue;
    const ally=candidates.shift();if(!ally)break;
    ally.botBoarding=booking(sim,vehicle,seat);ally.botBoarding.expires=sim.time+20;
    ally.botRideOrder={driverId:p.id,vehicleId:vehicle.id,origin,holdUntil:sim.time+8};
    ally.botJob=null;ally.botPath=[];ally.botVehicleRetryAt=0;
  }
}

function findBaseBoardingTarget(sim, p) {
  const base = sim.map.spawns[p.team];
  let available = 0, bots = 0;
  for (const ally of sim.players.values()) {
    if (!ally.bot || ally.team !== p.team) continue;
    bots++;
    if (ally.alive && !ally.vehicleId && (ally.hp >= 70 || sim.time - ally.lastHurt >= 2) && distance(ally, base) < BASE_RANGE &&
      (ally.botBoarding?.expires ?? 0) <= sim.time && sim.time >= (ally.botVehicleRetryAt ?? 0)) available++;
  }
  const infantry = bots >= 8 ? 2 : bots >= 3 ? 1 : 0;
  let candidate = null, candidateScore = Infinity, crew = null, crewScore = Infinity, demand = 0;
  for (const vehicle of sim.vehicles) {
    if (!canBoard(p, vehicle) || !atBase(sim, vehicle)) continue;
    const reserved = reservationsFor(sim, vehicle, p);
    const length = distance(p, vehicle);
    const driver = vehicle.seats[0] || reserved.has(0);
    const needed = departureCrew(vehicle) - vehicle.seats.filter(Boolean).length - reserved.size;
    if (driver && needed > 0) {
      demand += needed;
      const seat = vehicle.seats.findIndex((rider, index) => index > 0 && rider === null && !reserved.has(index));
      const score = length + (vehicle.seats[0] ? 0 : 8) - (seat === 1 && vehicle.type === 'humvee' ? 5 : 0);
      if (seat >= 0 && length < BASE_RANGE && score < crewScore) {
        crew = booking(sim, vehicle, seat);
        crewScore = score;
      }
    } else if (!driver && length < BASE_RANGE && needed > 0) {
      const score = length - (vehicle.type === 'humvee' ? 11 : 0);
      if (available >= needed + infantry && score < candidateScore) {
        candidate = { vehicle, needed };
        candidateScore = score;
      }
    }
  }
  if (crew) return crew;
  if (candidate && available >= candidate.needed + infantry + demand) return booking(sim, candidate.vehicle, 0);
  return null;
}

function findFieldBoardingTarget(sim, p) {
  const preference = vehiclePreference(p);
  if (!preference) return null;
  let choice = null, bestScore = Infinity;
  for (const vehicle of sim.vehicles) {
    if (!canBoard(p, vehicle) || atBase(sim, vehicle)) continue;
    const driver = sim.players.get(vehicle.seats[0]);
    const stop = driver?.botJourney;
    if (stop?.arrivedAt != null && (sim.time - stop.arrivedAt < 1.25 || stop.onward
      || vehiclePreference(driver) !== 'specialist')) continue;
    const length = distance(p, vehicle);
    if (length > (preference === 'specialist' ? 48 : 36)) continue;
    const reserved = reservationsFor(sim, vehicle, p);
    const free = index => vehicle.seats[index] === null && !reserved.has(index);
    const seat = free(0) ? 0
      : vehicle.seats.findIndex((rider, index) => index > 0 && free(index));
    if (seat < 0) continue;
    const score = length + (preference === 'crew' && seat > 0 ? -12 : seat > 0 ? 9 : 0);
    if (score < bestScore) {
      bestScore = score;
      choice = booking(sim, vehicle, seat);
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
  if (distance(p, vehicle) <= vehicleBoardingRange(vehicle) && sim.mountVehicle(p, vehicle, boarding.seat)) {
    p.botBoarding = null;
    p.botVehicleSince = sim.time;
    p.botBoardedFrom = { x: vehicle.x, z: vehicle.z };
    p.botStopSince = null;
    p.botDriverSeenAt = null;
    p.botVehicleReactAt = sim.time + .28;
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
  if(sim.time<(vehicle.pickupUntil??0))return;
  if(sim.time-(vehicle.lastBlastAt??-100)<1.6&&vehicle.hp<vehicle.maxHp*.75){
    if(steeringClear(sim,vehicle,-1,0,dt))p.input.forward=-.75;
    return;
  }
  if(vehicle.hp<vehicle.maxHp*.62&&sim.time-(vehicle.lastHurt??-100)>2){
    const engineer=vehicle.seats.map(id=>sim.players.get(id)).find(ally=>ally?.bot&&ally.classId==='support'&&ally!==p);
    if(engineer&&!(vehicle.repairStopUntil>sim.time)&&sim.time>(vehicle.repairRetryAt??0)){
      vehicle.repairStopUntil=sim.time+7;vehicle.repairRetryAt=sim.time+18;
    }
  }
  if(vehicle.repairStopUntil>sim.time&&sim.time-(vehicle.lastHurt??-100)>1)return;
  const gunner=sim.players.get(vehicle.seats[1]);
  if(vehicle.type==='humvee'&&gunner?.botCrewTarget&&vehicle.hp>vehicle.maxHp*.55&&distance(vehicle,gunner.botCrewTarget)>20&&distance(vehicle,gunner.botCrewTarget)<55){
    if(sim.time>(vehicle.supportRetryAt??0)){vehicle.supportUntil=sim.time+3;vehicle.supportRetryAt=sim.time+10;}
    if(vehicle.supportUntil>sim.time)return;
  }
  if (!p.ai?.squad?.order&&atBase(sim, vehicle) && !vehicle.pickupPlayerId && vehicle.seats.filter(Boolean).length < departureCrew(vehicle)) {
    // Let an understaffed crew fall back to infantry rather than depart shorthanded.
    if ((sim.time - p.botVehicleSince > 15 || vehicle.hp < vehicle.maxHp * .22)
      && Math.abs(vehicle.speed) < 1.3) stopRiding(sim, p);
    return;
  }
  if (!p.botJourney) p.botJourney = planJourney(sim, p, vehicle);
  const journey = p.botJourney;
  if (!journey || vehicle.hp < vehicle.maxHp * .22 || sim.time - journey.startedAt > journey.timeLimit) {
    if (Math.abs(vehicle.speed) < 1.3) stopRiding(sim, p);
    return;
  }
  while (journey.path.length > 1 && distance(vehicle, journey.path[0]) < 3.4) journey.path.shift();
  const next = journey.path[0];
  const remaining = distance(vehicle, next);
  if (journey.path.length === 1 && remaining < 3.6) {
    if (Math.abs(vehicle.speed) >= 1.3) return;
    journey.arrivedAt ??= sim.time;
    const canCollect = !journey.onward && vehicle.hp > vehicle.maxHp * .6 && vehiclePreference(p) === 'specialist';
    if (canCollect && sim.time - journey.arrivedAt < 6.5) return;
    const onward = canCollect && vehicle.seats.slice(1).some(Boolean)
      ? planJourney(sim, p, vehicle, undefined, journey.destination) : null;
    if (onward) p.botJourney = { ...onward, onward: true };
    else if (sim.time - journey.arrivedAt >= 1.25) stopRiding(sim, p, journey.destination);
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
    const alternate = planJourney(sim, p, vehicle, next.id, journey.avoidDestinationId);
    journey.replanned = true;
    if (alternate) {
      p.botJourney = { ...alternate, startedAt: journey.startedAt, replanned: true, onward: journey.onward };
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

function crewSight(sim,origin,to){
  if(!sim.lineClear(origin,to))return false;
  const length=Math.hypot(to.x-origin.x,to.y-origin.y,to.z-origin.z);if(length<.1)return true;
  const direction={x:(to.x-origin.x)/length,y:(to.y-origin.y)/length,z:(to.z-origin.z)/length};
  return !sim.vehicles.some(v=>(v.hp>0||v.wreckTime>0)&&rayVehicleArmor(origin,direction,v,length-.1)<length-.1);
}
function aimCrew(sim,p,vehicle,dt){
  const seat=getVehicleSeatPose(vehicle,p.vehicleSeat),spec=VEHICLE_TYPES[vehicle.type].seats[p.vehicleSeat];
  const gunner=spec.role==='gunner',weapon=gunner?TURRET_WEAPON:getWeapon(p.classId,p.weaponId);
  if(sim.time>=(p.botCrewSenseAt??0)){
    p.botCrewSenseAt=sim.time+.18+(p.botSlot%3)*.01;
    let selected=null,best=sim.botSettings.awareness*(gunner?1.6:1);
    for(const enemy of sim.players.values()){
      if(!enemy.alive||enemy.team===p.team||enemy.invulnerableUntil>sim.time)continue;
      const length=distance(p,enemy);if(length>=best)continue;
      const height=enemy.vehicleId?EYE_HEIGHT-.03:enemy.input.crouch?1.05:1.1;
      const yaw=Math.atan2(-(enemy.x-seat.x),-(enemy.z-seat.z)),pitch=Math.atan2(enemy.y+height-seat.y,length);
      if(Math.abs(angleDifference(yaw,p.yaw))>1.8||!gunner&&!canFirePassengerWeapon(vehicle,p.vehicleSeat,yaw,pitch)||!crewSight(sim,seat,{x:enemy.x,y:enemy.y+height,z:enemy.z}))continue;
      const old=p.botCrewTarget,elapsed=old?.id===enemy.id?sim.time-old.at:0;
      selected={id:enemy.id,x:enemy.x,y:enemy.y,z:enemy.z,height,at:sim.time,
        velocityX:elapsed>.03?clamp((enemy.x-old.x)/elapsed,-12,12)*.7+(old.velocityX??0)*.3:0,
        velocityZ:elapsed>.03?clamp((enemy.z-old.z)/elapsed,-12,12)*.7+(old.velocityZ??0)*.3:0};best=length;
    }
    if(!selected)for(const item of sim.deployables){
      if(item.kind!=='beacon'||item.team===p.team||item.hp<=0||distance(p,item)>best||!crewSight(sim,seat,{x:item.x,y:item.y+.4,z:item.z}))continue;
      const yaw=Math.atan2(-(item.x-seat.x),-(item.z-seat.z)),pitch=Math.atan2(item.y+.4-seat.y,distance(seat,item));
      if(Math.abs(angleDifference(yaw,p.yaw))>1.2||!gunner&&!canFirePassengerWeapon(vehicle,p.vehicleSeat,yaw,pitch))continue;
      selected={...item,height:.4,at:sim.time,velocityX:0,velocityZ:0};best=distance(p,item);
    }
    if(selected?.id!==p.botCrewTarget?.id)p.botVehicleReactAt=sim.time+sim.botSettings.reaction;
    p.botCrewTarget=selected;
  }
  const target=p.botCrewTarget,solution=target?aimBullet(seat,target,target.height,weapon.projectileSpeed):null;
  const phase=sim.time*1.6+p.botSlot*.75,error=sim.botSettings.aimError;
  const resting=!gunner&&vehicle.type==='humvee'?vehicle.yaw-Math.sign(spec.x)*Math.PI/2:vehicle.yaw;
  const wantedYaw=solution?solution.yaw+Math.sin(phase)*error:resting+Math.sin(phase*.45)*(gunner?1.4:.25),wantedPitch=solution?.pitch??-.03;
  const turn=sim.botSettings.turnSpeed*dt;
  p.input.yaw=p.yaw+clamp(angleDifference(wantedYaw,p.yaw),-turn,turn);
  p.input.pitch=p.pitch+clamp(wantedPitch-p.pitch,-turn,turn);
  const heatLimit=target&&distance(p,target)<15?.94:.77;
  p.input.fire=Boolean(target)&&sim.time>=(p.botVehicleReactAt??Infinity)&&Math.abs(angleDifference(wantedYaw,p.input.yaw))<.08&&Math.abs(wantedPitch-p.input.pitch)<.08
    &&(gunner?vehicle.heat<heatLimit:(phase%1.25)<.55)&& (gunner||canFirePassengerWeapon(vehicle,p.vehicleSeat,p.input.yaw,p.input.pitch));
  if(!gunner){p.input.aim=Boolean(target);p.input.reload=p.ammo===0||p.ammo<5&&!target;}
}

function nearbyInterest(sim, vehicle) {
  if(!sim.map.vehicleRoutes)return sim.points.find(point=>distance(vehicle,point)<22)?.id??null;
  const { nodes, objectives, landmarks } = roadGraph(sim, vehicle);
  const near = (point, parking) => distance(vehicle, point) < 22 || (parking && distance(vehicle, parking) < 10);
  const point = sim.points.find(p => near(p, nodes.get(objectives[p.id])));
  if (point) return point.id;
  const landmark = landmarks.find(({ site, parking }) => near(site, parking));
  if (landmark) return sim.points.reduce((best, point) =>
    distance(point, landmark.site) < distance(best, landmark.site) ? point : best, sim.points[0])?.id;
  return null;
}

function ride(sim, p, vehicle, dt) {
  const driver = sim.players.get(vehicle.seats[0]);
  const order=p.botRideOrder;
  if(order?.vehicleId===vehicle.id){
    if(driver?.id===order.driverId){
      const arrived=sim.points.find(point=>point.id!==order.origin&&distance(vehicle,point)<20);
      if(arrived&&sim.time>order.holdUntil&&Math.abs(vehicle.speed)<1.3){p.botRideOrder=null;stopRiding(sim,p,arrived.id);return;}
      aimCrew(sim,p,vehicle,dt);return;
    }
    if(!driver&&Math.abs(vehicle.speed)<1.3){
      const near=sim.points.some(point=>distance(vehicle,point)<22);
      if(near){p.botRideOrder=null;stopRiding(sim,p);return;}
      vehicle.seats[p.vehicleSeat]=null;vehicle.seats[0]=p.id;p.vehicleSeat=0;
      p.botJourney=null;p.botRideOrder=null;
      vehicle.pickupUntil=sim.time+3;vehicle.pickupPlayerId=order.driverId;
      return;
    }
    if(driver?.bot){p.botRideOrder=null;p.botBoardedFrom={x:vehicle.x,z:vehicle.z};}
    else {p.botRideOrder=null;stopRiding(sim,p);return;}
  }
  if(p.classId==='support'&&vehicle.repairStopUntil>sim.time&&Math.abs(vehicle.speed)<1.3){stopRiding(sim,p);return;}
  const emptySince = driver?.alive ? sim.time : (p.botDriverSeenAt ?? p.botVehicleSince);
  p.botDriverSeenAt = emptySince;
  p.botBoardedFrom ??= { x: vehicle.x, z: vehicle.z };
  if (Math.abs(vehicle.speed) < 1.3) {
    if(!driver&&sim.time-emptySince>1.5&&p.hp>40&&vehicle.hp>vehicle.maxHp*.3){
      vehicle.seats[p.vehicleSeat]=null;vehicle.seats[0]=p.id;p.vehicleSeat=0;
      p.botJourney=null;vehicle.pickupUntil=sim.time+1.5;return;
    }
    p.botStopSince ??= sim.time;
    const destination = driver?.botJourney;
    if (destination?.arrivedAt != null && p.botVehicleSince <= destination.arrivedAt
      && sim.time - destination.arrivedAt >= .4 && stopRiding(sim, p, destination.destination)) return;
    if (!destination && sim.time - p.botStopSince > 1 && distance(vehicle, p.botBoardedFrom) > 28 && !atBase(sim, vehicle)) {
      const interest = nearbyInterest(sim, vehicle);
      if (interest && stopRiding(sim, p, interest)) return;
    }
    if ((vehicle.hp < vehicle.maxHp * .22 || sim.time - emptySince > 4.5 || sim.time - p.botVehicleSince > 78)
      && stopRiding(sim, p)) return;
  } else p.botStopSince = null;
  aimCrew(sim, p, vehicle, dt);
}

export function thinkVehicleBot(sim, p, dt) {
  if (!sim.vehicles?.length) return false;
  const vehicle = p.vehicleId == null ? null : sim.vehicles.find(v => v.id === p.vehicleId);
  if (vehicle) {
    resetControls(p);
    const order=p.ai?.squad?.order;
    const orderedPoint=order?.pointId?sim.points.find(point=>point.id===order.pointId):null;
    if(order&&((p.vehicleSeat===0&&order.kind==='follow')||(orderedPoint&&distance(vehicle,orderedPoint)<22)||
      (p.vehicleSeat!==0&&vehicle.seats[0]!==order.playerId))){
      if(Math.abs(vehicle.speed)<1.3){stopRiding(sim,p,order.pointId);return true;}
      if(p.vehicleSeat===0&&order.kind==='follow')return true;
    }
    p.botVehicleSince ??= sim.time;
    if (p.vehicleSeat === 0){
      if(sim.map.vehicleRoutes)drive(sim, p, vehicle, dt);
      else if(sim.time>=(vehicle.pickupUntil??0)){
        const goal=orderedPoint??[...sim.points].sort((a,b)=>distance(vehicle,a)+(a.owner===p.team?100:0)-distance(vehicle,b)-(b.owner===p.team?100:0))[0];
        if(goal){
          if(distance(vehicle,goal)<18&&Math.abs(vehicle.speed)<1.3)stopRiding(sim,p,goal.id);
          else {const error=angleDifference(yawToward(vehicle,goal),vehicle.yaw),steer=clamp(-error*1.6,-1,1);
            if(steeringClear(sim,vehicle,1,steer,dt)){p.input.forward=.45;p.input.strafe=steer;}}
        }
      }
    }
    else ride(sim, p, vehicle, dt);
    return true;
  }

  if (p.botVehicleSince != null) {
    p.botVehicleSince = null;
    p.botDriverSeenAt = null;
    p.botStopSince = null;
    p.botBoardedFrom = null;
    p.botJourney = null;
    p.botVehicleRetryAt = sim.time + 12;
  }
  if (p.hp < 70 && sim.time - p.lastHurt < 2) {
    p.botBoarding = null;
    return false;
  }
  if (p.botBoarding) return approachVehicle(sim, p, dt);
  if (sim.time < (p.botVehicleRetryAt ?? 0)) return false;
  const atFriendlyBase = distance(p, sim.map.spawns[p.team]) < BASE_RANGE;
  if (atFriendlyBase) {
    p.botBoarding = findBaseBoardingTarget(sim, p);
  } else if (vehiclePreference(p)) {
    p.botBoarding = findFieldBoardingTarget(sim, p);
    p.botVehicleRetryAt = sim.time + 5 + sim.random() * 6;
  }
  return p.botBoarding ? approachVehicle(sim, p, dt) : false;
}
