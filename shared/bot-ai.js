import { aimBullet } from './ballistics.js';
import { getWeapon, EYE_HEIGHT, CAPTURE_RADIUS } from './world.js';
import { thinkVehicleBot } from './vehicle-ai.js';
import { thinkEquipment, liveBeacons } from './gadgets.js';
import { findCover, moveBot, elevatedSpots } from './bot-navigation.js';
import { rayVehicleArmor } from './vehicle-combat.js';
import {SQUAD_NAMES,aimedSquadPoint} from './squads.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const angle=v=>Math.atan2(Math.sin(v),Math.cos(v));
const eye=p=>({x:p.x,y:p.y+(p.input?.crouch?1.05:EYE_HEIGHT),z:p.z});
const reset=p=>Object.assign(p.input,{forward:0,strafe:0,sprint:false,crouch:false,jump:false,fire:false,aim:false,reload:false,
  gadget:false,secondaryGadget:false,grenade:false,weaponSlot:0,toolSlot:0,horn:false,yaw:p.yaw,pitch:p.pitch});
function state(sim,p){
  return p.ai??=( {mode:'advance',contact:null,memory:null,observations:new Map(),senseAt:sim.time+(p.botSlot%6)*.025,
    decideAt:0,goal:null,cover:null,pressure:0,pressureAt:-100,peekSide:p.botSlot%2?1:-1,
    aggression:.65+sim.random()*.7,caution:(sim.difficulty==='veteran'?1.3:sim.difficulty==='recruit'?.7:1)*(.85+sim.random()*.3),skill:.85+sim.random()*.3,pathUntil:0} );
}
function sight(sim,from,to){
  if(!sim.lineClear(from,to))return false;
  const length=Math.hypot(to.x-from.x,to.y-from.y,to.z-from.z);if(length<.05)return true;
  const direction={x:(to.x-from.x)/length,y:(to.y-from.y)/length,z:(to.z-from.z)/length};
  return !sim.vehicles.some(v=>(v.hp>0||v.wreckTime>0)&&rayVehicleArmor(from,direction,v,length-.1)<length-.1);
}

export function updateBotTeams(sim){
  sim.botTeams??=[{contacts:new Map(),squads:[],members:[]},{contacts:new Map(),squads:[],members:[]}];
  if(sim.time>=(sim.botTeamAt??0)){
    sim.botTeamAt=sim.time+1.3;
    for(let team=0;team<2;team++){
      const board=sim.botTeams[team],members=[...sim.players.values()].filter(p=>p.team===team);
      board.members=members;
      const groups=SQUAD_NAMES.map((_,i)=>members.filter(p=>p.squadId===i+1)).filter(group=>group.length);
      const old=board.squads,assigned=new Map();board.squads=[];
      for(const group of groups){
        const id=team+'/'+group[0].squadId,prior=old.find(s=>s.id===id),leader=group.find(p=>p.squadLeader)??group[0];
        const squad={id,members:group,leader,order:sim.squadOrders?.get(id)};
        if(squad.order&&squad.order.until<sim.time)squad.order=null;
        let best=null,score=Infinity;
        const owned=sim.points.filter(point=>point.owner===team).length,majority=owned>sim.points.length/2;
        for(const point of sim.points){
          const defenders=members.filter(p=>p.alive&&distance(p,point)<CAPTURE_RADIUS).length;
          const known=[...board.contacts.values()].filter(c=>sim.time-c.at<5&&distance(c,point)<24).length;
          const preserve=point.id===prior?.objective?.id?-28:0;
          const pressure=point.contested?-150:known?-35:0;
          const value=distance(leader,point)+(point.owner===team?(majority?-35:150):0)+pressure+
            (assigned.get(point.id)??0)*90+preserve+(point.owner===team?defenders*9:0)+(known>group.length?35:0);
          if(value<score){score=value;best=point;}
        }
        squad.objective=squad.order?.pointId?sim.points.find(point=>point.id===squad.order.pointId):best;
        if(squad.objective)assigned.set(squad.objective.id,(assigned.get(squad.objective.id)??0)+1);
        board.squads.push(squad);
        group.forEach((p,i)=>{if(!p.bot)return;const ai=state(sim,p);
          if(ai.squad?.objective?.id!==squad.objective?.id||ai.squad?.id!==squad.id){ai.goalUntil=0;ai.decideAt=0;}
          ai.squad=squad;ai.squadSlot=i;ai.role=p.classId==='medic'?'medic':p.classId==='support'?'anchor':p.classId==='recon'?'overwatch':p.botSlot%7===0?'hunter':i%3===2?'flanker':'assault';});
      }
      for(const [id,contact] of board.contacts)if(sim.time-contact.at>9)board.contacts.delete(id);
    }
  }
  for(const p of sim.players.values()){
    if(p.bot||!p.alive)continue;
    const command=p.input.order;
    if(command&&!p.botCommandHeld&&sim.time>=(p.nextSquadCommandAt??0)){
      const squad=sim.botTeams[p.team].squads.find(s=>s.members.includes(p));
      if(squad&&p.squadLeader){
        const point=aimedSquadPoint(sim,p);p.nextSquadCommandAt=sim.time+.3;
        squad.order={kind:point?(point.owner===p.team?'defend':'attack'):'follow',pointId:point?.id??null,playerId:p.id,until:Infinity};
        sim.squadOrders??=new Map();sim.squadOrders.set(squad.id,squad.order);
        if(point)squad.objective=point;
        for(const ally of squad.members)if(ally.bot){const ai=state(sim,ally);ai.decideAt=0;ai.pathUntil=0;ai.repathAt=0;ai.pathJob=null;ai.pathResult=null;ai.pathGoal=null;ai.pathJobGoal=null;ai.goalUntil=0;ai.goal=null;ai.cover=null;ai.flankDestination=null;ally.botPath=[];ally.nextThink=0;ally.botJourney=null;ally.botBoarding=null;ally.botRideOrder=null;}
        sim.event('squadOrder',{playerId:p.id,kind:squad.order.kind,pointId:squad.order.pointId});
      }
    }
    p.botCommandHeld=Boolean(command);
  }
}

