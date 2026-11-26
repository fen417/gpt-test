import {Simulation,sanitizeInput} from '../simulation.js';
import {ensureBotState,thinkInfantryBot} from '../bot-ai.js';
import {moveBot,resetNavigation} from '../bot-navigation.js';
import {dropCampaignMedkit,reviveDuration} from './medical.js';
import {WEAPONS,getSidearm} from '../world.js';
import {VEHICLE_TYPES,vehicleBodyTilt} from '../vehicles.js';
import {M05_FUEL_ROUTES,M05_GATES,M05_ROUTES,M05_SITES as sites,QUARRY_M05,quarryPoint} from './quarry-m05.js';

export const M05_SAVE_VERSION=1;
const heroes=['marten','vos'];
const checkpointStages=['camp','overlook','works','works','cover','cover','armor','armor','fuel','finale'];
const checkpointPhases=['arrival','survey','workers','route','station','ready','crusher','blast','evacuate','assembly'];
const difficulty={recruit:{enemies:2,bleed:36},regular:{enemies:3,bleed:27},veteran:{enemies:4,bleed:20}};
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const near=(a,b,r)=>a&&b&&dist(a,b)<=r&&Math.abs(a.y-b.y)<4;
const bearing=(a,b)=>Math.atan2(a.x-b.x,a.z-b.z);
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
const eye=(p,y=1.55)=>({x:p.x,y:p.y+y,z:p.z});
const point=([x,z])=>quarryPoint(x,z);
const vehiclePoint=(v,x,z)=>quarryPoint(v.x+x*Math.cos(v.yaw)+z*Math.sin(v.yaw),v.z-x*Math.sin(v.yaw)+z*Math.cos(v.yaw));
const idle=p=>sanitizeInput({yaw:p.yaw,pitch:p.pitch});
const ready=p=>p?.alive&&!p.downed;
const gateSeconds=4;
const enemyApproach={ridge:sites.overlook,works:sites.tunnel,cover:sites.mount,armor:sites.bend,fuel:sites.martenCover};
const enemyStage={ridge:'overlook',works:'works',cover:'cover',armor:'armor',fuel:'fuel'};
const gun={id:'m05-mounted',weapon:'СТАНКОВЫЙ ПУЛЕМЁТ',range:235,projectileSpeed:540,damage:40};
const coverPath=M05_ROUTES.assault.slice(1).map(point);
const armorPath=M05_ROUTES.armor.map(([x,z])=>[x,z]);
const exitPath=M05_ROUTES.exit.map(([x,z])=>[x,z]);
const squad=[
  ['duran','Гари Дюран','assault','ar416','wing','Командир отделения'],
  ['lasko','Тео Ласко','medic','ar416','medic','Санитар'],
  ['bruno','Бруно Валь','support','mg36','signal','Радист'],
  ['kane','Кейн','assault','ar416','reserve','Боец прикрытия'],
];
const crew=[['vos','Ирвин Вос'],['timo','Тимо Рэй'],['rafa','Рафа Ким']];
const saveFields=['stage','phase','phaseAt','stageAt','checkpoint','activeHero','flags','gates','powerAt','blastAt',
  'scans','coverLeg','coverMoving','coverSince','mountedAt','heat','overheated','gunSeq','gunNext','convoy',
  'radio','radioEnd','radioSerial','queue','cutscene','stats','order'];
const actorFields=['playerId','attackerId','killerId','victimId','ownerId','targetId','reviverId','helperId'];

export class Mission5Simulation extends Simulation{
  constructor(definition,options={}){
    super({mapId:QUARRY_M05.id,bots:0,difficulty:options.difficulty});
    this.rngState=Number.isInteger(options.seed)?options.seed>>>0:90527;
    this.random=()=>{this.rngState=(Math.imul(this.rngState,1664525)+1013904223)>>>0;return this.rngState/4294967296;};
    this.campaign=new QuarryMission(this,definition,options);
    this.campaign.initialize();
  }
  balanceTeams(){}
  updateVehicleActions(){}
  setInput(id,input={}){if(id==='local')this.campaign.input=input;}
  setWeaponAttachments(id,attachments){return super.setWeaponAttachments(id==='local'?'marten':id,attachments);}
  thinkBot(p,dt){this.campaign.think(p,dt);}
  moveVehicle(v,input,dt){
    if(!v.m05Route){
      if(!v.m05Truck)return super.moveVehicle(v,input,dt);
      return;
    }
    const next=v.m05Route[v.m05Waypoint];
    if(!next){v.speed=0;return;}
    const goal=point(next),distance=dist(v,goal);
    const speed=v.m05Paused?0:Math.min(v.m05Speed,Math.sqrt(distance*8)+.8);
    v.speed+=Math.max(-8*dt,Math.min(4*dt,speed-v.speed));
    const turn=wrap(bearing(v,goal)-v.yaw);
    v.yaw+=Math.max(-1.5*dt,Math.min(1.5*dt,turn));
    const step=Math.min(distance,Math.abs(turn)>.65?0:v.speed*dt);
    const x=v.x-Math.sin(v.yaw)*step,z=v.z-Math.cos(v.yaw)*step;
    if(step&&v.m05Truck&&this.vehicleCollides(v,x,z,v.yaw)){v.speed=0;return;}
    Object.assign(v,{x,y:this.groundAt(x,z),z},vehicleBodyTilt({...v,x,z},this.map.terrain));
    if(distance<.85)v.m05Waypoint++;
  }
  damage(p,amount,attacker,meta={}){
    const m=this.campaign;
    if(!ready(p)||!m||m.complete||m.failed||attacker&&attacker!==p&&attacker.team===p.team||
      m.protected(p)||this.time<p.invulnerableUntil)return;
    if(m.activeHero==='vos'&&p.id==='marten'){
      amount=Math.min(amount,p.hp-1);
      if(amount<=0)return;
    }
    if(!meta.bleedout&&p.team===0&&(p.m05Role==='squad'||p.id==='marten')&&amount>=p.hp&&!p.vehicleId){
      Object.assign(p,{downed:true,hp:1,downedTimer:difficulty[this.difficulty].bleed,lastHurt:this.time,
        reloading:false,reloadTime:0,heldGadget:null,input:idle(p)});
      if(p.id==='marten')m.mountedAt=null;
      m.say('support.casualty');
      return;
    }
    return super.damage(p,amount,attacker,meta);
  }
  damageVehicle(v,amount,attacker,kind,origin,sourceVehicleId){
    const m=this.campaign;
    if(!m||m.complete||m.failed||m.stage==='camp'||m.cutscene||
      v.m05Truck&&(m.stage!=='fuel'||['saved','lost'].includes(m.convoy[v.m05Truck].status)))return;
    if(v.id==='sokol-7'&&!['armor','fuel'].includes(m.stage))return;
    return super.damageVehicle(v,amount,attacker,kind,origin,sourceVehicleId);
  }
  step(dt){
    const m=this.campaign;
    if(m.complete||m.failed)return;
    m.beforeStep(dt);super.step(dt);m.afterStep(dt);
  }
  snapshot(){
    const state=super.snapshot(),m=this.campaign,alias=id=>id===m.activeHero?'local':id;
    for(const q of state.players){
      const p=this.players.get(q.id);
      Object.assign(q,{actorId:q.id,id:alias(q.id),downed:Boolean(p.downed),prone:Boolean(p.downed),downedTimer:p.downedTimer,
        reviver:alias(p.reviver),reviveProgress:p.reviveProgress??0,campaignCivilian:['worker','driver'].includes(p.m05Role),
        campaignAction:m.action(p),crouch:q.crouch||Boolean(p.downed)});
    }
    for(const v of state.vehicles)v.seats=v.seats.map(alias);
    for(const e of state.events)for(const key of actorFields)if(e[key])e[key]=alias(e[key]);
    for(const item of [...state.grenades,...state.rockets,...state.deployables])if(item.ownerId)item.ownerId=alias(item.ownerId);
    return {...state,weaponRoundId:m.roundId,campaign:m.presentation()};
  }
}

