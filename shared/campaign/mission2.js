import {Simulation,sanitizeInput} from '../simulation.js';
import {thinkInfantryBot,ensureBotState} from '../bot-ai.js';
import {moveBot,prepareNavigation} from '../bot-navigation.js';
import {shotRandom} from '../fire-control.js';
import {rayAffineBox} from '../geometry.js';
import {VEHICLE_TYPES,vehicleShape,vehicleBodyTilt} from '../vehicles.js';
import {fireTank,tankMuzzle,tankArmorZone} from '../tank.js';
import {campaignTankSight} from './tank-controls.js';
import {zeroedBulletPitch} from '../ballistics.js';
import {ALHADRA_DESERT,M02_RESERVE_ROUTE} from './alhadra-desert.js';
import {dropCampaignMedkit,reviveDuration} from './medical.js';

const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const bearing=(from,to)=>Math.atan2(from.x-to.x,from.z-to.z);
const angle=value=>Math.atan2(Math.sin(value),Math.cos(value));
const INTRO_SPEED_LIMIT=25/3.6;
const RESERVE_MARCH_SPEED=9.4;
const RESERVE_FORWARD_ENTRY=4;
const RESERVE_FIRE_RANGE=285;
const RESERVE_INTERCEPT_RANGE=110;
export const M02_SAVE_VERSION=2;

function trackGrade(terrain,x,z,yaw){
  const c=Math.cos(yaw),s=Math.sin(yaw);
  const h=(side,axle)=>terrain.heightAt(x+c*side+s*axle,z-s*side+c*axle);
  const fl=h(-1.56,-2.6),fr=h(1.56,-2.6),rl=h(-1.56,2.6),rr=h(1.56,2.6);
  return Math.max(Math.abs(fl-rl)/5.2,Math.abs(fr-rr)/5.2,Math.abs(fl-fr)/3.12,Math.abs(rl-rr)/3.12);
}