function sense(sim,p){
  const ai=p.ai,weapon=getWeapon(p.classId,p.weaponId),settings=sim.botSettings;
  if(sim.time<ai.senseAt)return;
  ai.senseAt=sim.time+(sim.difficulty==='veteran'?.12:sim.difficulty==='recruit'?.24:.18)+(p.botSlot%3)*.007;
  const origin=eye(p),range=p.classId==='recon'?Math.min(weapon.range,settings.awareness*2.25):settings.awareness;
  let selected=null,best=Infinity;
  for(const other of sim.players.values()){
    if(!other.alive||other.team===p.team||other.invulnerableUntil>sim.time)continue;
    const d=distance(p,other);if(d>range)continue;
    const bearing=Math.atan2(-(other.x-p.x),-(other.z-p.z));
    if(d>6&&Math.abs(angle(bearing-p.yaw))>1.35&&other.id!==ai.contact?.id)continue;
    const heights=other.vehicleId?[EYE_HEIGHT-.35,EYE_HEIGHT-.03]:other.input.crouch?[.7,1.05]:[1.05,1.58];let height=null;
    for(const h of heights)if(sight(sim,origin,{x:other.x,y:other.y+h,z:other.z})){height=h;break;}
    if(height===null)continue;
    const previous=ai.observations.get(other.id),elapsed=previous?sim.time-previous.at:0;
    const velocityX=elapsed>.03?clamp((other.x-previous.x)/elapsed,-12,12)*.65+(previous.velocityX??0)*.35:0;
    const velocityZ=elapsed>.03?clamp((other.z-previous.z)/elapsed,-12,12)*.65+(previous.velocityZ??0)*.35:0;
    const observed={id:other.id,x:other.x,y:other.y,z:other.z,height,velocityX,velocityZ,at:sim.time,kind:'player',confidence:1};
    ai.observations.set(other.id,observed);sim.botTeams[p.team].contacts.set(other.id,observed);
    const score=d-(other.id===ai.contact?.id?12:0)-(other.id===ai.attackerId?15:0)-(sim.time-other.lastShotAt<.5?10:0);
    if(score<best){best=score;selected=observed;}
  }
  if(!selected||distance(p,selected)>20)for(const item of sim.deployables){
    if(item.kind!=='beacon'||item.hp<=0||item.team===p.team||distance(p,item)>range||Math.abs(angle(Math.atan2(-(item.x-p.x),-(item.z-p.z))-p.yaw))>1.1)continue;
    if(sight(sim,origin,{x:item.x,y:item.y+.4,z:item.z})&&distance(p,item)+30<best){best=distance(p,item)+30;selected={id:item.id,x:item.x,y:item.y,z:item.z,height:.4,velocityX:0,velocityZ:0,at:sim.time,kind:'equipment',confidence:1};}
  }
  if(selected){
    if(!Number.isFinite(ai.reactAt)||selected.id!==ai.contact?.id&&(selected.id!==ai.memory?.id||ai.memory.confidence<1)){
      ai.reactAt=sim.time+(settings.reaction+sim.random()*settings.reactionVariance)/ai.skill;ai.burstAt=ai.reactAt;
    }
    ai.contact=selected;ai.memory={...selected};
  }else{
    ai.contact=null;
    for(const event of sim.events){
      if(event.time<sim.time-.35||event.time<=(ai.heardAt??-1)||!['shot','explosion','grenade'].includes(event.type))continue;
      if(event.playerId&&sim.players.get(event.playerId)?.team===p.team)continue;
      const audible=event.type==='explosion'?85:event.weaponId==='vk45'?22:55;
      if(distance(p,event)>audible||ai.memory&&ai.memory.at>event.time)continue;
      const uncertainty=3+distance(p,event)*.06;
      ai.memory={x:event.x+(sim.random()-.5)*uncertainty,y:event.y??0,z:event.z+(sim.random()-.5)*uncertainty,at:event.time,kind:'sound',confidence:.45};ai.heardAt=event.time;
    }
    if(!ai.memory||sim.time-ai.memory.at>2){
      const shared=[...sim.botTeams[p.team].contacts.values()].filter(c=>sim.time-c.at>.5&&sim.time-c.at<5&&distance(c,p)<80).sort((a,b)=>b.at-a.at)[0];
      if(shared&&(!ai.memory||shared.at>ai.memory.at))ai.memory={...shared,x:shared.x+(sim.random()-.5)*3,z:shared.z+(sim.random()-.5)*3,confidence:.65};
    }
    if(!ai.memory||sim.time-ai.memory.at>3)for(const other of sim.players.values()){
      if(!other.alive||other.team===p.team||other.vehicleId||other.moveSpeed<2)continue;
      if(distance(p,other)>(other.input.sprint?14:7))continue;
      ai.memory={x:other.x+(sim.random()-.5)*2,y:other.y,z:other.z+(sim.random()-.5)*2,at:sim.time,kind:'footsteps',confidence:.45};break;
    }
  }
  if(ai.memory&&sim.time-ai.memory.at>8)ai.memory=null;
  for(const [id,observation] of ai.observations)if(sim.time-observation.at>8)ai.observations.delete(id);
}

