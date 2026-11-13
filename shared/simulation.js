import { getMap, CLASSES, CLASS_WEAPONS, DIFFICULTIES, PLAYER_RADIUS, EYE_HEIGHT, CAPTURE_RADIUS, defaultWeaponId, getWeapon } from './world.js';

import { canFirePassengerWeapon, createVehicle, getVehicleBoardingSeat, getVehicleSeatPose, getVehicleDimensions, vehicleBoardingRange, vehicleBodyTilt, vehicleShape, TURRET_WEAPON, VEHICLE_TYPES, vehicleLocalPoint } from './vehicles.js';
import { shouldSpawnVehicleBotAtBase, thinkVehicleBot, honkVehicle } from './vehicle-ai.js';
import { rayVehicleArmor, rayVehicleGlass, rayVehicleCrew } from './vehicle-combat.js';
import { thinkInfantryBot, updateBotTeams, rememberBotDamage, suppressBot, botSpawnPoint, botDebugSnapshot } from './bot-ai.js';
import { findBotPath, prepareNavigation, beginNavigationTick } from './bot-navigation.js';
import { CAPTURE_RATE, canSpawnAtPoint, getPrimaryWeapon, getSidearm, WEAPON_SWITCH_TIME, CROUCH_EYE_HEIGHT } from './world.js';
import { aimBullet, bulletHeight, zeroedBulletPitch } from './ballistics.js';
import { slideVelocity } from './movement.js';
import { boxBounds, overlapsAffine, uprightBox } from './geometry.js';
import { getAssetColliders, rayCollider as rayBox, overlapsCollider, colliderNormal, expandCollider } from './asset-colliders.js';
import { activateGadget, selectGadget, updateEquipment, thinkEquipment, damageDeployable, deployableBounds, liveBeacons, supportHeight, blast, placingSupply, selectedGadget, isSupplyGadget, gadgetCooldown } from './gadgets.js';

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
const dist = (a,b) => Math.hypot(a.x-b.x,a.z-b.z);
const names = ['Ворон','Север','Волк','Туман','Барс','Кедр','Скат','Риф','Шторм','Каскад','Искра','Дозор','Сокол','Беркут','Гранит'];
const classKeys = Object.keys(CLASSES);
const validClass = value => typeof value==='string' && Object.hasOwn(CLASSES,value);
const angleDifference=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));

const crouching = player => !player.vehicleId && Boolean(player.crouching || player.slideTime > 0 || player.input.crouch);
const rayDir = { x: 0, y: 0, z: 0 };



export function sanitizeSpawnPoint(map,pointId) {
  // Beacon ownership, expiry, safety and available floor space are checked by respawn.
  return typeof pointId==='string'&&(map.points.some(point=>point.id===pointId)||/^beacon:\d{1,12}$/.test(pointId))?pointId:undefined;
}
export function sanitizeInput(input = {}) {
  if(!input||typeof input!=='object')input={};
  return {
    forward: clamp(finite(input.forward), -1, 1), strafe: clamp(finite(input.strafe), -1, 1),
    yaw: finite(input.yaw) % (Math.PI * 2), pitch: clamp(finite(input.pitch), -1.45, 1.45),
    sprint:input.sprint===true,crouch:input.crouch===true,jump:input.jump===true,
    fire:input.fire===true,aim:input.aim===true,reload:input.reload===true,
    gadget:input.gadget===true,secondaryGadget:input.secondaryGadget===true,grenade:input.grenade===true,weaponSlot:input.weaponSlot===1||input.weaponSlot===2?input.weaponSlot:0,
    toolSlot:input.toolSlot===1||input.toolSlot===2?input.toolSlot:0,
    interact:input.interact===true,switchSeat:input.switchSeat===true,horn:input.horn===true,
    orderAttack:input.orderAttack===true,orderDefend:input.orderDefend===true,orderFollow:input.orderFollow===true,
  };
}

function rotatedFloor(box,x,z,min,max,radius){
  if(box.parts){
    if(x<box.minX-radius||x>box.maxX+radius||z<box.minZ-radius||z>box.maxZ+radius||box.minY>max||box.h<min)return -Infinity;
    let top=-Infinity;
    for(const part of box.parts)top=Math.max(top,rotatedFloor(part,x,z,min,max,radius));
    return top;
  }
  if(x<box.minX-radius||x>box.maxX+radius||z<box.minZ-radius||z>box.maxZ+radius)return -Infinity;
  let top=-Infinity;
  for(const dx of [-radius,0,radius])for(const dz of [-radius,0,radius]){
    const origin={x:x+dx,y:max,z:z+dz};
    const hit=rayBox(origin,{x:0,y:-1,z:0},box,max-min);
    if(hit>1e-6&&Number.isFinite(hit)){
      const y=max-hit;
      if(colliderNormal(box,{x:origin.x,y,z:origin.z}).y>=.6)top=Math.max(top,y);
    }
  }
  return top;
}

function raySphere(origin, direction, center, radius) {
  const x=origin.x-center.x,y=origin.y-center.y,z=origin.z-center.z;
  const b=x*direction.x+y*direction.y+z*direction.z, c=x*x+y*y+z*z-radius*radius;
  if(c<=0)return 0;
  const disc=b*b-c;if(disc<0)return Infinity;
  const t=-b-Math.sqrt(disc);return t>=0?t:Infinity;
}

function rayCapsule(origin, direction, x, z, bottom, top, radius) {
  let nearest = Math.min(
    raySphere(origin, direction, {x, y:bottom, z}, radius),
    raySphere(origin, direction, {x, y:top, z}, radius),
  );
  const dx = origin.x - x, dz = origin.z - z;
  const a = direction.x ** 2 + direction.z ** 2;
  const b = dx * direction.x + dz * direction.z;
  const c = dx ** 2 + dz ** 2 - radius ** 2;
  if (c <= 0 && origin.y >= bottom && origin.y <= top) return 0;
  const discriminant = b ** 2 - a * c;
  if (a > 1e-8 && discriminant >= 0) {
    const entry = (-b - Math.sqrt(discriminant)) / a;
    const y = origin.y + direction.y * entry;
    if (entry >= 0 && y >= bottom && y <= top) nearest = Math.min(nearest, entry);
  }
  return nearest;
}

function weaponSpread(player) {
  const weapon = getWeapon(player.classId, player.weaponId), input = player.input;
  const movement = clamp(player.moveSpeed / weapon.speed, 0, 1);
  return weapon.spread * (input.aim ? .24 : .66) * (crouching(player) ? .81 : 1)
    * (1 + movement * (input.aim ? .85 : 1.3)) * (player.slideTime > 0 ? 1.45 : 1) * (player.grounded ? 1 : 2)
    * (1 + player.bloom) * (player.bot ? 1.45 : 1);
}

function impactMaterial(kind) {
  if (kind === 'village-wood' || kind === 'village-awning' || kind === 'village-palm') return 'wood';
  if (kind === 'village-barrels') return 'metal';
  if (kind.startsWith('port-')) return kind==='port-wall'?'concrete':'metal';
  if (kind === 'crate' || kind === 'tree' || kind === 'tent') return 'wood';
  if (kind === 'roof' || kind === 'container' || kind === 'pillar' || kind === 'warehouse' || kind === 'truck' || kind === 'car' || kind === 'fueltank' || kind === 'generator' || kind === 'kiosk') return 'metal';
  return 'concrete';
}

function footprint(vehicle, x=vehicle.x, z=vehicle.z, yaw=vehicle.yaw) {
  const { width, length, height } = getVehicleDimensions(vehicle);
  return { x, z, w:width/2, d:length/2, h:height, cos:Math.cos(yaw), sin:Math.sin(yaw) };
}

function overlaps(a,b) {
  const dx=b.x-a.x,dz=b.z-a.z;
  const c=Math.abs(a.cos*b.cos+a.sin*b.sin),s=Math.abs(a.cos*b.sin-a.sin*b.cos);
  return Math.abs(dx*a.cos-dz*a.sin)<a.w+b.w*c+b.d*s
    && Math.abs(dx*a.sin+dz*a.cos)<a.d+b.w*s+b.d*c
    && Math.abs(dx*b.cos-dz*b.sin)<b.w+a.w*c+a.d*s
    && Math.abs(dx*b.sin+dz*b.cos)<b.d+a.w*s+a.d*c;
}

