import {Simulation,sanitizeInput} from '../simulation.js';
import {ensureBotState} from '../bot-ai.js';
import {moveBot,resetNavigation} from '../bot-navigation.js';
import {activateGadget} from '../gadgets.js';
import {BLACK_HAWK,BLACK_HAWK_GUN,VEHICLE_TYPES,vehiclePartPose,getVehicleSeatPose} from '../vehicles.js';
import {WEAPONS,getSidearm} from '../world.js';
import {NAHAR,NAHAR_AIR_POSTS,NAHAR_GATES,NAHAR_LANDING,NAHAR_SITES as sites} from './nahar.js';
import {aimAt,departingPose,flightPath,LANDING_SECONDS,landingPose,orbitPose,targetInArc} from './mission4-flight.js';

export const M04_SAVE_VERSION=2;
const STAGES=['approach','right','transfer','orbit','landing','disembark','depot','station','freight','canal','relay','tunnel','finale'];
const CHECKPOINT_STAGES=['approach','right','transfer','depot','freight','canal'];
const MAIN='m03-extraction-1',WING='m03-extraction-2';
const LEFT=BLACK_HAWK_GUN.index;
const SAVE_FIELDS=['stage','stageAt','checkpoint','flags','gates','supplyUsed','enemySerial','order','knowledge','sent','waves',
  'power','source','escortAt','escortFrom','escortAway','orbitAt','combatOrbitAt','landing','departAt','nextRocketAt','lastHullBlast',
  'radio','radioEnd','radioSerial','queue','transmitting'];
const ptWarning='ПТ-90 ГОТОВИТ ВЫСТРЕЛ';
const RADIO_CUES={
  approach:[[6,'marten.sky'],[17,'gunner.check'],[29,'pilot.descend'],[37,'orlov.silent']],
  right:[[12,'marten.roofs'],[27,'gunner.tracers'],[47,'pilot.coverWing'],[68,'marten.secondPass'],[94,'pilot.cross']],
  orbit:[[12,'pilot.stationRoof'],[48,'pilot.orbitTwo'],[73,'orlov.yard']],
  landing:[[7,'marten.yard']],
  disembark:[[8,'pilot.clear']],
  relay:[[18,'marten.relayHold']],
  tunnel:[[9,'orlov.tunnel']],
};
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const close=(a,b,r=3)=>dist(a,b)<r&&Math.abs(a.y-(b.y??0))<1.55;
const eye=(p,h=1.45)=>({x:p.x,y:p.y+h,z:p.z});
const fixed=(p,yaw=p.yaw,pitch=0)=>sanitizeInput({yaw,pitch});
const emptyInput=p=>sanitizeInput({yaw:p.yaw,pitch:p.pitch});

export class Mission4Simulation extends Simulation{
  constructor(definition,options={}){
    super({mapId:NAHAR.id,bots:0,difficulty:options.difficulty});
    this.navigationBudgetMs=1.7;this.pathBudgetMs=1.05;this.pathRequestsPerTick=1;
    this.rngState=803144;
    this.random=()=>{this.rngState=(Math.imul(this.rngState,1664525)+1013904223)>>>0;return this.rngState/4294967296;};
    this.campaign=new NaharDirector(this,definition,options);
    this.campaign.initialize();
  }
  balanceTeams(){}
  updateVehicleActions(){}
  setInput(id,input={}){
    super.setInput(id,input);
    if(id==='local'&&this.campaign)this.campaign.input={...this.players.get(id).input,use:input.use===true};
  }
  moveVehicle(v,input,dt){
    if(v.id===MAIN||v.id===WING)Object.assign(v,this.campaign.aircraftPose(v));
    else super.moveVehicle(v,input,dt);
  }
  movePlayer(p,input,dt){
    if(p.airRole||p.campaignHidden)return;
    if(p.wounded){p.moveSpeed=0;p.vy=0;return;}
    super.movePlayer(p,input,dt);
  }
  thinkBot(p,dt){
    if(!this.campaign.think(p,dt))super.thinkBot(p,dt);
  }
  damage(p,amount,attacker,meta={}){
    const c=this.campaign;
    if(!p?.alive||p.campaignHidden||c.complete||c.stage==='finale'||attacker?.team===p.team&&attacker!==p)return;
    if(p.vehicleId&&(p.airCrew&&p.id!=='local'||p.id==='local'&&c.stage==='transfer'))return;
    if(p.id==='local'&&p.vehicleId===MAIN&&c.aircraft?.hp>0)amount*=meta.explosive?.32:.62;
    if(p.id==='dispatcher'&&p.wounded&&c.stage==='station'&&this.time<p.invulnerableUntil)return;
    super.damage(p,p.team===0?amount*c.settings.damage:amount,attacker,meta);
  }
  damageVehicle(v,amount,attacker,kind,origin,sourceVehicleId){
    const c=this.campaign;
    if(v.id===WING||v.id===MAIN&&!c.airDanger)return {ricochet:false,amount:0};
    if(v.id===MAIN&&kind==='blast'){
      if(this.time-(c.lastHullBlast??-30)<3)return {ricochet:false,amount:0};
      const capped=Math.min(amount,v.maxHp*c.settings.rocketHull/VEHICLE_TYPES[BLACK_HAWK].blastArmor);
      const hit=super.damageVehicle(v,capped,attacker,kind,origin,sourceVehicleId);
      if(hit?.amount>0||v.hp<=0)c.lastHullBlast=this.time;
      return hit;
    }
    if(v.id===MAIN&&kind==='bullet')amount*=.46;
    return super.damageVehicle(v,amount,attacker,kind,origin,sourceVehicleId);
  }
  step(dt){
    const c=this.campaign;
    if(c.failed||c.complete)return;
    c.beforeStep(dt);super.step(dt);c.afterStep(dt);
  }
  snapshot(){
    const state=super.snapshot();
    state.players=state.players.filter(p=>!this.players.get(p.id).campaignHidden).map(p=>{
      const actor=this.players.get(p.id);
      return {...p,role:actor.role,downed:Boolean(actor.wounded),medkits:actor.medkits??0};
    });
    state.campaign=this.campaign.presentation();
    return state;
  }
}