class QuarryMission{
  constructor(sim,definition,options){
    Object.assign(this,{sim,definition,options,lines:options.lines??{},carry:options.campaignProgress?.carry??{},
      stage:'camp',phase:'arrival',stageAt:0,phaseAt:0,checkpoint:0,activeHero:'marten',epoch:0,saveRevision:0,
      input:{},failed:null,complete:false,gates:{},powerAt:null,blastAt:null,cutscene:null,scans:[],scanTime:0,
      coverLeg:0,coverMoving:false,coverSince:null,heat:0,overheated:false,gunSeq:0,gunNext:0,mountedAt:null,
      radio:null,radioEnd:0,radioSerial:0,queue:[],order:'follow',flags:{},stats:{revives:0},
      convoy:Object.fromEntries(['A','B','C'].map(id=>[id,{status:'waiting',readyAt:null}])),
      roundId:options.weaponRoundId??'m05-'+Date.now()});
  }
  get time(){return this.sim.time;}
  get age(){return this.time-this.phaseAt;}
  get player(){return this.actor(this.activeHero);}
  get tank(){return this.vehicle('sokol-7');}
  get allies(){return [...this.sim.players.values()].filter(p=>p.m05Role==='squad');}
  actor(id){return this.sim.players.get(id);}
  crewActor(id){return this.actor(id)??this.actor(id+'-reserve');}
  vehicle(id){return this.sim.vehicles.find(v=>v.id===id);}
  add(id,name,team,cls,weapon,at,role,sidearm){
    const p=this.sim.addPlayer(id,name,team,cls,weapon,sidearm,id!=='marten');
    return Object.assign(p,eye(at,0),{m05Role:role,m05Post:eye(at,0),input:idle(p),invulnerableUntil:0});
  }
  addVehicle(id,type,team,at,yaw,extra={}){
    const v=this.sim.createMapVehicle({id,type,team,x:at.x,z:at.z,yaw,noRespawn:true});
    Object.assign(v,extra,{supplyTeam:team});this.sim.vehicles.push(v);return v;
  }
  placeEnemy(id,cls,weapon,at,role){
    const offsets=[[0,0],[1.4,0],[-1.4,0],[0,1.4],[0,-1.4],[2,2],[-2,-2]];
    const position=offsets.map(([dx,dz])=>quarryPoint(at.x+dx,at.z+dz))
      .find(p=>!this.sim.collides(p.x,p.z,p.y)&&!this.sim.vehicleAt(p.x,p.z,p.y))??at;
    const enemy=this.add(id,'Боец Восточного корпуса',1,cls,weapon,position,role);
    enemy.yaw=bearing(enemy,enemyApproach[role]);enemy.input=idle(enemy);
  }
  initialize(){
    const loadout=this.options.loadout??{},chosen=WEAPONS[loadout.primary];
    const weapon=chosen&&!chosen.sidearm?chosen:WEAPONS.ar416;
    const p=this.add('marten','Ян Мартен',0,'assault','ar416',
      sites.camp,'hero',getSidearm(loadout.sidearm).id);
    Object.assign(p,{weaponId:weapon.id,primaryWeaponId:weapon.id,ammo:weapon.mag,reserve:weapon.reserve});
    p.yaw=bearing(p,sites.reunion);p.input=idle(p);
    for(const [i,[id,name,cls,weapon,reserve,reserveName]] of squad.entries()){
      const replaced=this.carry[id+'_alive']===false;
      this.add(replaced?reserve:id,replaced?reserveName:name,0,cls,weapon,quarryPoint(-244+i*2.8,-232+i%2*3),'squad');
    }
    const command=this.carry.harranti_alive===false?'holt':'harranti';
    this.add(command,command==='holt'?'Капитан Холт':'Полковник Харранти',0,'assault','ar416',quarryPoint(-221,-216),'camp');
    const service=this.addVehicle('camp-service','humvee',0,quarryPoint(-243,-217),Math.PI/2);
    this.add('mechanic','Механик роты',0,'support','mg36',quarryPoint(service.x-1.62,service.z-1.3),'camp');
    this.add('camp-patient','Боец роты',0,'assault','ar416',quarryPoint(-237,-218),'camp');
    for(const [id,yaw] of [['mechanic',Math.PI],['camp-patient',Math.PI/2]]){
      const p=this.actor(id);p.yaw=yaw;p.input=idle(p);
    }
    const tank=this.addVehicle('sokol-7','tank',0,quarryPoint(-280,-226),-Math.PI/2,{controlScheme:'wot'});
    for(const [i,[id,name]] of crew.entries()){
      const replaced=id!=='vos'&&this.carry[id+'_alive']===false;
      this.seat(this.add(replaced?id+'-reserve':id,replaced?'Резервный танкист':name,0,'assault','ar416',tank,'crew'),tank,i);
    }
    const wing=this.addVehicle('sokol-1','tank',0,point(armorPath[0]),.1,{controlScheme:'wot'});
    this.seat(this.add('wing-driver','Экипаж «Сокола-1»',0,'assault','ar416',wing,'crew'),wing,0);
    for(const [id,x,z] of [['worker',-72,6],['worker-2',-73,9],['worker-3',-70,9]])
      this.add(id,id==='worker'?'Самир':'Рабочий карьера',0,'engineer','ar416',quarryPoint(x,z),'worker');
    const groups=[
      ['ridge',[-130,-76],[-116,-61],[-105,-43],[-117,-34]],
      ['works',[-61,-7],[-30,5],[-23,-8],[-11,10]],
      ['cover',[85,-38],[107,-32],[120,-20],[125,-2]],
      ['armor',[25,74],[55,79],[70,79],[13,105]],
      ['fuel',[-117,163],[-104,174],[-63,155],[-73,183]],
    ];
    for(const [group,...positions] of groups)for(const [i,pos] of positions.slice(0,difficulty[this.sim.difficulty].enemies).entries())
      this.placeEnemy(group+'-'+i,i%2?'support':'assault',i%2?'mg36':'ar416',point(pos),group);
    const patrol=this.addVehicle('corps-patrol','humvee',1,quarryPoint(177,14),Math.PI/2);
    this.seat(this.add('patrol-driver','Водитель Корпуса',1,'assault','ar416',patrol,'patrol'),patrol,0);
    this.seat(this.add('patrol-gunner','Стрелок Корпуса',1,'support','mg36',patrol,'patrol'),patrol,1);
    const defense=this.addVehicle('corps-tank','tank',1,quarryPoint(55,92),-.7,{controlScheme:'wot',hp:1450,maxHp:1450});
    this.seat(this.add('defense-driver','Танкист Корпуса',1,'assault','ar416',defense,'armor'),defense,0);
    for(const id of ['A','B','C']){
      const v=this.addVehicle('fuel-'+id,'humvee',0,sites['fuel'+id],Math.PI,{m05Truck:id,maxHp:480,hp:480});
      this.add('driver-'+id,'Водитель '+id,0,'engineer','ar416',quarryPoint(v.x-2.4,v.z-1.6),'driver');
    }
    this.sim.events.length=0;this.startScene('C1');this.save(0);
    this.initialSave=this.latestSave??this.serialize();
  }
  seat(p,v,index){
    if(!p?.alive||!v?.hp||v.seats[index])return false;
    v.seats[index]=p.id;Object.assign(p,{vehicleId:v.id,vehicleSeat:index,input:idle(p)});
    this.sim.syncVehicleSeat(p,v);return true;
  }
  unseatCrew(final=false,animate=true){
    const v=this.tank;
    for(const [i,[id]] of crew.entries()){
      const p=this.crewActor(id);
      if(!p?.vehicleId)continue;
      const landing=quarryPoint(v.x+(final?-3.6:1.8)+i*1.25,v.z+(final?3.0:-4.1));
      v.seats[p.vehicleSeat]=null;
      Object.assign(p,landing,{vehicleId:null,vehicleSeat:null,vy:0});
      if(animate&&ready(p)){
        const side=i===0?1:i===1?-1:1,offset=i===0?-.55:i===1?-.95:1.5;
        const hatch=vehiclePoint(v,side*.66,offset),step=vehiclePoint(v,side*1.67,offset+.42);
        p.yaw=bearing(hatch,landing);p.m05Action={key:'tank-exit',at:this.time+i*.75,duration:4.25,
          path:[{...hatch,y:v.y+1.12},{...hatch,y:v.y+2.24},{...step,y:v.y+1.36},landing],vehicle:v.id,index:i};
      }
      p.input=idle(p);
    }
  }
  drive(v,route,speed){if(v?.hp>0)Object.assign(v,{m05Route:route,m05Speed:speed,m05Waypoint:0,m05Paused:false});}
  arrived(v){return v?.m05Route&&v.m05Waypoint>=v.m05Route.length;}
  protected(p){
    return this.stage==='camp'&&near(p,sites.camp,70)||Boolean(this.cutscene)||p.m05Role==='camp'||
      p.m05Role==='worker'&&this.powerAt==null||
      p.m05Role==='driver'&&(this.stage!=='fuel'||this.convoy[p.id.at(-1)].status==='saved'||this.action(p)?.key==='truck-board')||
      this.flags.gateOperator===p.id&&this.flags.gatePanelAt!=null&&this.gates.main==null;
  }
  setPhase(phase){this.phase=phase;this.phaseAt=this.time;}
  setStage(stage,phase){this.stage=stage;this.stageAt=this.time;this.setPhase(phase);}
  say(...keys){
    for(let key of keys.filter(key=>typeof key==='string')){
      const speaker=this.lines[key]?.speaker??key.split('.')[0];
      if(['duran','bruno','kane','lasko','harranti','timo','rafa','worker'].includes(speaker)&&!ready(this.actor(speaker)))
        key=this.definition.fallbacks?.[key];
      if(key&&this.lines[key])this.queue.push(key);
    }
  }
  updateRadio(){
    if(this.radioEnd>this.time)return;
    const id=this.queue.shift();
    if(!id){this.radio=null;return;}
    const line=this.lines[id],duration=line.duration??Math.min(8,Math.max(2.2,line.text.length/14+1));
    this.radio={key:id,serial:++this.radioSerial};this.radioEnd=this.time+duration;
  }
  openGate(id){this.gates[id]??=this.time;}
  syncGates(){
    const disabled=new Set(Object.entries(M05_GATES).filter(([id])=>this.gates[id]!=null&&this.time-this.gates[id]>=gateSeconds).map(([,b])=>b.id));
    const signature=[...disabled].join(',');
    if(signature===this.gateSignature)return;
    this.gateSignature=signature;this.sim.refreshCampaignColliders(disabled);resetNavigation(this.sim);
  }
  startScene(id){
    this.cutscene={id,at:this.time,cue:0};this.epoch++;this.input={};
    if(id==='C2'){
      this.drive(this.vehicle('sokol-1'),armorPath.slice(0,8),7.1);
      this.drive(this.tank,armorPath.slice(0,2),8.2);
    }
    if(id==='C3'){
      this.blastAt=this.time;this.sim.event('explosion',{...eye(sites.blast,7),scale:2.5});
      this.pose(this.actor('marten'),'blast-brace',3.5,{at:this.time+4.75});
      this.say('marten.fire','harranti.abort');
    }
    if(id==='C4')this.say('vos.relief','marten.relief','vos.promise');
  }
  switchHero(id){
    this.player.input=idle(this.player);this.player.bot=true;
    this.activeHero=id;this.player.bot=false;this.player.input=idle(this.player);this.input={};this.sim.events.length=0;this.epoch++;
  }
  finishScene(){
    const id=this.cutscene.id;this.cutscene=null;this.input={};this.epoch++;
    for(const p of this.sim.players.values())delete p.m05Action;
    if(id==='C1'){this.unseatCrew(false,false);this.setPhase('reunion');}
    if(id==='C2'){
      delete this.tank.m05Route;this.switchHero('vos');
      this.setStage('armor','gate');this.say('holt.gate','timo.road','rafa.down','timo.thanks');
    }
    if(id==='C3'){
      this.switchHero('marten');this.setStage('fuel','evacuate');
      this.say('vos.needFuel','worker.trucks','duran.drivers','driver.aReady','driver.bGate','driver.cWait');this.save(8);
    }
    if(id==='C4'){this.setOutcome();this.complete=true;}
  }
  setOutcome(){
    const count=this.savedCount();
    const reserve=Number.isInteger(this.carry.tanks_alive)?this.carry.tanks_alive:2;
    const armorLosses=this.sim.vehicles.filter(v=>v.team===0&&v.type==='tank'&&v.hp<=0).length;
    Object.assign(this.flags,{m5_done:true,m5_fuel_saved:count,m5_fuel_reserve:['','minimal','limited','full'][count],
      m5_mayak_compromised:true,tanks_alive:Math.max(0,reserve-armorLosses)});
    for(const id of ['duran','bruno','lasko','kane','harranti','vos','timo','rafa']){
      if(this.actor(id))this.flags[id+'_alive']=this.actor(id).alive;
      else if(this.carry[id+'_alive']===false)this.flags[id+'_alive']=false;
    }
  }
  action(p){
    const action=p.m05Action;
    return ready(p)&&action&&this.time<action.at+action.duration?action:null;
  }
  pose(actor,key,duration,details={}){
    if(ready(actor)&&!this.action(actor))actor.m05Action={key,at:this.time,duration,...details};
    return this.action(actor??{});
  }
  canFinishScene(){
    switch(this.cutscene?.id){
      case 'C1':return this.arrived(this.tank);
      case 'C2':return this.arrived(this.tank);
      case 'C3':return near(this.actor('marten'),sites.martenCover,8);
      default:return true;
    }
  }
  updateScene(){
    const c=this.cutscene,elapsed=this.time-c.at;
    const cues=this.definition.cues?.[c.id]??[];
    for(;c.cue<cues.length&&elapsed>=cues[c.cue][0];c.cue++)this.say(...cues[c.cue].slice(1));
    if(c.id==='C1'){
      if(elapsed>=2&&!c.campProps){
        c.campProps=true;
        const patient=this.actor('camp-patient'),medic=this.actor('lasko')??this.actor('medic');
        const position=quarryPoint(patient.x-.58,patient.z-.48);
        Object.assign(medic,position,{yaw:bearing(position,patient),input:idle(medic)});
        this.pose(this.actor('mechanic'),'repair-wheel',9);
        this.pose(patient,'bandage-patient',8);
        this.pose(medic,'bandage-medic',8,{target:patient.id});
      }
      if(elapsed>=10&&!this.tank.m05Route)this.drive(this.tank,[[-236,-225]],5);
      if(elapsed>=22&&this.arrived(this.tank))this.unseatCrew();
    }
    if(c.id==='C4'&&elapsed>=7){
      this.unseatCrew(true);
      const radio=elapsed>=33&&elapsed<65;
      const order=this.radio?.key==='vos.moveOut';
      if(order)c.moveOutAt??=this.time;
      if(elapsed>=11&&!c.moveOutAt){
        this.pose(this.actor('marten'),'rest-armor',.85);
        this.pose(this.actor('vos'),radio?'radio':elapsed>=26?'coffee-hold':'adjust-strap',.85);
      }
      if(elapsed>=18&&elapsed<30)this.pose(this.crewActor('rafa'),'coffee-serve',12,{at:c.at+18});
      if(elapsed>=73&&!c.moveOutAt)this.pose(this.crewActor('timo'),'look-storm',4);
    }
    if(elapsed<this.definition.cinematics[c.id].duration||!this.canFinishScene()||
      c.id==='C4'&&(this.radio||this.queue.length))return;
    this.finishScene();
  }