function weaponProfile(p){
  const w=getWeapon(p.classId,p.weaponId);
  if(w.sidearm)return {near:5,far:18,burst:.24,pause:.35};
  if(p.weaponId==='sv98')return {near:42,far:95,burst:.12,pause:.85};
  if(p.classId==='recon')return {near:30,far:65,burst:.12,pause:.48};
  if(p.classId==='support')return {near:20,far:48,burst:.95,pause:.45};
  if(p.classId==='medic')return {near:8,far:23,burst:.52,pause:.30};
  return {near:14,far:40,burst:.36,pause:.42};
}

function aim(sim,p,target,dt){
  const ai=p.ai,profile=weaponProfile(p),w=getWeapon(p.classId,p.weaponId);
  const predicted={...target,x:target.x+target.velocityX*Math.min(.22,sim.time-target.at),z:target.z+target.velocityZ*Math.min(.22,sim.time-target.at)};
  const solution=aimBullet(eye(p),predicted,target.height??1.05,w.projectileSpeed);
  const d=distance(p,target),error=sim.botSettings.aimError*(.5+d/100)/ai.skill*(1+ai.pressure*.8+(p.moveSpeed>3?.4:0));
  const phase=sim.time*(1.3+ai.skill*.25)+p.botSlot*1.77;
  const yaw=solution.yaw+(Math.sin(phase)+Math.sin(phase*2.71)*.22)*error;
  const pitch=solution.pitch+Math.sin(phase*1.37+.8)*error*.55;
  p.input.yaw=p.yaw+clamp(angle(yaw-p.yaw),-sim.botSettings.turnSpeed*dt,sim.botSettings.turnSpeed*dt);
  p.input.pitch=p.pitch+clamp(pitch-p.pitch,-dt*1.9,dt*1.9);p.input.aim=d>8;
  const precision=d<9?.15:w.semi?.035:.065;
  const cycle=profile.burst+profile.pause*(sim.difficulty==='recruit'?1.5:sim.difficulty==='veteran'?.8:1);
  const clear=sight(sim,eye(p),{x:target.x,y:target.y+(target.height??1.05),z:target.z});
  p.input.fire=sim.time>=(ai.reactAt??sim.time)&&((sim.time-(ai.burstAt??0))%cycle)<profile.burst&&
    Math.abs(angle(yaw-p.input.yaw))<precision&&Math.abs(pitch-p.input.pitch)<precision&&clear;
  // Do not fire through a teammate even though friendly damage is disabled.
  if(p.input.fire)for(const ally of sim.players.values()){
    if(!ally.alive||ally.team!==p.team||ally===p||ally.vehicleId)continue;
    const ax=ally.x-p.x,az=ally.z-p.z,t=(ax*(target.x-p.x)+az*(target.z-p.z))/Math.max(.01,d*d);
    if(t>0&&t<1&&Math.hypot(ax-(target.x-p.x)*t,az-(target.z-p.z)*t)<.5&&Math.abs(ally.y-p.y)<1){p.input.fire=false;break;}
  }
}

