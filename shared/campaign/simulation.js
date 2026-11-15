import {Simulation,sanitizeInput} from '../simulation.js';
import {thinkInfantryBot,ensureBotState} from '../bot-ai.js';
import {moveBot,prepareNavigation} from '../bot-navigation.js';
import {getWeapon,DIFFICULTIES} from '../world.js';
import {aimCrew} from '../vehicle-ai.js';
import {vehicleBoardingRange} from '../vehicles.js';
import {ALHADRA,ROUTES} from './alhadra.js';
import {MissionRuntime} from './mission-runtime.js';

export const CAMPAIGN_SAVE_VERSION=1;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const bearing=(a,b)=>Math.atan2(a.x-b.x,a.z-b.z);
const angle=a=>Math.atan2(Math.sin(a),Math.cos(a));
const eye=p=>({x:p.x,y:p.y+((p.prone||p.downed)? .48:p.input.crouch?1.05:1.65),z:p.z});
const settings={recruit:{damage:.7,detection:1.4,bleed:35,syringes:3,medkits:4,cap:10,accuracy:.6},regular:{damage:1,detection:1,bleed:25,syringes:2,medkits:3,cap:14,accuracy:1},veteran:{damage:1.3,detection:.8,bleed:18,syringes:1,medkits:2,cap:14,accuracy:1.25}};
const roles={mg:['support','mg36'],sniper:['recon','dmr12'],assault:['medic','mcx9'],grenadier:['assault','ar416'],officer:['assault','ar416'],sentry:['assault','ar416'],patrol:['assault','ar416']};
const allyInfo={duran:['Гари Дюран','assault','ar416'],lasko:['Тео Ласко','medic','mcx9'],bruno:['Бруно Валь','assault','ar416'],kane:['Рядовой Кейн','support','mg36'],courier:['Связной','assault','ar416']};
const quietLines=new Set(['m01.bruno.patrol','m01.duran.crouch','m01.duran.prone','m01.duran.knife']);
const persistentPlayerKeys=['id','name','team','classId','weaponId','primaryWeaponId','sidearmId','weaponSlot','stowedAmmo','x','y','z','yaw','pitch','hp','alive','ammo','reserve','grenades','rockets','kills','deaths','assists','score','bot','botSlot','grounded','lastHurt','lastShotAt','shotSeq','reviveSeq','downed','downedAt','downedTimer','reviver','syringes','medkits','medkitCapacity','suppressed','prone','campaignRole','campaignZone','campaignGroup','home','homeYaw','holdAt','guideIndex','sleeping','detection','patrolIndex','withdrawn','scriptedWound','officerCallAt','called','invulnerableUntil','secondaryCooldown','gadgetTime','spawnedAt','vehicleId','vehicleSeat'];

// The ordinary movement, weapons, collision, projectiles and combat AI remain
// authoritative in Simulation. Only mission rules differ, in this local subclass.
export class CampaignSimulation extends Simulation {
  constructor(definition,options={}){
    super({bots:0,mapId:ALHADRA.id,difficulty:options.difficulty??'regular'});
    this.rngState=options.seed??901;this.random=()=>{this.rngState=(Math.imul(this.rngState,1664525)+1013904223)>>>0;return this.rngState/4294967296;};
    this.campaign=new CampaignDirector(this,definition,options);
    this.botSettings={...DIFFICULTIES[this.difficulty],aimError:DIFFICULTIES[this.difficulty].aimError/this.campaign.tuning.accuracy};
    this.campaign.initialize();
    prepareNavigation(this);
  }
  balanceTeams(){} // Authored expedition of five against a larger garrison.
  setInput(id,input){
    super.setInput(id,input);const p=this.players.get(id);if(!p)return;
    this.campaign.rawInput={...sanitizeInput(input),use:input.use===true,selfRevive:input.selfRevive===true,heal:input.heal===true,knife:input.knife===true,prone:input.prone===true};
    p.input.order=false;p.input.interact=false;p.input.horn=false;p.input.switchSeat=false;
  }
  moveVehicle(vehicle,input,dt){
    // Mission arrivals use the same collision-aware vehicle physics as combat.
    // The scripted route only supplies driver controls, never teleports the car.
    if(vehicle.campaignRoute&&this.campaign){
      input=this.campaign.routeControls(vehicle)??input;
    }
    super.moveVehicle(vehicle,input,dt);
  }
  thinkBot(p,dt){
    ensureBotState(this,p);
    if(this.campaign.thinkBot(p,dt))return;
    thinkInfantryBot(this,p,dt);this.campaign.afterThink(p,dt);
  }
  damage(victim,amount,attacker,meta={}){
    const c=this.campaign;if(!c)return super.damage(victim,amount,attacker,meta);
    if(c.cutscene||c.failed||c.complete||!victim.alive)return;
    if(victim.team===0&&attacker?.team===0&&attacker!==victim)return;
    if(victim.team===0&&c.radioActive&&victim.id!=='local')return;
    const armor=victim.vehicleId&&this.vehicles.find(v=>v.id===victim.vehicleId);
    if(armor?.campaignArmor&&armor.hp>0&&!meta.explosive)return;
    if(victim.downed){
      if(this.time-victim.downedAt<6||victim.id==='duran')return;
      victim.downedTimer-=Math.max(0,amount)*.12;return;
    }
    if(victim.team===0)amount*=c.tuning.damage;
    if(victim.team===0&&victim.hp<=amount&&this.time>=victim.invulnerableUntil){
      c.down(victim);victim.lastHurt=this.time;this.event('damage',{playerId:victim.id,attackerId:attacker?.id,amount:amount,x:attacker?.x??victim.x,z:attacker?.z??victim.z});return;
    }
    super.damage(victim,amount,attacker,meta);
    if(victim.alive&&victim.team===1&&attacker?.team===0&&!meta.silent)c.raise(victim.campaignZone,3,attacker);
    if(!victim.alive){
      victim.respawnIn=1e8;victim.deathAt=this.time;
      if(victim.campaignRole==='officer'&&!victim.called)c.say('m01.bruno.officerStopped');
    }
  }
  damageVehicle(vehicle,amount,attacker,kind,origin){
    if(vehicle.campaignArmor&&kind==='bullet')return {ricochet:true,amount:0};
    return super.damageVehicle(vehicle,amount,attacker,kind,origin);
  }
  event(type,data={}){
    const shooter=this.players?.get(data.playerId);
    if(type==='shot'&&this.campaign&&shooter?.suppressed&&shooter.weaponSlot===1)data={...data,suppressed:true};
    return super.event(type,data);
  }
  step(dt){
    const c=this.campaign;
    if(c.failed||c.complete||c.awaitingLoadout)return;
    if(c.cutscene){c.advanceCutscene(dt);return;}
    c.beforeStep(dt);super.step(dt);c.afterStep(dt);
  }
  snapshot(){
    const state=super.snapshot(),c=this.campaign;
    for(const p of state.players){const source=this.players.get(p.id);Object.assign(p,{downed:Boolean(source.downed),downedTimer:source.downedTimer??0,reviver:source.reviver??null,prone:Boolean(source.prone),suppressed:Boolean(source.suppressed),withdrawn:Boolean(source.withdrawn),role:source.campaignRole,syringes:source.syringes??0,medkits:source.medkits??0});}
    if(c.cutscene?.id==='briefing')for(const actor of c.definition.cutscenes.briefing.actors??[]){
      const p=state.players.find(p=>p.id===actor.id);if(!p)continue;
      Object.assign(p,{x:actor.x,z:actor.z,y:this.groundAt(actor.x,actor.z),yaw:Math.atan2(actor.x+80,actor.z+30),pitch:-.55,crouch:false,prone:false,downed:false,aim:false,moveSpeed:0,velocityX:0,velocityZ:0});
    }
    state.campaign=c.presentation();return state;
  }
}