class NaharDirector{
  constructor(sim,definition,options){
    this.sim=sim;this.definition=definition;this.options=options;this.settings=definition.difficulty[sim.difficulty];
    this.carry=options.campaignProgress?.carry??{};this.stage='approach';this.stageAt=0;
    this.checkpoint=0;this.saveRevision=0;this.epoch=0;this.failed=null;this.complete=false;
    this.flags={m4_done:false,m4_dispatcher_alive:false,m4_signal_sent:false};
    this.input={};this.radio=null;this.radioEnd=0;this.radioSerial=0;this.queue=[];this.eventsDone=new Set();
    this.gates={service:false,tunnel:false};this.progress=0;this.supplyUsed=false;this.enemySerial=0;
    this.order='follow';this.knowledge={log:false,recording:false};this.sent=0;this.waves=0;this.power=false;
  }
  get time(){return this.sim.time;}
  get age(){return this.time-this.stageAt;}
  get player(){return this.sim.players.get('local');}
  get aircraft(){return this.sim.vehicles.find(v=>v.id===MAIN);}
  get wing(){return this.sim.vehicles.find(v=>v.id===WING);}
  get dispatcher(){return this.sim.players.get('dispatcher');}
  get airborne(){return STAGES.indexOf(this.stage)<STAGES.indexOf('depot');}
  get airDanger(){return ['right','orbit','landing'].includes(this.stage);}
  get wingSpeaker(){return this.sim.players.get('duran')?.alive?'duran':'wing';}
  get medic(){return this.sim.players.get('lasko')??this.sim.players.get('medic');}
  get checkpointShifting(){return this.switchAt!=null;}

  initialize(){
    const chosen=WEAPONS[this.options.loadout?.primary];
    const weapon=chosen&&!chosen.sidearm?chosen:WEAPONS.ar416;
    const sidearm=getSidearm(this.options.loadout?.sidearm);
    const p=this.add('local','Ян Мартен',0,weapon.classId,weapon.id,null,'marten',false,sidearm.id);
    p.medkits=2;
    for(const [id,role] of [[MAIN,'transport'],[WING,'escort']]){
      const pose=this.aircraftPose({id});
      const v=this.sim.createMapVehicle({id,type:BLACK_HAWK,team:0,noRespawn:true,...pose});
      Object.assign(v,pose,{m04Aircraft:role});this.sim.vehicles.push(v);
    }
    const pilot=this.add('pilot','Лида Соколова',0,'assault','ar416',null,'pilot');
    const gunner=this.add('gunner','Бортстрелок Грач',0,'support','mg36',null,'gunner');
    const passenger=this.carry.lasko_alive===false?
      this.add('medic','Санитар бригады',0,'medic','mcx9',null,'medic'):
      this.add('lasko','Тео Ласко',0,'medic','mcx9',null,'medic');
    const wingman=this.carry.duran_alive===false?
      this.add('wing','Стрелок бригады',0,'assault','ar416',null,'wing'):
      this.add('duran','Гари Дюран',0,'assault','ar416',null,'wing');
    const second=this.add('escort-pilot','Пилот второго борта',0,'assault','ar416',null,'escort');
    const rightSeat=Number(this.options.loadout?.seat)===4?4:3;
    for(const [actor,seat] of [[pilot,0],[passenger,1],[gunner,LEFT],[wingman,rightSeat===3?4:3],[p,rightSeat]]){
      actor.airCrew=true;this.seat(actor,this.aircraft,seat);
    }
    second.airCrew=true;this.seat(second,this.wing,0);
    this.say('pilot.city');this.say('orlov.inbound');this.say('gunner.ready');this.updateRadio();
    this.initialSave=this.serialize();
  }
  add(id,name,team,cls,weapon,where,role,bot=true,sidearm='p19'){
    const p=this.sim.addPlayer(id,name,team,cls,weapon,sidearm,bot);
    p.role=role;
    if(where)this.place(p,where);
    return p;
  }
  place(actor,at){
    const desired={...at,y:at.y??this.sim.groundAt(at.x,at.z)};
    for(let i=0;i<34;i++){
      const a=i*2.399,r=Math.sqrt(i)*.67;
      const x=desired.x+r*Math.cos(a),z=desired.z+r*Math.sin(a);
      const y=at.y??this.sim.groundAt(x,z);
      if(this.sim.collides(x,z,y+.023)||this.sim.vehicleAt(x,z,y)||
        [...this.sim.players.values()].some(p=>p!==actor&&p.alive&&!p.vehicleId&&close(p,{x,y,z},.65)))continue;
      Object.assign(actor,{x,y,z,grounded:true,vy:0,moveSpeed:0,tickX:x,tickZ:z});return;
    }
    Object.assign(actor,{...desired,grounded:true,vy:0,moveSpeed:0,tickX:desired.x,tickZ:desired.z});
  }
  seat(actor,vehicle,seat){
    if(actor.vehicleId===vehicle.id&&vehicle.seats[actor.vehicleSeat]===actor.id)vehicle.seats[actor.vehicleSeat]=null;
    vehicle.seats[seat]=actor.id;
    const yaw=vehicle.yaw+(VEHICLE_TYPES[BLACK_HAWK].seats[seat].facing??0);
    Object.assign(actor,{vehicleId:vehicle.id,vehicleSeat:seat,yaw,pitch:0,input:fixed(actor,yaw),
      reloading:false,reloadTime:0,heldGadget:null,pendingGadget:null,gadgetAction:null});
    this.sim.syncVehicleSeat(actor,vehicle);
  }
  say(key,urgent=false){
    if(!this.options.lines?.[key])return;
    if(urgent){this.queue.length=0;this.radio=null;this.radioEnd=0;}
    this.queue.push(key);
  }
  updateRadio(){
    if(this.radio&&this.time<this.radioEnd)return;
    const key=this.queue.shift();
    this.radio=key?{key,serial:++this.radioSerial}:null;
    this.radioEnd=key?this.time+this.options.lines[key].duration:0;
  }
  radioCues(){
    if(this.stage==='relay'&&!this.transmitting)return;
    const elapsed=this.stage==='orbit'?this.time-this.combatOrbitAt:this.stage==='relay'?this.sent:this.age;
    for(const [at,key] of RADIO_CUES[this.stage]??[]){
      if(elapsed<at||this.eventsDone.has(key))continue;
      this.eventsDone.add(key);this.say(key);
    }
  }
  setStage(stage){
    this.stage=stage;this.stageAt=this.time;this.interaction=null;this.progress=0;
  }