function objectiveGoal(sim,p){
  const ai=p.ai,squad=ai.squad,order=squad?.order;
  if(order?.kind==='follow'){
    const leader=sim.players.get(order.playerId);
    if(leader){const side=ai.squadSlot%2?1:-1;return {x:leader.x+Math.cos(leader.yaw)*side*3+Math.sin(leader.yaw)*4,y:leader.y,z:leader.z-Math.sin(leader.yaw)*side*3+Math.cos(leader.yaw)*4};}
  }
  const point=squad?.objective??sim.points[0];if(!point)return null;
  p.botObjective=point;
  if(order?.pointId){
    for(let n=0;n<12;n++){
      const bearing=(ai.squadSlot+n*.31)*2.399,radius=CAPTURE_RADIUS*(order.kind==='defend'?.55:.3)*(1-n/16);
      const x=point.x+Math.cos(bearing)*radius,z=point.z+Math.sin(bearing)*radius,y=sim.groundAt(x,z);
      if(!sim.collides(x,z,y+.025))return {x,y,z};
    }
    return {x:point.x,y:sim.groundAt(point.x,point.z),z:point.z};
  }
  const leader=squad?.leader;
  if(!order&&ai.role==='medic'&&leader?.alive&&leader!==p&&!leader.vehicleId&&distance(p,leader)>7&&distance(p,leader)<45&&distance(p,point)>CAPTURE_RADIUS){
    const side=ai.peekSide;
    return {x:leader.x+Math.sin(leader.yaw)*3+Math.cos(leader.yaw)*side*2,y:leader.y,z:leader.z+Math.cos(leader.yaw)*3-Math.sin(leader.yaw)*side*2};
  }
  if(!order&&ai.role==='hunter'){
    const contact=[...sim.botTeams[p.team].contacts.values()].filter(c=>sim.time-c.at<6&&distance(c,p)<85).sort((a,b)=>distance(a,p)-distance(b,p))[0];
    if(contact)return {x:contact.x,y:contact.y,z:contact.z};
  }
  if(ai.role==='overwatch'&&sim.random()<.55){
    const elevated=elevatedSpots(sim,p,point).filter(n=>distance(n,point)<CAPTURE_RADIUS+12&&
      sim.lineClear({x:n.x,y:n.y+1.2,z:n.z},{x:point.x,y:sim.groundAt(point.x,point.z)+1,z:point.z}));
    if(elevated.length)return {...elevated[Math.floor(sim.random()*elevated.length)]};
  }
  if(point.contested&&distance(p,point)<CAPTURE_RADIUS+4&&ai.role!=='anchor'){
    const seen=[...sim.botTeams[p.team].contacts.values()].filter(c=>sim.time-c.at<5&&distance(c,point)<CAPTURE_RADIUS+5)[0];
    if(seen)return {x:seen.x,y:seen.y,z:seen.z};
    const a=p.botSlot*2.4+sim.time*.2,r=CAPTURE_RADIUS*.6;
    const search={x:point.x+Math.cos(a)*r,z:point.z+Math.sin(a)*r};
    if(!sim.collides(search.x,search.z))return search;
  }
  const enemyBase=sim.map.spawns[1-p.team],defending=point.owner===p.team||order?.kind==='defend';
  if(defending){const cover=findCover(sim,p,{...enemyBase,y:sim.groundAt(enemyBase.x,enemyBase.z)},{fire:true});
    if(cover&&distance(cover,point)<CAPTURE_RADIUS-1)return cover;}
  const spot=sim.pickObjectiveSpot(p,point);
  if(ai.role==='flanker'&&distance(p,point)>27){
    const dx=point.x-p.x,dz=point.z-p.z,l=Math.max(1,Math.hypot(dx,dz)),side=ai.peekSide;
    const flank={x:(p.x+point.x)/2-dz/l*side*12,z:(p.z+point.z)/2+dx/l*side*12};
    if(!sim.collides(flank.x,flank.z)){ai.flankDestination={...spot};return flank;}
  }
  return {...spot,y:sim.groundAt(spot.x,spot.z)};
}