export class CampaignDirector {
  constructor(sim,definition,options){
    this.sim=sim;this.definition=definition;this.options=options;this.tuning=settings[sim.difficulty];
    this.runtime=new MissionRuntime(definition,this);this.rawInput={};this.pending=[];this.spawned={};
    this.alerts=Object.fromEntries(['wadi','ridge','depot','village'].map(id=>[id,{level:0,last:-100,reinforced:false,source:null}]));
    this.dialogue={queue:[],active:null,remaining:0};this.spoken=new Set();this.radioSerial=0;
    this.light='night';this.order='follow';this.route=null;this.chargeSites=[{id:'charge-west',x:8,z:29,planted:false},{id:'charge-east',x:42,z:19,planted:false}];
    this.fuel=ALHADRA.boxes.filter(b=>b.campaignFuel!==undefined).map(b=>({id:b.id,x:b.x,y:b.baseY+.5,z:b.z,destroyed:false}));
    this.trucks=[{id:'truck-0',x:0,z:24,destroyed:false},{id:'truck-1',x:21,z:24,destroyed:false},{id:'truck-2',x:42,z:24,destroyed:false}];
    this.processedEvent=0;this.interaction=null;this.progress=0;this.checkpoint=0;this.saveRevision=0;this.epoch=0;
    this.lastInput={};this.cutscene=null;this.failed=null;this.complete=false;this.pickups={};this.unitSerial=0;
    this.revives=0;
  }
  get time(){return this.sim.time;}
  get player(){return this.sim.players.get('local');}
  get flags(){return this.runtime.state.flags;}
  get stage(){return this.runtime.state.stage;}
  get radioActive(){return Boolean(this.dialogue.active);}
  get alertLevel(){return Math.max(...Object.values(this.alerts).map(z=>z.level));}
  initialize(){
    const p=this.sim.addPlayer('local','Ян Мартен',0,'assault',this.options.loadout==='loud'?'ak12':'ar416','p19');
    Object.assign(p,{syringes:this.tuning.syringes,medkits:this.tuning.medkits,medkitCapacity:4,suppressed:this.options.loadout!=='loud',grenades:this.options.loadout==='loud'?5:2,invulnerableUntil:0});
    this.place(p,-200,-140);p.yaw=-2.35;p.input.yaw=p.yaw;
    for(const [i,id] of this.definition.allies.entries()){const a=this.addAlly(id,-203-i%2*2,-144-Math.floor(i/2)*2);a.yaw=p.yaw;}
    const courier=this.addAlly('courier',107,66);this.down(courier,true);courier.downedTimer=1e6;courier.invulnerableUntil=1e8;
    // A waiting extraction car is present from mission start, not created in
    // front of the player when the wounded courier reaches the east road.
    const evac=this.sim.createMapVehicle({id:'campaign-evac-car',type:'humvee',team:0,x:215,z:156,yaw:-2.3});
    evac.campaignEvacuation=true;evac.respawnIn=1e8;this.sim.vehicles.push(evac);
    this.dialogue={queue:[],active:null,remaining:0};
    this.startCutscene('briefing');
    this.initialSave=null;
  }
  addAlly(id,x,z){const [name,cls,weapon]=allyInfo[id];const p=this.sim.addPlayer(id,name,0,cls,weapon,'p19',true);Object.assign(p,{campaignRole:id,campaignZone:'wadi',grenades:0,invulnerableUntil:0,home:{x,z}});this.place(p,x,z);return p;}
  place(p,x,z,y){const spot=this.safeSpot(x,z,y);p.x=spot.x;p.z=spot.z;p.y=spot.y;p.tickX=p.x;p.tickZ=p.z;}
  safeSpot(x,z,y){
    for(let n=0;n<100;n++){const r=n===0?0:Math.sqrt(n)*.6,a=n*2.399,px=x+Math.cos(a)*r,pz=z+Math.sin(a)*r,py=y??this.sim.groundAt(px,pz);
      if(!this.sim.collides(px,pz,py+.03))return {x:px,z:pz,y:py};}
    return {x:this.player?.x??-200,z:this.player?.z??-140,y:this.player?.y??this.sim.groundAt(-200,-140)};
  }
  inZone(id,p=this.player){const z=this.definition.zones[id];return Boolean(p&&z&&Math.hypot(p.x-z.c[0],p.z-z.c[1])<=z.r);}
  allDead(group){return Boolean(this.spawned[group]&&!this.pending.some(u=>u.group===group)&&![...this.sim.players.values()].some(p=>p.campaignGroup===group&&p.alive));}
  action(a){
    if(a.spawn)this.enqueue(a.spawn);
    if(a.spawn==='wave1')this.say(this.sim.players.get('kane')?.alive?'m01.kane.waveOne':'m01.duran.defend');
    if(a.radio)this.say(a.radio);
    if(a.cutscene)this.startCutscene(a.cutscene);
    if(a.light)this.light=a.light;
    if(a.order==='radio'){
      this.order='radio';const b=this.sim.players.get('bruno');
      if(!b?.alive||b.downed){this.fail('Бруно не может передать сигнал.');return;}
      this.place(b,151,108);b.yaw=Math.PI;b.invulnerableUntil=0;
    }else if(a.order)this.order=a.order;
    if(a.checkpoint)this.pendingCheckpoint=a.checkpoint;
    if(a.spawnVehicle)this.spawnVehicle();
    if(a.end)this.complete=true;
  }
  enqueue(group){
    if(this.spawned[group])return;this.spawned[group]=true;
    let units=this.definition.groups[group]?.units??[];
    if(group==='villageGuards'&&this.flags.quietDepot)units=units.slice(3);
    if(group==='wave2'&&!this.flags.quietDepot)units=[...units,{role:'assault',x:205,z:147},{role:'assault',x:211,z:142}];
    // Old groups remain alive in their zones, but are suspended outside the
    // active area. Pending authored enemies are never counted as eliminated.
    units.forEach((u,i)=>this.pending.push({...u,id:`${group}-${i}`,group,zone:this.definition.groups[group].zone}));
  }
  activeEnemy(p){return p.alive&&p.team===1&&!p.withdrawn&&distance(p,this.player)<105;}
  // Spawns must never pop into the player's view, including reinforcements
  // triggered while the camera points at the alarm source.
  spawnVisible(pos){
    const p=this.player,d=distance(pos,p);
    if(d<24)return true;
    return d<105&&Math.abs(angle(bearing(p,pos)-p.yaw))<1.22&&
      this.sim.lineClear(eye(p),{x:pos.x,y:this.sim.groundAt(pos.x,pos.z)+1,z:pos.z});
  }
  safeEnemySpawn(unit){
    const original={x:unit.x,z:unit.z};
    const available=pos=>{
      const y=this.sim.groundAt(pos.x,pos.z);
      return !this.spawnVisible(pos)&&!this.sim.collides(pos.x,pos.z,y+.03)&&
        !this.sim.vehicles.some(v=>v.hp>0&&distance(v,pos)<4)&&
        ![...this.sim.players.values()].some(p=>p.alive&&distance(p,pos)<2);
    };
    if(available(original))return original;
    // Prefer a covered/off-screen approach close to the authored position,
    // not an arbitrary teleport to the player's back.
    for(const radius of [14,24,34,46]){
      for(let n=0;n<16;n++){
        const theta=(n/16)*Math.PI*2+((unit.id?.length??0)*.31);
        const pos={x:unit.x+Math.cos(theta)*radius,z:unit.z+Math.sin(theta)*radius};
        if(distance(pos,this.player)<27||Math.abs(pos.x)>228||Math.abs(pos.z)>168)continue;
        if(available(pos))return pos;
      }
    }
    return null;
  }
  flushSpawns(){
    let count=[...this.sim.players.values()].filter(p=>p.alive&&p.team===1).length;
    this.pending.sort((a,b)=>Number(b.group==='stationGuards')-Number(a.group==='stationGuards'));
    for(let i=0;i<this.pending.length&&count<this.tuning.cap;){
      const u=this.pending[i];
      // Nearby/relevant groups get slots first. Garrisons stay deterministic.
      if(this.stage>=4&&u.zone==='depot'){this.pending.splice(i,1);continue;}
      if(this.time<(u.spawnRetryAt??0)){i++;continue;}
      const spawn=this.safeEnemySpawn(u);
      if(!spawn){u.spawnRetryAt=this.time+.5;i++;continue;}
      this.pending.splice(i,1);const [cls,weapon]=roles[u.role]??roles.sentry;
      const p=this.sim.addPlayer(u.id,'Восточный корпус',1,cls,weapon,'p19',true);
      Object.assign(p,{campaignRole:u.role,campaignGroup:u.group,campaignZone:u.zone,
        // A sentry must defend where it actually materializes; it should not
        // leave cover to walk back to its original visible spawn point.
        home:{x:spawn.x,z:spawn.z},sleeping:Boolean(u.sleeping),detection:0,patrolIndex:0,
        grenades:u.role==='grenadier'?3:0,invulnerableUntil:0,spawnedAt:this.time});
      this.place(p,spawn.x,spawn.z,u.y);p.yaw=u.yaw??Math.PI*1.25;p.homeYaw=p.yaw;p.botSlot=++this.unitSerial||1;
      if(u.role==='officer'){this.sim.equipWeapon(p,2);p.equipTime=0;}
      if(u.role==='vehicle'){
        const v=this.sim.vehicles.find(v=>v.id==='campaign-mg-car');
        if(v?.hp>0){p.vehicleId=v.id;p.vehicleSeat=1;v.seats[1]=p.id;this.sim.syncVehicleSeat(p,v);}
        else{p.alive=false;p.respawnIn=1e8;}
      }
      count++;
    }
  }
  raise(zone,level,source){
    const z=this.alerts[zone];if(!z)return;
    const previous=z.level;z.level=Math.max(z.level,level);z.last=this.time;z.source=source?{x:source.x,y:source.y??0,z:source.z}:z.source;
    if(z.level>previous){
      this.say(z.level===3?'m01.officer.alarm':z.level===2?'m01.sentry.search':'m01.sentry.suspicion',true);
      if(z.level===3){
        this.dialogue.queue=this.dialogue.queue.filter(line=>!quietLines.has(line.key));
        if(quietLines.has(this.dialogue.active?.key)){this.dialogue.active=null;this.dialogue.remaining=0;}
        if(this.stage<=3&&!this.flags.depotBlastStarted)this.flags.earlyAlarm=true;
        const ids=Object.keys(this.alerts),i=ids.indexOf(zone);
        for(const adjacent of [ids[i-1],ids[i+1]])if(adjacent&&this.alerts[adjacent].level<1){this.alerts[adjacent].level=1;this.alerts[adjacent].last=this.time;this.alerts[adjacent].source=z.source;}
        // Officers call after 10 s. Other zones can call once immediately.
        const officer=[...this.sim.players.values()].some(p=>p.campaignRole==='officer'&&p.campaignZone===zone);
        if(!officer&&zone!=='village')this.reinforce(zone);
      }
    }
  }
  reinforce(zone){
    const z=this.alerts[zone];if(z.reinforced)return;z.reinforced=true;
    const centre=this.definition.zones[zone].c;
    for(let i=0;i<Math.min(6,this.options.loadout==='loud'?6:3);i++)this.pending.push({id:`reserve-${zone}-${i}`,role:'assault',x:centre[0]+26+i*2,z:centre[1]+24,zone,group:`reserve-${zone}`});
  }
  senses(dt){
    if(this.time<(this.senseAt??0))return;const elapsed=this.time-(this.lastSenseAt??this.time-.12);this.lastSenseAt=this.time;this.senseAt=this.time+.12;
    const p=this.player;this.detection=0;this.detectingEnemy=null;
    for(const e of this.sim.players.values()){
      if(!this.activeEnemy(e))continue;
      const z=this.alerts[e.campaignZone],d=distance(e,p);
      if(e.sleeping){if(p.moveSpeed>1&&d<8){e.sleeping=false;this.raise(e.campaignZone,1,p);}else continue;}
      const lit=this.inZone('depot')||this.inZone('station'),range=(lit?80:45)*(p.prone?.35:p.input.crouch?.6:p.input.sprint?1.4:1);
      const sees=d<range&&Math.abs(angle(bearing(e,p)-e.yaw))<Math.PI/4&&this.sim.lineClear(eye(e),eye(p));
      if(sees&&!p.downed){
        const tutorialGrace=this.stage===1&&this.time-this.runtime.state.stageAt<18&&d>15;
        e.detection=clamp((e.detection??0)+elapsed/((1.2+1.8*clamp((d-15)/(range-15),0,1))*this.tuning.detection),0,tutorialGrace?.7:1);
        if(e.detection>=1)this.raise(e.campaignZone,3,p);
        else if(e.detection>.15)this.raise(e.campaignZone,1,p);
      }else e.detection=Math.max(0,(e.detection??0)-elapsed*.3);
      if(e.detection>this.detection){this.detection=e.detection;this.detectingEnemy={x:e.x,z:e.z};}
      if(z.level<2)for(const body of this.sim.players.values())if(!body.alive&&body.team===1&&body.campaignZone===e.campaignZone&&!body.withdrawn&&distance(e,body)<18&&this.sim.lineClear(eye(e),{x:body.x,y:body.y+.25,z:body.z})){this.raise(e.campaignZone,2,body);break;}
      if(e.campaignRole==='officer'&&z.level===3&&!e.called){
        e.officerCallAt??=this.time+10;
        if(this.time>=e.officerCallAt){e.called=true;this.say('m01.officer.call');this.reinforce(e.campaignZone);}
      }
      const moving=p.moveSpeed>1,hearing=p.prone?2:p.input.crouch?3:p.input.sprint?15:8;
      if(moving&&d<hearing)this.raise(e.campaignZone,1,p);
    }
    for(const [id,z] of Object.entries(this.alerts)){
      const quiet=this.time-z.last;
      if(z.level===1&&quiet>15)z.level=0;
      else if(z.level===2&&quiet>40)z.level=1;
      else if(z.level===3&&quiet>30&&![...this.sim.players.values()].some(p=>p.alive&&p.team===1&&p.campaignZone===id)&&!this.pending.some(p=>p.zone===id))z.level=1;
    }
  }
  canSee(from,to){
    if(from.downed||to.withdrawn)return false;
    if(to.downed&&this.time-to.downedAt<6)return false;
    if(from.team===1){
      if(this.alerts[from.campaignZone]?.level<3)return false;
      if(from.campaignRole==='mg'&&Math.abs(angle(bearing(from,to)-(from.homeYaw??from.yaw)))>Math.PI/4)return false;
      if(from.campaignRole==='sniper'&&(this.time-(to.lastShotAt??-100)>.8||to.suppressed&&to.weaponSlot===1)&&distance(from,to)>25)return false;
    }else if(this.alertLevel<3&&!this.flags.playerOpenedFire)return false;
    return true;
  }
  botGoal(p){
    if(p.team===0){
      if(p.campaignRole==='courier'&&!this.flags.courierRevived)return p.home;
      if(this.order==='radio'&&p.id==='bruno')return {x:151,z:108};
      if(this.order==='hold')return p.holdAt??p.home;
      if(p.id==='duran'&&this.stage===1){
        const path=ROUTES.wadi;p.guideIndex??=1;
        if(distance(p,this.player)>7)return {x:p.x,z:p.z};
        const a=path[Math.min(p.guideIndex,path.length-1)],goal={x:a[0],z:a[1]};if(distance(p,goal)<2)p.guideIndex=Math.min(path.length-1,p.guideIndex+1);return goal;
      }
      const index=this.definition.allies.indexOf(p.id),side=index%2?1:-1;
      if(this.inZone('station')&&p.id!=='bruno')return {x:145+Math.max(0,index)*3,z:94};
      return {x:this.player.x+Math.sin(this.player.yaw)*(4+Math.max(0,index)*.6)+Math.cos(this.player.yaw)*side*2,z:this.player.z+Math.cos(this.player.yaw)*(4+Math.max(0,index)*.6)-Math.sin(this.player.yaw)*side*2};
    }
    if(p.campaignRole==='mg'||p.campaignRole==='sniper')return p.home;
    if(p.campaignGroup?.startsWith('wave'))return {x:150,z:105};
    if(p.investigation&&this.time<p.investigation.until)return p.investigation;
    if(p.campaignRole==='patrol'){
      if(this.time<(p.patrolWaitUntil??0))return {x:p.x,z:p.z};
      const a=(p.patrolIndex??0)%4*Math.PI/2,goal={x:p.home.x+Math.cos(a)*8,z:p.home.z+Math.sin(a)*6};if(distance(p,goal)<2)p.patrolIndex=(p.patrolIndex??0)+1;return goal;
    }
    return p.home;
  }
  idle(p){p.input=sanitizeInput({yaw:p.yaw,pitch:p.pitch,crouch:p.team===0&&this.player.input.crouch});}
  thinkBot(p,dt){
    if(p.downed||p.withdrawn){this.idle(p);return true;}
    if(p.campaignRole==='vehicleDriver'&&p.vehicleId){this.idle(p);return true;}
    if(p.id==='courier'&&this.flags.courierSaved){
      this.idle(p);
      const evac=this.sim.vehicles.find(v=>v.id==='campaign-evac-car');
      if(p.vehicleId)return true;
      if(evac?.hp>0){
        if(distance(p,evac)<vehicleBoardingRange(evac)&&this.sim.mountVehicle(p,evac,0)){
          evac.campaignRoute={points:[{x:226,z:166},{x:234,z:173}],index:0,speed:.66};
        }else moveBot(this.sim,p,evac,dt,{sprint:false});
      }
      return true;
    }
    if(p.campaignRole==='vehicle'&&p.vehicleId){const v=this.sim.vehicles.find(v=>v.id===p.vehicleId);this.idle(p);if(v?.hp>0)aimCrew(this.sim,p,v,dt);return true;}
    if(p.team===1){
      if(!this.activeEnemy(p)||p.sleeping){this.idle(p);return true;}
      const alert=this.alerts[p.campaignZone];
      if(alert.level<3){
        this.idle(p);p.ai.cover=null;p.ai.goal=null;
        if(alert.level>0&&alert.source&&alert.last>(p.investigatedAt??-1)&&this.time>=(p.investigateAgainAt??0)&&!['mg','sniper','officer'].includes(p.campaignRole)){
          const max=p.campaignRole==='patrol'?12:5,dx=alert.source.x-p.home.x,dz=alert.source.z-p.home.z,length=Math.max(1,Math.hypot(dx,dz)),scale=Math.min(1,max/length);
          p.investigation={x:p.home.x+dx*scale,z:p.home.z+dz*scale,until:this.time+9};p.investigatedAt=alert.last;p.investigateAgainAt=this.time+22;
        }
        const previous=p.patrolIndex,goal=this.botGoal(p);
        if(p.patrolIndex!==previous){p.patrolWaitUntil=this.time+3+(p.botSlot%3);return true;}
        if(goal&&distance(p,goal)>1.5&&!['mg','sniper','officer'].includes(p.campaignRole)){
          moveBot(this.sim,p,goal,dt,{sprint:false});p.input.forward*=.5;p.input.strafe*=.5;
        }else if(p.investigation){p.input.yaw=p.homeYaw+Math.sin(this.time*.7)*.35;}
        return true;
      }
      return false;
    }
    if(p.id==='courier'&&!this.flags.courierRevived){this.idle(p);return true;}
    if(p.id==='bruno'&&this.stage>=6){this.idle(p);p.input.crouch=true;return true;}
    const casualty=[...this.sim.players.values()].filter(a=>a.team===0&&a.alive&&a.downed&&a.id!=='courier'&&(!a.scriptedWound||this.time-a.downedAt>8)&&a!==p&&(!a.reviver||a.reviver===p.id)).sort((a,b)=>distance(p,a)-distance(p,b))[0];
    const medic=this.sim.players.get('lasko'),isMedic=p.id==='lasko';
    const canHelp=isMedic||(!medic?.alive||medic.downed||distance(medic,casualty??p)>25);
    if(casualty&&canHelp){
      const enemyClose=[...this.sim.players.values()].some(e=>this.activeEnemy(e)&&distance(e,p)<12&&this.sim.lineClear(eye(e),eye(p)));
      this.idle(p);
      if(enemyClose){p.input.crouch=true;this.cancelReviveBy(p.id);return true;}
      if(distance(p,casualty)>2.4||!this.sim.lineClear(eye(p),{x:casualty.x,y:casualty.y+.35,z:casualty.z})){this.cancelReviveBy(p.id);moveBot(this.sim,p,casualty,dt,{sprint:true});}
      else{if(isMedic&&casualty.id==='local'&&casualty.reviver!==p.id)this.say('m01.lasko.reviving',true);casualty.reviver=p.id;casualty.reviveProgress=(casualty.reviveProgress??0)+dt/(isMedic?6:10);if(casualty.reviveProgress>=1)this.revive(casualty);}
      return true;
    }
    this.cancelReviveBy(p.id);
    if(this.alertLevel<3&&!this.flags.playerOpenedFire||p.id==='courier'){
      this.idle(p);const goal=this.botGoal(p);if(distance(p,goal)>2)moveBot(this.sim,p,goal,dt,{sprint:false});return true;
    }
    return false;
  }
  afterThink(p,dt=1/60){
    p.input.gadget=false;p.input.secondaryGadget=false;p.input.toolSlot=0;p.input.order=false;p.input.horn=false;
    if(p.team===0){
      p.input.grenade=false;
      if(this.order==='hold')p.input.forward=p.input.strafe=0;
      if(p.id==='lasko'&&![...this.sim.players.values()].some(e=>this.activeEnemy(e)&&distance(e,p)<10))p.input.fire=false;
      // The player must finish the encounter; allies suppress and assist.
      const target=this.sim.players.get(p.ai?.contact?.id);if(target?.hp<=30)p.input.fire=false;
      if(!this.player.downed&&this.order!=='hold'&&distance(p,this.player)>14){const goal=this.botGoal(p);moveBot(this.sim,p,goal,dt,{sprint:true});}
    }else{
      if(p.campaignRole==='mg'||p.campaignRole==='sniper')p.input.forward=p.input.strafe=0;
      if(p.campaignRole==='mg')p.input.crouch=true;
      if(p.campaignRole!=='grenadier')p.input.grenade=false;
      else if(this.time-(this.player.lastMovedAt??0)<6)p.input.grenade=false;
      if(p.campaignRole==='officer'&&!p.called&&p.officerCallAt>this.time)p.input.fire=false;
      if(!p.campaignGroup?.startsWith('wave'))p.input.sprint=false;
      if(!p.ai.contact&&(!p.ai.memory||this.time-p.ai.memory.at>6)&&!p.campaignGroup?.startsWith('wave')){
        this.idle(p);const goal=this.botGoal(p);if(goal&&distance(p,goal)>2){moveBot(this.sim,p,goal,dt,{sprint:false});p.input.forward*=.5;p.input.strafe*=.5;}
      }
      // Defenders keep a post/cover instead of chasing contacts across the map.
      const leash=p.campaignRole==='assault'||p.campaignRole==='grenadier'?27:14;
      if(!p.campaignGroup?.startsWith('wave')&&distance(p,p.home)>leash){p.ai.cover=null;p.ai.goal={...p.home};moveBot(this.sim,p,p.home,dt,{sprint:false,look:!p.ai.contact});}
    }
  }
  cancelReviveBy(id){for(const a of this.sim.players.values())if(a.reviver===id){a.reviver=null;a.reviveProgress=0;}}
  down(p,scripted=false){
    p.downed=true;p.downedAt=this.time;p.downedTimer=this.tuning.bleed;p.hp=1;p.reviveProgress=0;p.reviver=null;p.prone=true;p.scriptedWound=scripted;p.slideTime=0;p.reloading=false;p.heldGadget=null;
    this.sim.equipWeapon(p,2);p.equipTime=0;
    if(p.id==='kane'&&this.stage===3&&!this.flags.kaneWounded){this.flags.kaneWounded=true;this.say('m01.kane.wounded');this.say('m01.lasko.kaneDown');}
    if(!scripted)this.say(p.id==='local'?'m01.lasko.playerDown':'m01.bruno.allyDown',true);
  }
  revive(p){
    if(p.id!=='local'&&p.reviver==='local')this.revives++;
    p.downed=false;p.downedTimer=0;p.hp=40;p.prone=false;p.reviveProgress=0;p.reviver=null;p.invulnerableUntil=this.time+2;p.reviveSeq=(p.reviveSeq??0)+1;p.lastHurt=this.time;
    if(p.id==='kane'){this.flags.kaneSaved=true;this.say('m01.kane.revived');}
    if(p.id==='courier'){this.flags.courierRevived=true;p.invulnerableUntil=0;this.say('m01.courier.saved');}
    if(p.id==='local')this.say('m01.lasko.playerUp',true);
    p.scriptedWound=false;
    this.sim.event('revive',{playerId:p.id,x:p.x,z:p.z});
  }
  startCutscene(id){if(this.cutscene?.id===id)return;this.cutscene={id,elapsed:0,line:0};this.dialogue={queue:[],active:null,remaining:0};}
  advanceCutscene(dt){
    const c=this.cutscene,def=this.definition.cutscenes[c.id];c.elapsed+=dt;
    if(c.id==='midpoint'&&this.flags.depotCinematicArmed&&!this.flags.depotDestroyed&&c.elapsed>=(def.detonateAt??2.2)){
      this.detonateDepot();this.runtime.tick();
      if(this.pendingCheckpoint){const n=this.pendingCheckpoint;this.pendingCheckpoint=null;this.save(n);}
    }
    while(c.line<def.lines.length&&c.elapsed>=def.lines[c.line][0]){this.say(def.lines[c.line++][1],true);}
    this.updateDialogue(dt);if(c.elapsed>=def.duration)this.finishCutscene();
  }
  finishCutscene(){
    const id=this.cutscene?.id;if(!id)return;
    if(id==='midpoint'&&this.flags.depotCinematicArmed&&!this.flags.depotDestroyed){this.detonateDepot();this.runtime.tick();if(this.pendingCheckpoint){const n=this.pendingCheckpoint;this.pendingCheckpoint=null;this.save(n);}}
    this.cutscene=null;this.dialogue={queue:[],active:null,remaining:0};
    if(id==='briefing'){this.awaitingLoadout=true;return;}
    if(id==='landing'){this.flags.landed=true;this.runtime.tick();this.initialSave=this.serialize();}
    if(id==='midpoint')this.say('m01.duran.village');
    if(id==='finale'){this.complete=true;this.saveRevision++;}
  }
  command(command){
    if(command.type==='skip'&&this.cutscene)this.finishCutscene();
    if(command.type==='loadout'&&this.awaitingLoadout){
      this.awaitingLoadout=false;this.options.loadout=command.loadout==='loud'?'loud':'silent';const p=this.player;p.suppressed=this.options.loadout!=='loud';
      p.primaryWeaponId=this.options.loadout==='loud'?'ak12':'ar416';p.weaponId=p.primaryWeaponId;p.ammo=30;p.reserve=180;p.grenades=p.suppressed?2:5;this.startCutscene('landing');
    }
    if(command.type==='retry'&&this.failed)this.restore(this.latestSave??this.initialSave);
  }
  say(key,repeat=false){
    if(quietLines.has(key)&&this.alertLevel===3)return;
    if(!this.options.lines?.[key]||!repeat&&this.spoken.has(key))return;
    if(this.dialogue.active?.key===key||this.dialogue.queue.some(line=>line.key===key))return;
    this.spoken.add(key);const line=this.options.lines[key];
    this.dialogue.queue.push({key,priority:line.priority??2,serial:++this.radioSerial});
    this.dialogue.queue.sort((a,b)=>b.priority-a.priority||a.serial-b.serial);
  }
  updateDialogue(dt){
    const d=this.dialogue;d.remaining-=dt;
    if(d.remaining<=0){d.active=d.queue.shift()??null;d.remaining=d.active?(this.options.lines[d.active.key].duration??4):0;}
  }
  interactions(dt){
    const p=this.player,i=this.rawInput;this.prompt=null;
    if(p.downed){
      if(i.selfRevive&&p.syringes>0){this.progress+=dt/4;this.interaction='self';p.input.fire=false;if(this.progress>=1){p.syringes--;this.revive(p);this.progress=0;}}
      else{this.progress=0;this.interaction=null;}
      return;
    }
    const wounded=[...this.sim.players.values()].filter(a=>a.alive&&a.team===0&&a.downed&&a!==p&&distance(p,a)<3&&this.sim.lineClear(eye(p),{x:a.x,y:a.y+.35,z:a.z})).sort((a,b)=>distance(p,a)-distance(p,b))[0];
    let target=null,duration=0;
    if(wounded){target={id:wounded.id,kind:'revive',text:`E · удерживать: помочь ${wounded.name}`};duration=5;}
    else if(this.stage===3){const site=this.chargeSites.find(s=>!s.planted&&distance(p,s)<4.5);if(site){target={...site,kind:'charge',text:'E · удерживать: заложить заряд'};duration=3;}}
    if(!target&&this.stage>=4&&!this.flags.documents&&distance(p,{x:154,z:109})<2.8){target={id:'documents',kind:'documents',text:'E · забрать документы офицера'};duration=.7;}
    if(!target){
      const supplies=[{id:'depotKit',x:14,z:41,kind:'kit'},{id:'courierKit',x:110,z:66,kind:'kit'},{id:'ammo',x:32,z:12,kind:'ammo'}];
      const s=supplies.find(s=>!this.pickups[s.id]&&distance(p,s)<3);if(s){target={...s,text:s.kind==='kit'?'E · взять аптечку':'E · пополнить боезапас'};duration=.7;}
    }
    if(target){
      this.prompt=target.text;
      if(this.interaction!==target.id){this.interaction=target.id;this.progress=0;}
      if(i.use){
        p.input.fire=false;this.progress+=dt/duration;
        if(wounded&&target.kind==='revive'){wounded.reviver=p.id;wounded.reviveProgress=this.progress;}
        if(this.progress>=1){
          if(target.kind==='revive')this.revive(wounded);
          if(target.kind==='charge'){this.chargeSites.find(s=>s.id===target.id).planted=true;this.say(this.chargeSites.every(s=>s.planted)?'m01.duran.chargeTwo':'m01.duran.chargeOne');if(this.chargeSites.every(s=>s.planted))this.fuseUntil=this.time+25;}
          if(target.kind==='documents'){this.flags.documents=true;this.say('m01.duran.documents');}
          if(target.kind==='kit'&&p.medkits<p.medkitCapacity){p.medkits++;this.pickups[target.id]=true;this.say('m01.lasko.medkit');}
          if(target.kind==='ammo'){p.ammo=getWeapon(p.classId,p.weaponId).mag;p.reserve=180;p.rockets=Math.max(2,p.rockets);p.grenades=Math.max(p.grenades,3);this.pickups[target.id]=true;this.say('m01.duran.ammo');}
          this.progress=0;this.interaction=null;
        }
      }else{this.progress=0;this.cancelReviveBy('local');}
    }else{this.progress=0;this.interaction=null;this.cancelReviveBy('local');}
    if(i.heal&&!this.lastInput.heal&&p.medkits>0&&p.hp<100){p.medkits--;p.hp=100;p.lastHurt=this.time;}
    if(i.knife&&!this.lastInput.knife&&this.time>=(this.knifeAt??0)){
      this.knifeAt=this.time+.75;
      const victim=[...this.sim.players.values()].find(e=>e.team===1&&e.alive&&distance(p,e)<2.5&&Math.abs(angle(bearing(p,e)-p.yaw))<.8&&this.sim.lineClear(eye(p),eye(e)));
      if(victim){const behind=Math.abs(angle(bearing(victim,p)-victim.yaw))>Math.PI*.55,quiet=behind&&victim.detection<1;this.sim.damage(victim,quiet?200:45,p,{weapon:'НОЖ',silent:quiet});if(!quiet)this.raise(victim.campaignZone,3,p);}
      this.sim.event('campaignKnife',{playerId:p.id,x:p.x,z:p.z});
    }
  }
  beforeStep(dt){
    if(this.awaitingLoadout)return;
    const p=this.player,i=this.rawInput;
    if(i.order&&!this.lastInput.order){this.order=this.order==='hold'?'follow':'hold';for(const a of this.sim.players.values())if(a.team===0&&a.bot)a.holdAt={x:a.x,z:a.z};this.say(this.order==='hold'?'m01.duran.hold':'m01.duran.move',true);}
    if(i.prone&&!this.lastInput.prone&&!p.downed)p.prone=!p.prone;
    if(p.prone||p.downed){p.input.crouch=true;p.input.sprint=false;p.input.jump=false;p.slideTime=0;}
    if(p.downed){this.sim.equipWeapon(p,2);p.input.weaponSlot=2;p.input.toolSlot=0;p.input.grenade=false;}
    if(p.lastMoveX===undefined){p.lastMoveX=p.x;p.lastMoveZ=p.z;}
    if(distance(p,{x:p.lastMoveX,z:p.lastMoveZ})>.3){p.lastMovedAt=this.time;p.lastMoveX=p.x;p.lastMoveZ=p.z;}
    this.interactions(dt);
    this.flushSpawns();
  }
  afterStep(dt){
    if(this.awaitingLoadout)return;
    this.updateDialogue(dt);
    const p=this.player;
    for(const a of this.sim.players.values()){
      if(a.team===1&&this.stage>=3&&a.campaignZone==='wadi'||a.team===1&&this.stage>=4&&['wadi','ridge','depot'].includes(a.campaignZone)){
        a.withdrawn=true;a.alive=false;a.respawnIn=1e8;
      }
      if(a.team!==0||!a.alive)continue;
      if(a.downed){
        if(a.id!=='duran'&&a.id!=='courier')a.downedTimer-=dt;
        if(a.downedTimer<=0){a.alive=false;a.downed=false;a.respawnIn=1e8;
          if(a.id==='local')this.fail('Мартен погиб.');
          else if(a.id==='bruno')this.fail('Радист потерян. Сигнал не передан.');
          else if(a.id==='kane')this.say('m01.lasko.kaneLost');
        }
      }else if(this.time-a.lastHurt>5&&a.hp<60)a.hp=Math.min(60,a.hp+4*dt);
      if(a.id!=='local'&&a.id!=='courier'&&!a.downed&&!(a.id==='bruno'&&this.stage>=6))this.recoverAlly(a,dt);
    }
    this.consumeEvents();this.senses(dt);this.scriptedEvents();this.runtime.tick();
    this.lastInput={...this.rawInput};
    if(this.pendingCheckpoint&&!this.failed){const n=this.pendingCheckpoint;this.pendingCheckpoint=null;this.save(n);}
  }
  scriptedEvents(){
    const p=this.player;
    if(this.stage===1&&distance(p,{x:-180,z:-107})<50){this.say('m01.duran.crouch');this.say('m01.bruno.patrol');}
    if(this.stage===1&&this.time>25)this.say('m01.duran.prone');
    if(this.stage===2&&this.options.loadout==='loud')this.say('m01.kane.grenade');
    if(this.stage===3&&!this.route){this.route=p.z>0?'dunes':'road';if(this.route==='road')this.say('m01.bruno.road');}
    if(this.fuseUntil&&this.time>=this.fuseUntil-5)this.say('m01.bruno.fuse');
    if(this.fuseUntil&&this.time>=this.fuseUntil-2.2&&!this.flags.depotCinematicArmed){this.flags.depotCinematicArmed=true;this.startCutscene('midpoint');}
    if(!this.flags.depotDestroyed&&this.fuel.every(b=>b.destroyed)&&this.trucks.every(t=>t.destroyed)){
      this.flags.depotDestroyed=true;this.flags.quietDepot??=!this.flags.earlyAlarm;
      if(this.flags.quietDepot)this.say('m01.duran.quiet');
      for(const z of Object.values(this.alerts)){z.level=1;z.last=this.time;}
    }
    const courier=this.sim.players.get('courier');
    if(this.stage>=4&&distance(p,courier)<25){this.say('m01.lasko.courier');this.say('m01.courier.help');}
    if(this.flags.courierRevived&&courier?.alive&&this.inZone('exit',courier)&&!this.flags.courierSaved){
      this.flags.courierSaved=true;p.medkitCapacity=5;p.medkits=Math.min(5,p.medkits+1);
      // He walks to the waiting extraction car and drives toward the far road.
      this.say('m01.courier.evacuated');
    }
    this.finishExtraction();
    if(this.stage===6&&this.time-this.runtime.state.timers.defence>=45)this.say('m01.bruno.radioHalf');
    if(this.stage>=6&&this.sim.vehicles.some(v=>v.campaignArmor&&v.hp<=0)&&!this.flags.vehicleDestroyed){this.flags.vehicleDestroyed=true;this.say('m01.bruno.vehicleDown');}
    if(p.downed)this.say('m01.duran.syringe');
  }
  detonateDepot(){
    this.fuseUntil=null;this.flags.quietDepot=!this.flags.earlyAlarm;this.flags.depotBlastStarted=true;
    for(const site of this.chargeSites)this.depotExplosion(site);
    for(const fuel of this.fuel)fuel.destroyed=true;for(const t of this.trucks)t.destroyed=true;
    this.flags.depotDestroyed=true;this.light='alarm';
    if(this.flags.quietDepot)this.say('m01.duran.quiet');
    for(const z of Object.values(this.alerts)){z.level=1;z.last=this.time;}
  }
  recoverAlly(a,dt=1/60){
    const helping=[...this.sim.players.values()].some(p=>p.reviver===a.id);
    if(this.order==='hold'||this.player.downed||helping||this.time<(a.recoverAfter??0)){a.stuckTime=0;a.recoveryProbe=null;return;}
    const goal=this.botGoal(a),attempting=Math.hypot(a.input.forward,a.input.strafe)>.15||a.ai?.mode==='blocked';
    if(!attempting||distance(a,goal)<4){a.stuckTime=0;a.recoveryProbe=null;return;}
    a.recoveryProbe??={x:a.x,z:a.z};
    if(distance(a,a.recoveryProbe)>.45){a.stuckTime=0;a.recoveryProbe={x:a.x,z:a.z};return;}
    a.stuckTime=(a.stuckTime??0)+dt;
    const blocked=a.ai?.mode==='blocked'||a.ai?.blockedSpot?.until>this.time;
    if(a.stuckTime<8||!blocked)return;
    const visible=Math.abs(angle(bearing(this.player,a)-this.player.yaw))<1.5&&this.sim.lineClear(eye(this.player),eye(a));
    if(visible)return;
    // Only recover behind the player's current view, never through a visible pop.
    for(let n=0;n<12;n++){
      const x=this.player.x+Math.sin(this.player.yaw)*(5+n*.3)+Math.cos(this.player.yaw)*(n%2?3:-3),z=this.player.z+Math.cos(this.player.yaw)*(5+n*.3)-Math.sin(this.player.yaw)*(n%2?3:-3),y=this.sim.groundAt(x,z);
      if(!this.sim.collides(x,z,y)&&![...this.sim.players.values()].some(p=>p!==a&&p.alive&&Math.hypot(p.x-x,p.z-z)<1.2)){this.place(a,x,z);a.ai=null;a.botPath=[];a.stuckTime=0;a.recoveryProbe=null;a.recoverAfter=this.time+30;break;}
    }
  }
  consumeEvents(){
    const events=this.sim.events.filter(e=>e.id>this.processedEvent);if(events.length)this.processedEvent=events.at(-1).id;
    for(const e of events){
      if(e.type==='shot'){
        const shooter=this.sim.players.get(e.playerId);if(shooter?.team===0){if(!e.suppressed)this.flags.playerOpenedFire=true;const radius=e.suppressed?25:120;this.noise(e,radius,e.suppressed?1:2);}
      }
      if(e.type==='explosion'){
        // Ordinary grenades/rockets can alert the garrison but cannot
        // detonate the mission's reinforced fuel drums or military trucks.
        // Only the planted demolition charges trigger the depot chain.
        this.noise(e,150,3);
      }
    }
  }
  noise(source,radius,level){for(const e of this.sim.players.values())if(e.alive&&e.team===1&&distance(e,source)<radius){if(e.sleeping){if(radius<150&&distance(e,source)>=8)continue;e.sleeping=false;}this.raise(e.campaignZone,level,source);}}
  depotExplosion(site){
    const origin={x:site.x,y:this.sim.groundAt(site.x,site.z)+1,z:site.z};
    // Eight metre chain blast with ordinary authoritative damage and events.
    this.sim.event('explosion',{...origin,kind:'grenade',playerId:'local'});
    for(const p of this.sim.players.values())if(p.alive&&distance(p,site)<8&&this.sim.lineClear(origin,{x:p.x,y:p.y+.8,z:p.z}))this.sim.damage(p,180*(1-distance(p,site)/8),this.player,{explosive:true,weapon:'ВЗРЫВ ТОПЛИВА'});
    for(const f of this.fuel)if(!f.destroyed&&distance(f,site)<8){f.destroyed=true;this.depotExplosion(f);}
    for(const t of this.trucks)if(distance(t,site)<11)t.destroyed=true;
  }
  routeControls(vehicle){
    const route=vehicle.campaignRoute;if(!route)return null;
    const target=route.points[route.index];
    if(!target){vehicle.campaignRoute=null;return {forward:0,strafe:0};}
    if(distance(vehicle,target)<3.8){
      route.index++;
      return route.index>=route.points.length?{forward:0,strafe:0}:this.routeControls(vehicle);
    }
    const desired=bearing(vehicle,target),error=angle(desired-vehicle.yaw);
    return {forward:Math.abs(error)>1?0.3:route.speed??.7,strafe:clamp(-error*2,-1,1)};
  }
  finishExtraction(){
    const evac=this.sim.vehicles.find(v=>v.id==='campaign-evac-car');
    if(!evac||!this.flags.courierSaved)return;
    if(evac.campaignRoute||!evac.seats[0])return;
    // The road ends at the playable boundary: withdraw beyond the visible
    // mission without letting a drivable car cross the world collision fence.
    if(evac.x>227&&distance(evac,this.player)>34){
      const courier=this.sim.players.get('courier');if(courier){courier.withdrawn=true;courier.alive=false;courier.respawnIn=1e8;}
      this.sim.vehicles=this.sim.vehicles.filter(v=>v!==evac);
    }
  }
  spawnVehicle(){
    if(this.sim.vehicles.some(v=>v.id==='campaign-mg-car'))return;
    // Approach from the far east road instead of appearing near the radio.
    // Enter from the north on the existing village road, not from the
    // impassable rocks along the east map boundary.
    const v=this.sim.createMapVehicle({id:'campaign-mg-car',type:'humvee',team:1,x:167,z:171,yaw:0});
    for(const z of [171,168,164,161,158]){
      if(!this.sim.vehicleCollides(v,167,z,0)&&!this.sim.vehicleCollides(v,167,z-3,0)){
        v.z=z;v.y=this.sim.groundAt(167,z);break;
      }
    }
    v.campaignArmor=true;v.hp=560;v.respawnIn=1e8;
    v.campaignRoute={points:[{x:167,z:154},{x:167,z:139}],index:0,speed:.82};
    this.sim.vehicles.push(v);
    const driver=this.sim.addPlayer('car-driver','Водитель противника',1,'assault','ak12','p19',true);
    Object.assign(driver,{campaignRole:'vehicleDriver',campaignGroup:'wave3',campaignZone:'village',vehicleId:v.id,vehicleSeat:0,invulnerableUntil:0});
    v.seats[0]=driver.id;this.sim.syncVehicleSeat(driver,v);
    this.pending.unshift({id:'car-gunner',role:'vehicle',x:v.x,z:v.z,group:'wave3',zone:'village'});
  }
  fail(reason){if(this.failed)return;this.failed=reason;this.progress=0;this.interaction=null;this.player.reviveProgress=0;if(reason.includes('Радист')){this.dialogue={queue:[],active:null,remaining:0};this.say('m01.bruno.failure',true);this.updateDialogue(0);}}
  save(number){
    this.checkpoint=number;
    if(number===2)for(const z of Object.values(this.alerts)){z.level=1;z.last=this.time;}
    if(number===4){this.player.hp=100;this.player.downed=false;}
    this.latestSave=this.serialize();this.saveRevision++;
  }
  serialize(){
    const players=[...this.sim.players.values()].map(p=>Object.fromEntries(persistentPlayerKeys.filter(k=>p[k]!==undefined).map(k=>[k,structuredClone(p[k])])));
    const mission={runtime:this.runtime.state,pending:this.pending,spawned:this.spawned,alerts:this.alerts,spoken:[...this.spoken],light:this.light,order:this.order,route:this.route,chargeSites:this.chargeSites,fuel:this.fuel,trucks:this.trucks,revives:this.revives,fuseUntil:this.fuseUntil??null,checkpoint:this.checkpoint,pickups:this.pickups,cutscene:this.cutscene,unitSerial:this.unitSerial??0};
    return structuredClone({version:CAMPAIGN_SAVE_VERSION,missionId:'m01',definitionVersion:this.definition.version,difficulty:this.sim.difficulty,loadout:this.options.loadout??'silent',time:this.time,rngState:this.sim.rngState,players,mission,vehicles:this.sim.vehicles.map(v=>({...v,runOverHits:undefined})),grenades:this.sim.grenades,rockets:this.sim.rockets,deployables:this.sim.deployables});
  }
  restore(save){
    if(!validCampaignSave(save,this.definition))return false;
    this.sim.time=save.time;this.sim.rngState=save.rngState;this.sim.winner=null;this.sim.players.clear();
    for(const stored of save.players){
      const p=this.sim.addPlayer(stored.id,stored.name,stored.team,stored.classId,stored.primaryWeaponId,stored.sidearmId,stored.bot);
      Object.assign(p,structuredClone(stored),{input:sanitizeInput({yaw:stored.yaw,pitch:stored.pitch}),ai:null,botPath:[],damagers:new Map(),reloading:false,cooldown:0,equipTime:0,reviver:null,reviveProgress:0,respawnIn:stored.alive?0:1e8,lastShotAt:Number.isFinite(stored.lastShotAt)?stored.lastShotAt:-100});
    }
    const m=structuredClone(save.mission);this.runtime.restore(m.runtime);delete m.runtime;this.spoken=new Set(m.spoken);delete m.spoken;Object.assign(this,m);
    this.options.loadout=save.loadout;this.sim.difficulty=save.difficulty;this.tuning=settings[save.difficulty];this.sim.botSettings={...DIFFICULTIES[save.difficulty],aimError:DIFFICULTIES[save.difficulty].aimError/this.tuning.accuracy};
    this.sim.vehicles=structuredClone(save.vehicles??[]);this.sim.grenades=structuredClone(save.grenades??[]);this.sim.rockets=structuredClone(save.rockets??[]);this.sim.deployables=structuredClone(save.deployables??[]);this.sim.bullets=[];
    this.sim.events=[];this.sim.eventId=0;this.processedEvent=0;this.sim.botTeams=null;this.sim.botTeamAt=0;
    // Reconstructing players invokes ordinary spawn sampling. Resume the saved
    // random stream only after reconstruction has finished.
    this.sim.rngState=save.rngState;
    this.dialogue={queue:[],active:null,remaining:0};this.failed=null;this.complete=false;this.awaitingLoadout=false;this.rawInput={};this.lastInput={};this.interaction=null;this.progress=0;this.senseAt=0;this.lastSenseAt=this.time;this.pendingCheckpoint=null;this.revives??=0;
    this.latestSave=structuredClone(save);this.epoch++;return true;
  }
  presentation(){
    const s=this.runtime.state,objective=this.definition.objectives.find(o=>o.id===s.activeObjective),p=this.player;
    const positions={follow:{x:-119,z:-63},ridge:{x:-80,z:-30},depot:{x:20,z:30},village:{x:150,z:105},station:{x:150,z:105},defend:{x:151,z:108}};
    const down=[...this.sim.players.values()].filter(a=>a.team===0&&a.downed&&a.alive&&a.id!=='local'&&(a.id!=='courier'||this.stage>=4&&distance(a,p)<35)).map(a=>({id:a.id,name:a.name,x:a.x,y:a.y,z:a.z,timer:a.downedTimer}));
    const levels=[0,.035,.14,.29,.46,.62,.79,1];
    const stage=Math.min(7,Math.max(0,s.stage));
    const sunriseTarget=clamp(levels[stage]+Math.min(.075,Math.max(0,this.time-s.stageAt)/120*.075),0,1);
    return {missionId:'m01',title:this.definition.title,stage:s.stage,sunriseTarget,stats:{kills:p?.kills??0,elapsedSeconds:Math.max(0,Math.floor(this.time)),revives:this.revives},objective:objective?.text??null,objectives:s.objectives,flags:{...this.flags},target:positions[s.activeObjective]??null,alert:this.alertLevel,alerts:this.alerts,detection:this.detection??0,detectingEnemy:this.detectingEnemy,order:this.order,route:this.route,light:this.light,downed:down,
      squadIds:['local',...this.definition.allies],prompt:this.prompt,progress:this.progress,interaction:this.interaction,subtitle:this.dialogue.active,subtitleRemaining:this.dialogue.remaining,cutscene:this.cutscene,awaitingLoadout:this.awaitingLoadout,failed:this.failed,complete:this.complete,checkpoint:this.checkpoint,saveRevision:this.saveRevision,epoch:this.epoch,
      chargeSites:this.chargeSites,fuel:this.fuel,trucks:this.trucks,fuze:Math.max(0,(this.fuseUntil??0)-this.time),radioRemaining:s.stage>=6?Math.max(0,90-(this.time-(s.timers.defence??this.time))):90,reviveProgress:p?.reviveProgress??0};
  }
}