  aircraftPose(v){
    const route=this.definition.flight;
    if(v.id===WING){
      const right=this.escortAt!=null,turn=right?this.time-this.escortAt:0;
      const pose=flightPath(right?route.right:route.approach,this.age);
      if(this.escortAway){
        const t=this.time-this.escortAway;
        return {...this.escortFrom,x:this.escortFrom.x+11*t,y:this.escortFrom.y+2.4*t,z:this.escortFrom.z+2*t,yaw:-1.74,speed:12};
      }
      return {...pose,x:pose.x+54,y:pose.y+6,z:pose.z+28,bodyRoll:right?.04*Math.sin(turn*.45):0};
    }
    if(this.departAt!=null)return departingPose(this.landing.pad,this.time-this.departAt,this.sim.map.terrain);
    if(this.landing)return landingPose(this.landing,this.time-this.landing.at,this.sim.map.terrain);
    if(this.orbitAt!=null){
      if(this.time>=this.orbitAt)return orbitPose(route.orbit,this.time-this.orbitAt);
      return flightPath(route.turn,this.time-this.orbitAt+route.turn.at(-1)[0]);
    }
    return flightPath(this.stage==='right'?route.right:route.approach,this.age);
  }
  spawnAir(wave){
    for(const [id,count,launcher] of wave.posts){
      const post=NAHAR_AIR_POSTS[id];
      for(let i=0;i<count;i++){
        const x=post.x+(i===0?-.6:i===1?-4:3.4),z=post.z+(i===0?-2.5:i===1?.8:1.7);
        const p=this.add(`roof-${++this.enemySerial}`,'Стрелок Корпуса',1,'assault','ar416',null,'roof');
        const pt=launcher&&i===0;
        Object.assign(p,{x,y:post.y,z,grounded:true,airRole:pt?'pt':'rifle',airPost:id,rockets:pt?1:0,
          hp:pt?57:p.hp,fireOffset:i*.37+this.enemySerial*.135,notBefore:this.time+.8+i*.55});
      }
    }
  }
  airTargets(){return [...this.sim.players.values()].filter(p=>p.alive&&p.airRole&&!p.campaignHidden);}
  updateThreat(){
    const craft=this.aircraft,player=this.player;
    const seat=player.vehicleSeat;
    const effectiveRange=seat===LEFT?177:Math.min(159,this.sim.playerWeapon(player).range*.91);
    const visible=target=>dist(craft,target)<effectiveRange&&targetInArc(this.sim,craft,seat,target);
    const active=this.sim.players.get(this.threatId);
    if(active&&(!active.alive||active.rockets<=0||this.time<(active.suppressedUntil??0)||
      !visible(active))){
      active.aimAt=null;active.heldGadget=null;this.threatId=null;
    }
    if(!this.threatId&&this.time>=(this.nextRocketAt??0)){
      const target=this.airTargets().filter(p=>p.airRole==='pt'&&p.rockets>0&&this.time>=p.notBefore&&
        this.time>=(p.suppressedUntil??0)&&visible(p)).sort((a,b)=>dist(craft,a)-dist(craft,b))[0];
      if(target){
        this.threatId=target.id;target.aimAt=this.time+this.settings.aimSeconds;target.heldGadget='launcher';
        if(!target.warned){
          target.warned=true;
          this.say(target.airPost==='blue'?`${this.wingSpeaker}.blue`:'pilot.roofDanger',true);
        }
      }
    }
    const threat=this.sim.players.get(this.threatId);
    if(threat?.aimAt!=null&&this.time>=threat.aimAt){
      threat.aimAt=null;threat.heldGadget=null;this.threatId=null;
      threat.notBefore=this.time+this.settings.rocketGap;
      const target=this.stage==='right'&&!this.eventsDone.has('rocket-wing')?this.wing??craft:craft;
      this.eventsDone.add('rocket-wing');
      const speed=85,dt=Math.min(2.2,dist(threat,target)/speed);
      const prediction=vehiclePartPose(target,0,1.8,0);
      prediction.x-=Math.sin(target.yaw)*target.speed*dt;prediction.z-=Math.cos(target.yaw)*target.speed*dt;
      prediction.y+=Math.max(-8,Math.min(8,target.verticalSpeed*dt))+1.4*dt**2;
      Object.assign(threat.input,aimAt(eye(threat),prediction),{aim:true,fire:false});
      if(activateGadget(this.sim,threat,true)){
        threat.rocketYaw=threat.input.yaw;threat.rocketPitch=threat.input.pitch;
        this.nextRocketAt=this.time+this.settings.rocketGap;
        this.say('pilot.rocket',true);
      }
    }
  }
  updateAir(){
    const route=this.definition.flight;
    if(this.stage==='approach'&&this.age>=route.approach.at(-1)[0]){
      this.setStage('right');this.escortAt=this.time;this.say('pilot.contact');this.save(1);
    }else if(this.stage==='right'&&this.age>=route.right.at(-1)[0]){
      this.escortFrom={...this.wing};this.escortAway=this.time;
      this.orbitAt=this.time+route.turn.at(-1)[0];
      const gunner=this.sim.players.get('gunner'),craft=this.aircraft;
      craft.seats[LEFT]=null;
      Object.assign(gunner,{vehicleId:null,vehicleSeat:null,hp:0,alive:false,campaignHidden:true});
      const {x,y,z}=vehiclePartPose(craft,-1.11,2.12,-.64);
      this.sim.event('bulletImpact',{x,y,z,tx:x,ty:y,tz:z,impact:'metal',impactVehicleId:craft.id});
      this.threatId=null;this.setStage('transfer');
      this.say('gunner.cut',true);this.say('pilot.gunnerDown');this.say(`${this.wingSpeaker}.transfer`);this.say(this.medic.id+'.gunnerDown');
      this.save(2);
    }
    const groups=this.stage==='right'?route.airWaves:this.stage==='orbit'&&this.time>=this.orbitAt?route.orbitWaves:null;
    if(groups){
      const elapsed=this.stage==='right'?this.age:this.time-this.combatOrbitAt;
      for(const [index,wave] of groups.entries()){
        const key=`${this.stage}-wave-${index}`;
        if(elapsed>=wave.at&&!this.eventsDone.has(key)){this.eventsDone.add(key);this.spawnAir(wave);}
      }
    }
    if(this.stage==='transfer'){
      if(this.checkpointShifting&&this.time>=this.switchAt){
        this.seat(this.player,this.aircraft,LEFT);this.switchAt=null;
        this.combatOrbitAt=Math.max(this.time,this.orbitAt);this.setStage('orbit');
        this.say('marten.seated');this.say('pilot.orbit');
      }else if(this.age>14&&!this.checkpointShifting&&!this.eventsDone.has('hold')){
        this.eventsDone.add('hold');this.say('pilot.hold');
      }
    }
    if(this.airDanger)this.updateThreat();
    if(this.stage==='orbit')this.checkLanding();
    if(this.stage==='landing'&&this.age>=LANDING_SECONDS){
      this.setStage('disembark');this.clearAir();
      this.unseatInfantry();this.say('pilot.touchdown',true);
    }
    if(this.lastHullBlast!=null&&this.aircraft?.hp>0&&!this.eventsDone.has('hull')){
      this.eventsDone.add('hull');this.say('pilot.hull',true);
    }
    if(this.escortAway!=null&&this.time-this.escortAway>23&&this.wing){
      this.sim.removePlayer('escort-pilot');this.sim.vehicles=this.sim.vehicles.filter(v=>v.id!==WING);
    }
  }
  checkLanding(){
    const lap=this.definition.flight.orbit.seconds,passed=this.time-this.combatOrbitAt;
    if(passed<2*lap)return;
    this.landingClearSince??=this.time;
    const danger=this.airTargets().filter(p=>p.role==='roof'&&dist(p,NAHAR_LANDING.primary)<124&&
      p.airRole==='pt'&&p.rockets>0&&this.time>=(p.suppressedUntil??0));
    const riflePressure=this.airTargets().filter(p=>p.airRole==='rifle'&&dist(p,NAHAR_LANDING.primary)<113).length;
    const clear=!danger.length&&(riflePressure<=6||passed>lap*2+12);
    if(!clear)this.landingClearSince=this.time;
    if(clear&&this.time-this.landingClearSince>1.25){this.beginLanding('primary');return;}
    if(!this.eventsDone.has('extra-circle')){this.eventsDone.add('extra-circle');this.say('pilot.again');}
    if(passed>=3*lap)this.beginLanding('alternate');
  }
  beginLanding(kind){
    const from=this.aircraft;
    this.landing={kind,pad:NAHAR_LANDING[kind],at:this.time,from:{x:from.x,y:from.y,z:from.z,yaw:from.yaw,
      bodyPitch:from.bodyPitch,bodyRoll:from.bodyRoll}};
    // The backup yard sits outside the roofs that denied the main approach.
    if(kind==='alternate')this.threatId=null;
    this.setStage('landing');this.say(kind==='alternate'?'pilot.backup':'pilot.land',true);
  }
  clearAir(){
    this.threatId=null;
    for(const p of this.airTargets())this.sim.removePlayer(p.id);
    this.sim.rockets=this.sim.rockets.filter(r=>this.sim.players.has(r.ownerId));
  }
  unseatInfantry(){
    const v=this.aircraft;
    for(const [i,seat] of [1,3,4].entries()){
      const p=this.sim.players.get(v.seats[seat]);
      if(!p||p.id==='local')continue;
      this.sim.dismountVehicle(p,true);
      this.place(p,{x:v.x+7+i*1.7,z:v.z+3+i*2});p.squadMember=true;
    }
  }
  exitAircraft(){
    const v=this.aircraft,p=this.player;
    this.sim.dismountVehicle(p,true);
    this.place(p,{x:v.x+5,z:v.z+4});
    const yaw=Math.atan2(p.x-sites.platforms.x,p.z-sites.platforms.z);
    Object.assign(p,{yaw,pitch:0,input:fixed(p,yaw)});
    this.departAt=this.time+4;this.setStage('depot');
    if(this.carry.bruno_alive!==false){
      const bruno=this.add('bruno','Бруно Валь',0,'support','pkp',{x:v.x+12,z:v.z+12},'signals');bruno.squadMember=true;
    }
    this.spawnGround('depot');this.say('marten.onFoot');this.say(this.medic.id+'.down');this.say('orlov.routes');
    if(this.carry.m3_documents)this.say(this.sim.players.has('bruno')?'bruno.route':'wing.route');
    this.save(3);
  }