function decide(sim,p){
  const ai=p.ai,target=ai.contact,threat=target??ai.memory;
  ai.decideAt=sim.time+(sim.difficulty==='recruit'?.38:sim.difficulty==='veteran'?.18:.25)+(p.botSlot%4)*.025;
  if(ai.squad?.order){
    ai.cover=null;ai.flankDestination=null;ai.mode='squad-order';
    if(!ai.goal||sim.time>=(ai.goalUntil??0)||ai.squad.order.kind==='follow'){ai.goal=objectiveGoal(sim,p);ai.goalUntil=sim.time+1;}
    p.botGoal=ai.goal;return;
  }
  if(ai.cover&&sim.time>(ai.coverUntil??0)){ai.lastCover=ai.cover;ai.cover=null;ai.peekSide*=-1;}
  if(threat&&(p.hp<45*ai.caution||ai.pressure>.5/ai.caution||target&&distance(p,target)>18)&&!ai.cover&&sim.time>=(ai.coverSearchAt??0)){
    ai.coverSearchAt=sim.time+1.4/ai.caution;
    ai.cover=findCover(sim,p,threat,{retreat:p.hp<45,fire:p.hp>=45});ai.coverUntil=sim.time+5+sim.random()*4;
    if(ai.cover){ai.mode=p.hp<45?'retreat':'cover';ai.goal=ai.cover;ai.peekAt=sim.time+.5+sim.random();}
  }
  if(p.hp<65||p.reserve<getWeapon(p.classId,p.weaponId).reserve*.2){
    const kind=p.hp<65?'medkit':'ammo';
    const supply=sim.deployables.filter(item=>item.kind===kind&&item.team===p.team&&item.hp>0&&item.expires>sim.time&&distance(p,item)<35)
      .sort((a,b)=>distance(p,a)-distance(p,b))[0];
    if(supply&&(!target||distance(p,target)>18)&&ai.pressure<.65){ai.mode='recover';ai.goal={x:supply.x+1.6,y:supply.y,z:supply.z};return;}
  }
  if(ai.cover){ai.mode=p.hp<45?'retreat':'cover';return;}
  if(target){
    ai.mode='combat';const profile=weaponProfile(p),d=distance(p,target);
    if(d>profile.far){const a=Math.atan2(p.z-target.z,p.x-target.x);ai.goal={x:target.x+Math.cos(a)*profile.far*.7,z:target.z+Math.sin(a)*profile.far*.7};}
    else if(d<profile.near&&p.classId==='recon'){
      const a=Math.atan2(p.z-target.z,p.x-target.x);ai.goal={x:p.x+Math.cos(a)*8,z:p.z+Math.sin(a)*8};
    }else ai.goal=null;
    return;
  }
  if(ai.memory&&sim.time-ai.memory.at<5&&ai.aggression>.8&&(!p.botObjective||distance(p,p.botObjective)<40)){
    ai.mode='search';ai.goal={x:ai.memory.x,y:ai.memory.y,z:ai.memory.z};return;
  }
  ai.mode='advance';
  if(ai.flankDestination&&ai.goal&&distance(p,ai.goal)<2){ai.goal=ai.flankDestination;ai.flankDestination=null;ai.goalUntil=sim.time+7;}
  else if(!ai.goal||sim.time>(ai.goalUntil??0)||distance(p,ai.goal)<1){ai.goal=objectiveGoal(sim,p);ai.goalUntil=sim.time+5+sim.random()*3;}
  p.botGoal=ai.goal;
}