  beforeStep(dt){
    const p=this.player,input=sanitizeInput(this.input);
    if(!Number.isFinite(this.input.yaw))input.yaw=p.yaw;
    this.heat=Math.max(0,this.heat-dt*(this.overheated?.26:.145));
    if(this.overheated&&this.heat<.35)this.overheated=false;
    if(this.cutscene?.id==='C4'&&!p.downed){
      const rest=quarryPoint(this.tank.x-4.7,this.tank.z+2.9);
      const walk=this.time-this.cutscene.at<11&&!near(p,rest,1.05);
      const leave=this.cutscene.moveOutAt!=null;
      p.input=sanitizeInput({yaw:bearing(p,walk?rest:leave?sites.storm:this.tank),forward:walk?.43:leave?.26:0});
    }else if(this.cutscene||p.downed)p.input=idle(p);
    else if(this.action(p)?.key==='gun-release')p.input=idle(p);
    else if(this.mountedAt!=null){
      const yaw=-Math.PI*.75+Math.max(-.82,Math.min(.88,wrap(input.yaw+Math.PI*.75)));
      const pitch=Math.max(-.43,Math.min(.12,input.pitch));
      p.input=sanitizeInput({yaw,pitch});
      if(input.fire&&this.time-this.mountedAt>.32)this.fireGun(p,yaw,pitch);
    }else{
      if(this.stage==='camp'&&near(p,sites.camp,70))Object.assign(input,{fire:false,grenade:false,toolSlot:0});
      p.input=input;
    }
    const pressed=Boolean(this.input.interact||this.input.use);
    if(pressed&&!this.interactHeld&&!this.cutscene&&!p.downed)this.interact();
    this.interactHeld=pressed;
    this.syncGates();this.reviveSquad(dt);
  }
  fireGun(p,yaw,pitch){
    if(this.overheated||this.time<this.gunNext||this.time-this.mountedAt<.8)return;
    this.gunNext=this.time+.084;this.gunSeq++;
    this.heat=Math.min(1,this.heat+.034);
    if(this.heat>=1){
      this.overheated=true;
      if(!this.flags.heatWarn){this.flags.heatWarn=true;this.say('marten.hot');}
    }
    const origin={x:sites.mount.x-Math.sin(yaw)*.97,y:sites.mount.y+1.54+Math.sin(pitch)*.97,z:sites.mount.z-Math.cos(yaw)*.97};
    p.shotSeq++;this.sim.launchBullet(p,gun,origin,yaw+(this.sim.random()-.5)*.018,pitch+(this.sim.random()-.5)*.018,null,true);
    Object.assign(this.sim.events.at(-1),{weaponId:'humvee-turret',mounted:true});
  }
  think(p,dt){
    if(!ready(p)){p.input=idle(p);return;}
    const v=p.vehicleId&&this.vehicle(p.vehicleId);
    if(v){
      p.input=idle(p);
      if(!this.cutscene&&p.id==='defense-driver'&&this.stage==='armor'){
        const target=this.tank,range=dist(v,target);
        p.input=sanitizeInput({yaw:bearing(v,target),pitch:Math.atan2(target.y-v.y,range),
          fire:range<130&&this.sim.lineClear(eye(v,2.5),eye(target,1.5))});
      }
      if(!this.cutscene&&p.id==='patrol-gunner'&&this.stage==='cover'&&this.coverLeg===2){
        const target=this.allies.find(a=>ready(a)&&dist(a,v)<55&&this.sim.lineClear(eye(v,2.4),eye(a)));
        if(target)p.input=sanitizeInput({yaw:bearing(v,target),pitch:Math.atan2(target.y-v.y-1,dist(v,target)),fire:Math.sin(this.time*2.5)>.3});
      }
      return;
    }
    const action=this.action(p);
    if(action?.path){p.input=idle(p);return;}
    if(action?.key==='repair-wheel'||action?.key==='bandage-medic'){
      p.input=sanitizeInput({yaw:p.yaw,crouch:true});return;
    }
    const goal=this.goal(p);
    if(goal){
      if(near(p,goal,goal.stopRadius??1.65)){
        p.input=sanitizeInput({yaw:goal.yaw??p.yaw,crouch:Boolean(goal.crouch),aim:Boolean(goal.aim)});
        if(!action&&!p.m05Revive&&p.m05Role==='squad'&&!this.cutscene&&
          ['descend','workers','power','route','cross','crusher','storage','evacuate'].includes(this.phase)){
          const ai=ensureBotState(this.sim,p);
          if(this.time>=(ai.watchAt??0)){
            ai.watchAt=this.time+.24;
            ai.watch=[...this.sim.players.values()].find(q=>q.team!==p.team&&ready(q)&&dist(p,q)<42&&this.canSee(p,q))?.id;
          }
          const watched=this.actor(ai.watch);
          if(ready(watched)){
            if(!ai.contact)p.yaw=bearing(p,watched);
            thinkInfantryBot(this.sim,p,dt);p.input.forward=p.input.strafe=0;
          }
        }
      }else{
        p.input=idle(p);
        ensureBotState(this.sim,p);
        moveBot(this.sim,p,goal,dt,{sprint:this.stage==='cover'&&this.coverMoving,look:true,followSteps:true});
      }
      return;
    }
    const assignedStage=enemyStage[p.m05Role];
    const nearby=dist(p,this.player)<48&&!this.protected(this.player);
    if(p.team===1&&assignedStage&&!this.cutscene&&(this.stage===assignedStage||nearby)){
      const ai=ensureBotState(this.sim,p);
      if((ai.pressureAt??-30)>this.time-1.5){p.input=sanitizeInput({yaw:p.yaw,crouch:true});return;}
      thinkInfantryBot(this.sim,p,dt);
      if(!ai.contact&&!ai.memory){
        if(this.time>=(ai.watchAt??0)){
          ai.watchAt=this.time+.2;
          ai.watch=[this.player,...this.allies].filter(q=>ready(q)&&dist(p,q)<50&&this.canSee(p,q))
            .sort((a,b)=>dist(p,a)-dist(p,b))[0]?.id;
        }
        const threat=this.actor(ai.watch);
        const desired=bearing(p,threat??enemyApproach[p.m05Role]);
        const turn=wrap(desired-p.yaw);
        p.input.yaw=p.yaw+Math.max(-3.1*dt,Math.min(3.1*dt,turn));
      }
      return;
    }
    p.input=idle(p);
  }
  goal(p){
    if(p.m05Revive)return p.m05Revive;
    if(p.id==='vos'&&this.stage==='camp'&&['brief','briefing'].includes(this.phase)){
      const at=quarryPoint(-220.2,-215.8);return {...at,yaw:bearing(at,sites.brief)};
    }
    if(p.id==='worker'&&this.stage==='works'&&this.phase==='power'){
      if(this.action(p)?.key==='worker-surrender')return null;
      return {...sites.panel,yaw:Math.PI,stopRadius:.68};
    }
    if(this.cutscene?.id==='C4'){
      const rest=quarryPoint(this.tank.x-4.7,this.tank.z+2.9),vos=this.actor('vos');
      if(this.cutscene.moveOutAt&&p.team===0)return {...quarryPoint(this.tank.x-2,this.tank.z+2.3),yaw:bearing(p,sites.storm)};
      if(p===vos)return {...quarryPoint(this.tank.x-3.6,this.tank.z+2),yaw:bearing(p,rest)};
      if(p===this.crewActor('rafa')&&this.time-this.cutscene.at>16)
        return {...quarryPoint(this.tank.x-4.15,this.tank.z+3.7),yaw:bearing(p,vos)};
    }
    if(p.m05Role==='driver'&&this.stage==='fuel'&&this.convoy[p.id.at(-1)].readyAt!=null){
      const v=this.vehicle('fuel-'+p.id.at(-1));
      if(v?.hp>0)return {...vehiclePoint(v,-1.8,-1.55),yaw:bearing(p,vehiclePoint(v,0,-1.5)),stopRadius:.77};
    }
    if(this.stage==='fuel'&&this.gates.fuel==null&&this.flags.fuelPanelOperator===p.id)
      return {...sites.fuelRelease,yaw:Math.PI,stopRadius:.68};
    if(p.m05Role==='crew'&&this.stage==='camp'&&this.phase==='departure'&&!this.flags.tankDeparted)
      return quarryPoint(this.tank.x+2.2,this.tank.z-2.4);
    if(p.m05Role!=='squad'&&p.id!=='marten')return null;
    if(this.stage==='cover'){
      if(this.flags.gateOperator===p.id&&this.gates.main==null)return {...sites.gatePanel,yaw:Math.PI,stopRadius:.68};
      const post=coverPath[Math.min(this.coverLeg+(this.coverMoving?0:-1),coverPath.length-1)]??quarryPoint(62,-63);
      return {...post,crouch:!this.coverMoving,aim:!this.coverMoving,yaw:bearing(p,sites.gate)};
    }
    if(this.stage==='armor')return this.flags.armorClear?sites.martenCover:quarryPoint(27,62);
    if(this.stage==='finale')return sites.finale;
    if(this.cutscene||this.stage==='camp'&&this.phase!=='departure')return null;
    if(this.order==='hold'&&p.m05Hold)return p.m05Hold;
    const lead=this.player,i=this.allies.indexOf(p);
    const side=(i%2===0?-1:1)*(2+Math.floor(i/2)),behind=3.2+Math.floor(i/2)*2;
    return quarryPoint(lead.x+Math.cos(lead.yaw)*side+Math.sin(lead.yaw)*behind,
      lead.z-Math.sin(lead.yaw)*side+Math.cos(lead.yaw)*behind);
  }
  afterStep(dt){
    if(!this.player.alive||this.stage==='armor'&&this.tank.hp<=0){this.failed='Управляемый герой или «Сокол-7» потерян.';return;}
    if(this.activeHero==='vos'&&!this.actor('marten').alive){this.failed='Мартен погиб у дробилки.';return;}
    this.updateRadio();
    if(this.cutscene){this.updateScene();return;}
    if(this.player.downed)return;
    if(this.stage==='camp')this.updateCamp();
    if(this.stage==='overlook')this.updateSurvey(dt);
    if(this.stage==='works')this.updateWorks();
    if(this.stage==='cover')this.updateCover();
    if(this.stage==='armor')this.updateArmor();
    if(this.stage==='fuel'){this.updateFuel();this.updateFire(dt);}
    if(this.stage==='finale'&&this.age>=5&&!this.queue.length&&!this.radio&&
      (!this.tank.hp||this.arrived(this.tank)))this.startScene('C4');
    if(!['camp','finale','armor'].includes(this.stage)){
      const medic=this.allies.find(p=>p.classId==='medic');
      if(medic)dropCampaignMedkit(this.sim,medic,()=>this.say(medic.id+'.medkitDrop'));
    }
  }
  updateCamp(){
    if(this.phase==='reunion'&&near(this.player,sites.reunion,7)){
      if(this.flags.reunionAt==null){
        this.flags.reunionAt=this.time;
        this.say('vos.reunion','marten.reunion','vos.crew','timo.warn','rafa.coffee','marten.coffee','lasko.check','marten.check');
      }
      if(this.time-this.flags.reunionAt>=8)this.setPhase('brief');
    }
    if(this.phase==='brief'&&near(this.player,sites.brief,7)){
      this.say('harranti.fuel','vos.fuel','harranti.range','marten.risk','harranti.plan','duran.ready','vos.depart',
        this.carry.m4_dispatcher_alive===true?'dispatcher.quarry':'orlov.recording');
      this.pose(this.actor('harranti')??this.actor('holt'),'brief-map',7);
      this.pose(this.actor('vos'),'brief-listen',6);
      this.setPhase('briefing');
    }
    if(this.phase==='briefing'&&this.age>8&&!this.queue.length&&!this.radio)this.setPhase('departure');
    if(this.phase!=='departure')return;
    if(!this.flags.tankDeparted){
      for(const [i,[id]] of crew.entries()){
        const p=this.crewActor(id);
        if(!ready(p)||p.vehicleId||dist(p,this.tank)>5.6)continue;
        p.m05BoardAt??=this.time;
        const hatch=vehiclePoint(this.tank,i===1?-.66:.66,i===2?1.5:-.55);
        if(this.time-p.m05BoardAt>=2.65){this.seat(p,this.tank,i);continue;}
        this.pose(p,'tank-board',2.65,{vehicle:this.tank.id,index:i,
          path:[eye(p,0),{...vehiclePoint(this.tank,i===1?-1.7:1.7,.15),y:this.tank.y+1.2},{...hatch,y:this.tank.y+2.16},{...hatch,y:this.tank.y+1.08}]});
      }
      if(this.actor('vos').vehicleId&&crew.every(([id])=>{const p=this.actor(id)??this.actor(id+'-reserve');return !ready(p)||p.vehicleId;})){
        this.flags.tankDeparted=true;
        this.drive(this.tank,[[-222,-244],[-178,-250],[-95,-253],[-11,-248],[72,-243],[149,-233],[216,-219],armorPath[0]],9.8);
      }
    }
    if(this.flags.tankDeparted&&near(this.player,sites.overlook,15)){
      this.setStage('overlook','survey');this.say('orlov.overlook');this.save(1);
    }
  }
  surveyTargets(){
    return [['fuel',eye(sites.blast,11)],['works',eye(sites.panel,11)],['gate',eye(sites.gate,5.5)]]
      .filter(([id,target])=>!this.scans.includes(id)&&this.sim.lineClear(eye(this.player,1.62),target));
  }
  updateSurvey(dt){
    if(this.phase==='survey'){
      const p=this.player,target=this.surveyTargets().find(([,t])=>
        Math.abs(wrap(bearing(p,t)-p.yaw))<.125&&Math.abs(Math.atan2(t.y-p.y,dist(p,t))-p.pitch)<.19);
      if(target){
        if(this.scanId!==target[0]){this.scanId=target[0];this.scanTime=0;}
        this.scanTime+=dt;if(this.scanTime>=.9)this.scans.push(target[0]);
      }else this.scanTime=0;
      if(this.scans.length===3){
        this.say('kane.trucks','duran.order','bruno.wait','marten.gate','orlov.route');this.setPhase('descend');
      }
    }
    if(this.phase==='descend'&&near(this.player,sites.tunnel,7)){this.setStage('works','workers');this.save(2);}
  }
  updateWorks(){
    if(this.phase==='power'){
      const worker=this.actor('worker');
      if(!ready(worker)||near(worker,sites.panel,.78)){
        if(this.flags.panelReached==null){this.flags.panelReached=this.time;this.pose(worker,'work-panel',2.7);}
        if(this.time-this.flags.panelReached>=1.9){
          this.powerAt=this.time;this.say('worker.power','duran.move');this.setPhase('route');this.save(3);
        }
      }
    }
    if(this.phase==='route'&&near(this.player,sites.mount,8)){
      this.setStage('cover','station');this.say('duran.mount','marten.exposed','duran.aim');this.save(4);
    }
  }
  hostiles(role){return [...this.sim.players.values()].filter(p=>p.m05Role===role&&p.team===1&&!p.vehicleId&&ready(p));}
  safer(p,at,range){
    return dist(p,at)>range||(ensureBotState(this.sim,p).pressureAt??-99)>this.time-2.4||
      !this.sim.lineClear(eye(p),eye(at,1.15));
  }
  updateCover(){
    if(this.phase==='cross'&&!this.allies.some(ready)&&!near(this.player,sites.gatePanel,6))return;
    if(this.phase==='ready'){
      if(this.time-this.gates.main>=.8&&this.arrived(this.tank)&&this.mountedAt==null&&!this.action(this.player))this.startScene('C2');
      return;
    }
    if(this.phase==='station'&&(this.mountedAt!=null||this.age>=12)){this.setPhase('cross');this.say('duran.cross');}
    if(this.phase!=='cross')return;
    if(this.coverLeg>=coverPath.length){
      const operator=this.actor(this.flags.gateOperator),actor=ready(operator)?operator:this.player;
      if(!near(actor,sites.gatePanel,actor===this.player?2.35:.82))return;
      if(this.flags.gatePanelAt==null){this.flags.gatePanelAt=this.time;this.pose(actor,'gate-panel',2.25);}
      if(this.time-this.flags.gatePanelAt<1.55)return;
      if(this.mountedAt!=null)this.leaveGun(this.player);
      this.openGate('main');this.say('duran.panel','holt.inbound');this.setPhase('ready');this.save(5);
      return;
    }
    this.coverSince??=this.time;
    const goal=coverPath[Math.min(this.coverLeg,coverPath.length-1)];
    const laneClear=this.hostiles('cover').every(p=>this.safer(p,goal,42));
    if(laneClear||!this.allies.some(ready)&&near(this.player,goal,6)){
      this.coverMoving=true;this.flags.coverExposedAt=null;
    }else if(this.coverMoving){
      this.flags.coverExposedAt??=this.time;
      if(this.time-this.flags.coverExposedAt>.95)this.coverMoving=false;
    }
    const team=this.allies.filter(ready);
    if(!this.coverMoving||team.length&&!team.some(p=>near(p,goal,5)))return;
    this.coverMoving=false;this.coverSince=this.time;this.coverLeg++;
    if(this.coverLeg===1)this.say('bruno.middle','medic.cross');
    if(this.coverLeg===2){
      this.say('bruno.vehicle');this.drive(this.vehicle('corps-patrol'),[[164,-10],[155,-22],[175,-38],[196,-63]],7);
    }
    if(this.coverLeg===3)this.say('duran.almost');
    if(this.coverLeg<coverPath.length)return;
    this.flags.gateOperator=team.find(p=>near(p,goal,5))?.id;
  }
  updateArmor(){
    if(this.phase==='gate'&&near(this.tank,sites.bend,21)){
      this.setPhase('crusher');this.say('marten.crusher','vos.clear');this.save(6);
    }
    if(this.phase==='crusher'&&near(this.tank,sites.crusher,70)&&this.vehicle('corps-tank').hp<=0&&this.hostiles('armor').length<=1){
      this.flags.armorClear=true;this.setPhase('storage');this.say('marten.passed','holt.storage');
    }
    if(this.phase==='storage'&&near(this.tank,sites.armorMeet,17)&&near(this.actor('marten'),sites.martenCover,7)){
      this.setPhase('blast');this.save(7);
    }
    if(this.phase==='blast')this.startScene('C3');
  }
  updateFuel(){
    const operator=this.actor(this.flags.fuelPanelOperator);
    if(this.gates.fuel==null&&operator){
      if(!ready(operator)){
        delete this.flags.fuelPanelOperator;delete this.flags.fuelPanelAt;
      }else{
        if(this.flags.fuelPanelAt==null&&near(operator,sites.fuelRelease,.85)){
          this.flags.fuelPanelAt=this.time;this.pose(operator,'fuel-panel',1.15);
        }
        if(this.flags.fuelPanelAt!=null&&this.time-this.flags.fuelPanelAt>=.66){
          this.openGate('fuel');this.say('marten.gateOpen');
        }
      }
    }
    for(const [id,record] of Object.entries(this.convoy)){
      const v=this.vehicle('fuel-'+id),driver=this.actor('driver-'+id);
      if(['lost','saved'].includes(record.status))continue;
      if(!v.hp||!driver.alive){record.status='lost';this.say('driver.lost');continue;}
      if(record.status==='waiting'){
        const clear=id==='A'?this.age>=4:id==='B'?this.gates.fuel!=null&&this.time-this.gates.fuel>=gateSeconds:
          this.hostiles('fuel').every(p=>this.safer(p,sites.fuelCPost,30));
        if(clear)record.readyAt??=this.time;
        const step=vehiclePoint(v,-1.8,-1.55);
        if(record.readyAt!=null&&ready(driver)&&near(driver,step,.9)&&record.boardAt==null){
          record.boardAt=this.time;
          this.pose(driver,'truck-board',2.1,{vehicle:v.id,path:[eye(driver,0),
            {...step,y:v.y+.55},{...vehiclePoint(v,-1.07,-1.55),y:v.y+.78},{...vehiclePoint(v,-.51,-1.55),y:v.y+.72}]});
        }
        if(record.boardAt!=null&&this.time-record.boardAt>=2.1&&this.seat(driver,v,0)){
          record.status='moving';this.drive(v,M05_FUEL_ROUTES[id],7.4);
        }
      }
      if(record.status==='moving'&&this.arrived(v)){record.status='saved';this.say('driver.safe'+id);}
      if(record.status==='moving'){
        v.m05Paused=this.hostiles('fuel').some(p=>dist(p,v)<16&&!this.safer(p,v,16));
      }
    }
    const saved=this.savedCount(),settled=Object.values(this.convoy).every(r=>r.status==='saved'||r.status==='lost');
    if(settled&&!saved){this.failed='Все заправщики потеряны.';return;}
    if(saved&&settled&&this.phase==='evacuate')this.withdraw();
    if(this.phase==='withdraw'&&near(this.player,sites.finale,12)){
      this.setStage('finale','assembly');this.save(9);
    }
  }
  updateFire(dt){
    for(const p of this.sim.players.values())if(ready(p)&&!p.vehicleId&&near(p,sites.blast,6.2))
      this.sim.damage(p,15*dt,null,{weapon:'ПОЖАР'});
  }
  savedCount(){return Object.values(this.convoy).filter(r=>r.status==='saved').length;}
  withdraw(){
    this.setPhase('withdraw');this.say('harranti.count','marten.count'+this.savedCount(),'harranti.withdraw','vos.guard');
    this.drive(this.tank,[[-16,125],[3,149],[-31,191],...exitPath.slice(2,-1),[168,216]],9.4);
    this.drive(this.vehicle('sokol-1'),[[28,83],[12,98],[-20,140],[-32,191],...exitPath.slice(2,-1),[191,225]],8.2);
  }
  reviveSquad(dt){
    for(const p of this.allies)p.m05Revive=null;
    if(this.cutscene||['camp','finale'].includes(this.stage))return;
    for(const patient of [this.actor('marten'),...this.allies]){
      if(!patient?.downed)continue;
      const p=this.player;
      const assisting=p!==patient&&ready(p)&&!p.vehicleId&&(this.input.use||this.input.interact)&&near(p,patient,2.5);
      const helpers=this.allies.filter(a=>a!==patient&&ready(a)&&!a.m05Revive&&dist(a,patient)<42);
      const helper=assisting?p:helpers.sort((a,b)=>(a.classId==='medic'?-35:0)-(b.classId==='medic'?-35:0)+dist(a,patient)-dist(b,patient))[0];
      const treating=helper&&near(helper,patient,2.5)&&this.sim.lineClear(eye(helper),eye(patient,.52));
      if(helper&&helper!==p)helper.m05Revive={...eye(patient,0),crouch:true,yaw:bearing(helper,patient)};
      if(treating){
        if(helper!==p)this.pose(helper,'revive_kneel',4);
        patient.reviver=helper.id;patient.reviveProgress=(patient.reviveProgress??0)+dt/reviveDuration(helper,4);
        if(patient.reviveProgress>=1){
          Object.assign(patient,{downed:false,downedTimer:0,hp:55,reviver:null,reviveProgress:0,
            reviveSeq:(patient.reviveSeq??0)+1,invulnerableUntil:this.time+2});
          this.stats.revives++;this.sim.event('revive',{playerId:patient.id,helperId:helper.id,...eye(patient,0)});
          this.say(helper.id==='lasko'?'lasko.revive':'support.revive');
        }
      }else{
        patient.reviver=null;patient.reviveProgress=0;patient.downedTimer-=dt;
        if(patient.downedTimer<=0){
          patient.downed=false;this.sim.damage(patient,1000,null,{weapon:'РАНЕНИЕ',bleedout:true});
        }
      }
    }
  }