  think(p,dt){
    const craft=this.aircraft;
    if(p.campaignHidden||p.wounded||this.stage==='finale'){p.input=fixed(p);return true;}
    if(p.airRole){
      if(p.pendingGadget){p.input=fixed(p,p.rocketYaw,p.rocketPitch);p.input.aim=true;return true;}
      const v=this.stage==='right'?this.wing??craft:craft,target=vehiclePartPose(v,0,2,0);
      const burst=(this.time+p.fireOffset)%3.2<.28;
      p.input=sanitizeInput({...aimAt(eye(p),target),aim:p.aimAt!=null,
        fire:p.airRole==='rifle'&&this.airDanger&&burst&&dist(p,v)<145&&this.sim.lineClear(eye(p),target)});
      p.crouching=this.time<(p.suppressedUntil??0);
      return true;
    }
    if(p.vehicleId){
      const v=this.sim.vehicles.find(v=>v.id===p.vehicleId),seat=VEHICLE_TYPES[BLACK_HAWK].seats[p.vehicleSeat];
      const target=this.airDanger&&(p.role==='wing'||p.role==='gunner')?this.airTargets().find(a=>a.airRole==='rifle'&&targetInArc(this.sim,v,p.vehicleSeat,a)):null;
      const aim=target?aimAt(getVehicleSeatPose(v,p.vehicleSeat),eye(target,1.08)):{yaw:v.yaw+(seat.facing??0),pitch:0};
      p.input=sanitizeInput({...aim,aim:Boolean(target),fire:Boolean(target)&&(this.time%3.6)<.45});return true;
    }
    if(p===this.dispatcher&&p.rescued){
      p.input=fixed(p);
      const goal=this.squadGoal(p);
      if(!close(p,goal,2.1)){ensureBotState(this.sim,p);moveBot(this.sim,p,goal,dt,{sprint:false,followSteps:true});}
      return true;
    }
    if(p===this.medic&&this.dispatcher?.wounded&&this.dispatcher.alive&&close(this.player,this.dispatcher,12)&&this.order==='assist'){
      const patient=this.dispatcher;
      p.input=fixed(p,aimAt(eye(p),patient).yaw);
      if(!close(p,patient,2.4)){ensureBotState(this.sim,p);moveBot(this.sim,p,patient,dt,{sprint:true,followSteps:true});}
      return true;
    }
    return false;
  }
  canSee(a,b){
    if(b.campaignHidden||b.airRole||b.vehicleId)return false;
    return this.sim.lineClear(eye(a),eye(b,b.wounded?.55:1.2));
  }
  squadGoal(p){
    const player=this.player,offset=p.botSlot%3;
    if(this.stage==='tunnel'&&this.gates.tunnel)return sites.exit;
    if(this.order==='hold'&&p!==this.dispatcher)return p.holdAt??p;
    if(Math.abs(p.y-player.y)>1.1)return player;
    const goal={x:player.x+Math.cos(offset*2.4)*3,z:player.z+Math.sin(offset*2.4)*3,y:player.y};
    return this.sim.collides(goal.x,goal.z,goal.y+.03)?player:goal;
  }
  botGoal(p){
    if(p.team===0)return this.squadGoal(p);
    if(p.assaultGoal&&dist(p,p.assaultGoal)>3)return p.assaultGoal;
    return dist(p,p.home)>9?p.home:{x:p.home.x+Math.sin(this.time*.12+p.botSlot)*3,z:p.home.z+Math.cos(p.botSlot)*3,y:p.home.y};
  }
  spawnGround(key,points=this.definition.ground[key]){
    for(const [i,[x,z,y]] of points.entries()){
      const cls=i%5===3?'support':i%5===4?'recon':'assault';
      const weapon=cls==='support'?'mg36':cls==='recon'?'dmr12':'ar416';
      const p=this.add(`nahar-enemy-${++this.enemySerial}`,'Боец Корпуса',1,cls,weapon,{x,y,z},key);
      p.home={x:p.x,y:p.y,z:p.z};p.grenades=i%5===3?1:0;p.rockets=0;
      if(key==='relay')p.assaultGoal=i%2?sites.relay:sites.power;
      if(key==='tunnel')p.assaultGoal={x:172,z:190};
    }
  }
  openGate(name){
    if(this.gates[name])return;
    this.gates[name]=true;this.syncGates();
  }
  syncGates(){
    this.sim.refreshCampaignColliders(new Set(Object.entries(NAHAR_GATES).filter(([id])=>this.gates[id]).map(([,b])=>b.id)));
    resetNavigation(this.sim);for(const p of this.sim.players.values()){p.ai=null;p.botPath=[];}
  }
  acquire(source){
    if(this.stage!=='station')return;
    this.flags.m4_dispatcher_alive=Boolean(this.dispatcher?.alive);
    this.source=source;
    this.setStage('freight');this.spawnGround('freight');
    this.say(source==='dispatcher'?'dispatcher.live':'marten.copy');
    if(source==='dispatcher'){this.say('marten.moveDispatcher');this.say('dispatcher.walk');}
    this.say('orlov.freight');this.save(4);
  }
  reviveDispatcher(){
    const p=this.dispatcher;if(!p?.alive||!p.wounded)return;
    Object.assign(p,{wounded:false,rescued:true,prone:false,hp:65});
    if(this.order==='assist'&&this.medic?.alive&&close(this.medic,p,3))this.say(this.medic.id+'.pulse',true);
    this.acquire('dispatcher');
  }
  updateGround(dt){
    const p=this.player,craft=this.aircraft;
    if(craft&&this.departAt!=null&&this.time-this.departAt>=24.5){
      this.sim.removePlayer('pilot');this.sim.vehicles=this.sim.vehicles.filter(v=>v.id!==MAIN);
    }
    if(this.stage==='depot'&&dist(p,sites.station)<55){
      this.setStage('station');this.spawnGround('station');
      const d=this.add('dispatcher','Диспетчер',0,'medic','mcx9',sites.dispatcher,'dispatcher');
      Object.assign(d,{wounded:true,hp:42,prone:true,invulnerableUntil:this.time+9});
      this.say('orlov.dispatch');this.say('orlov.stationIn');
    }else if(this.stage==='freight'&&p.z>52&&p.x>12){
      this.setStage('canal');this.spawnGround('canal');this.say('orlov.channel');this.save(5);
    }
    if(this.dispatcher?.wounded&&this.dispatcher.alive&&this.order==='assist'){
      const medic=this.medic;
      if(medic?.alive&&close(medic,this.dispatcher,2.5)&&this.sim.lineClear(eye(medic),eye(this.dispatcher,.5))){
        this.medicCare=(this.medicCare??0)+dt;if(this.medicCare>=3.4)this.reviveDispatcher();
      }else this.medicCare=0;
    }
    if(this.stage==='station'&&this.knowledge.log&&this.knowledge.recording)this.acquire('recording');
    if(this.stage==='relay'&&this.transmitting)this.updateTransmission(dt);
    if(this.stage==='tunnel'&&this.gates.tunnel&&close(p,sites.exit,5)){
      this.exitAt??=this.time;
      if(this.time-this.exitAt>3||[...this.sim.players.values()].every(a=>!a.alive||a.team!==0||!a.squadMember||close(a,sites.exit,9))){
        this.flags.m4_dispatcher_alive=Boolean(this.dispatcher?.alive&&this.dispatcher.rescued);
        this.setStage('finale');this.say('marten.exit');
      }
    }else this.exitAt=null;
    if(this.stage==='finale'&&!this.radio&&!this.queue.length&&this.age>=6){this.flags.m4_done=true;this.complete=true;}
  }
  updateTransmission(dt){
    const length=this.settings.hold;
    const waves=this.definition.ground.relay;
    if(this.waves<waves.length&&this.sent>=length*[0,.31,.62][this.waves]){
      this.spawnGround('relay',waves[this.waves]);this.waves++;
      this.say(`${this.wingSpeaker}.pressure`);
    }
    if(!this.power||dist(this.player,sites.relay)>32)return;
    const threat=[...this.sim.players.values()].find(p=>p.team===1&&p.alive&&p.role==='relay'&&close(p,sites.power,5.5));
    if(threat&&this.sent>length*.37&&!this.eventsDone.has('power-cut')){
      this.power=false;this.eventsDone.add('power-cut');this.say(`${this.wingSpeaker}.broken`,true);return;
    }
    this.sent=Math.min(length,this.sent+dt);
    if(this.sent>=length*.82&&!this.eventsDone.has('signal-almost')){
      this.eventsDone.add('signal-almost');this.say('orlov.signalAlmost');
    }
    if(this.sent>=length){
      this.flags.m4_signal_sent=true;this.setStage('tunnel');this.spawnGround('tunnel');
      this.say('orlov.received',true);
      if(this.dispatcher?.alive&&this.dispatcher.rescued){this.say('dispatcher.gate');this.openGate('tunnel');}
    }
  }
  get supply(){return this.landing?.kind==='alternate'?sites.supplyAlternate:sites.supplyPrimary;}
  candidates(){
    const current=this.stage,patient=this.dispatcher;
    const options=[];
    if(current==='depot'||current==='station'||current==='freight'){
      if(!this.supplyUsed)options.push(['supply','Пополнить боезапас',this.supply,1,()=>{
        const p=this.player,weapon=WEAPONS[p.weaponId],stowed=WEAPONS[p.weaponSlot===2?p.primaryWeaponId:p.sidearmId];
        p.reserve=Math.max(p.reserve,weapon.reserve);p.stowedAmmo.reserve=Math.max(p.stowedAmmo.reserve,stowed.reserve);
        this.supplyUsed=true;
      }]);
      if(!this.gates.service)options.push(['service','Открыть служебный вход',NAHAR_GATES.service,1.3,()=>this.openGate('service')]);
    }
    if(current==='station'&&patient?.alive&&patient.wounded)
      options.push(['dispatcher','Помочь диспетчеру',patient,3,()=>this.reviveDispatcher()]);
    if(current==='station'&&!patient?.alive){
      if(!this.knowledge.log)options.push(['log','Забрать журнал рейсов',sites.log,1.25,()=>{this.knowledge.log=true;}]);
      if(!this.knowledge.recording)options.push(['recording','Забрать запись',sites.recording,1.25,()=>{this.knowledge.recording=true;}]);
    }
    if((current==='canal'||current==='relay')&&!this.power)options.push(['power','Включить питание',sites.power,1.8,()=>{
      this.power=true;
      if(current==='canal'){this.setStage('relay');this.say('marten.power',true);}
      else this.say('marten.repair',true);
    }]);
    if(current==='relay'&&this.power&&!this.transmitting)options.push(['relay','Начать передачу',sites.relay,1.25,()=>{
      this.transmitting=true;this.say('orlov.send',true);
    }]);
    if(current==='tunnel'&&!this.gates.tunnel)options.push(['tunnel','Открыть калитку ключом',sites.tunnelGate,1.2,()=>this.openGate('tunnel')]);
    return options;
  }
  beforeStep(dt){
    const p=this.player,swap=this.input.switchSeat&&!this.lastSwap;
    this.lastSwap=Boolean(this.input.switchSeat);this.prompt='';
    if(this.airborne){
      p.input.toolSlot=0;p.input.interact=false;p.input.order=false;p.input.grenade=false;
      if(this.stage==='approach'&&swap&&p.vehicleSeat>=3){
        const v=this.aircraft,other=this.sim.players.get(v.seats[p.vehicleSeat===3?4:3]);
        if(other){const a=p.vehicleSeat,b=other.vehicleSeat;this.seat(other,v,a);this.seat(p,v,b);}
      }
      if(this.stage==='transfer'){
        p.input.fire=false;
        if(swap&&this.age>=3.6&&!this.checkpointShifting){
          this.switchAt=this.time+1.65;this.say('marten.moveGun');
        }
      }
      if(this.stage==='disembark'&&this.age>=1.4&&this.input.use)this.exitAircraft();
      return;
    }
    if(this.stage==='finale'){p.input=emptyInput(p);return;}
    if(this.input.order&&!this.lastOrder)this.command({type:'order',order:'follow'});
    this.lastOrder=Boolean(this.input.order);
    const use=this.candidates().filter(([, ,point])=>close(p,point,2.7)).sort((a,b)=>dist(p,a[2])-dist(p,b[2]))[0];
    if(!use){this.interaction=null;this.progress=0;return;}
    const [id,label,,seconds,action]=use;this.prompt=label;
    if(this.interaction!==id){this.interaction=id;this.progress=0;}
    this.progress=this.input.use?this.progress+dt/seconds:0;
    if(this.progress>=1){this.progress=0;this.interaction=null;action();}
  }
  afterStep(dt){
    if(!this.player.alive||this.airborne&&this.aircraft?.hp<=0){
      this.failed=this.airborne?'Вертолёт потерян. Вернитесь к контрольной точке.':'Мартен погиб. Вернитесь к контрольной точке.';
      return;
    }
    for(const p of this.airTargets())if(p.airRole==='pt'&&p.lastHurt>this.time-.04){
      p.suppressedUntil=this.time+7;p.aimAt=null;p.heldGadget=null;
      if(this.threatId===p.id){
        this.threatId=null;
        if(!this.eventsDone.has('confirmed-suppression')){
          this.eventsDone.add('confirmed-suppression');this.say('marten.suppressed');
        }
      }
    }
    if(this.airborne)this.updateAir();else this.updateGround(dt);
    this.radioCues();
    this.updateRadio();
  }
  command(command){
    if(command?.type==='retry'){this.restore(this.latestSave??this.initialSave);return;}
    if(command?.type!=='order'||this.airborne||this.complete||this.failed||!['follow','hold','assist'].includes(command.order))return;
    this.order=command.order;
    if(this.order==='hold')for(const p of this.sim.players.values())if(p.squadMember)p.holdAt={x:p.x,y:p.y,z:p.z};
  }
  target(){
    switch(this.stage){
      case 'depot':return sites.platforms;
      case 'station':return this.dispatcher?.alive?this.dispatcher:!this.knowledge.log?sites.log:sites.recording;
      case 'freight':return sites.freight;
      case 'canal':return this.player.z<132?sites.bridge:sites.power;
      case 'relay':return this.power?sites.relay:sites.power;
      case 'tunnel':return this.gates.tunnel?sites.exit:sites.tunnelGate;
      default:return null;
    }
  }
  presentation(){
    const threat=this.sim.players.get(this.threatId),target=this.target();
    const player=this.player,craft=this.aircraft;
    const transfer=this.checkpointShifting?Math.max(0,1-(this.switchAt-this.time)/1.65):null;
    return {missionId:'m04',objective:this.stage,stage:this.stage,stageAt:this.stageAt,time:this.time,
      epoch:this.epoch,checkpoint:this.checkpoint,complete:this.complete,failed:this.failed,cutscene:this.stage==='finale'?{id:'finale',elapsed:this.age}:null,
      airborne:this.airborne,transfer,transferReady:this.stage==='transfer'&&this.age>=3.6,
      disembarkReady:this.stage==='disembark'&&this.age>=1.4,landing:this.landing?.kind??null,
      hull:craft?Math.ceil(craft.hp/craft.maxHp*100):null,bodyRoll:craft?.bodyRoll??0,
      threat:threat?.alive?{...eye(threat,2.45),label:ptWarning,time:Math.max(0,(threat.aimAt??this.time)-this.time)}:null,
      target:target?{x:target.x,y:target.y??0,z:target.z}:null,gates:{...this.gates},
      prompt:this.prompt,progress:this.progress,order:this.order,power:this.power,transmitting:this.transmitting??false,
      sent:this.sent/this.settings.hold,source:this.source??null,flags:{...this.flags},
      radio:this.radio,radioRemaining:Math.max(0,this.radioEnd-this.time),
      stats:{elapsedSeconds:Math.floor(this.time),kills:player.kills,
        losses:[...this.sim.players.values()].filter(p=>p.team===0&&!p.alive).length},
    };
  }