export function validCampaignSave(save,definition){
  const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v),list=(v,max)=>Array.isArray(v)&&v.length<=max;
  const position=p=>record(p)&&[p.x,p.z].every(Number.isFinite)&&Math.abs(p.x)<=250&&Math.abs(p.z)<=190;
  if(!record(save)||save.version!==CAMPAIGN_SAVE_VERSION||save.missionId!==definition.id||save.definitionVersion!==definition.version||!Object.hasOwn(settings,save.difficulty)||!Number.isFinite(save.time)||save.time<0||save.time>=86400||!Number.isInteger(save.rngState)||save.rngState<0||save.rngState>0xffffffff)return false;
  if(!list(save.players,160)||!save.players.some(p=>p?.id==='local'&&p.team===0)||new Set(save.players.map(p=>p?.id)).size!==save.players.length)return false;
  if(!save.players.every(p=>position(p)&&typeof p.id==='string'&&[0,1].includes(p.team)&&['assault','medic','support','recon'].includes(p.classId)&&[p.y,p.hp,p.yaw,p.pitch].every(Number.isFinite)&&p.hp>=0&&p.hp<=100&&typeof p.alive==='boolean'&&record(p.stowedAmmo)))return false;
  const m=save.mission,r=m?.runtime;
  if(!record(m)||!record(r)||!Number.isInteger(r.stage)||r.stage<0||r.stage>7||!Number.isFinite(r.stageAt)||!record(r.flags)||!record(r.objectives)||!record(r.timers)||!list(r.fired,128)||!r.fired.every(id=>typeof id==='string')||!Object.values(r.timers).every(Number.isFinite))return false;
  if(!list(m.pending,160)||!m.pending.every(u=>position(u)&&typeof u.id==='string'&&typeof u.group==='string'&&Object.hasOwn(definition.zones,u.zone)&&Object.hasOwn({...roles,vehicle:true},u.role))||!record(m.spawned)||!list(m.spoken,512)||!m.spoken.every(k=>typeof k==='string')||!record(m.pickups))return false;
  if(!record(m.alerts)||!['wadi','ridge','depot','village'].every(id=>{const z=m.alerts[id];return record(z)&&Number.isInteger(z.level)&&z.level>=0&&z.level<=3&&Number.isFinite(z.last)&&typeof z.reinforced==='boolean'&&(!z.source||position(z.source));}))return false;
  if(!['night','alarm','dawn'].includes(m.light)||!['follow','hold','radio'].includes(m.order)||!Number.isInteger(m.checkpoint)||m.checkpoint<0||m.checkpoint>4)return false;
  if(!list(m.chargeSites,2)||m.chargeSites.length!==2||!m.chargeSites.every(s=>position(s)&&typeof s.planted==='boolean')||!list(m.fuel,8)||m.fuel.length!==8||!m.fuel.every(f=>position(f)&&typeof f.destroyed==='boolean')||!list(m.trucks,3)||m.trucks.length!==3||!m.trucks.every(t=>position(t)&&typeof t.destroyed==='boolean'))return false;
  if(m.cutscene&&(!Object.hasOwn(definition.cutscenes,m.cutscene.id)||!Number.isFinite(m.cutscene.elapsed)||!Number.isInteger(m.cutscene.line)))return false;
  if(!list(save.vehicles,4)||!save.vehicles.every(v=>position(v)&&v.type==='humvee'&&Number.isFinite(v.hp)&&Array.isArray(v.seats)&&position(v.home)))return false;
  return list(save.grenades,64)&&save.grenades.every(position)&&list(save.rockets,64)&&save.rockets.every(position)&&list(save.deployables,64)&&save.deployables.every(position);
}