  interact(){
    const p=this.player;if(p.vehicleId)return;
    if(this.stage==='camp'&&near(p,quarryPoint(-249,-221),4)){
      p.reserve=Math.max(p.reserve,this.sim.playerWeapon(p).reserve);
      p.grenades=Math.max(p.grenades,2);p.rockets=Math.max(p.rockets,2);
    }
    if(this.stage==='works'&&this.phase==='workers'&&near(p,sites.workerDoor,3.7)){
      const worker=this.actor('worker');worker.yaw=bearing(worker,p);
      this.pose(worker,'worker-surrender',3.2);
      this.openGate('worker');this.setPhase('power');this.say('worker.appear','worker.order','marten.worker','worker.panel');
    }
    if(this.stage==='cover'&&this.phase!=='ready'&&(this.mountedAt!=null||near(p,sites.mount,2.6))){
      if(this.mountedAt!=null){
        this.leaveGun(p);
      }else{
        Object.assign(p,sites.mount,{yaw:-Math.PI*.75,pitch:-.15,vy:0});
        this.mountedAt=this.time;this.pose(p,'gun-grab',.42);this.say('marten.mounted');
      }
      p.input=idle(p);this.input={};this.epoch++;
    }
    if(this.stage==='fuel'&&this.gates.fuel==null&&near(p,sites.fuelRelease,2.2)){
      this.flags.fuelPanelOperator=p.id;this.flags.fuelPanelAt??=this.time;
      this.pose(p,'fuel-panel',1.15);
    }
    if(this.phase==='evacuate'&&this.savedCount()&&near(p,sites.withdraw,9))this.withdraw();
  }
  leaveGun(p){
    if(this.mountedAt==null)return;
    this.mountedAt=null;
    const start=eye(p,0);
    p.m05Action={key:'gun-release',at:this.time,duration:.58,path:[start,start,start,eye(sites.mountExit,0)]};
    Object.assign(p,sites.mountExit,{vy:0});
  }
  command(command){
    if(command?.type==='retry'){this.restore(this.latestSave??this.initialSave);return;}
    if(this.failed||this.complete)return;
    if(command?.type==='skip'&&this.cutscene){
      if(this.time-this.cutscene.at<3||!this.canFinishScene())return;
      if(this.cutscene.id==='C1')this.unseatCrew();
      if(this.cutscene.id==='C4'){this.unseatCrew(true,false);this.radio=null;this.queue=[];}
      this.finishScene();return;
    }
    if(this.cutscene)return;
    if(command?.type==='answer'&&this.phase==='reunion'&&!this.flags.answered&&['return','tanks','later'].includes(command.value)){
      this.flags.answered=true;this.say('vos.answer-'+command.value);
    }
    if(command?.type==='order'&&['follow','hold','assist'].includes(command.order)){
      this.order=command.order;
      for(const p of this.allies)p.m05Hold=quarryPoint(p.x,p.z);
      if(this.stage==='fuel'&&this.gates.fuel==null&&this.flags.fuelPanelOperator==null&&
        command.order==='assist'&&near(this.player,sites.fuelRelease,32)){
        const helper=this.allies.filter(ready).sort((a,b)=>dist(a,sites.fuelRelease)-dist(b,sites.fuelRelease))[0];
        if(helper)this.flags.fuelPanelOperator=helper.id;
      }
    }
  }
  botGoal(p){return p.m05Post;}
  canSee(p,q){
    const from=eye(p,p.downed?.45:p.input.crouch?1.05:1.52);
    return (q.downed?[.45]:q.input.crouch?[.7,1.05]:[1.05,1.58])
      .some(height=>this.sim.lineClear(from,eye(q,height)));
  }
  target(){
    const marker={
      arrival:'reunion',reunion:'reunion',brief:'brief',briefing:'brief',departure:'overlook',
      descend:'tunnel',workers:'workerDoor',power:'panel',route:this.player.x<-20?'worksExit':this.player.z>-69?'mountEntry':'mount',station:'mount',
      cross:this.mountedAt==null?'mount':null,ready:'gate',gate:'gate',crusher:'crusher',storage:'armorMeet',blast:'blast',
      evacuate:this.gates.fuel==null?'fuelRelease':this.savedCount()?'withdraw':'fuelCPost',withdraw:'finale',assembly:'finale',
    }[this.phase];
    return marker?sites[marker]:null;
  }
  presentation(){
    const p=this.player;
    let prompt=null;
    if(!this.cutscene&&!p.downed){
      if(this.stage==='camp'&&near(p,quarryPoint(-249,-221),4))prompt='Пополнить боезапас';
      else if(this.mountedAt!=null)prompt='Покинуть пулемёт';
      else if(this.stage==='cover'&&this.phase!=='ready'&&near(p,sites.mount,2.6))prompt='Занять пулемёт';
      else if(this.phase==='workers'&&near(p,sites.workerDoor,3.7))prompt='Открыть дверь';
      else if(this.stage==='fuel'&&this.gates.fuel==null&&near(p,sites.fuelRelease,2.2))prompt='Открыть бокс B';
      else if(this.phase==='evacuate'&&this.savedCount()&&near(p,sites.withdraw,9))prompt='Подтвердить отход';
      else if(this.allies.some(q=>q.downed&&near(p,q,2.5)))prompt='Удерживайте, чтобы поднять бойца';
    }
    const alias=id=>id===this.activeHero?'local':id;
    return {missionId:'m05',activeHero:this.activeHero,controlledActorId:this.activeHero,stage:this.stage,phase:this.phase,
      stageAt:this.stageAt,time:this.time,objective:this.phase,target:this.target(),prompt,epoch:this.epoch,checkpoint:this.checkpoint,
      complete:this.complete,failed:this.failed,cutscene:this.cutscene?{id:this.cutscene.id,elapsed:this.time-this.cutscene.at,skippable:this.canFinishScene()}:null,
      radio:this.radio,radioRemaining:Math.max(0,this.radioEnd-this.time),flags:{...this.flags},
      squadIds:['local',...this.allies.map(a=>a.id)],order:this.order,
      gates:Object.fromEntries(Object.entries(this.gates).map(([id,at])=>[id,Math.min(1,(this.time-at)/gateSeconds)])),
      power:this.powerAt!=null,blastAt:this.blastAt,mounted:this.mountedAt!=null,heat:this.heat,overheated:this.overheated,
      scans:[...this.scans],survey:this.phase==='survey'?this.surveyTargets().map(([id,target])=>({id,target})):[],
      rescuerId:alias(p.reviver),reviveProgress:p.reviveProgress??0,
      choice:this.phase==='reunion'&&!this.flags.answered&&near(p,sites.reunion,10),
      convoy:structuredClone(this.convoy),fuelSaved:this.savedCount(),
      stats:{...this.stats,elapsedSeconds:Math.floor(this.time),
        killsByHero:Object.fromEntries(heroes.map(id=>[id,this.actor(id)?.kills??0])),
        kills:heroes.reduce((n,id)=>n+(this.actor(id)?.kills??0),0),
        losses:[...this.sim.players.values()].filter(p=>p.team===0&&!p.alive).length}};
  }
  save(checkpoint){
    this.checkpoint=checkpoint;
    if(this.options.ironman)return;
    this.latestSave=this.serialize();this.saveRevision++;
  }
  serialize(){
    const s=this.sim;
    return structuredClone({version:M05_SAVE_VERSION,definitionVersion:this.definition.version,missionId:'m05',
      difficulty:s.difficulty,roundId:this.roundId,time:s.time,tick:Math.round(s.time*60),rngState:s.rngState,
      mission:Object.fromEntries(saveFields.map(key=>[key,this[key]])),
      players:[...s.players.values()].map(({ai,damagers,botPath,m05Revive,...p})=>p),
      vehicles:s.vehicles.map(({runOverHits,...v})=>v),killCounts:Object.fromEntries(s.weaponKills),
      attachments:Object.fromEntries(s.weaponAttachments),grenades:s.grenades,rockets:s.rockets,bullets:s.bullets,deployables:s.deployables});
  }
  restore(save){
    if(!validMission5Save(save,this.definition)||this.sim.difficulty!==save.difficulty)return false;
    const s=this.sim;
    s.players.clear();s.vehicles=structuredClone(save.vehicles);resetNavigation(s);
    const service=this.vehicle('camp-service');
    if(service?.x===-245&&service.z===-222)Object.assign(service,quarryPoint(-243,-217));
    for(const actor of save.players){
      const p=s.addPlayer(actor.id,actor.name,actor.team,actor.classId,actor.primaryWeaponId,actor.sidearmId,actor.bot);
      Object.assign(p,structuredClone(actor),{input:idle(actor),ai:null,damagers:new Map(),botPath:[]});
      if(p.id==='mechanic'&&p.x===-245.8&&p.z===-223.6)
        Object.assign(p,quarryPoint(-244.62,-218.3),{yaw:Math.PI});
    }
    for(const key of ['grenades','rockets','bullets','deployables'])s[key]=structuredClone(save[key]);
    for(const key of saveFields)this[key]=structuredClone(save.mission[key]);
    Object.assign(s,{time:save.time,rngState:save.rngState,events:[],botTeams:null,botTeamAt:0,
      weaponKills:new Map(Object.entries(save.killCounts??{})),weaponAttachments:new Map(Object.entries(save.attachments??{}))});
    this.roundId=save.roundId??this.roundId;this.input={};this.interactHeld=false;this.failed=null;this.complete=false;
    this.scanTime=0;this.epoch++;this.gateSignature=null;this.syncGates();
    this.latestSave=structuredClone(save);this.saveRevision++;
    return true;
  }
}