  save(number){
    if(this.options.ironman)return;
    this.checkpoint=number;this.latestSave=this.serialize();this.saveRevision++;
  }
  serialize(){
    const sim=this.sim;
    const mission=Object.fromEntries(SAVE_FIELDS.map(key=>[key,this[key]]));
    mission.eventsDone=[...this.eventsDone];
    return structuredClone({version:M04_SAVE_VERSION,definitionVersion:this.definition.version,missionId:'m04',
      difficulty:sim.difficulty,time:this.time,rngState:sim.rngState,mission,
      players:[...sim.players.values()].map(({ai,damagers,botPath,...p})=>p),
      vehicles:sim.vehicles.map(({runOverHits,...v})=>v),weaponKills:Object.fromEntries(sim.weaponKills),
      grenades:sim.grenades,rockets:sim.rockets,bullets:sim.bullets,deployables:sim.deployables});
  }
  restore(save){
    if(!validMission4Save(save,this.definition))return false;
    const sim=this.sim;resetNavigation(sim);sim.players.clear();sim.vehicles=structuredClone(save.vehicles);
    for(const actor of save.players){
      const p=sim.addPlayer(actor.id,actor.name,actor.team,actor.classId,actor.primaryWeaponId,actor.sidearmId,actor.bot);
      Object.assign(p,structuredClone(actor),{ai:null,damagers:new Map(),botPath:[]});
    }
    for(const key of ['grenades','rockets','bullets','deployables'])sim[key]=structuredClone(save[key]);
    sim.time=save.time;sim.rngState=save.rngState;sim.events=[];sim.eventId=0;sim.botTeams=null;sim.botTeamAt=0;
    sim.weaponKills=new Map(Object.entries(save.weaponKills??{}));
    for(const key of SAVE_FIELDS)this[key]=structuredClone(save.mission[key]);
    Object.assign(this,{failed:null,complete:false,input:{},lastSwap:false,lastOrder:false,
      switchAt:null,threatId:null,prompt:'',progress:0,interaction:null,medicCare:0,exitAt:null,landingClearSince:null});
    this.eventsDone=new Set(save.mission.eventsDone);this.syncGates();
    this.latestSave=this.checkpoint?structuredClone(save):null;this.saveRevision++;this.epoch++;
    return true;
  }
}