function equipment(sim,p,dt){
  const ai=p.ai,contact=ai.contact;
  if(p.pendingGadget)return thinkEquipment(sim,p,dt);
  if(ai.pressure>.6||sim.time-p.lastHurt<1||contact&&distance(p,contact)<20)return false;
  if(thinkEquipment(sim,p,dt)){ai.mode=p.botJob?.kind??'support';return true;}
  if(p.classId==='medic'&&p.secondaryCooldown<=0&&(!contact||ai.cover)){
    const need=[...sim.players.values()].some(ally=>ally.alive&&ally.team===p.team&&ally.hp<75&&distance(ally,p)<5);
    const existing=sim.deployables.some(item=>item.kind==='medkit'&&item.team===p.team&&item.hp>0&&distance(item,p)<7);
    if(need&&!existing){p.input.secondaryGadget=true;ai.mode='heal';p.input.fire=false;return true;}
  }
  if(p.classId==='assault'&&p.gadgetTime<=0&&(!contact||ai.cover)){
    const need=[...sim.players.values()].some(ally=>ally.alive&&ally.team===p.team&&ally.reserve<getWeapon(ally.classId,ally.weaponId).reserve*.4&&distance(ally,p)<6);
    const existing=sim.deployables.some(item=>item.kind==='ammo'&&item.team===p.team&&item.hp>0&&distance(item,p)<7);
    if(need&&!existing){p.input.gadget=true;p.input.fire=false;ai.mode='resupply';return true;}
  }
  if(p.classId==='recon'&&p.gadgetTime<=0&&!contact&&distance(p,sim.map.spawns[p.team])>35&&!liveBeacons(sim,p.team).some(b=>b.ownerId===p.id)){
    const point=p.botObjective;
    if(point&&distance(p,point)<40){
      const base=sim.map.spawns[1-p.team];
      if(sim.time>(ai.beaconSearchAt??0)){ai.beaconSearchAt=sim.time+2;ai.beaconCover=findCover(sim,p,{...base,y:sim.groundAt(base.x,base.z)});}
      const hidden=ai.beaconCover;
      if(hidden&&distance(p,hidden)>1){ai.mode='place-beacon';moveBot(sim,p,hidden,dt,{sprint:false});return true;}
      if(hidden){p.input.gadget=true;return true;}
    }
  }
  return false;
}