export class Mission2Simulation extends Simulation{
  constructor(definition,options={}){
    super({bots:0,mapId:ALHADRA_DESERT.id,difficulty:options.difficulty??'regular'});
    this.rngState=options.seed??74102;
    this.random=()=>{this.rngState=(Math.imul(this.rngState,1664525)+1013904223)>>>0;return this.rngState/4294967296;};
    this.campaign=new Mission2Director(this,definition,options);
    this.campaign.initialize();
  }
  balanceTeams(){}
  damage(player,amount,attacker,meta){
    if(player.campaignRole==='platoon'&&attacker?.team===1&&attacker.campaignRole==='tank-driver')return;
    if(player.campaignRole==='platoon'&&player.alive&&this.time>=player.invulnerableUntil){
      if(player.downed)return;
      if(amount>=player.hp){
        Object.assign(player,{hp:1,downed:true,prone:true,downedTimer:25,reviver:null,lastHurt:this.time,
          input:sanitizeInput({yaw:player.yaw})});
        return;
      }
    }
    return super.damage(player,amount,attacker,meta);
  }
  updateVehicleActions(p){
    // One commander operates a sealed tank throughout this mission.
    if(p.id==='local'){p.input.interact=false;p.input.switchSeat=false;p.input.horn=false;return;}
    if(p.campaignRole==='tank-driver')return;
    super.updateVehicleActions(p);
  }
  damageVehicle(vehicle,amount,attacker,kind,origin,sourceVehicleId,impact){
    const wasAlive=vehicle.hp>0;
    if(vehicle.type==='tank'&&vehicle.controlScheme==='wot'&&kind==='blast'&&!vehicle.scriptedLoss){
      // A tank has one health pool. Even a rear/roof hit cannot erase it in
      // one shot. Keep the damage limit tied to base health across difficulties.
      const armor=VEHICLE_TYPES.tank.armorZones[tankArmorZone(vehicle,origin)]??1;
      amount=Math.min(amount,this.campaign.tankMaxHp(vehicle)*.34/armor);
    }
    const hit=super.damageVehicle(vehicle,amount,attacker,kind,origin,sourceVehicleId);
    if(vehicle.type==='tank'&&vehicle.hp>0&&!vehicle.burning&&impact?.directCannon&&
      hit?.amount>0&&tankArmorZone(vehicle,origin)==='rear'&&this.random()<.8){
      vehicle.burning=true;
      if(vehicle.id==='sokol-7')this.campaign.say('kim.fire',3,{priority:2});
      else if(vehicle.team===0)this.campaign.say('holt.allyHit',3);
    }
    if(vehicle.id==='sokol-7'&&vehicle.hp>0&&vehicle.hp<(vehicle.maxHp*.45)&&!this.campaign.flags.repairHint){
      this.campaign.flags.repairHint=true;this.campaign.say('grey.repair',5);
    }
    if(wasAlive&&vehicle.type==='tank'&&vehicle.hp<=0){
      // Campaign wrecks stay as cover and do not respawn like multiplayer vehicles.
      vehicle.respawnIn=1e8;vehicle.wreckTime=1e8;vehicle.compactWreck=true;
      this.campaign?.onTankDestroyed(vehicle,attacker);
    }
    if(attacker?.id==='local'&&(hit?.amount>0||wasAlive&&vehicle.hp<=0)){
      this.campaign.feedback={text:vehicle.hp<=0?'УНИЧТОЖЕН':'ПРОБИТИЕ',until:this.time+1.8};
    }
    return hit;
  }
  setInput(id,input={}){
    super.setInput(id,input);
    const p=this.players.get(id);
    if(p?.vehicleId&&p.id==='local'){
      const v=this.vehicles.find(v=>v.id===p.vehicleId);
      if(v?.controlScheme==='wot'){
        // The one human controls hull and turret. No multiplayer tank seat
        // or control semantics are changed.
        const c=this.campaign;
        p.input.weaponSlot=0;
        p.input.yaw=Number.isFinite(input.yaw)?input.yaw:p.yaw;
        p.input.pitch=Number.isFinite(input.pitch)?input.pitch:0;
        p.input.turretHold=Boolean(input.turretHold);
        if(input.cameraOrigin&&['x','y','z'].every(k=>Number.isFinite(input.cameraOrigin[k]))&&distance(v,input.cameraOrigin)<20&&Math.abs(input.cameraOrigin.y-v.y)<20){
          const sight=campaignTankSight(this.map,this.vehicles,input.cameraOrigin,p.input.yaw,p.input.pitch,v.id);
          c.sight=sight;
          if(!p.input.turretHold){
            const mouth=tankMuzzle(v),range=Math.max(1,distance(mouth,sight));
            p.input.yaw=bearing(mouth,sight);
            const direct=Math.atan2(sight.y-mouth.y,range),speed=v.weapon===1?20000:v.campaignWeapons[v.m02Shell]?.speed??420;
            p.input.pitch=clamp(zeroedBulletPitch(direct,range,speed),-.15,.35);
          }
        }
        if(c.lockedTargetId&&!p.input.turretHold){
          const target=this.vehicles.find(other=>other.id===c.lockedTargetId&&other.hp>0);
          const origin={x:v.x,y:v.y+2.2,z:v.z},destination=target&&
            {x:target.x,y:target.y+1.5,z:target.z};
          if(!target||distance(v,target)>850||!c.visible(origin,destination))c.lockedTargetId=null;
          else{
            const lead=distance(v,target)/(v.campaignWeapons[v.m02Shell]?.speed??420);
            destination.x-=Math.sin(target.yaw)*target.speed*lead;
            destination.z-=Math.cos(target.yaw)*target.speed*lead;
            p.input.yaw=bearing(v,destination);
            p.input.pitch=clamp(zeroedBulletPitch(Math.atan2(destination.y-origin.y,distance(v,destination)),distance(v,destination),v.campaignWeapons[v.m02Shell]?.speed??420),-.15,.35);
          }
        }
        if(input.brake)p.input.forward=0;
        else if(c.cruise&&Math.abs(p.input.forward)<.01)
          p.input.forward=c.definition.friendlyCompany.speed/VEHICLE_TYPES.tank.maxSpeed;
        else if(Math.abs(p.input.forward)>.01)c.cruise=false;
        c.braking=Boolean(input.brake);
      }
    }
  }
  thinkBot(p,dt){
    if(p.campaignRole!=='tank-driver'){
      if(p.campaignRole==='atgun'){this.campaign.thinkGun(p);return;}
      if(!p.alive)return;
      if(p.downed){p.input=sanitizeInput({yaw:p.yaw,crouch:true});return;}
      if(this.campaign.thinkMedic(p,dt))return;
      ensureBotState(this,p);thinkInfantryBot(this,p,dt);
      const goal=this.campaign.botGoal(p);
      if(goal&&!p.ai.contact)moveBot(this,p,goal,dt,{sprint:false});
      p.input.grenade=false;return;
    }
    const v=this.vehicles.find(v=>v.id===p.vehicleId);
    if(!v?.hp||!p.alive){p.input=sanitizeInput({yaw:p.yaw});return;}
    if(v.m02ApproachYaw!==undefined&&!this.campaign.flags.contact){
      // Drive the vanguard over the ridge using the same tank physics as the player.
      const speed=this.campaign.definition.enemyCompany.speed;
      p.input=sanitizeInput({yaw:v.m02ApproachYaw,forward:speed/VEHICLE_TYPES.tank.maxSpeed});
      return;
    }
    if(this.time<(p.nextM02Think??0))return;
    p.nextM02Think=this.time+.09+((p.botSlot??0)%3)*.013;
    const c=this.campaign,enemy=this.vehicles.filter(other=>other.type==='tank'&&other.hp>0&&other.team!==v.team);
    if(v.team===0&&c.phase==='village'&&v.shellAmmo.he>0)
      for(const other of this.players.values())if(other.alive&&!other.vehicleId&&other.team===1&&distance(v,other)<500)enemy.push(other);
    let target=null,nearest=Infinity,best=Infinity;
    const from={x:v.x,y:(v.y??0)+2.4,z:v.z};
    const fireRange=v.m02Guard?340:v.m02Rear?((v.m02Waypoint??0)>=3?RESERVE_FIRE_RANGE:RESERVE_INTERCEPT_RANGE):800;
    for(const other of enemy){
      const d=distance(v,other);
      if(d>(v.m02Rear||v.m02Guard?fireRange:850)||!this.campaign.visible(from,{x:other.x,y:other.y+1.2,z:other.z}))continue;
      const assigned=this.vehicles.filter(t=>t.team===v.team&&t.hp>0&&t.id!==v.id&&t.m02TargetId===other.id).length;
      const score=d+assigned*280-(v.team===0&&c.order==='fire'&&c.orderTargetId===other.id?650:0);
      if(score<best){best=score;nearest=d;target=other;}
    }
    v.m02TargetId=target?.id??null;
    if(target){v.m02Shell=target.type==='tank'?'ap':'he';v.cannonAmmo=v.shellAmmo[v.m02Shell];}
    const route=v.team===0?c.definition.friendlyCompany.route:v.m02Rear?M02_RESERVE_ROUTE:c.definition.enemyCompany.route;
    let wp=Math.min(v.m02Waypoint??0,route.length-1);
    let point=route[Math.min(wp,route.length-1)];
    // A tank defending a zone should maintain a safe interval from its
    // neighbours, while moving toward the next authored waypoint.
    // Fixed independent lanes throughout the march: older code aimed every
    // tank at the same waypoint and the entire company jammed on one ridge.
    const line=c.flags.formation==='line'&&v.team===0;
    const lane=line?v.m02Index-4.5:v.m02Index===0?0:(v.m02Index-1)%3-1,row=line?0:v.m02Index===0?0:1+Math.floor((v.m02Index-1)/3);
    const pathA=route[Math.max(0,wp-1)],pathB=route[Math.min(wp+1,route.length-1)];
    const tx=pathB[0]-pathA[0],tz=pathB[1]-pathA[1];
    const len=Math.max(1,Math.hypot(tx,tz)),ux=tx/len,uz=tz/len;
    const offsetGoal=point=>({
      x:point[0]-uz*20*lane-ux*row*22,
      z:point[1]+ux*20*lane-uz*row*22,
    });
    let goal=offsetGoal(point);
    if(distance(v,goal)<28&&wp<route.length-1){
      wp++;v.m02Waypoint=wp;point=route[wp];goal=offsetGoal(point);
    }
    if(c.order==='hold'&&v.team===0)goal={x:v.x,z:v.z};
    if(c.order==='help'&&v.team===0&&v.id!=='sokol-7'){
      const playerTank=this.vehicles.find(t=>t.id==='sokol-7');
      if(playerTank)goal={x:playerTank.x+(v.m02Index%3-1)*9,z:playerTank.z+16+v.m02Index};
    }
    if(v.team===0&&c.phase==='village'&&c.villageStartedAt!==null&&c.order==='forward'&&v.m02Index%3!==0){
      const guns=[...this.players.values()].filter(p=>p.alive&&p.campaignRole==='atgun')
        .sort((a,b)=>distance(v,a)-distance(v,b));
      const gun=guns[0];
      if(gun&&distance(v,gun)>105)goal={x:gun.x+(v.m02Index%3-1)*16,z:gun.z-36};
    }
    const combatAllowed=c.started&&c.elapsed>=13;
    const inRange=target&&nearest<fireRange;
    const attack=Boolean(inRange&&combatAllowed&&!v.m02Withdraw);
    if(c.order!=='hold'||v.team===1){
      if(c.enemiesAlive<=2&&v.team===0&&c.phase==='battle'&&!target){
        const hidden=enemy.filter(other=>other.type==='tank').sort((a,b)=>distance(v,a)-distance(v,b))[0];
        if(hidden)goal={x:hidden.x+(v.m02Index%3-1)*26,z:hidden.z-44};
      }
      if(v.m02Rear&&wp===route.length-1&&(v.m02Pursuit||distance(v,goal)<28)){
        v.m02Pursuit=true;
        const opponent=target??enemy.reduce((closest,other)=>!closest||distance(v,other)<distance(v,closest)?other:closest,null);
        if(opponent){
          const spread=(v.m02Index%3-1)*16;
          goal=attack&&nearest<55?{x:v.x,z:v.z}:{x:opponent.x-uz*spread,z:opponent.z+ux*spread};
        }
      }else if(!v.m02Rear&&v.team===1&&wp===route.length-1&&target&&nearest>=180&&target.z<-95)
        goal={x:target.x+(v.m02Index%3-1)*18,z:target.z};
      if(this.time<(v.m02DetourUntil??0))goal=v.m02Detour;
      else if(!v.m02Rear&&attack&&nearest<180)goal={x:v.x,z:v.z};
    }
    if(v.m02Withdraw&&this.time>=(v.m02DetourUntil??0))goal=v.m02Withdraw;
    if(v.m02Guard)goal=v;
    const desired=bearing(v,goal),delta=angle(desired-v.yaw);
    const companySpeed=v.m02Rear||v.m02Withdraw?RESERVE_MARCH_SPEED:v.team===0?c.definition.friendlyCompany.speed:c.definition.enemyCompany.speed;
    const drive=distance(v,goal)>10&&Math.abs(delta)<1.15?companySpeed/VEHICLE_TYPES.tank.maxSpeed:0;
    const turn=v.m02Guard?0:clamp(-delta*1.8,-1,1);
    if(this.time<(v.m02EscapeUntil??0)){
      const prior=p.input;
      p.input=sanitizeInput({...prior,forward:-.65,strafe:-v.m02EscapeSide,fire:false});
      return;
    }
    if((drive>0||Math.abs(turn)>.15)&&Math.abs(v.speed)<.2&&distance(v,goal)>24){
      v.m02Stopped=(v.m02Stopped??0)+.10;
      if(v.m02Stopped>1.8){
        v.m02EscapeSide=-(v.m02EscapeSide??(v.m02Index%2===0?1:-1));
        v.m02EscapeUntil=this.time+1.8;v.m02Stopped=0;
        const side=v.m02EscapeSide;
        v.m02Detour={x:v.x+Math.cos(v.yaw)*side*27-Math.sin(v.yaw)*10,
          z:v.z-Math.sin(v.yaw)*side*27-Math.cos(v.yaw)*10};
        v.m02DetourUntil=this.time+8;
      }
    }else v.m02Stopped=0;
    const lead=target?nearest/(v.campaignWeapons.ap.speed??420):0;
    const aimed=target?{x:target.x-Math.sin(target.yaw??0)*(target.speed??0)*lead,z:target.z-Math.cos(target.yaw??0)*(target.speed??0)*lead}:null;
    const random=shotRandom(p.id,Math.floor(this.time/2),'m02-aim');
    const accuracy=c.definition.difficulty[this.difficulty]?.enemyAccuracy??1;
    const error=(random()-.5)*(v.team===1?.016/accuracy:.004);
    const yaw=target?bearing(v,aimed)+error:v.yaw;
    const flatDistance=Math.max(1,nearest);
    // The AP shells follow real ballistic arcs (20 m/s²). At 600m, raw
    // line-of-sight pitch lands ~20m short; zero the gun to the vehicle roof.
    const mouth=tankMuzzle(v);
    const directPitch=target?Math.atan2(target.y+(target.type==='tank'?1.4:1)-mouth.y,flatDistance):0;
    const pitch=target?clamp(zeroedBulletPitch(directPitch,flatDistance,
      v.campaignWeapons?.[v.m02Shell]?.speed??420),-.15,.35):0;
    const aimAligned=target&&Math.abs(angle(yaw-v.aimYaw))<.018&&
      Math.abs(pitch-v.aimPitch)<.010;
    const fire=Boolean(attack&&aimAligned&&this.time>=(v.m02FireAt??0));
    p.input=sanitizeInput({forward:drive,strafe:turn,yaw,pitch,fire,weaponSlot:0});
  }
  // Campaign vehicles use the regular collision/suspension/track physics.
  vehicleCollides(vehicle,x,z,yaw){
    if(vehicle.type==='tank'&&(x!==vehicle.x||z!==vehicle.z)){
      const grade=trackGrade(this.map.terrain,x,z,yaw);
      if(grade>.55&&grade>trackGrade(this.map.terrain,vehicle.x,vehicle.z,vehicle.yaw)+.004)return true;
    }
    return super.vehicleCollides(vehicle,x,z,yaw);
  }
  moveVehicle(vehicle,input,dt){
    if(vehicle.id===this.campaign.definition.player.vehicleId){
      if(this.campaign.braking)input={...input,forward:0};
      else if(this.campaign.elapsed<15&&input?.forward>INTRO_SPEED_LIMIT/VEHICLE_TYPES.tank.maxSpeed){
        input={...input,forward:INTRO_SPEED_LIMIT/VEHICLE_TYPES.tank.maxSpeed};
      }
    }
    super.moveVehicle(vehicle,input,dt);
  }
  step(dt){
    const c=this.campaign;
    if(c.complete||c.failed)return;
    if(c.cutscene){
      this.time+=Math.max(0,dt);
      for(const v of this.vehicles.filter(t=>t.team===0)){
        const crew=this.players.get(v.seats[0]);
        this.moveVehicle(v,{forward:3/13,strafe:0},dt);
        if(crew)this.syncVehicleSeat(crew,v);
      }
      c.advanceBriefing(dt);
      return;
    }
    super.step(dt);
    // A campaign commander handles driving and gunnery together. In normal
    // multiplayer, the shared simulation handles both turret stations.
    for(const v of this.vehicles){
      if(v.hp<=0||v.type!=='tank'||v.controlScheme!=='wot')continue;
      const driver=this.players.get(v.seats[0]);
      if(driver?.alive&&(!driver.bot||c.elapsed>=13)&&(!v.m02Rear||this.time>=c.nextReserveShot)){
        const before=v.cannonSeq;fireTank(this,driver,v,dt);
        if(before!==v.cannonSeq){
          v.m02FireAt=this.time+(v.team===1?5.5:4.5)+(v.m02Index%3)*.45;
          if(v.m02Rear)c.nextReserveShot=this.time+.85;
        }
      }
    }
    c.update(dt);
  }
  snapshot(){
    const state=super.snapshot(),c=this.campaign;
    for(const player of state.players){
      const live=this.players.get(player.id);
      Object.assign(player,{downed:Boolean(live.downed),prone:Boolean(live.prone),downedTimer:live.downedTimer??0});
    }
    state.vehicles.forEach(v=>{
      const live=this.vehicles.find(q=>q.id===v.id);
      if(!live)return;
      v.controlScheme=live.controlScheme;
      if(live.compactWreck)v.compactWreck=true;
      if(v.type==='tank'&&v.team===1)v.camo='desert';
      v.m02Shell=live.m02Shell;
      v.shellAmmo=live.shellAmmo?{...live.shellAmmo}:undefined;
    });
    state.campaign=c.presentation();
    state.campaign.guns=[...this.players.values()].filter(p=>p.campaignRole==='atgun')
      .map(({id,x,y,z,yaw,alive})=>({id,x,y,z,yaw,alive}));
    return state;
  }
}
export class Mission2Director{
  constructor(sim,definition,options){
    this.sim=sim;this.definition=definition;this.options=options;
    this.started=false;this.cutscene={id:'briefing',elapsed:0,duration:definition.briefing.duration};
    this.failed=null;this.complete=false;this.awaitingLoadout=false;this.stage=0;
    this.flags={};this.order='forward';this.radio=null;this.radioEnd=0;this.radioSerial=0;
    this.fired=new Set();this.checkpoint=0;this.latestSave=null;this.saveRevision=0;
    this.combatStartedAt=null;this.elapsed=0;this.enemySerial=0;this.braking=false;
    this.cruise=false;this.lockedTargetId=null;
    this.epoch=0;this.phase='march';this.radioQueue=[];this.sight=null;this.orderTargetId=null;
    this.groundWave=0;this.villageStartedAt=null;this.intelProgress=0;this.lastCheckpointAt=0;
    this.feedback=null;this.smoke=[];this.completedObjectives=[];this.nextReserveShot=0;
  }
  tankMaxHp(vehicle,difficulty){
    const {player,friendlyCompany,enemyCompany}=this.definition;
    const tuning=this.definition.difficulty[difficulty];
    if(vehicle.id===player.vehicleId)return player.maxHp+(tuning?.playerTankHpBonus??0);
    if(vehicle.team===0)return friendlyCompany.maxHp*(tuning?.alliedTankHpMultiplier??1);
    return enemyCompany.maxHp;
  }
  initialize(){
    const c=this.definition,team=c.friendlyCompany,base=team.start;
    const forward=bearing({x:base[0],z:base[1]},{x:0,z:0});
    const names=team.members;
    const heading=team.route[1],dx=heading[0]-base[0],dz=heading[1]-base[1];
    const norm=Math.max(1,Math.hypot(dx,dz)),ux=dx/norm,uz=dz/norm;
    for(let i=0;i<names.length;i++){
      const meta=names[i],lane=i%3-1,row=Math.floor(i/3);
      const isPlayer=meta.id===c.player.vehicleId;
      const [x,z]=isPlayer?c.player.start:[
        base[0]+ux*(35-row*17)-uz*lane*15,base[1]+uz*(35-row*17)+ux*lane*15,
      ];
      const v=this.sim.createMapVehicle({id:meta.id,type:'tank',team:0,x,z,yaw:forward});
      const maxHp=this.tankMaxHp(v,this.sim.difficulty);
      Object.assign(v,{controlScheme:'wot',m02Index:i,m02Waypoint:0,
        fireByHit:true,
        shellAmmo:{ap:c.weapons.ap.ammo,he:c.weapons.he.ammo},
        m02Shell:'ap',campaignWeapons:c.weapons,
        cannonAmmo:c.weapons.ap.ammo,respawnIn:1e8,dispersion:.12,
        hp:maxHp,maxHp,
        m02FireAt:this.sim.time+(i%4)*.6});
      // Re-seed total location from actual collision-free start. All tanks
      // are placed with full physics and remain separate actors.
      this.sim.vehicles.push(v);
      const playerId=isPlayer?'local':`tank-crew-${i+1}`;
      const driver=this.sim.addPlayer(playerId,meta.name,0,'assault','ar416','p19',!isPlayer);
      v.seats[0]=driver.id;
      Object.assign(driver,{alive:true,hp:100,respawnIn:0,
        vehicleId:v.id,vehicleSeat:0,invulnerableUntil:0,campaignRole:'tank-driver'});
      this.sim.syncVehicleSeat(driver,v);
    }
    this.startingVehicles=structuredClone(this.sim.vehicles);
    this.spawnPlatoon();
    prepareNavigation(this.sim);
    this.fired.add('brief-holt.brief01');this.say('holt.brief01',6);
  }
  onTankDestroyed(vehicle,attacker){
    this.smoke.push({x:vehicle.x,y:vehicle.y,z:vehicle.z,until:this.time+45});
    if(vehicle.id==='sokol-8'&&!this.flags.baleLost){
      this.flags.baleLost=true;this.say('bale.loss',4,{priority:2});
    }else if(vehicle.team===0&&this.time>=(this.nextLossReport??0)){
      this.nextLossReport=this.time+12;this.say('ray.allyLoss',3,{priority:2});
    }else if(vehicle.team===1&&attacker?.team===0&&this.time>=(this.nextVictoryReport??0)){
      const cheers=['kim.enemyDown','vos.enemyDown','grey.enemyDown'];
      const index=this.flags.destroyedTankReport??0;
      this.flags.destroyedTankReport=(index+1)%cheers.length;this.nextVictoryReport=this.time+9;
      this.say(cheers[index],3);
    }
  }
  say(key,duration=4,{priority=1}={}){
    if(!this.options.lines?.[key]&&this.options.lines)return;
    duration=Math.max(duration,this.options.lines?.[key]?.duration??0);
    if(this.radio&&this.radioEnd>this.time&&priority<=1){
      if(priority===0)return;
      if(!this.radioQueue.some(q=>q.key===key)&&this.radioQueue.length<8)this.radioQueue.push({key,duration,priority});
      return;
    }
    this.radio={key,serial:++this.radioSerial};this.radioEnd=this.sim.time+duration;
  }
  get player(){return this.sim.players.get('local');}
  get time(){return this.sim.time;}
  get tanksAlive(){return this.sim.vehicles.filter(v=>v.type==='tank'&&v.team===0&&v.hp>0).length;}
  get enemiesAlive(){return this.sim.vehicles.filter(v=>v.type==='tank'&&v.team===1&&v.hp>0).length;}
  get reserveEnd(){const c=this.definition.enemyCompany;return c.total-c.villageGuard.length;}
  advanceBriefing(dt){
    if(!this.cutscene)return;
    this.cutscene.elapsed+=dt;
    for(const cue of this.definition.briefing.lines){
      if(this.cutscene.elapsed>=cue.at&&!this.fired.has(`brief-${cue.key}`)){
        this.fired.add(`brief-${cue.key}`);this.say(cue.key,cue.duration);
      }
    }
    if(this.cutscene.elapsed>=this.definition.briefing.duration)this.beginCombat();
  }
  beginCombat(){
    if(this.started)return;
    this.cutscene=null;this.started=true;this.stage=1;
    this.combatStartedAt=this.sim.time;this.elapsed=0;
    for(const initial of this.startingVehicles){
      const v=this.sim.vehicles.find(v=>v.id===initial.id);Object.assign(v,structuredClone(initial));
      const p=this.sim.players.get(v.seats[0]);if(p)this.sim.syncVehicleSeat(p,v);
    }
    this.ensureVanguard();
    this.radio=null;this.radioQueue=[];this.save(0);
    // Carry surviving squad members' voices forward from mission 1.
    const carry=this.options.campaignProgress?.carry??{};
    this.say(carry.bruno_alive?'bruno.signal':'duran.signal',4);
  }
  command(command){
    if(command?.type==='skip'&&this.cutscene){this.beginCombat();return;}
    if(command?.type==='retry'&&this.latestSave){this.restore(this.latestSave);return;}
    if(this.complete||this.failed||this.cutscene)return;
    if(command?.type==='weapon'){
      const v=this.sim.vehicles.find(x=>x.id==='sokol-7');if(!v)return;
      const type=['ap','he','mg'].includes(command.mode)?command.mode:'ap';
      v.weapon=type==='mg'?1:0;
      v.m02Shell=type==='he'?'he':'ap';
      v.cannonAmmo=v.shellAmmo[v.m02Shell];
      v.weaponReadyAt=this.sim.time+.22;return;
    }
    if(command?.type==='order'&&['forward','fire','hold','help'].includes(command.order)){
      this.order=command.order;
      this.orderTargetId=command.order==='fire'?(this.lockedTargetId??this.sight?.targetId):null;
      this.say('vos.'+command.order,2);return;
    }
    if(command?.type==='repair'){
      const v=this.sim.vehicles.find(x=>x.id==='sokol-7');
      if(v?.hp>0&&(v.hp<v.maxHp||v.burning)&&this.sim.time>=(v.nextSelfRepair??0)&&Math.abs(v.speed)<1){
        v.hp=Math.min(v.maxHp,v.hp+300);v.nextSelfRepair=this.sim.time+35;
        v.burning=false;this.say('crew.repair',2);
        this.sim.event('campaignRepair',{vehicleId:v.id,amount:300});return;
      }
    }
    if(command?.type==='targetLock'){
      if(this.lockedTargetId){this.lockedTargetId=null;return;}
      const v=this.sim.vehicles.find(x=>x.id==='sokol-7'),driver=this.player;
      if(!v||!driver)return;
      let nearest=null,best=.135;
      for(const target of this.sim.vehicles){
        if(target.hp<=0||target.team===v.team||distance(v,target)>850)continue;
        const vertical=Math.atan2(target.y+1.5-v.y-2.2,distance(v,target));
        const deviation=Math.hypot(angle(bearing(v,target)-driver.input.yaw),vertical-driver.input.pitch);
        const origin={x:v.x,y:v.y+2.2,z:v.z},point={x:target.x,y:target.y+1.5,z:target.z};
        if(deviation<best&&this.sim.lineClear(origin,point)){best=deviation;nearest=target;}
      }
      this.lockedTargetId=nearest?.id??null;
      return;
    }
    if(command?.type==='cruise'){this.cruise=!this.cruise;return;}
    if(command?.type==='interact'&&this.phase==='debrief'){
      const v=this.sim.vehicles.find(v=>v.id==='sokol-7'),wreck=this.sim.vehicles.find(v=>v.id==='east-tank-10');
      if(v&&wreck&&wreck.hp<=0&&distance(v,wreck)<18&&Math.abs(v.speed)<1){
        this.flags.enemyOrder=true;this.phase='finale';this.finaleAt=this.time;
        this.completedObjectives.push('intel');this.say('dargo.final',5,{priority:2});
      }
    }
  }
  spawnEnemy(count){
    const c=this.definition.enemyCompany,rear=this.enemySerial>=c.firstWave;
    let entry=rear?RESERVE_FORWARD_ENTRY:0;
    while(entry>0){
      const [x,z]=M02_RESERVE_ROUTE[entry];
      if(!this.sim.vehicles.some(v=>v.team===0&&v.hp>0&&distance(v,{x,z})<=170))break;
      entry--;
    }
    const base=rear?M02_RESERVE_ROUTE[entry]:c.contactStart,heading=rear?M02_RESERVE_ROUTE[entry+1]:c.contactApproach;
    const dirX=heading[0]-base[0],dirZ=heading[1]-base[1],
      norm=Math.max(1,Math.hypot(dirX,dirZ)),ux=dirX/norm,uz=dirZ/norm;
    for(let j=0;j<count;j++){
      const n=this.enemySerial++,i=rear?n-c.firstWave:n;
      const lane=i===0?0:(i-1)%3-1,row=i===0?0:1+Math.floor((i-1)/3);
      const x=rear?base[0]-ux*row*22-uz*lane*20:base[0];
      const z=rear?base[1]-uz*row*22+ux*lane*20:base[1]+(i-(count-1)/2)*9;
      const yaw=Math.atan2(-ux,-uz);
      const v=this.addEnemyTank(n,x,z,yaw,{m02Waypoint:rear?entry+1:0,m02Index:i,m02Rear:rear});
      if(!rear)Object.assign(v,{m02ApproachYaw:yaw,speed:c.speed});
    }
  }
  addEnemyTank(n,x,z,yaw,formation){
    const v=this.sim.createMapVehicle({id:`east-tank-${n+1}`,type:'tank',team:1,x,z,yaw});
    const hp=this.definition.enemyCompany.maxHp;
    Object.assign(v,{controlScheme:'wot',...formation,fireByHit:true,
      cannonAmmo:48,campaignWeapons:this.definition.weapons,m02Shell:'ap',
      shellAmmo:{ap:48,he:8},respawnIn:1e8,hp,maxHp:hp,dispersion:.12,
      m02FireAt:this.time+(n%3)*.6});
    this.sim.vehicles.push(v);
    const driver=this.sim.addPlayer(`east-crew-${n+1}`,`Восточный корпус ${n+1}`,1,'assault','ak12','p19',true);
    v.seats[0]=driver.id;
    Object.assign(driver,{alive:true,hp:100,respawnIn:0,
      vehicleId:v.id,vehicleSeat:0,invulnerableUntil:0,campaignRole:'tank-driver'});
    this.sim.syncVehicleSeat(driver,v);
    return v;
  }
  deployVillageGuard(){
    const entry={x:-235,z:-248};
    const company=this.definition.enemyCompany;
    while(this.enemySerial<company.total){
      const i=this.enemySerial-this.reserveEnd,[x,z]=company.villageGuard[i];
      this.addEnemyTank(this.enemySerial++,x,z,bearing({x,z},entry),{m02Index:i,m02Guard:true});
    }
  }
  ensureVanguard(){if(this.enemySerial===0)this.spawnEnemy(this.definition.enemyCompany.firstWave);}
  execute(event){
    if(event.id==='enemyVanguard'){
      this.ensureVanguard();
      this.flags.contact=true;
      this.say('holt.contactReport',3);
      this.say('vos.contactReply',3);
      this.openContact();
    }
    else if(event.type==='spawn')this.spawnEnemy(event.count??1);
    else if(event.type==='radio')this.say(event.key,3);
    else if(event.type==='wingmanLoss'){
      const v=this.sim.vehicles.find(x=>x.id===event.idOfTank);
      if(v?.hp>0){
        const attacker=this.sim.players.get('east-crew-1');
        v.scriptedLoss=true;this.sim.damageVehicle(v,100000,attacker,'blast',{x:v.x+1,y:v.y+.9,z:v.z});
      }
    }else if(event.type==='formation')this.flags.formation=event.name;
  }
  openContact(){
    const targets=this.sim.vehicles.filter(v=>v.team===0&&v.id!==this.definition.player.vehicleId&&v.hp>0);
    let shots=0;
    for(const enemy of this.sim.vehicles.filter(v=>v.team===1&&v.hp>0)){
      const crew=this.sim.players.get(enemy.seats[0]),mouth=tankMuzzle(enemy);
      const index=targets.findIndex(v=>this.visible(mouth,{x:v.x,y:v.y+1.4,z:v.z}));
      if(!crew?.alive||index<0)continue;
      const [target]=targets.splice(index,1);
      const range=distance(mouth,target);
      enemy.aimYaw=bearing(mouth,target);
      enemy.aimPitch=zeroedBulletPitch(Math.atan2(target.y+1.4-mouth.y,range),range,this.definition.weapons.ap.speed);
      crew.input=sanitizeInput({fire:true,yaw:enemy.aimYaw,pitch:enemy.aimPitch});
      fireTank(this.sim,crew,enemy,1/60);
      crew.input.fire=false;enemy.m02FireAt=this.time+5.5;enemy.m02TargetId=target.id;
      if(++shots>=3)break;
    }
  }
  update(dt){
    this.elapsed=this.sim.time-this.combatStartedAt;
    for(const event of this.definition.timeline){
      if(this.fired.has(event.id)||this.elapsed+1e-7<event.at)continue;
      this.fired.add(event.id);this.execute(event);
    }
    if(this.radio&&this.sim.time>this.radioEnd){this.radio=null;const next=this.radioQueue.shift();if(next)this.say(next.key,next.duration);}
    const playerTank=this.sim.vehicles.find(v=>v.id==='sokol-7');
    if(!playerTank||playerTank.hp<=0||!this.player?.alive){this.failed='Танк «Сокол-7» уничтожен.';return;}
    if(this.elapsed>=13&&this.phase==='march'){this.phase='battle';this.stage=3;}
    const company=this.definition.enemyCompany;
    if(this.flags.enemyRetreat||this.phase==='battle'&&this.enemySerial===company.firstWave)this.withdrawVanguard(playerTank);
    if(this.phase==='battle'&&this.enemySerial===company.firstWave&&(this.flags.enemyRetreat||this.enemiesAlive===0)){
      this.fired.add('enemyRear');this.spawnEnemy(this.reserveEnd-this.enemySerial);
      this.deployVillageGuard();
    }
    const allTanksDeployed=this.enemySerial===company.total;
    const enemyDefeated=allTanksDeployed&&!this.sim.vehicles.some(v=>v.type==='tank'&&v.team===1&&v.hp>0&&!v.m02Withdraw);
    if(enemyDefeated&&!this.flags.village){
      this.flags.village=true;this.phase='village';this.stage=4;this.completedObjectives.push('armor');
      this.spawnVillageAttack();this.say('duran.support',5);this.save(2);
    }
    if(this.phase==='village'){
      const defenders=[...this.sim.players.values()].filter(p=>p.campaignRole==='platoon'&&p.alive);
      this.updateVillageAid(defenders,dt);
      if(!defenders.length){this.failed='Взвод на площади уничтожен. Аль-Хадра потеряна.';return;}
      if(this.villageStartedAt===null&&distance(playerTank,{x:17,z:0})<110){
        this.villageStartedAt=this.time;
        const carry=this.options.campaignProgress?.carry??{};
        this.say(carry.kane_alive?'kane.support':'duran.underFire',4);
        this.save(3);
      }
      if(this.villageStartedAt!==null){
        const age=this.time-this.villageStartedAt;
        const waves=this.definition.villageInfantryWaves.length;
        if(this.groundWave<waves&&age>=this.groundWave*30)this.spawnGroundWave();
        const threats=[...this.sim.players.values()].filter(p=>p.team===1&&p.alive&&['village-assault','atgun'].includes(p.campaignRole));
        if(age>=90&&this.groundWave===waves&&!threats.length){
          this.phase='debrief';this.stage=5;this.completedObjectives.push('platoon');this.say('duran.saved',4);this.save(4);
        }
      }
    }
    if(this.phase==='finale'&&this.time-this.finaleAt>=Math.max(6,this.options.lines?.['dargo.final']?.duration??0)){
      this.complete=true;this.save(5);
    }
    if(this.phase==='battle'&&this.elapsed-this.lastCheckpointAt>=60){this.lastCheckpointAt=this.elapsed;this.save(1);}
    if(!this.flags.firstContact&&this.elapsed>=13){this.flags.firstContact=true;this.save(1);}
    this.smoke=this.smoke.filter(s=>s.until>this.time);
    if(this.time>=(this.nextVisibility??0)){this.nextVisibility=this.time+.25;this.updateVisibility();}
  }
  save(checkpoint){
    if(this.options.ironman)return;
    this.checkpoint=checkpoint;
    this.latestSave=this.serialize();this.saveRevision++;
  }
  spawnSoldier(id,name,team,x,z,role,cls='assault'){
    const p=this.sim.addPlayer(id,name,team,cls,cls==='support'?'mg36':'ar416','p19',true);
    let placed=false;
    for(let r=0;r<=12&&!placed;r+=2)for(let i=0;i<12;i++){
      const a=i*Math.PI/6,px=x+Math.cos(a)*r,pz=z+Math.sin(a)*r,y=this.sim.groundAt(px,pz);
      if(!this.sim.collides(px,pz,y,.4,1.7)){
        Object.assign(p,{x:px,z:pz,y,home:{x:px,z:pz},alive:true,hp:150,invulnerableUntil:0,grenades:0,campaignRole:role,respawnIn:0});placed=true;break;
      }
    }
    if(!placed){this.sim.players.delete(id);return null;}
    return p;
  }
  botGoal(p){return p.team===1?{x:17,z:0}:p.home;}
  canSee(p,other){return this.phase==='village'&&this.visible({x:p.x,y:p.y+1.6,z:p.z},{x:other.x,y:other.y+1.2,z:other.z});}
  spawnPlatoon(){
    const carry=this.options.campaignProgress?.carry??{};
    this.spawnSoldier('m02-duran',carry.duran_alive===false?'Командир взвода':'Гари Дюран',0,17,8,'platoon');
    const members=[['kane','Кейн',-29,20,'support'],['bruno','Бруно',18,25,'assault'],['lasko','Ласко',-29,-15,'medic']];
    for(const [id,name,x,z,cls] of members)if(carry[id+'_alive']!==false)this.spawnSoldier('m02-'+id,name,0,x,z,'platoon',cls);
    if(carry.lasko_alive===false)this.spawnSoldier('m02-field-medic','Санитар взвода',0,-26,-12,'platoon','medic');
    for(let i=0;i<2;i++)this.spawnSoldier('m02-rifle-'+i,'Боец взвода',0,17,-12+i*7,'platoon');
  }
  withdrawVanguard(playerTank){
    const vanguard=this.sim.vehicles.filter(v=>v.team===1&&!v.m02Rear&&!v.m02Guard&&v.hp>0);
    if(vanguard.length&&vanguard.length<=3&&!this.flags.enemyRetreat){
      this.flags.enemyRetreat=true;
      const [x,z]=this.definition.enemyCompany.contactApproach;
      for(const [index,v] of vanguard.entries())v.m02Withdraw={x:x-40,z:z+(index-1)*29,at:this.time};
      if(vanguard.length===3)this.say('holt.retreat',3);
    }
    for(const v of vanguard){
      if(!v.m02Withdraw||distance(v,v.m02Withdraw)>24&&
        (this.time-v.m02Withdraw.at<65||distance(v,playerTank)<180))continue;
      this.sim.removePlayer(v.seats[0]);this.sim.vehicles=this.sim.vehicles.filter(other=>other!==v);
    }
  }
  medicInVillage(){
    return this.sim.players.get('m02-lasko')??this.sim.players.get('m02-field-medic');
  }
  canTreat(medic,patient){
    return distance(medic,patient)<2.5&&Math.abs(medic.y-patient.y)<1.4&&
      this.sim.lineClear({x:medic.x,y:medic.y+1.4,z:medic.z},{x:patient.x,y:patient.y+.4,z:patient.z});
  }
  thinkMedic(p,dt){
    const patient=this.sim.players.get(this.medicPatientId);
    if(p!==this.medicInVillage()||!patient?.downed||!patient.alive)return false;
    const treating=this.canTreat(p,patient);
    p.input=sanitizeInput({yaw:bearing(p,patient),crouch:treating});
    if(!treating){
      ensureBotState(this.sim,p);moveBot(this.sim,p,patient,dt,{sprint:true,followSteps:true});
    }
    return true;
  }
  updateVillageAid(defenders,dt){
    const medic=this.medicInVillage();
    const voice=medic?.id==='m02-field-medic'?'reserveMedic':'lasko';
    const casualties=defenders.filter(p=>p.downed);
    const couldRescue=medic?.alive&&!medic.downed;
    const patient=couldRescue?casualties.filter(p=>p!==medic&&distance(p,medic)<44).sort((a,b)=>distance(a,medic)-distance(b,medic))[0]:null;
    this.medicPatientId=patient?.id??null;
    for(const p of casualties){
      if(p===patient&&this.canTreat(medic,p)){
        if(!p.reviver)this.say(voice+'.revive',2);
        p.reviver=medic.id;p.reviveProgress=(p.reviveProgress??0)+dt/reviveDuration(medic,8);
        if(p.reviveProgress>=1){
          Object.assign(p,{downed:false,prone:false,hp:40,reviver:null,reviveProgress:0,
            downedTimer:0,invulnerableUntil:this.time+2,reviveSeq:(p.reviveSeq??0)+1});
          this.sim.event('revive',{playerId:p.id,medicId:medic.id,x:p.x,z:p.z});
        }
      }else{
        p.reviver=null;p.reviveProgress=0;p.downedTimer-=dt;
        if(p.downedTimer<=0)Object.assign(p,{hp:0,downed:false,alive:false,respawnIn:1e8,deaths:p.deaths+1});
      }
    }
    dropCampaignMedkit(this.sim,medic,()=>this.say(voice+'.medkitDrop',3));
  }
  spawnVillageAttack(){
    for(const [i,[x,z,watchX,watchZ]] of this.definition.villageApproachGuns.entries()){
      const p=this.spawnSoldier('m02-atgun-'+i,'Расчёт ПТ-орудия',1,x,z,'atgun');
      if(p){
        p.yaw=bearing(p,{x:watchX,z:watchZ});p.input=sanitizeInput({yaw:p.yaw});
        p.nextGunShot=this.time+8+i*2;
      }
    }
  }
  spawnGroundWave(){
    const wave=this.groundWave++;
    for(const [i,[x,z]] of this.definition.villageInfantryWaves[wave].entries()){
      this.spawnSoldier(`m02-assault-${wave}-${i}`,'Восточный корпус',1,x,z,'village-assault');
    }
    this.say(wave===0?'duran.targets':wave===1?'grey.cover':'holt.lastWave',4);
  }
  thinkGun(p){
    p.input=sanitizeInput({yaw:p.yaw});
    if(!p.alive||this.time<(p.nextGunTrack??0))return;
    p.nextGunTrack=this.time+.12;
    const target=this.sim.vehicles.filter(v=>v.hp>0&&v.team===0&&distance(p,v)<175&&this.visible({x:p.x,y:p.y+1.5,z:p.z},{x:v.x,y:v.y+1,z:v.z})).sort((a,b)=>distance(p,a)-distance(p,b))[0];
    if(!target)return;
    const d=distance(p,target),yaw=bearing(p,target),pitch=zeroedBulletPitch(Math.atan2(target.y+1-p.y-1.5,d),d,300);
    p.input.yaw=yaw;
    if(this.time<(p.nextGunShot??0))return;
    p.nextGunShot=this.time+8;
    this.sim.rockets.push({id:`at-shell-${p.id}-${++this.sim.eventId}`,kind:1,ownerId:p.id,team:1,x:p.x,y:p.y+1.5,z:p.z,
      vx:-Math.sin(yaw)*Math.cos(pitch)*300,vy:Math.sin(pitch)*300,vz:-Math.cos(yaw)*Math.cos(pitch)*300,life:5,
      campaignShell:'ap',campaignShellProfile:{damage:900,blastRadius:1.5}});
    this.sim.event('cannonShot',{playerId:p.id,x:p.x,y:p.y+1.5,z:p.z,shellType:'ap'});
  }
  visible(a,b){
    if(!this.sim.lineClear(a,b))return false;
    const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,lengthSq=dx*dx+dz*dz;
    const length=Math.hypot(dx,dy,dz),direction={x:dx/length,y:dy/length,z:dz/length};
    for(const v of this.sim.vehicles){
      if(v.hp>0||v.wreckTime<=0)continue;
      const fraction=((v.x-a.x)*dx+(v.z-a.z)*dz)/Math.max(1,lengthSq);
      if(fraction<=0||fraction>=1||Math.hypot(a.x+dx*fraction-v.x,a.z+dz*fraction-v.z)>5)continue;
      if(rayAffineBox(a,direction,vehicleShape(v),length)<length)return false;
    }
    for(const s of this.smoke){
      if(distance(a,s)<15||distance(b,s)<10)continue;
      const t=clamp(((s.x-a.x)*dx+(s.z-a.z)*dz)/Math.max(1,lengthSq),0,1);
      if(Math.hypot(a.x+dx*t-s.x,a.z+dz*t-s.z)<10&&a.y+(b.y-a.y)*t<s.y+14)return false;
    }
    return true;
  }
  updateVisibility(){
    const observers=this.sim.vehicles.filter(v=>v.team===0&&v.hp>0);
    this.visibleEnemies=[];
    for(const target of [...this.sim.vehicles.filter(v=>v.team===1&&v.hp>0),...[...this.sim.players.values()].filter(p=>p.team===1&&p.alive&&!p.vehicleId)]){
      if(observers.some(v=>distance(v,target)<850&&this.visible({x:v.x,y:v.y+2.4,z:v.z},{x:target.x,y:target.y+1,z:target.z})))this.visibleEnemies.push(target.id);
    }
  }
  serialize(){
    return structuredClone({
      version:M02_SAVE_VERSION,missionId:'m02',definitionVersion:this.definition.version,
      difficulty:this.sim.difficulty,time:this.sim.time,rngState:this.sim.rngState,
      vehicles:this.sim.vehicles.map(v=>({...v,runOverHits:undefined})),
      players:[...this.sim.players.values()].map(p=>({...p,damagers:undefined,ai:undefined})),
      rockets:this.sim.rockets,bullets:this.sim.bullets,grenades:this.sim.grenades,deployables:this.sim.deployables,
      mission:{stage:this.stage,started:this.started,combatStartedAt:this.combatStartedAt,
        elapsed:this.elapsed,checkpoint:this.checkpoint,order:this.order,nextReserveShot:this.nextReserveShot,
        flags:this.flags,fired:[...this.fired],enemySerial:this.enemySerial,
        cruise:this.cruise,lockedTargetId:this.lockedTargetId,phase:this.phase,
        groundWave:this.groundWave,villageStartedAt:this.villageStartedAt,smoke:this.smoke,
        completedObjectives:this.completedObjectives,finaleAt:this.finaleAt??null,
        lastCheckpointAt:this.lastCheckpointAt,orderTargetId:this.orderTargetId,
        carry:this.options.campaignProgress?.carry??{}},
    });
  }
  restore(save){
    if(!validMission2Save(save,this.definition))return false;
    this.sim.time=save.time;this.sim.rngState=save.rngState;this.sim.players.clear();
    this.sim.vehicles=structuredClone(save.vehicles);
    for(const v of this.sim.vehicles){
      v.y=this.sim.groundAt(v.x,v.z);
      Object.assign(v,vehicleBodyTilt(v,this.sim.map.terrain));
      if(v.type==='tank'&&v.hp<=0)v.compactWreck=true;
      if(v.type==='tank'&&!v.fireByHit){v.burning=false;v.fireByHit=true;}
      const maxHp=this.tankMaxHp(v,save.difficulty);
      if(v.maxHp!==maxHp){
        v.hp=v.hp/v.maxHp*maxHp;v.maxHp=maxHp;
      }
    }
    for(const p of save.players){
      const created=this.sim.addPlayer(p.id,p.name,p.team,p.classId,p.primaryWeaponId,p.sidearmId,p.bot);
      Object.assign(created,structuredClone(p),{damagers:new Map(),ai:null});
    }
    Object.assign(this,structuredClone(save.mission));
    this.nextReserveShot=save.mission.nextReserveShot??0;
    this.fired=new Set(save.mission.fired);
    this.options.campaignProgress={carry:structuredClone(save.mission.carry)};
    if(this.options.campaignProgress.carry.lasko_alive===false&&!this.medicInVillage())
      this.spawnSoldier('m02-field-medic','Санитар взвода',0,-26,-12,'platoon','medic');
    this.sim.rngState=save.rngState;
    this.flags.contact=this.fired.has('enemyVanguard');
    const firstTank=this.sim.vehicles.find(v=>v.id==='east-tank-1');
    if(this.phase==='march'&&this.elapsed===0&&firstTank&&firstTank.home.x!==this.definition.enemyCompany.contactStart[0]){
      // The previous opening checkpoint stored the old staggered vanguard.
      for(const v of this.sim.vehicles)if(v.team===1)this.sim.players.delete(v.seats[0]);
      this.sim.vehicles=this.sim.vehicles.filter(v=>v.team===0);
      this.enemySerial=0;
    }
    if(this.started)this.ensureVanguard();
    if(this.phase==='battle'&&this.fired.has('enemyRear')){
      const missing=this.reserveEnd-this.enemySerial;
      if(missing>0)this.spawnEnemy(missing);
      this.deployVillageGuard();
    }
    for(const [i,[x,z,watchX,watchZ]] of this.definition.villageApproachGuns.entries()){
      const gun=this.sim.players.get('m02-atgun-'+i);
      if(gun?.alive&&distance(gun,{x,z})>20)Object.assign(gun,{x,z,home:{x,z},grounded:true});
      if(gun?.alive){gun.yaw=bearing(gun,{x:watchX,z:watchZ});gun.input=sanitizeInput({yaw:gun.yaw});}
    }
    for(const p of this.sim.players.values()){
      const mounted=p.vehicleId&&this.sim.vehicles.find(v=>v.id===p.vehicleId);
      if(mounted)this.sim.syncVehicleSeat(p,mounted);
      else if(p.grounded)p.y=this.sim.groundAt(p.x,p.z);
    }
    for(const key of ['rockets','bullets','grenades','deployables'])this.sim[key]=structuredClone(save[key]??[]);
    this.sim.events=[];this.sim.eventId=0;this.sim.botTeams=null;this.sim.botTeamAt=0;
    this.epoch++;this.sight=null;this.radioQueue=[];this.feedback=null;this.visibleEnemies=[];this.nextVisibility=0;
    this.cutscene=null;this.failed=null;this.complete=false;
    this.braking=false;this.awaitingLoadout=false;this.radio=null;this.radioEnd=0;
    this.latestSave=this.serialize();this.saveRevision++;return true;
  }
  presentation(){
    const v=this.sim.vehicles.find(x=>x.id==='sokol-7');
    const fallen=this.definition.friendlyCompany.count-this.tanksAlive;
    const phase=this.phase;
    const wreck=this.sim.vehicles.find(v=>v.id==='east-tank-10');
    const armor=phase==='battle'?this.sim.vehicles.filter(v=>v.type==='tank'&&v.team===1&&v.hp>0&&!v.m02Withdraw):[];
    const villageGuard=armor.length&&armor.every(v=>v.m02Guard)?armor[0]:null;
    return {missionId:'m02',title:this.definition.title,stage:this.stage,
      phase,objective:villageGuard?'villageGuard':phase,flags:{...this.flags},order:this.order,cutscene:this.cutscene,
      awaitingLoadout:false,failed:this.failed,complete:this.complete,checkpoint:this.checkpoint,
      epoch:this.epoch,time:this.elapsed,radio:this.radio,radioRemaining:Math.max(0,this.radioEnd-this.sim.time),
      target:phase==='debrief'&&wreck?{x:wreck.x,z:wreck.z}:villageGuard?{x:villageGuard.x,z:villageGuard.z}:{x:17,z:0},
      tanksAlive:this.tanksAlive,enemyTanksAlive:this.flags.contact?this.enemiesAlive:0,
      enemyTanksSpawned:this.flags.contact?this.enemySerial:0,alliedLosses:fallen,
      shell:v?.m02Shell??'ap',weaponMode:v?.weapon===1?'mg':v?.m02Shell??'ap',
      cruise:this.cruise,lockedTargetId:this.lockedTargetId,
      repairRemaining:Math.max(0,(v?.nextSelfRepair??0)-this.time),feedback:this.feedback?.until>this.time?this.feedback.text:null,
      sight:this.sight,visibleEnemies:this.flags.contact?this.visibleEnemies??[]:[],smoke:this.smoke,
      platoonAlive:[...this.sim.players.values()].filter(p=>p.campaignRole==='platoon'&&p.alive).length,
      villageHoldRemaining:this.villageStartedAt===null?90:Math.max(0,90-(this.time-this.villageStartedAt)),
      groundEnemies:[...this.sim.players.values()].filter(p=>p.team===1&&p.alive&&!p.vehicleId).length,
      completedObjectives:this.completedObjectives,
      stats:{elapsedSeconds:Math.floor(this.elapsed),losses:fallen,kills:this.player?.kills??0},
      // Progress bridge from mission 1, preserved for contextual dialogue.
      carry:{...(this.options.campaignProgress?.carry??{})}};
  }
}
export function validMission2Save(save,definition){
  const position=o=>o&&['x','y','z'].every(k=>Number.isFinite(o[k]))&&Math.abs(o.x)<=1100&&Math.abs(o.z)<=700;
  const list=(v,max)=>Array.isArray(v)&&v.length<=max;
  if(!save||save.version!==M02_SAVE_VERSION||save.missionId!=='m02'||save.definitionVersion!==definition.version||
    !Number.isFinite(save.time)||save.time<0||!Number.isInteger(save.rngState)||
    !Object.hasOwn(definition.difficulty,save.difficulty)||
    !list(save.vehicles,definition.friendlyCompany.count+definition.enemyCompany.total)||!list(save.players,64))return false;
  if(!save.vehicles.every(v=>position(v)&&typeof v.id==='string')||!save.players.every(p=>position(p)&&typeof p.id==='string'))return false;
  const vehicles=new Map(save.vehicles.map(v=>[v.id,v])),players=new Map(save.players.map(p=>[p.id,p]));
  if(vehicles.size!==save.vehicles.length||players.size!==save.players.length||!vehicles.has('sokol-7')||!players.has('local'))return false;
  for(const v of save.vehicles){
    if(!position(v)||v.type!=='tank'||!Number.isFinite(v.hp)||!Number.isFinite(v.maxHp)||v.hp<0||v.maxHp<=0||v.hp>v.maxHp||
      !['yaw','speed','aimYaw','aimPitch'].every(k=>Number.isFinite(v[k]))||!list(v.seats,5)||v.seats.length!==5||
      !v.shellAmmo||!['ap','he'].every(k=>Number.isFinite(v.shellAmmo[k])&&v.shellAmmo[k]>=0)||
      !v.home||!Number.isFinite(v.home.x)||!Number.isFinite(v.home.z))return false;
    for(const id of v.seats)if(id!==null&&(!players.has(id)||players.get(id).vehicleId!==v.id))return false;
  }
  for(const p of save.players)if(!position(p)||!Number.isFinite(p.hp)||typeof p.alive!=='boolean'||
    !['assault','support','medic','recon'].includes(p.classId)||p.vehicleId&&(!vehicles.has(p.vehicleId)||vehicles.get(p.vehicleId).seats[p.vehicleSeat]!==p.id))return false;
  const local=players.get('local'),m=save.mission;
  if(local.vehicleId!=='sokol-7'||local.vehicleSeat!==0||!m||!list(m.fired,100)||!m.fired.every(k=>typeof k==='string')||
    !['march','battle','village','debrief','finale'].includes(m.phase)||typeof m.started!=='boolean'||
    !Number.isFinite(m.combatStartedAt)||!Number.isFinite(m.elapsed)||m.elapsed<0||
    Math.abs(save.time-m.combatStartedAt-m.elapsed)>.1||!Number.isInteger(m.checkpoint)||
    !Number.isInteger(m.enemySerial)||m.enemySerial<0||m.enemySerial>definition.enemyCompany.total||
    !Number.isInteger(m.groundWave)||m.groundWave<0||m.groundWave>definition.villageInfantryWaves.length||
    m.villageStartedAt!==null&&!Number.isFinite(m.villageStartedAt)||
    !m.flags||!m.carry||!list(m.smoke,20)||!list(m.completedObjectives,8)||!['forward','fire','hold','help'].includes(m.order))return false;
  for(const key of ['rockets','bullets','grenades','deployables']){
    if(!list(save[key],256)||!save[key].every(position))return false;
  }
  return true;
}