export function validMission4Save(save,definition){
  const point=p=>p&&[p.x,p.y,p.z].every(Number.isFinite)&&Math.abs(p.x)<=1025&&Math.abs(p.z)<=1025&&Math.abs(p.y)<400;
  const list=(items,max)=>Array.isArray(items)&&items.length<=max&&items.every(point);
  const m=save?.mission;
  if(save?.version!==M04_SAVE_VERSION||save.missionId!=='m04'||save.definitionVersion!==definition.version||
    !['recruit','regular','veteran'].includes(save.difficulty)||!Number.isFinite(save.time)||save.time<0||
    !Number.isInteger(save.rngState)||!m||!Number.isInteger(m.checkpoint)||CHECKPOINT_STAGES[m.checkpoint]!==m.stage||
    !Number.isFinite(m.stageAt)||m.stageAt>save.time||!Array.isArray(m.eventsDone)||m.eventsDone.length>64||
    !m.flags||!m.gates||!m.knowledge||!Array.isArray(m.queue)||!['follow','hold','assist'].includes(m.order)||
    !list(save.players,100)||!list(save.vehicles,2))return false;
  const aircraft=save.vehicles;
  if(!aircraft.every(v=>(v.id===MAIN||v.id===WING)&&v.type===BLACK_HAWK&&v.seats?.length===5&&Number.isFinite(v.hp)))return false;
  if(m.checkpoint<3&&!aircraft.some(v=>v.id===MAIN&&v.seats.includes('local')))return false;
  if(m.checkpoint===2&&!Number.isFinite(m.orbitAt)||m.checkpoint>=3&&!NAHAR_LANDING[m.landing?.kind])return false;
  if(!save.players.some(p=>p.id==='local'&&p.team===0&&p.alive)||new Set(save.players.map(p=>p.id)).size!==save.players.length)return false;
  if(!save.players.every(p=>typeof p.id==='string'&&[0,1].includes(p.team)&&Number.isFinite(p.hp)&&p.input&&p.stowedAmmo&&
    (!p.vehicleId||aircraft.some(v=>v.id===p.vehicleId&&v.seats[p.vehicleSeat]===p.id))))return false;
  return ['grenades','rockets','bullets','deployables'].every(key=>list(save[key],420));
}