export function thinkInfantryBot(sim,p,dt){
  if(!p.alive)return;
  const ai=state(sim,p);reset(p);ai.pressure=Math.max(0,1-(sim.time-ai.pressureAt)/1.7);
  // A horn reservation overrides ordinary errands, but not an active revive.
  if((p.vehicleId||p.botBoarding&&p.botRideOrder)&&thinkVehicleBot(sim,p,dt)){ai.mode=p.vehicleSeat===0?'drive':'ride';return;}
  sense(sim,p);
  let grenade=null;
  for(const g of sim.grenades)if(g.fuse<1.25&&distance(p,g)<(sim.difficulty==='veteran'?9:sim.difficulty==='recruit'?5.5:7)&&(g.team!==p.team||g.owner===p.id)&&
    (distance(p,g)<2.5||sim.lineClear(eye(p),{x:g.x,y:g.y+.1,z:g.z}))){grenade=g;break;}
  if(grenade){
    if(ai.grenadeThreat!==grenade.id){ai.grenadeThreat=grenade.id;ai.evadeAt=sim.time+sim.botSettings.reaction*.35;}
  }
  if(grenade&&sim.time>=ai.evadeAt){
    ai.mode='evade-grenade';const d=Math.max(.1,distance(p,grenade));
    p.pendingGadget=null;p.gadgetAction=null;
    moveBot(sim,p,{x:p.x+(p.x-grenade.x)/d*9,z:p.z+(p.z-grenade.z)/d*9},dt,{sprint:true});return;
  }
  if(p.gadgetAction&&p.gadgetAction!=='repair'){ai.mode='use-equipment';return;}
  if(sim.time>=ai.decideAt)decide(sim,p);
  if(ai.squad?.order){
    const target=ai.contact;if(target)aim(sim,p,target,dt);
    if(ai.goal)moveBot(sim,p,ai.goal,dt,{sprint:!target,look:!target});
    if(p.ammo===0){p.input.reload=true;p.input.fire=false;}
    return;
  }
  if(equipment(sim,p,dt))return;
  if(!ai.squad?.order&&!ai.contact&&ai.pressure<.25&&thinkVehicleBot(sim,p,dt)){ai.mode='board';return;}
  const target=ai.contact;
  if(target){
    aim(sim,p,target,dt);
    if(ai.cover){
      const hiding=p.hp<45||ai.pressure>.7||p.reloading;
      if(sim.time>(ai.peekAt??0)){
        ai.peeking=!ai.peeking&&!hiding;ai.peekAt=sim.time+(ai.peeking?.6+sim.random()*.6:.8+sim.random()*1.1);
      }
      const goal=ai.peeking&&ai.cover.peek&&!hiding?ai.cover.peek:ai.cover;
      moveBot(sim,p,goal,dt,{sprint:false,look:false,cautious:true});
      if(goal===ai.cover){p.input.crouch=true;p.input.fire=false;}
    }else if(ai.goal)moveBot(sim,p,ai.goal,dt,{sprint:false,look:false});
    else if(sim.time>(ai.strafeAt??0)){ai.strafeAt=sim.time+.7+sim.random();ai.strafe=sim.random()<.5?-1:1;}
    if(!ai.cover&&!ai.goal){
      const x=p.x+Math.cos(p.yaw)*ai.strafe*.8,z=p.z-Math.sin(p.yaw)*ai.strafe*.8;
      if(!sim.collides(x,z,p.y+.1))p.input.strafe=ai.strafe*.3;
    }
    if(p.ammo===0&&p.weaponSlot===1&&distance(p,target)<15&&p.stowedAmmo.ammo>0){p.input.weaponSlot=2;p.input.fire=false;}
    else if(p.ammo===0){p.input.reload=true;p.input.fire=false;}
    if(p.grenades>0&&sim.time>(ai.grenadeAt??0)&&target.kind==='player'&&distance(p,target)>12&&distance(p,target)<25&&sim.time>=(ai.reactAt??Infinity)+.7){
      const allies=[...sim.players.values()].some(a=>a.alive&&a.team===p.team&&distance(a,target)<6);
      if(!allies&&Math.abs(angle(p.yaw-Math.atan2(-(target.x-p.x),-(target.z-p.z))))<.15){p.input.grenade=true;p.input.fire=false;ai.grenadeAt=sim.time+12+sim.random()*8;}
    }
  }else{
    if(p.weaponSlot===2&&(p.stowedAmmo.ammo+p.stowedAmmo.reserve)>0)p.input.weaponSlot=1;
    if(ai.goal)moveBot(sim,p,ai.goal,dt,{sprint:ai.mode==='advance'||ai.mode==='retreat',cautious:ai.mode==='search'});
    if(ai.mode==='recover'&&ai.goal&&distance(p,ai.goal)<3){p.input.forward=p.input.strafe=0;p.input.crouch=true;}
    if(ai.cover&&distance(p,ai.cover)<1&&(p.hp<65||ai.pressure>.3))p.input.crouch=true;
    if(ai.memory){const wanted=Math.atan2(-(ai.memory.x-p.x),-(ai.memory.z-p.z))+(distance(p,ai.memory)<3?Math.sin((sim.time-ai.memory.at)*1.8)*.7:0);
      p.input.yaw=p.yaw+clamp(angle(wanted-p.yaw),-dt*sim.botSettings.turnSpeed,dt*sim.botSettings.turnSpeed);}
    else if(ai.goal&&distance(p,ai.goal)<1){p.input.yaw=p.yaw+Math.sin(sim.time*.7+p.botSlot)*dt*.35;p.input.crouch=ai.role==='overwatch'||ai.role==='anchor';}
    if(p.ammo<getWeapon(p.classId,p.weaponId).mag*.45&&p.reserve>0)p.input.reload=true;
    if(ai.role==='anchor'&&ai.memory&&sim.time-ai.memory.at<1.8&&ai.pressure<.5&&p.ammo>15&&!p.reloading){
      aim(sim,p,{...ai.memory,height:ai.memory.height??1.05,velocityX:0,velocityZ:0},dt);ai.mode='suppress';p.input.sprint=false;
    }
  }
  if(p.hp<45&&p.classId==='medic'&&p.secondaryCooldown<=0&&!target){p.input.secondaryGadget=true;p.input.fire=false;}
}