export class Simulation {
  constructor({ bots=23, difficulty='regular', mapId, random=Math.random, debugBots=false }={}) {
    this.debugBots=debugBots;
    this.map=getMap(mapId);
    this.navigationHouses = this.map.theme === 'desert-village'
      ? this.map.structures.filter(structure => structure.kind.startsWith('village-house') || structure.kind === 'village-ruin')
      : [];
    initializeCollisionWorld(this);
    this.random=random;this.time=0;this.players=new Map();this.maxTickets=600;this.tickets=[600,600];
    this.difficulty=typeof difficulty==='string'&&Object.hasOwn(DIFFICULTIES,difficulty)?difficulty:'regular';
    this.botSettings=DIFFICULTIES[this.difficulty];
    this.vehicles=(this.map.vehicleSpawns??[]).map(spawn=>this.createMapVehicle(spawn));
    this.points=this.map.points.map(p=>({...p,owner:-1,progress:0,contested:false,spawnBlocked:false}));
    this.events=[];this.eventId=0;this.winner=null;this.grenades=[];this.bullets=[];this.deployables=[];this.rockets=[];this.ticketClock=0;
    this.gridCell=this.map.navigationCell??4;this.gridSize=Math.ceil(this.map.size/this.gridCell);this.gridOrigin=-this.map.size/2;
    this.blocked=new Uint8Array(this.gridSize*this.gridSize);
    this.pathPrevious=new Int32Array(this.blocked.length);
    this.pathQueue=new Int32Array(this.blocked.length);
    const clearance=this.gridCell/2+PLAYER_RADIUS+.1;
    const gridIndex=position=>(position-this.gridOrigin)/this.gridCell-.5;
    if(this.map.shoreX!==undefined){
      const dryColumn=Math.ceil(gridIndex(this.map.shoreX+PLAYER_RADIUS));
      for(let row=0;row<this.gridSize;row++){
        const offset=row*this.gridSize;
        this.blocked.fill(1,offset,offset+dryColumn);
      }
    }
    const area = this.map.playArea;
    if(area)for(let iz=0;iz<this.gridSize;iz++)for(let ix=0;ix<this.gridSize;ix++){
      const x=this.gridOrigin+(ix+.5)*this.gridCell,z=this.gridOrigin+(iz+.5)*this.gridCell;
      if(x<area.minX+clearance||x>area.maxX-clearance||z<area.minZ+clearance||z>area.maxZ-clearance)
        this.blocked[iz*this.gridSize+ix]=1;
    }
    for(const box of this.colliders){
      if(box.overhead&&!box.obb&&!box.parts&&box.kind!=='village-stair')continue;
      const minX=Math.max(0,Math.floor(gridIndex(box.minX-clearance))+1);
      const maxX=Math.min(this.gridSize,Math.ceil(gridIndex(box.maxX+clearance)));
      const minZ=Math.max(0,Math.floor(gridIndex(box.minZ-clearance))+1);
      const maxZ=Math.min(this.gridSize,Math.ceil(gridIndex(box.maxZ+clearance)));
      if(minX<maxX)for(let z=minZ;z<maxZ;z++){
        if(!box.obb&&!box.parts)this.blocked.fill(1,z*this.gridSize+minX,z*this.gridSize+maxX);
        else for(let x=minX;x<maxX;x++){
          const px=this.gridOrigin+(x+.5)*this.gridCell,pz=this.gridOrigin+(z+.5)*this.gridCell;
          if(overlapsCollider(uprightBox(px,this.groundAt(px,pz),pz,clearance,EYE_HEIGHT),box))this.blocked[z*this.gridSize+x]=1;
        }
      }
    }
    for(let n=0;n<clamp(Math.floor(bots),0,31);n++){
      const cls=classKeys[Math.floor(n/2)%4];
      const wep=CLASS_WEAPONS[cls]?.[Math.floor(n/8)%2]??defaultWeaponId(cls);
      const p=this.addPlayer(`bot-${n}`,names[n%names.length],n%2,cls,wep);p.bot=true;p.botSlot=n;p.nextThink=0;p.botPath=[];
    }
    if(bots>0)prepareNavigation(this);
    this.ready=true;
  }
  // Keep both teams within one player of each other by moving bots across the sides.
  balanceTeams(){
    if(!this.ready)return;
    for(let guard=0;guard<40;guard++){
      const count=[0,0],bots=[[],[]];
      for(const q of this.players.values()){count[q.team]++;if(q.bot)bots[q.team].push(q);}
      const big=count[0]>count[1]?0:1,small=1-big;
      if(count[big]-count[small]<=1||!bots[big].length)return;
      const mover=bots[big].find(q=>!q.alive)||bots[big][bots[big].length-1];
      this.dismountVehicle(mover,true);
      this.deployables=this.deployables.filter(item=>item.ownerId!==mover.id);
      mover.team=small;mover.alive=false;mover.respawnIn=0;
      this.respawn(mover.id);
    }
  }
  event(type,data={}) { this.events.push({id:++this.eventId,type,time:this.time,...data}); }
  awardScore(player,amount,reason,extra={}) {
    if(!player||this.winner!==null)return 0;
    const pts=Math.max(1,Math.round(amount));
    player.score=(player.score||0)+pts;
    this.event('score',{playerId:player.id,points:pts,total:player.score,reason,...extra});
    return pts;
  }
  addPlayer(id,name='Боец',team,classId='assault',weaponId='',sidearmId) {
    if(this.players.has(id))return this.players.get(id);
    if(team!==0&&team!==1){let a=0,b=0;for(const p of this.players.values())p.team===0?a++:b++;team=a<=b?0:1;}
    const cls=validClass(classId)?classId:'assault';
    const wep=getPrimaryWeapon(cls,weaponId).id??defaultWeaponId(cls);
    const p={id:String(id),name:String(name||'Боец').replace(/[<>\x00-\x1f]/g,'').slice(0,20),team,classId:cls,weaponId:wep,x:0,y:0,z:0,yaw:0,pitch:0,hp:100,alive:false,ammo:0,reserve:0,kills:0,deaths:0,assists:0,score:0,damagers:new Map(),spottedBy:null,respawnIn:0,reloading:false,shotSeq:0,input:sanitizeInput(),cooldown:0,reloadTime:0,gadgetTime:0,grenades:2,vy:0,lastHurt:-100,bot:false};
    this.players.set(p.id,p);this.respawn(p.id,cls,'',wep,sidearmId);this.balanceTeams();return p;
  }
  removePlayer(id){
    const p=this.players.get(id);
    if(p)this.dismountVehicle(p,true);
    this.players.delete(id);this.deployables=this.deployables.filter(item=>item.ownerId!==id);this.balanceTeams();
  }
  setInput(id,input){const p=this.players.get(id);if(p&&!p.bot)p.input=sanitizeInput(input);}
  respawn(id,classId,pointId,weaponId,sidearmId){
    const p=this.players.get(id);if(!p || p.alive || p.respawnIn>0)return false;
    if(p.bot&&!pointId&&!shouldSpawnVehicleBotAtBase(this,p))pointId=botSpawnPoint(this,p)??undefined;
    const beacons=liveBeacons(this,p.team).filter(item=>![...this.players.values()].some(enemy=>enemy.alive&&enemy.team!==p.team&&dist(enemy,item)<8));
    if(p.bot&&!pointId&&beacons.length&&this.random()<.32)pointId=beacons[Math.floor(this.random()*beacons.length)].id;
    const beacon=beacons.find(item=>item.id===pointId);
    if(pointId?.startsWith('beacon:')&&!beacon)return false;
    if(p.bot&&!pointId&&!shouldSpawnVehicleBotAtBase(this,p)){const safe=this.points.filter(q=>canSpawnAtPoint(q,p.team)&&![...this.players.values()].some(enemy=>enemy.alive&&enemy.team!==p.team&&dist(enemy,q)<25)).sort((a,b)=>Math.hypot(a.x,a.z)-Math.hypot(b.x,b.z));pointId=safe[0]?.id;}
    const point=this.points.find(q=>q.id===pointId);
    if(point&&(!canSpawnAtPoint(point,p.team)||[...this.players.values()].some(enemy=>enemy.alive&&enemy.team!==p.team&&dist(enemy,point)<CAPTURE_RADIUS)))return false;
    if(validClass(classId))p.classId=classId;
    const wep=getPrimaryWeapon(p.classId,weaponId||p.primaryWeaponId);
    const sidearm=getSidearm(sidearmId??p.sidearmId);
    p.weaponId=p.primaryWeaponId=wep.id;p.sidearmId=sidearm.id;p.weaponSlot=1;p.equipTime=0;
    p.stowedAmmo={ammo:sidearm.mag,reserve:sidearm.reserve};
    const base=beacon||point||this.map.spawns[p.team];let x=base.x,z=base.z,spawnY=this.groundAt(x,z),placed=!beacon;
    for(let n=0;n<25;n++){
      const radius=beacon?3.2:8,tx=base.x+(this.random()-.5)*radius,tz=base.z+(this.random()-.5)*radius;
      const ty=beacon?supportHeight(this,tx,tz,beacon.y):this.groundAt(tx,tz);
      if((!beacon||Math.abs(ty-beacon.y)<.5)&&!this.collides(tx,tz,ty)&&!this.vehicleAt(tx,tz,ty)){x=tx;z=tz;spawnY=ty;placed=true;break;}
    }
    if(!placed)return false;
    p.damagers=new Map();p.spottedBy=null;
    Object.assign(p,{x,y:this.groundAt(x,z),z,yaw:p.team===0?0:Math.PI,pitch:0,hp:100,alive:true,ammo:wep.mag,reserve:wep.reserve,respawnIn:0,reloading:false,reloadTime:0,cooldown:0,grenades:2,vy:0,grounded:true,input:sanitizeInput(),lastHurt:this.time,invulnerableUntil:this.time+2,botTargetId:null,botObjective:null,botGoal:null,botWatchYaw:p.team===0?0:Math.PI,botHoldCrouch:false,botPath:[],nextThink:0,jumpHeld:false,grenadeHeld:false});
    Object.assign(p,{bloom:0,moveSpeed:0,lastShotAt:-Infinity,fireHeld:false,vehicleId:null,vehicleSeat:null,interactHeld:false,switchSeatHeld:false});
    Object.assign(p,{slideTime:0,slideCooldown:0,slideVx:0,slideVz:0,crouchHeld:false,crouching:false,wasSprinting:false});
    p.y=spawnY;
    Object.assign(p,{rockets:p.classId==='assault'?2:0,secondaryCooldown:0,gadgetTime:0,gadgetAction:null,gadgetActionUntil:0,
      pendingGadget:null,gadgetTargetId:null,gadgetHeld:false,secondaryGadgetHeld:false,downedUntil:0,botJob:null,heldGadget:null});
    p.ai=null;p.botRideOrder=null;p.hornHeld=false;p.botCrewTarget=null;p.botCrewSenseAt=0;this.botTeamAt=0;
    p.velocityX=0;p.velocityZ=0;p.tickX=x;p.tickZ=z;
    p.botTransit = null;
    p.botLastHouse = null;
    if(p.bot)Object.assign(p,{botJourney:null,botBoarding:null,botVehicleSince:null,botDriverSeenAt:null,botVehicleRetryAt:0,botVehicleReactAt:0});
    if(beacon){
      const owner=this.players.get(beacon.ownerId);
      if(owner&&owner.id!==p.id&&owner.team===p.team)this.awardScore(owner,25,'ВЫСАДКА НА МАЯК',{kind:'beaconSpawn',allyId:p.id});
    }
    this.event('spawn',{playerId:p.id,x:p.x,z:p.z,team:p.team});return true;
  }
  groundAt(x,z){return this.map.terrain?.heightAt(x,z)??0;}
  stairHeightAt(x,z,y,bodyHeight){
    const step=this.stepHeight;
    if(!step)return y;
    let height=y;
    const origin={x,y:y+step+.001,z},direction={x:0,y:-1,z:0};
    for(const box of this.rayBoxes(origin,direction,step+.001)){
      if(box.obb||box.parts){
        const top=rotatedFloor(box,x,z,y+.001,y+step+.001,PLAYER_RADIUS);
        if(top>height&&!this.collides(x,z,top+1e-5,PLAYER_RADIUS,bodyHeight))height=top+1e-5;
        continue;
      }
      if(!['village-stair','village-floor'].includes(box.kind)||box.h<=height||box.h>y+step)continue;
      if(Math.abs(x-box.x)>=box.w/2+PLAYER_RADIUS||Math.abs(z-box.z)>=box.d/2+PLAYER_RADIUS)continue;
      if(!this.collides(x,z,box.h,PLAYER_RADIUS,bodyHeight))height=box.h;
    }
    return height;
  }
  createMapVehicle(spawn){return {...createVehicle(spawn),y:this.groundAt(spawn.x,spawn.z),...vehicleBodyTilt(spawn,this.map.terrain)};}
  collides(x,z,y=this.groundAt(x,z),radius=PLAYER_RADIUS,height=EYE_HEIGHT){
    const limit=this.map.size/2-2;
    if(Math.abs(x)>limit||Math.abs(z)>limit||x<(this.map.shoreX??-Infinity)+radius)return true;
    const area=this.map.playArea;
    if(area&&(x<area.minX+radius||x>area.maxX-radius||z<area.minZ+radius||z>area.maxZ-radius))return true;
    const origin=this.map.size/2,cell=this.collisionCell,size=this.collisionSize;
    const minX=Math.max(0,Math.floor((x-radius+origin)/cell)),maxX=Math.min(size-1,Math.floor((x+radius+origin)/cell));
    const minZ=Math.max(0,Math.floor((z-radius+origin)/cell)),maxZ=Math.min(size-1,Math.floor((z+radius+origin)/cell));
    for(let bz=minZ;bz<=maxZ;bz++)for(let bx=minX;bx<=maxX;bx++)for(const b of this.collisionBins[bz*size+bx]){
      if(b.obb||b.parts){if(overlapsCollider(uprightBox(x,y,z,radius,height),b))return true;continue;}
      if(b.overhead&&y+height<=b.minY)continue;
      if(y<b.h&&x>b.minX-radius&&x<b.maxX+radius&&z>b.minZ-radius&&z<b.maxZ+radius)return true;
    }
    return false;
  }
  // Walk only grid cells crossed by a ray. Exact rayBox remains the narrow
  // phase, including roofs and raised geometry; the grid never decides a hit.
  rayBoxes(origin,direction,maximum){
    const size=this.collisionSize,cell=this.collisionCell,offset=this.map.size/2;
    let x=Math.floor((origin.x+offset)/cell),z=Math.floor((origin.z+offset)/cell);
    if(x<0||z<0||x>=size||z>=size)return this.colliders;
    const result=this.rayCandidates;result.length=0;
    this.rayVisit=(this.rayVisit+1)>>>0;
    if(!this.rayVisit){this.rayVisited.fill(0);this.rayVisit=1;}
    const visit=this.rayVisit,seen=this.rayVisited;
    const add=(bx,bz)=>{
      if(bx<0||bz<0||bx>=size||bz>=size)return;
      for(const box of this.collisionBins[bz*size+bx])if(seen[box.collisionIndex]!==visit){
        seen[box.collisionIndex]=visit;result.push(box);
      }
    };
    const sx=Math.sign(direction.x),sz=Math.sign(direction.z);
    const deltaX=sx?cell/Math.abs(direction.x):Infinity,deltaZ=sz?cell/Math.abs(direction.z):Infinity;
    let nextX=sx?((x+(sx>0?1:0))*cell-offset-origin.x)/direction.x:Infinity;
    let nextZ=sz?((z+(sz>0?1:0))*cell-offset-origin.z)/direction.z:Infinity;
    while(x>=0&&z>=0&&x<size&&z<size){
      add(x,z);
      if(Math.min(nextX,nextZ)>maximum)break;
      if(Math.abs(nextX-nextZ)<1e-9){
        // Include both sides of an exact corner, not only the diagonal cell.
        add(x+sx,z);add(x,z+sz);
        x+=sx;z+=sz;nextX+=deltaX;nextZ+=deltaZ;
      }else if(nextX<nextZ){x+=sx;nextX+=deltaX;}
      else{z+=sz;nextZ+=deltaZ;}
    }
    return result;
  }
  lineClear(a,b){
    const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z;
    const length=Math.hypot(dx,dy,dz);
    if(length<.1)return true;
    rayDir.x=dx/length;rayDir.y=dy/length;rayDir.z=dz/length;
    if(this.map.terrain?.raycast(a,rayDir,length)<length-.1)return false;
    const minX=Math.min(a.x,b.x),maxX=Math.max(a.x,b.x),minZ=Math.min(a.z,b.z),maxZ=Math.max(a.z,b.z);
    for(const box of this.rayBoxes(a,rayDir,length)){
      if(box.maxX<minX||box.minX>maxX||box.maxZ<minZ||box.minZ>maxZ)continue;
      if(rayBox(a,rayDir,box,length)<length-.1)return false;
    }
    return true;
  }
  vehicleCollides(vehicle,x,z,yaw){
    const body=footprint(vehicle,x,z,yaw);
    const c=Math.abs(body.cos),s=Math.abs(body.sin);
    const dx=body.w*c+body.d*s,dz=body.w*s+body.d*c;
    const limit=this.map.size/2-2;
    if(Math.abs(x)+dx>limit||Math.abs(z)+dz>limit)return true;
    const area=this.map.playArea;
    if(area&&(x-dx<area.minX||x+dx>area.maxX||z-dz<area.minZ||z+dz>area.maxZ))return true;
    const tilted=Boolean(vehicle.modelRotation?.x||vehicle.modelRotation?.z);
    const needsShape=tilted||this.hasRotatedGeometry||
      this.vehicles.some(other=>other.modelRotation?.x||other.modelRotation?.z);
    const pose=needsShape?{...vehicle,x,z,yaw,y:this.groundAt(x,z)}:null;
    const shape=pose?vehicleShape({...pose,...vehicleBodyTilt(pose,this.map.terrain)}):null;
    const bounds=shape?boxBounds({obb:shape}):null;
    if(tilted&&(bounds.minX<-limit||bounds.maxX>limit||bounds.minZ<-limit||bounds.maxZ>limit))return true;
    for(const box of this.colliders){
      if(box.obb||box.parts||tilted){
        if(bounds.minX>=box.maxX||bounds.maxX<=box.minX||bounds.minZ>=box.maxZ||bounds.maxZ<=box.minZ)continue;
        if(overlapsCollider(shape,box))return true;
        continue;
      }
      if(Math.abs(box.x-x)>=dx+box.w/2||Math.abs(box.z-z)>=dz+box.d/2)continue;
      if(box.overhead&&this.groundAt(x,z)+body.h<=box.minY)continue;
      if(overlaps(body,{x:box.x,z:box.z,w:box.w/2,d:box.d/2,cos:1,sin:0}))return true;
    }
    return this.vehicles.some(other=>other!==vehicle&&(other.hp>0||other.wreckTime>0)&&
      (tilted||other.modelRotation?.x||other.modelRotation?.z?overlapsAffine(shape,vehicleShape(other)):overlaps(body,footprint(other))));
  }
  vehicleAt(x,z,y,radius=PLAYER_RADIUS){
    return this.vehicles.some(v=>{
      if(v.hp<=0&&!(v.wreckTime>0))return false;
      if(v.modelRotation?.x||v.modelRotation?.z)return overlapsAffine(uprightBox(x,y,z,radius,EYE_HEIGHT),vehicleShape(v));
      const body=footprint(v),dx=x-v.x,dz=z-v.z;
      return y<(v.y??0)+body.h && Math.abs(dx*body.cos-dz*body.sin)<body.w+radius
        && Math.abs(dx*body.sin+dz*body.cos)<body.d+radius;
    });
  }
  syncVehicleSeat(p,vehicle){
    const pose=getVehicleSeatPose(vehicle,p.vehicleSeat);
    Object.assign(p,{x:pose.x,z:pose.z,y:pose.y-EYE_HEIGHT,vy:0,grounded:true,moveSpeed:Math.abs(vehicle.speed)});
  }
  mountVehicle(p,vehicle,seat){
    if(!p.alive||p.vehicleId||vehicle.hp<=0||vehicle.seats[seat]!==null||
      Math.abs(vehicle.speed)>3||Math.abs(p.y-this.groundAt(p.x,p.z))>.8||dist(p,vehicle)>vehicleBoardingRange(vehicle)||
      (vehicle.team!==p.team&&vehicle.seats.some(Boolean)))return false;
    if(!this.lineClear({x:p.x,y:p.y+1.25,z:p.z},{x:vehicle.x,y:vehicle.y+1.25,z:vehicle.z}))return false;
    vehicle.team=p.team;
    vehicle.seats[seat]=p.id;
    if(!p.bot&&seat===0&&vehicle.pickupPlayerId===p.id){
      vehicle.pickupUntil=0;vehicle.pickupPlayerId=null;
      const origin=this.points.find(point=>dist(vehicle,point)<22)?.id??null;
      for(const id of vehicle.seats){const ally=this.players.get(id);if(ally?.bot)ally.botRideOrder={driverId:p.id,vehicleId:vehicle.id,origin,holdUntil:this.time+8};}
    }
    Object.assign(p,{vehicleId:vehicle.id,vehicleSeat:seat,reloading:false,reloadTime:0,invulnerableUntil:0});
    this.syncVehicleSeat(p,vehicle);
    this.event('vehicleEnter',{playerId:p.id,vehicleId:vehicle.id,seat});
    return true;
  }
  dismountVehicle(p,force=false){
    if(!p.vehicleId)return false;
    const vehicle=this.vehicles.find(v=>v.id===p.vehicleId),seat=p.vehicleSeat;
    if(vehicle){
      if(!force&&Math.abs(vehicle.speed)>4.5)return false;
      const spec=VEHICLE_TYPES[vehicle.type],position=spec.seats[seat];
      const dimensions=getVehicleDimensions(vehicle);
      const side=position.x<=0?-1:1, width=dimensions.width/2+.68, length=dimensions.length/2+.72;
      const seatZ=position.z*(vehicle.modelScale?.z??1);
      const offsets=[[side*width,seatZ],[-side*width,seatZ],[0,length],[0,-length],[side*width,length],[-side*width,length]];
      const exit=offsets.map(([x,z])=>vehicleLocalPoint(vehicle,x,z)).find(({x,z})=>
        !this.collides(x,z)&&!this.vehicleAt(x,z,this.groundAt(x,z))&&
        this.lineClear({x:p.x,y:vehicle.y+.95,z:p.z},{x,y:this.groundAt(x,z)+.95,z}));
      if(!force&&!exit)return false;
      if(exit){p.x=exit.x;p.z=exit.z;}
      vehicle.seats[seat]=null;
      this.event('vehicleExit',{playerId:p.id,vehicleId:vehicle.id,seat});
    }
    Object.assign(p,{vehicleId:null,vehicleSeat:null,y:this.groundAt(p.x,p.z),vy:0,moveSpeed:0});
    return true;
  }
  updateVehicleActions(p){
    const {interact,switchSeat}=p.input;
    if(p.input.horn&&!p.hornHeld&&p.vehicleSeat===0)honkVehicle(this,p);
    p.hornHeld=p.input.horn;
    if(interact&&!p.interactHeld){
      if(p.vehicleId)this.dismountVehicle(p);
      else{
        for(const v of this.vehicles){
          const driver=this.players.get(v.seats[0]);
          if(v.pickupPlayerId!==p.id||v.pickupUntil<this.time||!driver?.bot||dist(p,v)>vehicleBoardingRange(v))continue;
          const free=v.seats.findIndex((id,index)=>index>0&&id===null);
          if(free>=0){v.seats[free]=driver.id;v.seats[0]=null;driver.vehicleSeat=free;driver.botJourney=null;}
        }
        const boarding=getVehicleBoardingSeat(p,this.vehicles);
        if(boarding)this.mountVehicle(p,boarding.vehicle,boarding.seat);
      }
    }
    if(switchSeat&&!p.switchSeatHeld&&p.vehicleId){
      const vehicle=this.vehicles.find(v=>v.id===p.vehicleId);
      const oldSeat=p.vehicleSeat;
      if(Math.abs(vehicle.speed)<4.5){
        for(let n=1;n<vehicle.seats.length;n++){
          const seat=(oldSeat+n)%vehicle.seats.length;
          if(vehicle.seats[seat]!==null)continue;
          vehicle.seats[oldSeat]=null;vehicle.seats[seat]=p.id;p.vehicleSeat=seat;
          if(VEHICLE_TYPES[vehicle.type].seats[seat].role!=='passenger'){
            p.reloading=false;p.reloadTime=0;
          }
          this.event('vehicleEnter',{playerId:p.id,vehicleId:vehicle.id,seat});
          break;
        }
      }
    }
    p.interactHeld=interact;p.switchSeatHeld=switchSeat;
  }
  moveVehicle(vehicle,input,dt){
      const spec=VEHICLE_TYPES[vehicle.type];
      const throttle=input?.forward??0, steering=input?.strafe??0;
      vehicle.steer=steering;
      const target=throttle>=0?throttle*spec.maxSpeed:throttle*spec.reverseSpeed;
      const slowing=vehicle.speed!==0&&(Math.sign(target)!==Math.sign(vehicle.speed)||Math.abs(target)<Math.abs(vehicle.speed));
      const acceleration=slowing?spec.brake:spec.acceleration;
      vehicle.speed+=clamp(target-vehicle.speed,-acceleration*dt,acceleration*dt);
      const turn=steering*spec.turnRate*Math.min(1,Math.abs(vehicle.speed)/4)
        *(1-.46*Math.abs(vehicle.speed)/spec.maxSpeed)*Math.sign(vehicle.speed);
      const substeps=Math.max(1,Math.ceil(Math.abs(vehicle.speed)*dt/.4));
      const movement=vehicle.speed*dt/substeps;
      for(let n=0;movement!==0&&n<substeps;n++){
        const yaw=angleDifference(vehicle.yaw-turn*dt/substeps,0);
        const x=vehicle.x-Math.sin(yaw)*movement,z=vehicle.z-Math.cos(yaw)*movement;
        if(this.vehicleCollides(vehicle,x,z,yaw)){vehicle.speed=0;break;}
        Object.assign(vehicle,{x,y:this.groundAt(x,z),z,yaw});
      }
      Object.assign(vehicle,vehicleBodyTilt(vehicle,this.map.terrain));
  }
  updateVehicles(dt){
    for(const vehicle of this.vehicles){
      if(vehicle.hp<=0){
        vehicle.wreckTime=Math.max(0,vehicle.wreckTime-dt);
        vehicle.respawnIn=Math.max(0,vehicle.respawnIn-dt);
        const home=vehicle.home;
        if(vehicle.respawnIn<=0&&!this.vehicleCollides(vehicle,home.x,home.z,home.yaw)&&
          ![...this.players.values()].some(p=>p.alive&&dist(p,home)<2.8)){
          Object.assign(vehicle,this.createMapVehicle(home));
        }
        continue;
      }
      const spec=VEHICLE_TYPES[vehicle.type];
      this.moveVehicle(vehicle,this.players.get(vehicle.seats[0])?.input,dt);
      for(const id of vehicle.seats){
        const passenger=this.players.get(id);
        if(passenger)this.syncVehicleSeat(passenger,vehicle);
      }
      const gunner=spec.seats[1].role==='gunner'?this.players.get(vehicle.seats[1]):null;
      vehicle.gunCooldown=Math.max(-dt,vehicle.gunCooldown-dt);
      vehicle.heat=Math.max(0,vehicle.heat-dt*(vehicle.overheated?.28:.26));
      if(vehicle.overheated&&vehicle.heat<=.3)vehicle.overheated=false;
      if(gunner?.alive){
        vehicle.aimYaw=gunner.input.yaw;
        vehicle.aimPitch=clamp(gunner.input.pitch,TURRET_WEAPON.minPitch,TURRET_WEAPON.maxPitch);
      }else{
        vehicle.aimYaw=vehicle.yaw;vehicle.aimPitch=0;
      }
    }
  }
  damageVehicle(vehicle,amount,attacker,kind){
    if(vehicle.hp<=0||this.winner!==null||attacker?.team===vehicle.team)return;
    const spec=VEHICLE_TYPES[vehicle.type];
    vehicle.lastHurt=this.time;
    if(kind==='blast')vehicle.lastBlastAt=this.time;
    vehicle.hp=Math.max(0,vehicle.hp-amount*(kind==='blast'?spec.blastArmor:spec.bulletArmor));
    if(vehicle.hp>0)return;
    vehicle.speed=0;vehicle.steer=0;vehicle.respawnIn=spec.respawn;vehicle.wreckTime=8;
    for(const id of [...vehicle.seats]){
      const passenger=this.players.get(id);
      if(!passenger)continue;
      this.dismountVehicle(passenger,true);
      this.damage(passenger,200,attacker,{weapon:'ВЗРЫВ ТЕХНИКИ'});
    }
    this.event('vehicleDestroyed',{vehicleId:vehicle.id,vehicleType:vehicle.type,attackerId:attacker?.id,x:vehicle.x,y:vehicle.y+.65,z:vehicle.z});
    this.event('explosion',{x:vehicle.x,y:vehicle.y+.65,z:vehicle.z,vehicleId:vehicle.id});
    if(attacker)this.awardScore(attacker,100,'УНИЧТОЖЕНИЕ ТЕХНИКИ',{kind:'vehicle'});
  }
  damage(victim,amount,attacker,meta={}){
    if(!victim.alive||this.winner!==null||this.time<victim.invulnerableUntil)return;
    const prevHp=victim.hp;
    victim.hp=Math.max(0,victim.hp-amount);
    const dealt=prevHp-victim.hp;
    victim.lastHurt=this.time;
    if(dealt>0)rememberBotDamage(this,victim,attacker);
    this.event('damage',{playerId:victim.id,attackerId:attacker?.id,amount:dealt,x:attacker?.x??victim.x,z:attacker?.z??victim.z});
    if(attacker&&attacker!==victim&&attacker.team!==victim.team&&dealt>0){
      this.awardScore(attacker,Math.max(1,Math.round(dealt)),'НАНЕСЕНИЕ УРОНА',{kind:'damage',victimId:victim.id});
      if(!victim.damagers)victim.damagers=new Map();
      const prev=victim.damagers.get(attacker.id)||{amount:0,time:0};
      victim.damagers.set(attacker.id,{amount:prev.amount+dealt,time:this.time});
    }
    if(victim.hp<=0){
      this.dismountVehicle(victim,true);
      victim.alive=false;victim.deaths++;victim.respawnIn=4;victim.downedUntil=this.time+4;victim.reloading=false;
      victim.pendingGadget=null;victim.gadgetAction=null;
      this.tickets[victim.team]=Math.max(0,this.tickets[victim.team]-1);
      if(attacker&&attacker.team!==victim.team){
        attacker.kills++;
        this.awardScore(attacker,100,'УСТРАНЕНИЕ ПРОТИВНИКА',{kind:'kill',victim:victim.name});
        if(meta.headshot)this.awardScore(attacker,25,'ВЫСТРЕЛ В ГОЛОВУ',{kind:'headshot'});
        const nearPoint=this.points.find(pt=>dist(victim,pt)<=CAPTURE_RADIUS+6||dist(attacker,pt)<=CAPTURE_RADIUS+6);
        if(nearPoint){
          if(nearPoint.owner===attacker.team){
            this.awardScore(attacker,50,`ОБОРОНА ТОЧКИ ${nearPoint.id}`,{kind:'defense',pointId:nearPoint.id});
          }else if(dist(attacker,nearPoint)<=CAPTURE_RADIUS+4){
            this.awardScore(attacker,25,`ШТУРМ ТОЧКИ ${nearPoint.id}`,{kind:'attack',pointId:nearPoint.id});
          }
        }
      }
      const assistedIds=new Set();
      if(victim.damagers){
        for(const [helperId,info] of victim.damagers.entries()){
          if(helperId===attacker?.id||this.time-info.time>12||info.amount<10)continue;
          const helper=this.players.get(helperId);
          if(helper&&helper.team!==victim.team){
            helper.assists=(helper.assists||0)+1;
            assistedIds.add(helper.id);
            const high=info.amount>=75;
            this.awardScore(helper,high?75:50,high?'ПОМОЩЬ КАК УБИЙСТВО':'ПОМОЩЬ В УСТРАНЕНИИ',{kind:'assist',victim:victim.name});
          }
        }
      }
      if(victim.spottedUntil>this.time&&victim.spottedBy&&victim.spottedBy!==attacker?.id){
        const spotter=this.players.get(victim.spottedBy);
        if(spotter&&spotter.team!==victim.team){
          if(!assistedIds.has(spotter.id))spotter.assists=(spotter.assists||0)+1;
          this.awardScore(spotter,25,'ПОМОЩЬ РАЗВЕДКОЙ',{kind:'spot_assist',victim:victim.name});
        }
      }
      victim.damagers?.clear();
      victim.spottedBy=null;
      this.event('kill',{killer:attacker?.name||'Окружение',victim:victim.name,killerId:attacker?.id,victimId:victim.id,weapon:meta.weapon||(attacker?getWeapon(attacker.classId,attacker.weaponId).weapon:'ГРАНАТА'),team:attacker?.team,headshot:!!meta.headshot});
    }
  }
  shoot(p,vehicle=null){
    const c=getWeapon(p.classId,p.weaponId),input=p.input;if(p.cooldown>0||p.reloading||p.ammo<=0)return;
    p.invulnerableUntil=0;
    p.ammo--;p.shotSeq++;p.cooldown+=c.interval;
    const eye=crouching(p)?CROUCH_EYE_HEIGHT:EYE_HEIGHT;
    const origin=vehicle?getVehicleSeatPose(vehicle,p.vehicleSeat):{x:p.x,y:p.y+eye,z:p.z};
    const angle = this.random() * Math.PI * 2;
    const radius = Math.sqrt(this.random()) * weaponSpread(p);
    const yaw = p.yaw + Math.cos(angle) * radius;
    // Bots already aim along the compensated launch angle returned by aimBullet.
    const scoped = Boolean(c.zeroRange && input.aim && !p.bot);
    const borePitch = scoped ? zeroedBulletPitch(p.pitch, c.zeroRange, c.projectileSpeed) : p.pitch;
    const pitch = borePitch + Math.sin(angle) * radius;
    p.lastShotAt = this.time;
    p.bloom = Math.min(1.25, p.bloom + (input.aim ? .16 : .23));
    this.launchBullet(p,c,origin,yaw,pitch,vehicle,scoped);
  }
  shootTurret(p,vehicle,dt){
    if(!p.input.fire||vehicle.overheated||vehicle.gunCooldown>0)return;
    vehicle.gunCooldown=Math.max(-dt,vehicle.gunCooldown)+TURRET_WEAPON.interval;
    vehicle.heat=Math.min(1,vehicle.heat+TURRET_WEAPON.heatPerShot);
    if(vehicle.heat>=1)vehicle.overheated=true;
    vehicle.gunSeq++;
    const spread=TURRET_WEAPON.spread*(1+vehicle.heat*.6+Math.abs(vehicle.speed)*.034);
    const angle=this.random()*Math.PI*2, radius=Math.sqrt(this.random())*spread;
    const yaw=vehicle.aimYaw+Math.cos(angle)*radius,pitch=vehicle.aimPitch+Math.sin(angle)*radius;
    const origin=getVehicleSeatPose(vehicle,1);
    this.launchBullet(p,TURRET_WEAPON,origin,yaw,pitch,vehicle);
  }
  launchBullet(p,weapon,origin,yaw,pitch,firingVehicle=null,trace=false){
    const speed=weapon.projectileSpeed, horizontal=speed*Math.cos(pitch);
    const velocity={vx:-Math.sin(yaw)*horizontal,vy:Math.sin(pitch)*speed,vz:-Math.cos(yaw)*horizontal};
    const life=weapon.range/speed, mounted=weapon===TURRET_WEAPON;
    const shotSeq=mounted?firingVehicle.gunSeq:p.shotSeq;
    this.event('shot',{playerId:p.id,classId:p.classId,weaponId:p.weaponId,team:p.team,shotSeq,...origin,
      ...(trace||shotSeq%3===0?{...velocity,life}:{}),...(firingVehicle?{vehicleId:firingVehicle.id,mounted}:{})});
    this.bullets.push({...origin,...velocity,life,weapon,age:0,time:this.time,shotId:this.eventId,
      playerId:p.id,team:p.team,vehicleId:firingVehicle?.id});
  }
  updateBullets(){
    let active=0;
    for(const bullet of this.bullets){
      const age=Math.min(bullet.life,this.time-bullet.time);
      if(age<=bullet.age||this.advanceBullet(bullet,age))this.bullets[active++]=bullet;
    }
    this.bullets.length=active;
  }
  advanceBullet(bullet,age){
    const {x,y,z,vx,vy,vz,weapon,team,playerId}=bullet;
    const start=bullet.age,dt=age-start;
    const origin={x:x+vx*start,y:bulletHeight(y,vy,start),z:z+vz*start};
    const dx=vx*dt,dy=bulletHeight(y,vy,age)-origin.y,dz=vz*dt;
    const length=Math.hypot(dx,dy,dz);
    const direction={x:dx/length,y:dy/length,z:dz/length};
    let closest=length,target=null,vehicle=null,equipment=null,headshot=false,impact=null,impactBox=null;
    const terrain=this.map.terrain;
    const ground=terrain?terrain.raycast(origin,direction,length):(direction.y<0?-origin.y/direction.y:Infinity);
    if(ground>=0&&ground<closest){closest=ground;impact='ground';}
    for(const box of this.rayBoxes(origin,direction,closest)){
      const distance=rayBox(origin,direction,box,closest);
      if(distance<closest){closest=distance;impact=impactMaterial(box.kind);impactBox=box;}
    }
    const glassHits=[];
    for(const v of this.vehicles){
      if(v.hp<=0&&!(v.wreckTime>0))continue;
      for(const pane of rayVehicleGlass(origin,direction,v,closest))glassHits.push({vehicle:v,...pane});
      const distance=rayVehicleArmor(origin,direction,v,closest);
      if(distance<closest){closest=distance;vehicle=v;impact='metal';}
    }
    for(const item of this.deployables){
      if(item.hp<=0||item.team===team)continue;
      const hit=rayBox(origin,direction,deployableBounds(item),closest);
      if(hit<closest){closest=hit;equipment=item;vehicle=null;impact='metal';}
    }
    const endX=origin.x+dx,endZ=origin.z+dz;
    const minX=Math.min(origin.x,endX)-.24,maxX=Math.max(origin.x,endX)+.24;
    const minZ=Math.min(origin.z,endZ)-.24,maxZ=Math.max(origin.z,endZ)+.24;
    for(const other of this.players.values()){
      if(other.id===playerId||!other.alive||other.team===team)continue;
      suppressBot(this,other,bullet,origin,direction,Math.min(length,closest));
      if(other.vehicleId){
        const transport=this.vehicles.find(v=>v.id===other.vehicleId);
        if(!transport)continue;
        const hit=rayVehicleCrew(origin,direction,transport,other.vehicleSeat,closest);
        if(hit.distance<closest){closest=hit.distance;target=other;headshot=hit.headshot;vehicle=null;equipment=null;}
        continue;
      }
      if(other.x<minX||other.x>maxX||other.z<minZ||other.z>maxZ)continue;
      const crouch=crouching(other),headY=other.y+(crouch?1.06:EYE_HEIGHT);
      const head=raySphere(origin,direction,{x:other.x,y:headY,z:other.z},.15);
      const body=rayCapsule(origin,direction,other.x,other.z,other.y+.26,other.y+(crouch?.79:1.25),.24);
      const hit=Math.min(head,body);
      if(hit<closest){closest=hit;target=other;headshot=head<body;vehicle=null;equipment=null;}
    }
    for(const hit of glassHits)if(hit.distance<=closest&&!((hit.vehicle.glassBroken??0)&(1<<hit.id))){
      hit.vehicle.glassBroken=(hit.vehicle.glassBroken??0)|(1<<hit.id);
      this.event('glassBreak',{vehicleId:hit.vehicle.id,pane:hit.id,x:origin.x+direction.x*hit.distance,y:origin.y+direction.y*hit.distance,z:origin.z+direction.z*hit.distance});
    }
    bullet.age=age;
    if(!target&&!vehicle&&!impact&&age<bullet.life)return true;
    const hit=Boolean(target&&this.time>=target.invulnerableUntil);
    if(target)impact=hit?'flesh':'shield';
    const vehicleHit=Boolean(vehicle?.hp>0&&vehicle.team!==team);
    const flight=start+dt*closest/length;
    this.event('bulletImpact',{shotId:bullet.shotId,playerId,team,weaponId:weapon.id,x,y,z,flight,
      tx:origin.x+direction.x*closest,ty:origin.y+direction.y*closest,tz:origin.z+direction.z*closest,
      ...(weapon.id==='sv98'&&!target&&impact?{
        impactBoxId:vehicle?undefined:impactBox?.id,impactVehicleId:vehicle?.id,
        dx:direction.x,dy:direction.y,dz:direction.z,
      }:{}),
      hit,headshot:hit&&headshot,impact,vehicleHit,equipmentHit:Boolean(equipment)});
    const shooter=this.players.get(playerId),attacker=shooter?.team===team?shooter:null;
    const falloff=clamp(1-Math.max(0,flight*weapon.projectileSpeed-35)/300,.65,1);
    if(hit)this.damage(target,weapon.damage*falloff*(headshot?2:1),attacker,{headshot,weapon:weapon.weapon});
    if(vehicleHit)this.damageVehicle(vehicle,weapon.damage*falloff,attacker,'bullet');
    if(equipment)damageDeployable(this,equipment,weapon.damage*falloff,attacker);
    return false;
  }
  updateReload(p,weapon,dt){
    if(p.reloading){
      p.reloadTime-=dt;
      if(p.reloadTime<=0){
        const amount=Math.min(weapon.mag-p.ammo,p.reserve);
        p.ammo+=amount;p.reserve-=amount;p.reloading=false;
      }
    }
    if(p.input.reload||p.ammo===0)this.startReload(p);
  }
  firePersonalWeapon(p,weapon,pressed,firing,vehicle=null){
    if(!firing)return;
    if(p.bot||!weapon.semiAuto||pressed)this.shoot(p,vehicle);
    if(pressed&&p.ammo===0&&p.reserve===0&&!p.reloading&&p.cooldown<=0){
      this.event('dryFire',{playerId:p.id,classId:p.classId,x:p.x,z:p.z});
    }
  }
  startReload(p){
    const weapon = getWeapon(p.classId, p.weaponId);
    if(p.heldGadget||p.equipTime>0||p.reloading||p.ammo>=weapon.mag||p.reserve<=0)return;
    p.reloading=true;
    p.reloadTime=weapon.reload;
    this.event('reload',{playerId:p.id,classId:p.classId,weaponId:p.weaponId,duration:weapon.reload,empty:p.ammo===0,x:p.x,z:p.z});
  }
  equipWeapon(p,slot){
    if(!slot||slot===p.weaponSlot)return;
    const {ammo,reserve}=p.stowedAmmo;
    p.stowedAmmo={ammo:p.ammo,reserve:p.reserve};
    Object.assign(p,{ammo,reserve,weaponSlot:slot,weaponId:slot===2?p.sidearmId:p.primaryWeaponId,
      equipTime:WEAPON_SWITCH_TIME,reloading:false,reloadTime:0,bloom:0});
    p.cooldown=Math.max(p.cooldown,WEAPON_SWITCH_TIME);
    this.event('equip',{playerId:p.id,weaponId:p.weaponId,x:p.x,z:p.z});
  }
  gadget(p){return activateGadget(this,p);}
  throwGrenade(p){
    if(!p.grenades||p.grenadeCooldown>0)return;p.grenades--;p.grenadeCooldown=1;
    p.invulnerableUntil=0;
    const eye={x:p.x,y:p.y+(crouching(p)?CROUCH_EYE_HEIGHT:EYE_HEIGHT),z:p.z};
    const direction={x:-Math.sin(p.yaw)*Math.cos(p.pitch),y:Math.sin(p.pitch),z:-Math.cos(p.yaw)*Math.cos(p.pitch)};
    let hit=this.map.terrain?.raycast(eye,direction,80)??(direction.y<-.001?-eye.y/direction.y:Infinity);
    if(hit<0||hit>80)hit=Infinity;
    for(const box of this.rayBoxes(eye,direction,80))hit=Math.min(hit,rayBox(eye,direction,box,80));
    let hitPlayer=false;
    for(const other of this.players.values())if(other!==p&&other.alive){
      const distance=rayCapsule(eye,direction,other.x,other.z,other.y+.2,other.y+(crouching(other)?.95:1.5),.28);
      if(distance<hit){hit=distance;hitPlayer=true;}
    }
    const maximum=38, horizontal=Number.isFinite(hit)?Math.min(maximum,hit*Math.cos(p.pitch)):maximum;
    const range=Math.max(.4,horizontal), x=p.x-Math.sin(p.yaw)*range,z=p.z-Math.cos(p.yaw)*range;
    const targetY=Number.isFinite(hit)&&horizontal<maximum&&!hitPlayer?eye.y+direction.y*hit:this.groundAt(x,z)+.1;
    const origin={x:p.x,y:eye.y-.14,z:p.z},flight=clamp(.4+range*.033,.42,1.65);
    let vx=(x-origin.x)/flight,vz=(z-origin.z)/flight,vy=(targetY-origin.y+7*flight*flight)/flight;
    const speed=Math.hypot(vx,vy,vz),limit=Math.min(1,26/Math.max(.001,speed));
    vx*=limit;vy*=limit;vz*=limit;
    this.grenades.push({id:`grenade-${++this.eventId}`,owner:p.id,team:p.team,...origin,vx,vz,vy,fuse:1.8,yaw:p.yaw||0});
    this.event('grenade',{playerId:p.id,x:p.x,y:p.y||0,z:p.z,yaw:p.yaw||0});
  }
  gridIndex(x,z){return clamp(Math.floor((z-this.gridOrigin)/this.gridCell),0,this.gridSize-1)*this.gridSize+clamp(Math.floor((x-this.gridOrigin)/this.gridCell),0,this.gridSize-1);}
  pathfind(start,goal){return findBotPath(this,start,goal);}
  pickObjectiveSpot(p,point){
    const slot=p.botSlot??0;
    const baseAngle=slot*2.3999632+this.random()*Math.PI*2;
    const radii=[4.2,6.4,8.2,3.0];
    let bestSpot={x:point.x,z:point.z},bestScore=-Infinity;
    for(let i=0;i<12;i++){
      const angle=baseAngle+i*(Math.PI*2/12);
      const r=radii[i%radii.length]+(this.random()-.5)*1.2;
      const tx=point.x+Math.cos(angle)*r,tz=point.z+Math.sin(angle)*r;
      if(Math.hypot(tx-point.x,tz-point.z)>=CAPTURE_RADIUS-1.4)continue;
      if(this.collides(tx,tz,undefined,PLAYER_RADIUS+.35)||this.blocked[this.gridIndex(tx,tz)])continue;
      let minAlly=Infinity;
      for(const ally of this.players.values()){
        if(ally===p||!ally.alive||ally.team!==p.team)continue;
        const ref=ally.botGoal||ally;
        const d=Math.hypot(tx-ref.x,tz-ref.z);
        if(d<minAlly)minAlly=d;
      }
      const coverBonus=this.collides(tx+Math.cos(angle)*1.6,tz+Math.sin(angle)*1.6,undefined,PLAYER_RADIUS)?2.5:0;
      const score=Math.min(minAlly,8)+coverBonus+(this.random()-.5)*.4;
      if(score>bestScore){bestScore=score;bestSpot={x:tx,z:tz};}
    }
    const enemyBase=this.map.spawns[1-p.team]??{x:0,z:0};
    const outwardYaw=Math.atan2(-(bestSpot.x-point.x),-(bestSpot.z-point.z));
    const frontYaw=Math.atan2(-(enemyBase.x-bestSpot.x),-(enemyBase.z-bestSpot.z));
    p.botWatchYaw=frontYaw+angleDifference(outwardYaw,frontYaw)*.45+((slot%3)-1)*.35;
    p.botHoldCrouch=(slot+Math.floor(this.time))%3===0;
    return bestSpot;
  }
  // Shared by authority and local movement prediction; no combat or AI runs here.
  movePlayer(p,i,dt){
    if(!dt||!p.alive||p.vehicleId)return;
    p.yaw=i.yaw;p.pitch=i.pitch;
    const c=getWeapon(p.classId,p.weaponId);
      const slide=slideVelocity(p,i,c,dt,(x,z)=>this.groundAt(x,z));
      p.crouching=Boolean(i.crouch||slide||(p.crouching&&this.collides(p.x,p.z,p.y)));
      const bodyHeight=p.crouching?CROUCH_EYE_HEIGHT+.12:EYE_HEIGHT;
      const norm=Math.max(1,Math.hypot(i.forward,i.strafe));let speed=c.speed*(i.crouch?.5:i.sprint&&!i.fire?1.55:i.aim?.7:1);
      if(p.crouching)speed=c.speed*.5;
      const dx=slide?slide.vx*dt:(-Math.sin(p.yaw)*i.forward+Math.cos(p.yaw)*i.strafe)/norm*speed*dt;
      const dz=slide?slide.vz*dt:(-Math.cos(p.yaw)*i.forward-Math.sin(p.yaw)*i.strafe)/norm*speed*dt;
      const oldX=p.x,oldZ=p.z;
      const substeps=slide?Math.max(1,Math.ceil(Math.hypot(dx,dz)/.2)):1;
      for(let moveStep=0;moveStep<substeps;moveStep++){
      const stepX=dx/substeps,stepZ=dz/substeps;
      let followsGround=p.grounded&&p.y<=this.groundAt(p.x,p.z)+.025;
      const insideVehicle=this.vehicleAt(p.x,p.z,p.y);
      let walkX=followsGround?this.groundAt(p.x+stepX,p.z):p.y;
      const groundX=walkX;
      if(!slide&&this.stepHeight&&p.grounded&&this.collides(p.x+stepX,p.z,walkX,PLAYER_RADIUS,bodyHeight))walkX=this.stairHeightAt(p.x+stepX,p.z,walkX,bodyHeight);
      if(!this.collides(p.x+stepX,p.z,walkX,PLAYER_RADIUS,bodyHeight)&&(insideVehicle||!this.vehicleAt(p.x+stepX,p.z,walkX))){
        p.x+=stepX;
        if(walkX>groundX+.0001){p.y=walkX;followsGround=false;}
      }
      let walkZ=followsGround?this.groundAt(p.x,p.z+stepZ):p.y;
      const groundZ=walkZ;
      if(!slide&&this.stepHeight&&p.grounded&&this.collides(p.x,p.z+stepZ,walkZ,PLAYER_RADIUS,bodyHeight))walkZ=this.stairHeightAt(p.x,p.z+stepZ,walkZ,bodyHeight);
      if(!this.collides(p.x,p.z+stepZ,walkZ,PLAYER_RADIUS,bodyHeight)&&(insideVehicle||!this.vehicleAt(p.x,p.z+stepZ,walkZ))){
        p.z+=stepZ;
        if(walkZ>groundZ+.0001){p.y=walkZ;followsGround=false;}
      }
      if(followsGround)p.y=this.groundAt(p.x,p.z);
      }
      const ground=this.groundAt(p.x,p.z);
      p.moveSpeed=Math.hypot(p.x-oldX,p.z-oldZ)/dt;
      if(slide&&p.moveSpeed<Math.hypot(slide.vx,slide.vz)*.5)p.slideTime=0;
      if(i.jump&&p.grounded&&!p.jumpHeld){p.vy=6;p.grounded=false;}p.jumpHeld=i.jump;
      const oldY=p.y;p.vy-=18*dt;let nextY=p.y+p.vy*dt;let floor=ground;
      if(p.vy<=0)for(const box of this.floorBoxes(p.x,p.z,PLAYER_RADIUS)){
        if(box.obb||box.parts){
          floor=Math.max(floor,rotatedFloor(box,p.x,p.z,nextY-.01,oldY+.01,PLAYER_RADIUS));
          continue;
        }
        const support=PLAYER_RADIUS*(['village-stair','village-floor'].includes(box.kind)?1:.6);
        if(oldY>=box.h-.01&&nextY<=box.h&&Math.abs(p.x-box.x)<box.w/2+support&&Math.abs(p.z-box.z)<box.d/2+support)floor=Math.max(floor,box.h);
      }
      p.y=Math.max(floor,nextY);p.grounded=p.y===floor;if(p.grounded)p.vy=0;
    p.velocityX=(p.x-oldX)/dt;p.velocityZ=(p.z-oldZ)/dt;
  }
  floorBoxes(x,z,radius){
    const half=this.map.size/2,cell=this.collisionCell,size=this.collisionSize;
    const loX=Math.floor((x-radius+half)/cell),hiX=Math.floor((x+radius+half)/cell);
    const loZ=Math.floor((z-radius+half)/cell),hiZ=Math.floor((z+radius+half)/cell);
    if(loX<0||loZ<0||hiX>=size||hiZ>=size)return this.colliders;
    const out=this.floorCandidates;out.length=0;
    this.floorVisit=(this.floorVisit+1)>>>0;
    if(!this.floorVisit){this.floorVisited.fill(0);this.floorVisit=1;}
    for(let iz=loZ;iz<=hiZ;iz++)for(let ix=loX;ix<=hiX;ix++)for(const box of this.collisionBins[iz*size+ix]){
      if(this.floorVisited[box.collisionIndex]===this.floorVisit)continue;
      this.floorVisited[box.collisionIndex]=this.floorVisit;out.push(box);
    }
    return out;
  }
  thinkBot(p,dt){thinkInfantryBot(this,p,dt);}
  step(rawDt){
    const dt=clamp(finite(rawDt),0,.1);if(!dt)return;this.time+=dt;
    while(this.events.length&&this.time-this.events[0].time>=1.2)this.events.shift();
    if(this.winner!==null)return;
    for(const p of this.players.values()){p.tickX=p.x;p.tickZ=p.z;}
    // Spread route planning across ticks when many bots spawn together.
    this.botPathBudget=this.pathRequestsPerTick??2;
    beginNavigationTick(this);
    updateEquipment(this,dt);
    updateBotTeams(this);
    if(this.vehicles.length){
      for(const p of this.players.values()){
        if(!p.alive)continue;
        if(p.bot)this.thinkBot(p,dt);
        this.updateVehicleActions(p);
      }
      this.updateVehicles(dt);
    }
    for(const p of this.players.values()){
      if(!p.alive){p.respawnIn=Math.max(0,p.respawnIn-dt);if(p.bot&&p.respawnIn===0)this.respawn(p.id);continue;}
      if(p.bot&&!this.vehicles.length)this.thinkBot(p,dt);
      const i=p.input;p.yaw=i.yaw;p.pitch=i.pitch;
      p.equipTime=Math.max(0,p.equipTime-dt);
      const mounted=p.vehicleId&&this.vehicles.find(v=>v.id===p.vehicleId);
      const personal=!mounted||VEHICLE_TYPES[mounted.type].seats[p.vehicleSeat].role==='passenger';
      if(personal&&!placingSupply(p,this.time)){
        const backup=p.bot&&p.ammo+p.reserve===0&&p.stowedAmmo.ammo+p.stowedAmmo.reserve>0;
        const tool=selectedGadget(p.classId,i.toolSlot);
        // A delayed client input may still request the pre-placement pistol
        // and supply slot. Keep the automatic return authoritative until the
        // client clears that unavailable tool selection.
        const usedSupply=!p.bot&&isSupplyGadget(tool)&&gadgetCooldown(p,tool)>0;
        this.equipWeapon(p,usedSupply?1:i.weaponSlot||(backup?3-p.weaponSlot:0));
      }
      if(!p.bot)selectGadget(this,p,i.toolSlot);
      const c=getWeapon(p.classId,p.weaponId);
      const pressed = i.fire && !p.fireHeld;
      p.fireHeld = i.fire;
      // Carry the fractional tick remainder through a burst so cadence stays on spec.
      const firing = !p.heldGadget && i.fire && !i.sprint && p.equipTime===0 && !i.gadget && !i.secondaryGadget && !(p.gadgetActionUntil>this.time);
      const continuous = firing && (p.bot || !c.semiAuto) && !pressed && !p.reloading;
      p.cooldown = Math.max(continuous ? -dt : 0, p.cooldown - dt);
      p.bloom = Math.max(0, p.bloom - dt * (this.time - p.lastShotAt > .16 ? 3.6 : .4));
      p.gadgetTime=Math.max(0,p.gadgetTime-dt);p.grenadeCooldown=Math.max(0,(p.grenadeCooldown||0)-dt);
      if(p.vehicleId){
        p.slideTime=0;p.crouching=false;p.crouchHeld=i.crouch;p.wasSprinting=false;
        const vehicle=mounted;
        const seat=VEHICLE_TYPES[vehicle.type].seats[p.vehicleSeat];
        if(seat.role==='gunner'){
          p.pitch=vehicle.aimPitch;
          this.shootTurret(p,vehicle,dt);
        }else if(seat.role==='passenger'){
          this.updateReload(p,c,dt);
          this.firePersonalWeapon(p,c,pressed,firing&&canFirePassengerWeapon(vehicle,p.vehicleSeat,p.yaw,p.pitch),vehicle);
        }
        if(this.time-p.lastHurt>7&&p.hp<100)p.hp=Math.min(100,p.hp+7*dt);
        continue;
      }
      this.updateReload(p,c,dt);
      if(p.networkFrames){
        for(const frame of p.networkFrames){this.movePlayer(p,frame.input,frame.dt);p.inputAck=frame.sequence;}
        p.networkFrames=null;
      }else if(!p.networkControlled||p.networkIdle)this.movePlayer(p,i,dt);
      this.firePersonalWeapon(p,c,pressed,firing);
      if(p.heldGadget&&i.fire&&!i.sprint&&(pressed||p.heldGadget==='repair')){
        activateGadget(this,p,p.heldGadget==='launcher'||p.heldGadget==='medkit');
      }
      if(p.bot&&i.gadget&&(!p.gadgetHeld||p.classId==='support'))this.gadget(p);
      if(p.bot&&i.secondaryGadget&&!p.secondaryGadgetHeld)activateGadget(this,p,true);
      p.gadgetHeld=i.gadget;p.secondaryGadgetHeld=i.secondaryGadget;
      if(i.grenade&&!p.grenadeHeld&&!(p.gadgetActionUntil>this.time))this.throwGrenade(p);p.grenadeHeld=i.grenade;
      if(this.time-p.lastHurt>7&&p.hp<100)p.hp=Math.min(100,p.hp+7*dt);
    }
    for(const p of this.players.values()){
      p.velocityX=(p.x-p.tickX)/dt;
      p.velocityZ=(p.z-p.tickZ)/dt;
    }
    this.updateBullets();
    for(const grenade of this.grenades){
      grenade.fuse-=dt;grenade.vy-=14*dt;
      const delta={x:grenade.vx*dt,y:(grenade.vy+7*dt)*dt,z:grenade.vz*dt},length=Math.hypot(delta.x,delta.y,delta.z);
      const direction=length>0?{x:delta.x/length,y:delta.y/length,z:delta.z/length}:{x:0,y:0,z:0};
      let nearest=length,hit=null;
      for(const box of this.grenadeColliders){const distance=rayBox(grenade,direction,box,length);if(distance<nearest){nearest=distance;hit=box;}}
      if(hit?.parts){
        const asset=hit;
        let closest=length;
        for(const part of asset.parts){
          const distance=rayBox(grenade,direction,part,closest);
          if(distance<closest){closest=distance;hit=part;}
        }
      }
      if(hit){
        const travel=Math.max(0,nearest-.02);grenade.x+=direction.x*travel;grenade.y+=direction.y*travel;grenade.z+=direction.z*travel;
        if(hit.obb){
          const normal=colliderNormal(hit,grenade),speed=grenade.vx*normal.x+grenade.vy*normal.y+grenade.vz*normal.z;
          if(speed<0){grenade.vx-=1.35*speed*normal.x;grenade.vy-=1.35*speed*normal.y;grenade.vz-=1.35*speed*normal.z;}
        }else{
          const faces=[['x',Math.abs(Math.abs(grenade.x-hit.x)-hit.w/2)],['z',Math.abs(Math.abs(grenade.z-hit.z)-hit.d/2)],['y',Math.min(Math.abs(grenade.y-hit.h),Math.abs(grenade.y-hit.minY))]];
          const axis=faces.sort((a,b)=>a[1]-b[1])[0][0];grenade[`v${axis}`]*=-.35;
        }
      }else if(this.collides(grenade.x+delta.x,grenade.z+delta.z,grenade.y+delta.y-.12,.12,.24)){grenade.vx*=-.35;grenade.vz*=-.35;}
      else{grenade.x+=delta.x;grenade.y+=delta.y;grenade.z+=delta.z;}
      const ground=this.groundAt(grenade.x,grenade.z)+.15;
      if(grenade.y<ground){grenade.y=ground;grenade.vy=Math.abs(grenade.vy)*.3;grenade.vx*=.92;grenade.vz*=.92;}
      if(grenade.fuse<=0)blast(this,{x:grenade.x,y:grenade.y,z:grenade.z},this.players.get(grenade.owner),'grenade',null,grenade.team);
    }
    this.grenades=this.grenades.filter(g=>g.fuse>0);
    for(const point of this.points){
      const nearby=[0,0];for(const p of this.players.values())if(p.alive&&dist(p,point)<CAPTURE_RADIUS)nearby[p.team]++;
      point.contested=nearby[0]>0&&nearby[1]>0;
      const advantage=nearby[0]-nearby[1];
      if(advantage&&!point.contested){
        const prevOwner=point.owner;
        const capTeam=advantage>0?0:1;
        const direction=advantage>0?-1:1;
        point.progress=clamp(point.progress+direction*dt*CAPTURE_RATE*Math.min(2,Math.abs(advantage)),-1,1);
        if((prevOwner===0&&point.progress>=0)||(prevOwner===1&&point.progress<=0)){
          point.owner=-1;
          for(const p of this.players.values()){
            if(p.alive&&p.team===capTeam&&dist(p,point)<CAPTURE_RADIUS){
              this.awardScore(p,75,`НЕЙТРАЛИЗАЦИЯ ТОЧКИ ${point.id}`,{kind:'neutralize',pointId:point.id});
            }
          }
        }
        const owner=point.progress<=-1?0:point.progress>=1?1:point.owner;
        if(owner!==point.owner&&(owner===0||owner===1)){
          point.owner=owner;
          this.event('capture',{pointId:point.id,team:owner});
          for(const p of this.players.values()){
            if(p.alive&&p.team===owner&&dist(p,point)<CAPTURE_RADIUS){
              this.awardScore(p,150,`ЗАХВАТ ТОЧКИ ${point.id}`,{kind:'capture',pointId:point.id});
            }
          }
        }
      }
      if(point.owner===0&&point.progress>=0)point.owner=-1;
      if(point.owner===1&&point.progress<=0)point.owner=-1;
      point.spawnBlocked=point.owner!==-1&&nearby[1-point.owner]>0;
    }
    this.ticketClock+=dt;if(this.ticketClock>=1){this.ticketClock-=1;const held=[this.points.filter(p=>p.owner===0).length,this.points.filter(p=>p.owner===1).length];if(held[0]>held[1])this.tickets[1]=Math.max(0,this.tickets[1]-(held[0]-held[1]));if(held[1]>held[0])this.tickets[0]=Math.max(0,this.tickets[0]-(held[1]-held[0]));}
    if(this.tickets[0]<=0||this.tickets[1]<=0){this.winner=this.tickets[0]<=0?1:0;this.event('roundEnd',{winner:this.winner,reason:'tickets'});}
    else if(this.time>=960){const held=[this.points.filter(p=>p.owner===0).length,this.points.filter(p=>p.owner===1).length];this.winner=this.tickets[0]===this.tickets[1]?(held[0]>=held[1]?0:1):(this.tickets[0]>this.tickets[1]?0:1);this.event('roundEnd',{winner:this.winner,reason:'time'});}
  }
  snapshot(){
    const players=[...this.players.values()].map(p=>{
      const wep=getWeapon(p.classId,p.weaponId);
      return {
        id:p.id,name:p.name,team:p.team,classId:p.classId,weaponId:p.weaponId||wep.id,primaryWeaponId:p.primaryWeaponId,sidearmId:p.sidearmId,weaponSlot:p.weaponSlot,equipTime:p.equipTime,x:p.x,y:p.y,z:p.z,yaw:p.yaw,pitch:p.pitch,
        hp:p.hp,alive:p.alive,ammo:p.ammo,reserve:p.reserve,kills:p.kills,deaths:p.deaths,assists:p.assists||0,score:p.score||0,respawnIn:p.respawnIn,
        reloading:p.reloading,reloadProgress:p.reloading?clamp(1-p.reloadTime/wep.reload,0,1):0,
        shotSeq:p.shotSeq,spread:weaponSpread(p),crouch:crouching(p),sliding:!p.vehicleId&&p.slideTime>0,
        slideYaw:p.slideTime>0?Math.atan2(-p.slideVx,-p.slideVz):p.yaw,sprint:!p.vehicleId&&!crouching(p)&&p.input.sprint&&p.moveSpeed>wep.speed,
        aim:p.input.aim,grounded:p.grounded,bot:p.bot,protected:this.time<p.invulnerableUntil,
        gadgetCooldown:p.gadgetTime,secondaryCooldown:p.secondaryCooldown,rockets:p.rockets,heldGadget:p.heldGadget,
        gadgetAction:p.gadgetAction,gadgetActionRemaining:Math.max(0,(p.gadgetActionUntil??0)-this.time),gadgetTargetId:p.gadgetTargetId,
        grenades:p.grenades,spotted:p.spottedUntil>this.time,
        vehicleId:p.vehicleId,vehicleSeat:p.vehicleSeat,
        networkActive:p.alive&&(!p.grounded||this.time-(p.lastShotAt??-10)<.5),vy:p.vy,velocityX:p.velocityX,velocityZ:p.velocityZ,moveSpeed:p.moveSpeed,
        slideTime:p.slideTime,slideCooldown:p.slideCooldown,slideVx:p.slideVx,slideVz:p.slideVz,
        controlFlags:(p.jumpHeld?1:0)|(p.crouchHeld?2:0)|(p.wasSprinting?4:0),
      };
    });
    return {
      ...(this.debugBots?{aiDebug:botDebugSnapshot(this)}:{}),
      time:this.time,mapId:this.map.id,roundDuration:960,maxTickets:this.maxTickets,difficulty:this.difficulty,tickets:[...this.tickets],players,
      points:this.points.map(p=>({...p})),events:this.events.map(e=>({...e})),
      vehicles:this.vehicles.map(({home,gunCooldown,...v})=>({...v,seats:[...v.seats]})),
      deployables:this.deployables.map(item=>({...item})),
      rockets:this.rockets.map(rocket=>({...rocket})),
      grenades:this.grenades.map(g=>({id:g.id,x:g.x,y:g.y,z:g.z,team:g.team,ownerId:g.owner,fuse:g.fuse,yaw:g.yaw||0})),winner:this.winner,
    };
  }
}