export function validMission5Save(save,definition){
  const m=save?.mission;
  const validPoint=p=>p&&[p.x,p.y,p.z].every(Number.isFinite)&&Math.abs(p.x)<817&&Math.abs(p.z)<817;
  if(save?.missionId!=='m05'||save.version!==M05_SAVE_VERSION||save.definitionVersion!==definition.version||
    !Object.hasOwn(difficulty,save.difficulty)||!Number.isFinite(save.time)||save.time<0||!Number.isInteger(save.rngState)||
    !m||!Number.isInteger(m.checkpoint)||checkpointStages[m.checkpoint]!==m.stage||checkpointPhases[m.checkpoint]!==m.phase||
    !heroes.includes(m.activeHero)||!m.flags||!m.gates||!m.stats||typeof m.order!=='string'||
    !Array.isArray(m.scans)||!Array.isArray(m.queue)||m.queue.length>100||
    !['A','B','C'].every(id=>['waiting','moving','saved','lost'].includes(m.convoy?.[id]?.status))||
    !Array.isArray(save.players)||save.players.length>75||!Array.isArray(save.vehicles)||save.vehicles.length>12)return false;
  if(!heroes.every(id=>save.players.some(p=>p?.id===id))||
    new Set(save.players.map(p=>p?.id)).size!==save.players.length||new Set(save.vehicles.map(v=>v?.id)).size!==save.vehicles.length)return false;
  if(!save.vehicles.every(v=>validPoint(v)&&['tank','humvee'].includes(v.type)&&Number.isFinite(v.hp)&&
    v.seats?.length===VEHICLE_TYPES[v.type].seats.length&&
    v.seats.every((id,i)=>id==null||save.players.some(p=>p?.id===id&&p.vehicleId===v.id&&p.vehicleSeat===i))))return false;
  if(!save.players.every(p=>validPoint(p)&&typeof p.id==='string'&&Number.isFinite(p.hp)&&p.stowedAmmo&&
    (!p.vehicleId||save.vehicles.some(v=>v.id===p.vehicleId&&v.seats[p.vehicleSeat]===p.id))))return false;
  return ['grenades','rockets','bullets','deployables'].every(key=>Array.isArray(save[key])&&save[key].length<600&&save[key].every(validPoint));
}