export function rememberBotDamage(sim,p,attacker){
  if(!p.bot)return;const ai=state(sim,p);ai.pressureAt=sim.time;ai.attackerId=attacker?.id;
  if(attacker&&!ai.contact)ai.memory={x:attacker.x+(sim.random()-.5)*6,y:attacker.y,z:attacker.z+(sim.random()-.5)*6,at:sim.time,kind:'damage',confidence:.55};
  ai.decideAt=0;
}
export function suppressBot(sim,p,bullet,origin,direction,length){
  if(!p.bot||!p.alive||p.team===bullet.team||p.vehicleId)return;
  const center={x:p.x,y:p.y+1,z:p.z},dx=center.x-origin.x,dy=center.y-origin.y,dz=center.z-origin.z;
  const t=clamp(dx*direction.x+dy*direction.y+dz*direction.z,0,length);
  if(Math.hypot(dx-direction.x*t,dy-direction.y*t,dz-direction.z*t)<1.5){
    const ai=state(sim,p);ai.pressureAt=sim.time;ai.decideAt=Math.min(ai.decideAt,sim.time+.1);
    if(!ai.memory)ai.memory={x:p.x-direction.x*20+(sim.random()-.5)*5,y:p.y,z:p.z-direction.z*20+(sim.random()-.5)*5,at:sim.time,kind:'incoming',confidence:.35};
  }
}

export function botSpawnPoint(sim,p){
  const objective=p.ai?.squad?.objective??p.botObjective;if(!objective)return null;
  const beacons=liveBeacons(sim,p.team).filter(item=>!sim.points.some(point=>point.contested&&distance(point,item)<12));
  const choices=[...sim.points.filter(point=>point.owner===p.team&&!point.contested&&!point.spawnBlocked),...beacons]
    .filter(point=>![...sim.players.values()].some(enemy=>enemy.alive&&enemy.team!==p.team&&distance(enemy,point)<(point.kind==='beacon'?8:25)));
  choices.sort((a,b)=>distance(a,objective)-distance(b,objective));
  return choices[0]?.id??null;
}

export function botDebugSnapshot(sim){
  return [...sim.players.values()].filter(p=>p.bot&&p.alive).map(p=>({id:p.id,name:p.name,mode:p.ai?.mode,squad:p.ai?.squad?.id,role:p.ai?.role,
    target:p.ai?.contact?.id??null,memory:p.ai?.memory?{x:p.ai.memory.x,z:p.ai.memory.z,age:sim.time-p.ai.memory.at}:null,
    goal:p.ai?.goal?{x:p.ai.goal.x,y:p.ai.goal.y,z:p.ai.goal.z}:null,cover:p.ai?.cover?{x:p.ai.cover.x,z:p.ai.cover.z}:null}));
}