function initializeCollisionWorld(world){
    world.colliders=getAssetColliders(world.map);
    world.hasRotatedGeometry=world.colliders.some(box=>box.obb||box.parts);
    world.stepHeight=world.map.stepHeight??(world.hasRotatedGeometry ? .3 : 0);
    // Static broad phase: movement queries touch nearby cells, not every
    // warehouse/container on the map for every actor and axis each tick.
    world.collisionCell=16;
    world.collisionSize=Math.ceil(world.map.size/world.collisionCell);
    world.collisionBins=Array.from({length:world.collisionSize**2},()=>[]);
    const bin=value=>Math.max(0,Math.min(world.collisionSize-1,Math.floor((value+world.map.size/2)/world.collisionCell)));
    for(const box of world.colliders)for(let z=bin(box.minZ);z<=bin(box.maxZ);z++)
      for(let x=bin(box.minX);x<=bin(box.maxX);x++)world.collisionBins[z*world.collisionSize+x].push(box);
    world.colliders.forEach((box,index)=>{box.collisionIndex=index;});
    world.rayCandidates=[];
    world.rayVisited=new Uint32Array(world.colliders.length);
    world.rayVisit=0;
    world.grenadeColliders=world.colliders.map(box=>expandCollider(box,.12));
  world.floorCandidates=[];world.floorVisited=new Uint32Array(world.colliders.length);world.floorVisit=0;
}
// Collision-only view: no bots, pathfinding grid, combat, or match simulation on clients.
export function createPredictionWorld(mapId){
  const world=Object.create(Simulation.prototype);world.map=getMap(mapId);world.vehicles=[];
  initializeCollisionWorld(world);return world;
}
