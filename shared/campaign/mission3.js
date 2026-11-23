import {Simulation,sanitizeInput} from '../simulation.js';
import {ensureBotState,thinkInfantryBot} from '../bot-ai.js';
import {moveBot,resetNavigation,walkableSegment} from '../bot-navigation.js';
import {blast} from '../gadgets.js';
import {overlapsCollider,rayCollider} from '../asset-colliders.js';
import {uprightBox} from '../geometry.js';
import {vehicleBodyTilt} from '../vehicles.js';
import {getSidearm,WEAPONS} from '../world.js';
import {TEL_MAZIN,M03_CHARGE_CACHE as chargeCache,m03ConvoyPose,packPanels,telMazinFloor} from './tel-mazin.js';
import {M03_EXTRACTION,Mission3Extraction} from './mission3-extraction.js';
import {reviveDuration} from './medical.js';

const SAVE_VERSION=1,MAX_ENEMIES=14;
const TERRAIN_REVISION=1;
const ambushTiming={
  recruit:{fireDelay:1.7,protection:4},
  regular:{fireDelay:1.2,protection:2.8},
  veteran:{fireDelay:.7,protection:1.7},
};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const angle=n=>Math.atan2(Math.sin(n),Math.cos(n));
const yawTo=(a,b)=>Math.atan2(a.x-b.x,a.z-b.z);
const eye=(p,h=1.55)=>({x:p.x,y:p.y+h,z:p.z});
const point=([x,z])=>({x,z});
const soldierTypes={rifle:['assault','ar416'],assault:['medic','mcx9'],mg:['support','pkp'],rpg:['assault','ak12'],
  sniper:['recon','sv98'],at:['assault','ak12'],sapper:['assault','ar416'],'truck-driver':['assault','ar416'],'truck-gunner':['support','mg36']};
const allies={duran:['Гари Дюран','assault','ar416'],lasko:['Тео Ласко','medic','mcx9'],
  bruno:['Бруно Валь','support','pkp'],kane:['Рядовой Кейн','recon','sv98']};
const crew={vos:'Ирвин Вос',timo:'Тимо Рэй',rafa:'Рафа Ким'};
const stageRadio=['','orlov.craft','orlov.cross','orlov.market','orlov.breach','harranti.hold'];
const brigadeSites=[[-89,37],[-72,42],[-26,34],[10,13],[23,-30],[69,13],[172,-10],[177,-14]];
const brigadeMedics=new Set([0,4]);
const MEDIC_TREATMENT_SECONDS=4, MEDIC_RANGE=42;
const doorsById=new Map(TEL_MAZIN.interactives.filter(item=>item.type==='door').map(item=>[item.id,item]));
const supplySites=[{id:'tea-kit',x:-155,z:12,kind:'aid'},{id:'cross-smoke',x:-46,z:13,kind:'smoke'},
  {id:'market-rpg',x:36,z:-24,kind:'rockets'},{id:'craft-ammo',x:-96,z:48,kind:'ammo'},
  {id:'vos-cache',x:-147,z:5,kind:'crew'}];

export class Mission3Simulation extends Simulation{
  constructor(definition,options={}){
    super({mapId:TEL_MAZIN.id,bots:0,difficulty:options.difficulty});
    this.navigationBudgetMs=1.55;this.pathBudgetMs=1.05;this.pathRequestsPerTick=1;
    this.rngState=options.seed??803118;
    this.random=()=>{this.rngState=(Math.imul(this.rngState,1664525)+1013904223)>>>0;return this.rngState/4294967296;};
    this.campaign=new ColumnDirector(this,definition,options);
    this.campaign.initialize();
  }
  balanceTeams(){}
  setInput(id,input={}){
    if(this.campaign?.extraction)return;
    super.setInput(id,input);
    if(id!=='local')return;
    const c=this.campaign,p=c.player;
    c.input={...p.input,use:input.use===true,heal:input.heal===true,selfRevive:input.selfRevive===true,
      knife:input.knife===true,prone:input.prone===true};
    p.input.interact=false;p.input.order=false;
  }
  updateVehicleActions(){}
  moveVehicle(v,input,dt){
    if(v.convoyIndex===undefined){super.moveVehicle(v,input,dt);return;}
    const c=this.campaign,pose=m03ConvoyPose(c.definition,v.convoyIndex,c.rideTime);
    Object.assign(v,pose,{y:this.groundAt(pose.x,pose.z),speed:c.rideTime<c.definition.convoy.ambushAt?c.definition.convoy.speed:0});
    if(c.rideTime<c.definition.convoy.ambushAt)v.aimYaw=pose.yaw+(c.rideTime>=112&&v.convoyIndex===0?.58:0);
    Object.assign(v,vehicleBodyTilt(v,this.map.terrain));
  }
  movePlayer(p,input,dt){
    if(p.dropAt!==undefined){
      const progress=(this.time-p.dropAt)/p.dropDuration;
      if(progress<1){
        p.y=this.groundAt(p.x,p.z)+p.dropHeight*(1-progress*progress);p.yaw=input.yaw;p.pitch=input.pitch;
        return;
      }
      delete p.dropAt;p.y=this.groundAt(p.x,p.z);p.grounded=true;
    }
    if(p.id==='local'&&this.campaign.limp&&input.sprint){
      // Sprint has full input normalization, so scale elapsed movement instead.
      super.movePlayer(p,input,dt*.9);return;
    }
    super.movePlayer(p,input,dt);
  }
  thinkBot(p,dt){
    const c=this.campaign;
    if(p.team===1&&(c.inTransit||c.stage===0&&this.time<c.stageAt+ambushTiming[this.difficulty].fireDelay)){
      p.input=sanitizeInput({yaw:p.yaw});return;
    }
    if(this.campaign.thinkBot(p,dt))return;
    const prior=p.botThinkAt;
    super.thinkBot(p,dt);
    if(p.botThinkAt!==prior)this.campaign.afterThink(p,Math.min(.08,this.time-(p.m03ThinkAt??this.time-dt)));
    p.m03ThinkAt=p.botThinkAt!==prior?this.time:p.m03ThinkAt;
  }
  damage(p,amount,attacker,meta={}){
    const c=this.campaign;
    if(!p?.alive||c.inTransit||c.finale||this.time<p.invulnerableUntil||attacker?.team===p.team&&attacker!==p)return;
    if(p.team===0){
      if(p.id==='vos'||p.storyCrew&&!p.columnCrew||c.stage===0&&this.time<c.stageAt+ambushTiming[this.difficulty].protection)return;
      amount*=this.difficulty==='recruit'?.7:this.difficulty==='veteran'?1.25:1;
      if(p.downed){
        if(this.time-p.downedAt>5&&!c.reviveInProgress(p))p.downedTimer-=amount*(p.id==='local'&&c.playerMedic?.alive ? .025 : .08);
        return;
      }
      if(amount>=p.hp){c.down(p);this.event('damage',{playerId:p.id,attackerId:attacker?.id,amount,x:attacker?.x??p.x,z:attacker?.z??p.z});return;}
    }
    super.damage(p,amount,attacker,meta);
  }
  damageVehicle(v,amount,attacker,kind,origin,sourceVehicleId){
    if(v.convoyIndex!==undefined&&!v.scriptedLoss)return {ricochet:true,amount:0};
    const hit=super.damageVehicle(v,amount,attacker,kind,origin,sourceVehicleId);
    if(v.hp<=0){v.respawnIn=1e8;v.wreckTime=1e8;}
    return hit;
  }
  step(dt){
    const c=this.campaign;
    if(c.complete||c.failed)return;
    if(c.extraction){
      this.time+=dt;c.extraction.update();
      if(c.extraction.elapsed>=M03_EXTRACTION.end){c.complete=true;c.flags.m3_done=true;}
      return;
    }
    c.beforeStep(dt);super.step(dt);c.afterStep(dt);
  }
  snapshot(){
    const state=super.snapshot();
    for(const p of state.players){
      const live=this.players.get(p.id);
      Object.assign(p,{role:live.role,downed:Boolean(live.downed),downedTimer:live.downedTimer??0,prone:Boolean(live.prone),
        reviver:live.reviver??null,syringes:live.syringes??0,medkits:live.medkits??0,interior:this.campaign.inside(live)?.id??null,
        fieldMedic:Boolean(live.fieldMedic),rescuedBrigade:Boolean(live.rescuedBrigade),rescue:Boolean(live.rescue),
        fieldRevives:live.fieldRevives??0,inExtractionCabin:Boolean(live.inExtractionCabin)});
      if(this.campaign.finale&&!this.campaign.extraction&&['local','harranti'].includes(p.id))p.handshake=this.time-this.campaign.finale.at;
    }
    state.campaign=this.campaign.presentation();return state;
  }
}

class ColumnDirector{
  constructor(sim,definition,options){
    this.sim=sim;this.definition=definition;this.options=options;this.carry=options.campaignProgress?.carry??{};
    this.scriptedVehicles=true;
    this.input={};this.previous={};this.rideTime=0;this.rideIndex=0;this.skipHold=0;this.stage=-1;
    this.fired=new Set();this.choiceIndex=0;this.queue=[];this.serial=0;this.radio=null;this.radioEnd=0;
    this.checkpoint=0;this.saveRevision=0;this.epoch=0;this.pending=[];this.enemySerial=0;
    this.failed=null;this.complete=false;this.finale=null;this.extraction=null;this.flags={brigade_saved:0,m3_documents:false};
    this.order='follow';this.progress=0;this.charges=[false,false];this.chargesCollected=false;this.fuseAt=null;this.defenceAt=null;this.defenceWave=0;
    this.interactives=Object.fromEntries(TEL_MAZIN.interactives.map(item=>[item.id,item.initial]));
    this.smoke=[];this.notices=[];this.supplies={};this.limp=Boolean(this.carry.marten_wounded);this.geometryDirty=true;
  }
  get time(){return this.sim.time;}
  get player(){return this.sim.players.get('local');}
  get inTransit(){return this.stage<0;}
  get enemies(){return [...this.sim.players.values()].filter(p=>p.team===1&&p.alive);}
  get section(){return this.definition.stages[this.stage];}
  initialize(){
    const sim=this.sim,p=this.add('local','Ян Мартен',0,['assault','ar416'],{x:-832,z:-38},'marten',false);
    const selected=this.options.loadout?.primary;
    const primary=Object.hasOwn(WEAPONS,selected)&&!WEAPONS[selected].sidearm?WEAPONS[selected]:WEAPONS.ar416;
    const sidearm=getSidearm(this.options.loadout?.sidearm);
    Object.assign(p,{primaryWeaponId:primary.id,weaponId:primary.id,ammo:primary.mag,reserve:primary.reserve,
      sidearmId:sidearm.id,stowedAmmo:{ammo:sidearm.mag,reserve:sidearm.reserve},
      medkits:2,syringes:2,squadMember:false});
    const count=Math.max(7,Math.min(9,Math.floor(this.carry.tanks_alive??8)));
    for(let n=0;n<count;n++){
      const v=sim.createMapVehicle({id:n===3?'sokol-7':`m03-tank-${n+1}`,type:'tank',team:0,...m03ConvoyPose(this.definition,n,0)});
      v.convoyIndex=n;sim.vehicles.push(v);
    }
    for(const [id,data] of Object.entries(allies)){
      const available=this.carry[`${id}_alive`]!==false;
      const a=this.add(available?id:`stand-in-${id}`,available?data[0]:'Боец бригады',0,data.slice(1),p,available?id:`stand-in-${id}`);
      a.squadMember=true;a.fieldMedic=id==='lasko';a.grenades=id==='duran'?2:0;
    }
    for(const [id,name] of Object.entries(crew)){
      const a=this.add(id,name,0,['assault','ar416'],p,id);a.storyCrew=true;a.columnCrew=true;
    }
    const mount=(who,v,seat)=>{
      if(!who)return;
      Object.assign(who,{vehicleId:v.id,vehicleSeat:seat,yaw:v.yaw,input:sanitizeInput({yaw:v.yaw})});
      v.seats[seat]=who.id;sim.syncVehicleSeat(who,v);
    };
    const hull=sim.vehicles[3],next=sim.vehicles[4];
    mount(p,hull,4);mount(sim.players.get('timo'),hull,0);mount(sim.players.get('vos'),hull,1);mount(sim.players.get('rafa'),next,1);
    sim.players.get('vos').invulnerableUntil=1e8;
    for(const [i,id] of Object.keys(allies).entries())mount(sim.players.get(id)??sim.players.get(`stand-in-${id}`),i<2?hull:next,i%2+2);
    this.refreshGeometry();this.updateRide();this.initialSave=this.serialize();
  }
  add(id,name,team,[cls,weapon],where,role,bot=true){
    const p=this.sim.addPlayer(id,name,team,cls,weapon,'p19',bot);
    Object.assign(p,this.safeSpot(where,p),{role,invulnerableUntil:0,grenades:0,home:null});
    p.home={x:p.x,y:p.y,z:p.z};return p;
  }
  safeSpot(where,p=null){
    for(let n=0;n<90;n++){
      const r=Math.sqrt(n)*.65,a=n*2.399,x=where.x+Math.cos(a)*r,z=where.z+Math.sin(a)*r,y=where.y??this.sim.groundAt(x,z);
      if(this.sim.collides(x,z,y+.02)||this.sim.vehicleAt(x,z,y))continue;
      if([...this.sim.players.values()].some(q=>p!==q&&q.alive&&distance(q,{x,z})<.68&&Math.abs(q.y-y)<1))continue;
      return {x,y,z};
    }
    return {x:where.x,y:where.y??this.sim.groundAt(where.x,where.z),z:where.z};
  }
  say(key){
    if(!key||!this.options.lines?.[key]&&this.options.lines)return;
    this.queue.push(key);
  }
  updateRadio(){
    if(this.radio&&this.time<this.radioEnd)return;
    if(this.choices){
      if(this.rideTime<this.choiceUntil)return;
      this.queue.unshift(...this.choices.slice(0,2));this.choices=null;
    }
    const question=this.definition.dialogueChoices.findIndex(choice=>choice.question===this.radio?.key);
    if(this.inTransit&&this.rideTime<this.definition.convoy.villageAt&&question>=this.choiceIndex){
      this.choices=this.definition.dialogueChoices[question].answers;
      this.choiceIndex=question+1;
      this.choiceUntil=this.rideTime+7;
      this.radio=null;
      return;
    }
    const key=this.queue.shift();
    this.radio=key?{key,serial:++this.serial}:null;
    this.radioEnd=key?this.time+(this.options.lines?.[key]?.duration??4):0;
  }
  once(key,at,action){
    if(this.fired.has(key)||this.rideTime+1e-7<at)return;
    this.fired.add(key);action();
  }
  beforeStep(dt){
    const p=this.player,i=this.input;
    this.refreshGeometry();
    if(this.inTransit){
      const {combatAt}=this.definition.convoy;
      this.skipHold=i.jump?this.skipHold+dt:0;
      const speed=this.skipHold>=1&&this.rideTime<90?10:1;
      this.rideTime=Math.min(combatAt,this.rideTime+Math.min(dt*speed,speed>1?90-this.rideTime:Infinity));
      if(speed>1){this.radio=null;this.queue.length=0;this.choices=null;}
      const hull=this.sim.vehicles.find(v=>v.id===p.vehicleId);
      const base=hull?hull.yaw+Math.PI:p.yaw;
      const yaw=hull?base+Math.max(-2.094,Math.min(2.094,angle((i.yaw??base)-base))):i.yaw??base;
      p.input=sanitizeInput({yaw,pitch:i.pitch});
    }else if(this.finale){p.input=sanitizeInput({yaw:p.yaw,pitch:p.pitch});}
    else{
      if(i.prone&&!this.previous.prone&&!p.downed)p.prone=!p.prone;
      if(p.downed){p.input.sprint=false;p.input.jump=false;p.input.grenade=false;p.input.toolSlot=0;p.input.weaponSlot=2;}
      if(p.prone)p.input.sprint=false;
      this.interact(dt);
    }
    this.previous={...i};
  }
  afterStep(dt){
    if(this.inTransit){this.updateRide();this.flushEnemies();this.updateRadio();return;}
    if(this.finale){
      this.updateRadio();
      if(!this.radio&&!this.queue.length&&this.time>=this.finale.at+8)this.startExtraction();
      return;
    }
    this.rideTime+=dt;
    this.updateMedic(dt);this.updateWounds(dt);this.processExplosions();this.flushEnemies();
    this.notices=this.notices.filter(notice=>notice.until>this.time);
    if(!this.player.alive){this.failed='Мартен погиб. Вернитесь к контрольной точке.';return;}
    const atTarget=!this.player.downed&&distance(this.player,point(this.section.target))<this.section.radius;
    if(this.stage===0){
      if(!this.fired.has('ambush-second')&&(this.time>=this.stageAt+8||!this.priorityThreats('at','rpg'))){
        this.fired.add('ambush-second');this.enqueue(this.section.second);
      }
      if(atTarget&&this.inside(this.player)?.id==='gate'&&!this.priorityThreats('at','rpg')){
        this.enterStage(1,1);
      }
    }else if(this.stage<4){
      const priority=this.stage===1?this.enemies.some(e=>distance(e,point(this.section.target))<16):
        this.stage===2?this.priorityThreats('mg'):this.priorityThreats('sniper');
      if(atTarget&&!priority)this.enterStage(this.stage+1,this.stage);
    }else if(this.stage===4){
      if(this.fuseAt!==null&&this.time>=this.fuseAt&&!this.flags.breached)this.detonate();
      if(this.flags.breached&&!this.player.downed&&this.player.x>138)this.enterStage(5,4);
    }else this.defend(atTarget);
    this.smoke=this.smoke.filter(s=>s.until>this.time);this.updateRadio();
  }
  priorityThreats(...roles){
    return this.enemies.some(p=>roles.includes(p.role))||this.pending.some(entry=>roles.includes(entry.at(-1)));
  }
  updateRide(){
    const d=this.definition.convoy;
    while(this.rideIndex<this.definition.ride.length&&this.rideTime+1e-7>=this.definition.ride[this.rideIndex][0]){
      const [at,key,fallback]=this.definition.ride[this.rideIndex++],speaker=key.split('.')[0];
      if(this.rideTime-at<2&&!(this.input.jump&&this.skipHold>=1&&this.rideTime<90)){
        this.say(this.carry[`${speaker}_alive`]===false?fallback??'vos.quiet':key);
      }
    }
    this.once('roofs',d.villageAt+6,()=>this.say(this.carry.kane_alive===false?'timo.roofs':'kane.roofs'));
    this.once('window',d.villageAt+12,()=>this.say('timo.window'));
    this.once('ambush-first',d.villageAt-14,()=>this.enqueue(this.definition.stages[0].first));
    this.once('lead-hit',d.ambushAt,()=>{this.radio=null;this.queue=[];this.hitTank(this.sim.vehicles[0],{x:-116,z:-9});});
    this.once('tail-hit',d.ambushAt+.8,()=>{
      this.hitTank(this.sim.vehicles.filter(v=>v.convoyIndex!==undefined).at(-1),{x:-181,z:9});
      this.flags.tanks_alive=this.sim.vehicles.filter(v=>v.convoyIndex!==undefined&&v.hp>0).length;
    });
    this.once('dismount',d.dismountAt,()=>this.dismount());
    this.once('combat',d.combatAt,()=>{this.stage=0;this.stageAt=this.time;this.say('vos.trapped');});
  }
  hitTank(v,source){
    v.scriptedLoss=true;
    const origin={...source,y:this.sim.groundAt(source.x,source.z)+1.4},target={x:v.x,y:v.y+.75,z:v.z};
    const rocketId=`m03-ambush-${v.convoyIndex}`;
    this.sim.event('rocketLaunch',{...origin,rocketId,team:1,vx:(target.x-origin.x)*4,vy:(target.y-origin.y)*4,vz:(target.z-origin.z)*4});
    this.sim.damageVehicle(v,100000,null,'blast',origin);
    const explosion=this.sim.events.findLast(event=>event.type==='explosion'&&event.vehicleId===v.id&&event.time===this.time);
    if(explosion)Object.assign(explosion,{kind:'rocket',ambushLeadHit:v.convoyIndex===0});
    this.sim.event('m03AmbushHit',{...target,vehicleId:v.id,rocketId,missionTime:this.rideTime});
  }
  dismount(animate=true){
    for(const p of this.sim.players.values())if(p.vehicleId&&p.team===0&&p.id!=='vos'){
      const v=this.sim.vehicles.find(v=>v.id===p.vehicleId),seat=p.vehicleSeat;
      if(v?.convoyIndex===undefined)continue;
      this.sim.dismountVehicle(p,true);
      const spot=this.safeSpot(p,p);
      Object.assign(p,spot);
      if(animate){
        const dropHeight=p.id==='local'?.95:.72;
        Object.assign(p,{y:spot.y+dropHeight,dropHeight,dropAt:this.time,dropDuration:p.id==='local'?.46:.31+(seat%3)*.05,
          grounded:false,invulnerableUntil:this.time+1});
      }else{
        delete p.dropAt;
        p.grounded=true;
      }
      if(p.columnCrew){p.home=spot;p.squadMember=true;}
    }
    this.seatVos();
    this.choices=null;
  }
  seatVos(){
    const p=this.sim.players.get('vos'),tank=this.sim.vehicles.find(v=>v.id==='sokol-7');
    if(!p||!tank?.hp)return;
    for(const vehicle of this.sim.vehicles){
      const seat=vehicle.seats.indexOf(p.id);
      if(seat!==-1)vehicle.seats[seat]=null;
    }
    tank.seats[0]=p.id;
    Object.assign(p,{vehicleId:tank.id,vehicleSeat:0,alive:true,hp:100,downed:false,downedTimer:0,prone:false,
      respawnIn:0,reviver:null,squadMember:false,invulnerableUntil:1e8,input:sanitizeInput({yaw:tank.yaw})});
    delete p.dropAt;
    this.sim.syncVehicleSeat(p,tank);
  }
  command(command){
    if(command?.type==='retry'){this.restore(this.latestSave??this.initialSave);return;}
    if(this.failed||this.complete||this.finale)return;
    if(this.inTransit){
      if(command?.type==='answer'&&this.choices&&Number.isInteger(command.index)&&command.index>=0&&command.index*2<this.choices.length){
        const choice=command.index*2;
        this.queue.unshift(this.choices[choice],this.choices[choice+1]);this.choices=null;
      }
      return;
    }
    if(command?.type==='smoke'&&this.player.smokeGrenades>0&&!this.player.downed){
      const p=this.player,where={x:p.x-Math.sin(p.yaw)*10,z:p.z-Math.cos(p.yaw)*10};
      if(!this.sim.lineClear(eye(p),{...where,y:p.y+.7}))return;
      p.smokeGrenades--;this.smoke.push({...where,y:this.sim.groundAt(where.x,where.z),until:this.time+13});return;
    }
    if(command?.type==='order'&&['follow','hold','assault','cover','revive'].includes(command.order)){
      this.order=command.order;this.orderAt=this.time;this.orderTarget=this.aimTarget(40);
      if(this.order==='assault'){
        const door=this.aimedPanel('door',32);
        if(!door){this.order='follow';return;}
        const {x,z}=door.part,targetZ=z+Math.sign(z-this.player.z||1)*2;
        this.orderTarget={x,y:this.sim.groundAt(x,targetZ),z:targetZ};this.assaultDoor=door.id;
        this.assaultLead=this.sim.players.get('duran')?.alive?'duran':[...this.sim.players.values()].find(p=>p.squadMember&&p.alive&&!p.downed)?.id;
      }
      if(this.order==='hold')for(const p of this.sim.players.values())if(p.squadMember)p.holdAt={x:p.x,y:p.y,z:p.z};
    }
  }
  enterStage(stage,checkpoint=0){
    this.stage=stage;this.stageAt=this.time;
    this.queue=this.queue.filter(key=>!stageRadio.includes(key)&&key!=='vos.trapped');
    for(const enemy of this.enemies)enemy.pursuing=true;
    if(stage<5)this.enqueue(this.section.first);
    else{
      this.pending.length=0;
      this.setPanel('hq-gate','open');
      const p=this.add('harranti','Полковник Харранти',0,['assault','ar416'],{x:176,z:-11},'harranti');
      p.storyCrew=true;
    }
    if(stage===1)for(const [i,[x,z]] of brigadeSites.entries()){
      const medic=brigadeMedics.has(i);
      const b=this.add(`brigade-${i+1}`,`${medic?'Санитар':'Боец'} бригады ${i+1}`,0,medic?['medic','mcx9']:['assault','ar416'],{x,z},'brigade');
      b.fieldMedic=medic;b.rescue=true;this.down(b);
    }
    this.say(stageRadio[stage]);
    if(checkpoint)this.save(checkpoint);
  }
  enqueue(entries){for(const e of entries)this.pending.push(e);}
  spawnPosition(entry){
    if(typeof entry[0]==='number')return {x:entry[0],z:entry[1]};
    if(entry[0]==='tower')return TEL_MAZIN.tower;
    const house=TEL_MAZIN.houses[entry[0]],inHouse=this.enemies.filter(p=>p.homeId===house.id).length;
    if(entry.at(-1)==='mg'&&house.emplacement)return house.emplacement;
    return {x:house.x+(inHouse?1.9:0),z:house.z+(inHouse?1.9:-2.2),y:house.baseY+.02};
  }
  flushEnemies(){
    if(this.stage>=1)for(const enemy of this.enemies){
      if(enemy.pursuing&&distance(enemy,this.player)>80&&!this.spawnVisible(enemy))this.sim.players.delete(enemy.id);
    }
    let capacity=MAX_ENEMIES-this.enemies.length;
    const held=[];
    while(capacity>0&&this.pending.length){
      const entry=this.pending.shift(),role=entry.at(-1),where=this.spawnPosition(entry),p=this.player;
      const truck=role.startsWith('truck-'),mounted=this.sim.vehicles.find(v=>v.id==='m03-truck');
      const reinforcement=this.stage>=5||this.stage===4&&this.section.second.some(spawn=>
        spawn[0]===entry[0]&&spawn[1]===entry[1]&&spawn.at(-1)===role);
      const lead=this.safeSpot(where),lockedPosition=typeof entry[0]==='string';
      const alternatives=lockedPosition&&!reinforcement?[]:[-1,1].flatMap(side=>[12,22,34].map(offset=>({x:where.x+5,z:where.z+side*offset})));
      const ambush=this.stage<=0;
      const spot=truck?(mounted??this.truckApproach()):[lead,...alternatives.map(a=>this.safeSpot(a))].find(a=>
        (!ambush||this.clearOfDismount(a))&&(!reinforcement||distance(p,a)>=30)&&
        (this.stage<0||!this.spawnVisible(a))&&
        !this.sim.collides(a.x,a.z,a.y+.02)&&!this.sim.vehicleAt(a.x,a.z,a.y));
      if(!spot){held.push(entry);continue;}
      capacity--;
      const id=`m03-enemy-${++this.enemySerial}`;
      const bot=this.add(id,'Восточный корпус',1,soldierTypes[role],spot,role);
      if(reinforcement&&this.stage===4)bot.pursuing=true;
      bot.homeId=lockedPosition&&spot===lead?entry[0]:null;
      if(this.stage===5)bot.defenceWave=this.defenceWave;
      bot.invulnerableUntil=this.time+.15;bot.rockets=['at','rpg'].includes(role)?2:0;
      bot.yaw=yawTo(bot,p);bot.input=sanitizeInput({yaw:bot.yaw});
      if(role==='rpg')bot.hp=45;
      if(role==='sniper')bot.nextSniper=this.time+2;
      if(truck)this.mountTruck(bot,role,spot);
    }
    this.pending.push(...held);
  }
  clearOfDismount(spot){
    const at=this.definition.convoy.ambushAt;
    return distance(spot,m03ConvoyPose(this.definition,3,at))>=20&&distance(spot,m03ConvoyPose(this.definition,4,at))>=20;
  }
  spawnVisible(spot){
    const p=this.player,range=distance(p,spot),height=spot.y+1.15-p.y-1.55;
    if(range<8)return true;
    return Math.abs(angle(yawTo(p,spot)-p.yaw))<1.23&&Math.abs(angle(Math.atan2(height,range)-p.pitch))<.88&&
      this.sim.lineClear(eye(p),eye(spot,1.15));
  }
  truckApproach(){
    const sim=this.sim;
    for(const [x,z] of [[220,0],[220,-7],[220,7],[218,-12],[218,12]]){
      const spawn={x,y:sim.groundAt(x,z),z,yaw:Math.atan2(x-206,z)};
      if(distance(spawn,this.player)>=30&&!this.spawnVisible(spawn)&&!sim.vehicleCollides({type:'humvee'},x,z,spawn.yaw))return spawn;
    }
    return null;
  }
  mountTruck(bot,role,spot){
    const id='m03-truck';let truck=this.sim.vehicles.find(v=>v.id===id);
    if(!truck){
      truck=this.sim.createMapVehicle({id,type:'humvee',team:1,...spot});
      this.sim.vehicles.push(truck);
    }
    const seat=role==='truck-driver'?0:1;
    truck.seats[seat]=bot.id;Object.assign(bot,{vehicleId:id,vehicleSeat:seat});this.sim.syncVehicleSeat(bot,truck);
  }
  inside(p){
    return this.sim.navigationHouses.find(h=>Math.abs(p.x-h.x)<h.w/2-.14&&Math.abs(p.z-h.z)<h.d/2-.14&&p.y<h.baseY+h.h-.1);
  }
  blastRoom(p){
    const room=this.inside(p);
    if(room&&TEL_MAZIN.interactives.filter(i=>i.id.startsWith(`${room.id}-`)).every(i=>['closed','locked'].includes(this.interactives[i.id])))return room;
    return null;
  }
  alert(){
    if(this.inTransit)return 0;
    const room=this.inside(this.player);
    if(!room||this.stage===5)return 3;
    const threats=this.enemies.filter(e=>e.homeId===room.id);
    return threats.some(e=>e.ai?.contact?.id==='local')||this.time-this.player.lastShotAt<5?3:1;
  }
  canSee(from,to,checkWalls=true){
    if(to.id==='vos'||to.storyCrew&&!to.columnCrew)return false;
    const a=eye(from),b=eye(to,to.downed?.43:1.2);
    for(const s of this.smoke){
      const dx=b.x-a.x,dz=b.z-a.z,u=Math.max(0,Math.min(1,((s.x-a.x)*dx+(s.z-a.z)*dz)/Math.max(.01,dx*dx+dz*dz)));
      if(Math.hypot(a.x+u*dx-s.x,a.z+u*dz-s.z)<4.5&&a.y+(b.y-a.y)*u<s.y+4)return false;
    }
    return !checkWalls||this.sim.lineClear(a,b);
  }
  botGoal(p){
    if(p.team===1){
      if(p.pursuing||p.role==='sapper'||this.stage===5&&!p.homeId)return this.player;
      if(p.homeId&&this.inside(this.player)?.id===p.homeId&&p.ai?.memory){
        const h=TEL_MAZIN.houses[p.homeId];
        if(h&&p.home.y<h.baseY+1)return {x:h.x-h.w*.30,z:h.z+2,y:h.baseY+.02};
      }
      return p.home;
    }
    if(this.order==='hold')return p.holdAt??p.home;
    if(this.order==='assault'&&this.orderTarget)return this.orderTarget;
    if(p.rescuedBrigade||p.fieldMedic){const door=this.routeDoor(p,this.player);if(door)return door;}
    const angle=p.botSlot*2.399,spacing=p.fieldMedic?3.2+(p.botSlot%2):p.rescuedBrigade?5:p.columnCrew?8+(p.botSlot%3)*2:5.5;
    return {x:this.player.x+Math.cos(angle)*spacing,z:this.player.z+Math.sin(angle)*spacing};
  }
  thinkBot(p,dt){
    const sim=this.sim,player=this.player;
    if(this.inTransit&&p.team===0||this.finale||p.id==='vos'||p.storyCrew&&!p.columnCrew||p.rescue||p.downed){
      const talking=this.radio?.key.startsWith(`${p.id}.`),looksAtPlayer=p.squadMember&&p.vehicleId===player.vehicleId&&p.vehicleId&&talking;
      p.input=sanitizeInput({yaw:looksAtPlayer?yawTo(p,player):p.yaw,pitch:looksAtPlayer?.07:p.pitch});return true;
    }
    if(p.role==='sapper'&&distance(p,player)<6&&sim.lineClear(eye(p),eye(player))){
      sim.damage(p,1000,player,{explosive:true});blast(sim,eye(p,.55),p,'grenade');return true;
    }
    if(p.role==='sniper'){
      p.input=sanitizeInput({yaw:yawTo(p,player),pitch:Math.atan2(player.y+.92-p.y-1.65,distance(p,player))});
      if(!this.canSee(p,player)){if(p.sniperAt){p.sniperAt=null;p.nextSniper=this.time+1;}return true;}
      if(!p.sniperAt&&this.time>=p.nextSniper){p.sniperAt=this.time+.72;p.flashUntil=p.sniperAt;}
      if(p.sniperAt&&this.time>=p.sniperAt){p.input.fire=true;p.sniperAt=null;p.nextSniper=this.time+3.8;}
      return true;
    }
    if(p.role==='truck-driver'&&p.vehicleId){
      const truck=sim.vehicles.find(v=>v.id===p.vehicleId);
      const joinRoad=truck.x>207&&Math.abs(truck.z)>.9,yaw=joinRoad?Math.atan2(truck.x-206,truck.z):Math.PI/2;
      const steer=Math.max(-1,Math.min(1,angle(truck.yaw-yaw)*2));
      p.input=sanitizeInput({yaw,strafe:steer,forward:truck.x>164?.5:0});return true;
    }
    if(p.role==='truck-gunner'&&p.vehicleId){
      p.input=sanitizeInput({yaw:yawTo(p,player),pitch:Math.atan2(player.y-p.y,distance(p,player)),fire:this.canSee(p,player),aim:true});return true;
    }
    if(p.medicTarget){
      const wounded=sim.players.get(p.medicTarget);
      if(!wounded?.alive||!wounded.downed)return false;
      ensureBotState(sim,p);p.input=sanitizeInput({yaw:yawTo(p,wounded)});
      if(this.medicCanTreat(p,wounded))p.input.crouch=true;
      else{
        const door=this.routeDoor(p,wounded);
        if(Boolean(door)!==p.medicAtDoor){
          p.medicAtDoor=Boolean(door);this.resetTreatmentPath(p);
        }
        if(!door&&(this.time>=(p.medicApproach?.until??0)||distance(p.medicApproach?.patient??p,wounded)>1.2))
          p.medicApproach={point:this.treatmentSpot(p,wounded),patient:{x:wounded.x,z:wounded.z},until:this.time+1.2};
        moveBot(sim,p,door??p.medicApproach?.point,dt,{sprint:true,followSteps:true});
      }
      return true;
    }
    return false;
  }
  routeDoor(actor,target){
    const building=p=>this.sim.navigationHouses.find(h=>Math.abs(p.x-h.x)<h.w/2-.14&&Math.abs(p.z-h.z)<h.d/2-.14&&p.y<h.baseY+h.h+.7);
    const current=building(actor),destination=building(target),house=current??destination;
    if(!house||current===destination)return null;
    const doors=[-1,1].map(side=>doorsById.get(`${house.id}-door-${side}`)).filter(d=>d&&this.interactives[d.id]!=='locked');
    const cost=d=>distance(actor,d.part)+distance(target,d.part)*.6+(['open','destroyed'].includes(this.interactives[d.id])?0:1.5);
    const door=doors.sort((a,b)=>cost(a)-cost(b))[0];
    if(!door||this.interactives[door.id]!=='closed')return null;
    const {x,z}=door.part,side=Math.sign(z-house.z),where={x,z:z+side*(current?-2.16:2.16),y:door.part.baseY};
    if(distance(actor,where)<1.05&&Math.abs(actor.y-where.y)<.75&&this.sim.lineClear(eye(actor),eye(where,1.15))){
      this.setPanel(door.id,'open');
      return null;
    }
    return where;
  }
  medicCanTreat(medic,patient){
    return distance(medic,patient)<2.55&&Math.abs(medic.y-patient.y)<.8&&this.sim.lineClear(eye(medic,.95),eye(patient,.35));
  }
  canHelpInjured(player,patient){
    return distance(player,patient)<2.65&&this.sim.lineClear(eye(player),eye(patient,.35));
  }
  reviveInProgress(patient){
    if(patient===this.player&&this.interaction==='self'&&this.input.selfRevive&&patient.syringes>0&&this.progress>0)return true;
    const medic=this.sim.players.get(patient.reviver);
    if(!medic?.alive||medic.downed)return false;
    if(medic===this.player)return this.interaction===patient.id&&this.input.use&&this.progress>0&&this.canHelpInjured(medic,patient);
    return medic.medicTarget===patient.id&&medic.medicProgress>0&&this.medicCanTreat(medic,patient);
  }
  treatmentSpot(medic,patient){
    let spot=patient,best=Infinity;
    for(let i=0;i<8;i++){
      const angle=Math.atan2(medic.z-patient.z,medic.x-patient.x)+Math.ceil(i/2)*Math.PI/4*(i%2?1:-1);
      const at={x:patient.x+1.65*Math.cos(angle),y:patient.y,z:patient.z+1.65*Math.sin(angle)};
      if(this.sim.collides(at.x,at.z,at.y+.03,.36,1.15)||this.sim.vehicleAt(at.x,at.z,at.y)||!this.medicCanTreat(at,patient))continue;
      const range=distance(medic,at),clear=range<7&&walkableSegment(this.sim,medic,at);
      const blocked=medic.ai?.blockedSpot;
      const cost=range-(clear?12:0)+(blocked&&this.time<blocked.until&&distance(at,blocked)<1?8:0);
      if(cost<best){best=cost;spot=at;}
    }
    return spot;
  }
  resetTreatmentPath(helper){
    helper.botPath=[];helper.medicApproach=null;
    const ai=helper.ai;if(!ai)return;
    ai.pathJob?.return();ai.pathJob=null;ai.pathResult=null;
    ai.pathGoal=null;ai.repathAt=0;ai.pathUntil=0;ai.goal=null;ai.goalUntil=0;
  }
  afterThink(p,dt){
    if(!p.ai)return;
    const contact=p.ai.contact,target=this.sim.players.get(contact?.id),sim=this.sim;
    p.input.grenade=false;p.input.gadget=false;p.input.secondaryGadget=['at','rpg'].includes(p.role)&&target?.alive&&distance(p,target)>13&&distance(p,target)<42&&this.time>=(p.rpgAt??0);
    if(p.input.secondaryGadget)p.rpgAt=this.time+7;
    if(p.team===0){
      if(this.order==='hold')p.input.forward=p.input.strafe=0;
      else if(this.order==='cover'&&this.orderTarget&&this.time<this.orderAt+6){
        p.input.yaw=yawTo(p,this.orderTarget);p.input.fire=p.ammo>0;p.input.forward=p.input.strafe=0;
        p.input.pitch=Math.atan2(this.orderTarget.y-p.y-1.65,distance(p,this.orderTarget));
      }else if(this.order==='assault'&&this.assaultDoor){
        const door=TEL_MAZIN.interactives.find(d=>d.id===this.assaultDoor);
        if(p.id===this.assaultLead&&distance(p,door.part)<3){
          this.setPanel(door.id,'open');
          if(this.interactives[door.id]==='open'){
            this.assaultDoor=null;
            if(p.grenadeCooldown<=0&&p.grenades>0){p.input.grenade=true;p.input.yaw=yawTo(p,this.orderTarget);}
          }
        }else if(p.id!==this.assaultLead&&distance(p,door.part)<6)p.input.forward=p.input.strafe=0;
      }
    }else{
      if(p.role==='mg'&&distance(p,p.home)<1.4){
        p.input.forward=p.input.strafe=0;p.input.crouch=false;
      }
      if(p.role==='assault'&&p.homeId){
        const door=TEL_MAZIN.interactives.find(d=>d.type==='door'&&d.id.startsWith(`${p.homeId}-door-`)&&
          distance(p,d.part)<2.6&&['closed','locked'].includes(this.interactives[d.id]));
        if(door&&contact){p.breachDoorAt??=this.time+1.2;if(this.time>=p.breachDoorAt){this.setPanel(door.id,'destroyed');p.breachDoorAt=null;}}
        else p.breachDoorAt=null;
      }
      const grenade=sim.grenades.find(g=>g.team===0&&distance(p,g)<5&&g.fuse<1.4);
      if(grenade){p.avoidGrenadeAt??=this.time+.7;if(this.time>=p.avoidGrenadeAt){const h=TEL_MAZIN.houses[p.homeId];
        if(h)moveBot(sim,p,{x:h.x,z:h.z+Math.sign(p.z-grenade.z||1)*(h.d/2+2)},dt,{sprint:true});}}
      else p.avoidGrenadeAt=null;
      if(p.homeId&&!contact&&distance(p,p.home)>10)moveBot(sim,p,p.home,dt,{sprint:false});
    }
  }
  aimTarget(max=4){
    const p=this.player,origin=eye(p),cos=Math.cos(p.pitch);
    const dir={x:-Math.sin(p.yaw)*cos,y:Math.sin(p.pitch),z:-Math.cos(p.yaw)*cos};
    return {x:origin.x+dir.x*max,y:origin.y+dir.y*max,z:origin.z+dir.z*max};
  }
  aimedPanel(type,range=3.1){
    const p=this.player,origin=eye(p),aim=this.aimTarget(1);
    let best=null,score=.68;
    for(const item of TEL_MAZIN.interactives){
      if(item.type==='breach'||item.type==='gate'||type&&item.type!==type||this.interactives[item.id]==='destroyed')continue;
      const part=item.part,dx=part.x-origin.x,dy=part.baseY+part.h*.54-origin.y,dz=part.z-origin.z,len=Math.hypot(dx,dy,dz);
      if(len>.1&&len<range){const dot=((aim.x-origin.x)*dx+(aim.y-origin.y)*dy+(aim.z-origin.z)*dz)/len;
        if(dot>score){best=item;score=dot;}}
    }
    return best;
  }
  interact(dt){
    const p=this.player,i=this.input;this.prompt='';
    const previousPatient=this.sim.players.get(this.interaction);
    if(previousPatient?.reviver===p.id)previousPatient.reviver=null;
    if(i.heal&&!this.previous.heal&&p.medkits>0&&!p.downed&&(p.hp<100||this.limp)){
      p.medkits--;p.hp=100;this.limp=false;
    }
    if(i.knife&&!this.previous.knife&&!p.downed&&this.time>=(this.meleeAt??0)){
      this.meleeAt=this.time+.6;
      const victim=this.enemies.find(e=>distance(p,e)<1.2&&Math.abs(e.y-p.y)<1.1&&Math.abs(angle(yawTo(p,e)-p.yaw))<.8&&this.canSee(p,e));
      if(victim)this.sim.damage(victim,60,p,{weapon:'РУКОПАШНАЯ',silent:true});
      this.sim.event('campaignKnife',{playerId:p.id,x:p.x,z:p.z});
    }
    if(p.downed){
      this.prompt=p.syringes>0?'X · удерживать шприц':'Дождитесь медика';
      this.hold('self',i.selfRevive&&p.syringes>0,dt,4,()=>{p.syringes--;this.revive(p);});return;
    }
    const wounded=[...this.sim.players.values()].find(a=>a!==p&&a.team===0&&a.alive&&a.downed&&this.canHelpInjured(p,a));
    if(wounded){
      this.prompt=`E · удерживать: помочь · ${wounded.name}`;
      if(i.use)wounded.reviver=p.id;
      this.hold(wounded.id,i.use,dt,reviveDuration(p,6),()=>this.revive(wounded));return;
    }
    if(previousPatient){this.interaction=null;this.progress=0;}
    if(this.stage===4&&!this.flags.breached&&!this.chargesCollected&&distance(p,chargeCache)<2.75){
      this.prompt='E · взять два заряда';
      this.hold('charge-cache',i.use,dt,.55,()=>{this.chargesCollected=true;});return;
    }
    if(this.stage===4&&this.chargesCollected&&!this.flags.breached){
      const charge=this.definition.breach.charges.findIndex((site,index)=>!this.charges[index]&&distance(p,point(site))<2.75);
      if(charge>=0){
        this.prompt='E · удерживать: установить заряд';
        this.hold(`charge-${charge}`,i.use,dt,this.definition.breach.plantSeconds,()=>{
          this.charges[charge]=true;
          if(this.charges.every(Boolean)){
            this.fuseAt=this.time+this.definition.breach.fuseSeconds;this.say('orlov.fuse');
            this.enqueue(this.section.second);
          }
        });return;
      }
    }
    if(this.stage>=1&&!this.flags.m3_documents&&distance(p,{x:-94,z:40})<2.6){
      this.prompt='E · взять документы корпуса';
      this.hold('documents',i.use,dt,.55,()=>{this.flags.m3_documents=true;this.say('marten.documents');});return;
    }
    const item=supplySites.find(s=>(s.kind==='crew'||!this.supplies[s.id])&&distance(p,s)<2.5&&Math.abs(p.y)<1.4);
    if(item){
      this.prompt=({aid:'E · взять аптечку и перевязаться',smoke:'E · взять дымовую гранату',rockets:'E · взять боекомплект ПТ-90',
        ammo:'E · взять патроны',crew:'E · пополнить боекомплект у Воса'})[item.kind];
      this.hold(item.id,i.use,dt,.55,()=>this.supply(item));return;
    }
    const panel=this.aimedPanel();
    if(panel){
      const status=this.interactives[panel.id],locked=status==='locked',open=status==='open';
      this.prompt=locked?'E · удерживать: выбить дверь':`E · ${open?'закрыть':'открыть'} ${panel.type==='door'?'дверь':'ставни'}`;
      if(locked)this.hold(panel.id,i.use,dt,1.2,()=>this.setPanel(panel.id,'destroyed'));
      else if(i.use&&!this.previous.use)this.setPanel(panel.id,open?'closed':'open');
    }else this.hold(null,false,dt,1,()=>{});
  }
  hold(id,held,dt,seconds,finish){
    if(!held){this.interaction=null;this.progress=0;return;}
    if(this.interaction!==id){this.interaction=id;this.progress=0;}
    this.player.input.fire=false;this.progress+=dt/seconds;
    if(this.progress+1e-7>=1){finish();this.interaction=null;this.progress=0;}
  }
  supply(item){
    const p=this.player;this.supplies[item.id]=true;
    if(item.kind==='aid'){p.medkits=Math.min(4,p.medkits+1);this.limp=false;}
    if(item.kind==='smoke')p.smokeGrenades=(p.smokeGrenades??0)+2;
    if(item.kind==='rockets')p.rockets=Math.max(3,p.rockets);
    if(item.kind==='crew'||item.kind==='ammo'){
      const weapon=this.sim.playerWeapon(p);p.ammo=weapon.mag;p.reserve=weapon.reserve;p.grenades=Math.max(p.grenades,3);
      if(item.kind==='crew'){p.medkits=Math.max(p.medkits,2);this.limp=false;}
    }
  }
  setPanel(id,status){
    const before=this.interactives[id];if(before===status||before==='destroyed')return;
    const panel=TEL_MAZIN.interactives.find(i=>i.id===id);
    const shape=status==='closed'?panel.part:status==='open'?panel.opened:null;
    if(shape&&[...this.sim.players.values()].some(p=>p.alive&&Math.abs(p.y-shape.baseY)<1.7&&
      Math.abs(p.x-shape.x)<shape.w/2+.44&&Math.abs(p.z-shape.z)<shape.d/2+.44))return;
    this.interactives[id]=status;this.geometryDirty=true;
  }
  refreshGeometry(){
    if(!this.geometryDirty)return;
    const disabled=new Set();
    for(const i of TEL_MAZIN.interactives){
      const state=this.interactives[i.id];
      if(state==='open'||state==='destroyed')disabled.add(i.id);
      if(i.opened&&state!=='open')disabled.add(i.opened.id);
    }
    this.sim.refreshCampaignColliders(disabled);resetNavigation(this.sim);this.geometryDirty=false;
    this.doorRevision=(this.doorRevision??0)+1;this.packedPanels=packPanels(this.interactives);
  }
  processExplosions(){
    for(const e of this.sim.events){
      if(e.id<=(this.latestExplosion??0)||e.type!=='explosion')continue;
      this.latestExplosion=e.id;
      for(const i of TEL_MAZIN.interactives){
        if(i.type==='breach'||i.type==='gate'||this.interactives[i.id]==='destroyed')continue;
        const target={x:i.part.x,y:i.part.baseY+i.part.h*.5,z:i.part.z};
        if(distance(e,target)>=3.4||Math.abs(e.y-target.y)>=2.35)continue;
        const dx=target.x-e.x,dy=target.y-e.y,dz=target.z-e.z,len=Math.hypot(dx,dy,dz),dir={x:dx/len,y:dy/len,z:dz/len};
        if(len<.05||!this.sim.rayBoxes(e,dir,len).some(b=>b.id!==i.id&&b.id!==i.opened?.id&&rayCollider(e,dir,b,len)<len-.1))
          this.setPanel(i.id,'destroyed');
      }
    }
  }
  detonate(){
    this.flags.breached=true;
    for(const id of this.definition.breach.opens){
      this.setPanel(id,'destroyed');const b=TEL_MAZIN.interactives.find(i=>i.id===id).part;
      this.sim.event('explosion',{x:b.x,y:b.baseY+.65,z:b.z,kind:'grenade'});
    }
    this.refreshGeometry();
  }
  down(p){
    const patient=this.sim.players.get(p.medicTarget);
    if(patient?.reviver===p.id)patient.reviver=null;
    Object.assign(p,{downed:true,prone:true,hp:1,downedAt:this.time,downedTimer:p.rescue?1e6:p.id==='local'?32:25,reviver:null,
      slideTime:0,reloading:false,heldGadget:null,medicTarget:null,medicProgress:0});
    this.sim.equipWeapon(p,2);p.equipTime=0;
    if(p.id==='local')this.say('marten.downed');
  }
  revive(p,medic){
    const rescue=p.rescue;
    Object.assign(p,{downed:false,prone:false,rescue:false,hp:50,reviver:null,downedTimer:0,
      reviveSeq:(p.reviveSeq??0)+1,invulnerableUntil:this.time+2});
    if(p.bot)this.sim.equipWeapon(p,1);
    if(rescue){
      this.flags.brigade_saved++;
      p.squadMember=true;p.rescuedBrigade=true;
      this.notify(`${p.name} вступил во временный отряд`);
    }
    if(medic){
      medic.fieldRevives=(medic.fieldRevives??0)+1;
      if(p.id==='local')this.notify(`${medic.name} поднял Мартена`);
    }
    this.sim.event('revive',{playerId:p.id,medicId:medic?.id,x:p.x,y:p.y,z:p.z});
  }
  notify(text){this.notices=[...this.notices.slice(-2),{text,until:this.time+8}];}
  updateWounds(dt){
    for(const p of this.sim.players.values())if(p.alive&&p.downed){
      if(p.rescue&&p.downedTimer>115){
        if(distance(p,this.player)>20)continue;
        p.downedTimer=115;
      }
      if(this.reviveInProgress(p))continue;
      p.downedTimer-=dt;
      if(p.downedTimer<=0){
        p.downed=false;p.prone=false;
        Simulation.prototype.damage.call(this.sim,p,1000,null);
        if(p.id!=='local'){
          this.notify(`Погиб · ${p.name}`);
          this.say('orlov.loss');
        }
      }
    }
  }
  updateMedic(dt){
    const player=this.player,allies=[...this.sim.players.values()].filter(p=>p.team===0&&p.alive);
    const responders=allies.filter(p=>p.bot&&(p.squadMember||p.fieldMedic)&&!p.downed&&!p.vehicleId);
    const patients=allies.filter(p=>p.downed&&(!p.rescue||p.downedTimer<=115)&&
      !(p.reviver===player.id&&this.reviveInProgress(p))).sort((a,b)=>a===player?-1:b===player?1:a.downedTimer-b.downedTimer);
    for(const helper of responders){
      const patient=this.sim.players.get(helper.medicTarget),probe=helper.medicProbe;
      if(!patient?.downed||!probe||this.time<probe.at+2.5)continue;
      if(distance(helper,probe)<.85&&Math.abs(helper.y-probe.y)<.3&&!this.medicCanTreat(helper,patient)){
        helper.medicBlockedPatient=patient.id;helper.medicBlockedUntil=this.time+4;
        this.resetTreatmentPath(helper);
      }
      helper.medicProbe={...eye(helper,0),at:this.time};
    }
    const assignments=new Map();this.playerMedic=null;
    for(const patient of patients){
      let best=null,bestCost=Infinity;
      for(const helper of responders){
        const medical=helper.classId==='medic';
        const range=this.order==='revive'?(medical?60:42):(medical?MEDIC_RANGE:30);
        const separation=distance(helper,patient);
        if(separation>range||assignments.has(helper)||
          helper.medicBlockedPatient===patient.id&&this.time<(helper.medicBlockedUntil??0))continue;
        const cost=separation+Math.abs(helper.y-patient.y)*3-(medical?10:0)-
          (this.medicCanTreat(helper,patient)?42:0)-(helper.medicTarget===patient.id?7:0);
        if(cost<bestCost){best=helper;bestCost=cost;}
      }
      if(best){assignments.set(best,patient);if(patient===player)this.playerMedic=best;}
    }
    for(const medic of responders){
      const candidate=assignments.get(medic);
      if(candidate?.id!==medic.medicTarget){
        const previous=this.sim.players.get(medic.medicTarget);
        if(previous?.reviver===medic.id)previous.reviver=null;
        medic.medicProgress=0;medic.medicTarget=candidate?.id;
        medic.medicProbe={...eye(medic,0),at:this.time};
        medic.medicAtDoor=false;this.resetTreatmentPath(medic);
      }
      if(!candidate)continue;
      if(!this.medicCanTreat(medic,candidate)){
        if(candidate.reviver===medic.id)candidate.reviver=null;
        medic.medicProgress=0;continue;
      }
      candidate.reviver=medic.id;medic.medicProgress=(medic.medicProgress??0)+dt;
      if(medic.medicProgress+1e-7>=reviveDuration(medic,MEDIC_TREATMENT_SECONDS)){this.revive(candidate,medic);medic.medicTarget=null;medic.medicProgress=0;}
    }
  }
  defend(atTarget){
    if(this.defenceAt===null&&atTarget){this.defenceAt=this.time;this.defenceWave=1;this.enqueue(this.section.first);return;}
    if(this.defenceAt===null)return;
    if(this.defenceThreats()){this.nextWaveAt=null;return;}
    if(this.defenceWave===1){
      this.nextWaveAt??=this.time+6;
      if(this.time>=this.nextWaveAt){
        this.defenceAt=this.time;this.defenceWave=2;this.enqueue(this.section.second);this.say('harranti.truck');
      }
      return;
    }
    if(!atTarget||this.player.downed)return;
    this.finale={at:this.time};this.flags.harranti_alive=true;
    const harranti=this.sim.players.get('harranti');
    const y=TEL_MAZIN.houses.headquarters.baseY+.02;
    Object.assign(this.player,{x:174.1,y,z:-11,yaw:-Math.PI/2,prone:false,downed:false,grounded:true,vy:0});
    if(harranti)Object.assign(harranti,{x:175.23,y,z:-11,yaw:Math.PI/2,grounded:true,vy:0});
    for(const id of Object.keys(allies))this.flags[`${id}_alive`]=this.sim.players.get(id)?.alive===true;
    const vos=this.sim.players.get('vos');
    this.setPanel('hq-gate','open');this.queue=[];this.radio=null;
    this.say('harranti.final');
    if(vos?.alive&&['timo','rafa'].every(id=>this.sim.players.get(id)?.alive)){
      this.sim.dismountVehicle(vos,true);
      Object.assign(vos,this.safeSpot({x:173.65,z:-12.6},vos),{yaw:-.3,grounded:true});
      this.say('vos.final');
    }
    this.say('dargo.final');
  }
  startExtraction(){
    const sim=this.sim;
    const infantry=[this.player,...[...sim.players.values()].filter(p=>p.bot&&p.team===0&&p.alive&&!p.downed&&
      !p.storyCrew&&(p.squadMember||p.rescuedBrigade))];
    this.smoke=[];sim.events=[];sim.grenades=[];sim.rockets=[];
    this.extraction=new Mission3Extraction(sim,infantry);
  }
  defenceThreats(){return this.pending.length+this.enemies.filter(e=>e.defenceWave).length;}
  save(number){
    if(this.options.ironman)return;
    this.checkpoint=number;this.latestSave=this.serialize();this.saveRevision++;
  }
  serialize(){
    const sim=this.sim;
    return structuredClone({version:SAVE_VERSION,definitionVersion:this.definition.version,missionId:'m03',difficulty:sim.difficulty,
      terrainRevision:TERRAIN_REVISION,
      time:sim.time,rngState:sim.rngState,players:[...sim.players.values()].map(({ai,damagers,...p})=>p),
      vehicles:sim.vehicles.map(({runOverHits,...v})=>v),grenades:sim.grenades,rockets:sim.rockets,bullets:sim.bullets,deployables:sim.deployables,
      mission:{checkpoint:this.checkpoint,stage:this.stage,stageAt:this.stageAt,rideTime:this.rideTime,rideIndex:this.rideIndex,
        enemySerial:this.enemySerial,flags:this.flags,pending:this.pending,fired:[...this.fired],order:this.order,orderAt:this.orderAt,
        orderTarget:this.orderTarget,charges:this.charges,chargesCollected:this.chargesCollected,fuseAt:this.fuseAt,
        defenceAt:this.defenceAt,defenceWave:this.defenceWave,nextWaveAt:this.nextWaveAt,
        interactives:this.interactives,supplies:this.supplies,limp:this.limp,smoke:this.smoke,carry:this.carry,choiceIndex:this.choiceIndex}});
  }
  restore(save){
    if(!validMission3Save(save,this.definition))return false;
    const sim=this.sim;
    const migrateTerrain=save.terrainRevision!==TERRAIN_REVISION;
    resetNavigation(sim);sim.players.clear();sim.vehicles=structuredClone(save.vehicles);
    if(migrateTerrain)for(const v of sim.vehicles){
      v.y=sim.groundAt(v.x,v.z);
      Object.assign(v,vehicleBodyTilt(v,sim.map.terrain));
    }
    for(const actor of save.players){
      const p=sim.addPlayer(actor.id,actor.name,actor.team,actor.classId,actor.primaryWeaponId,actor.sidearmId,actor.bot);
      Object.assign(p,structuredClone(actor),{ai:null,damagers:new Map(),botPath:[]});
      if(migrateTerrain){
        if(p.home)p.home.y+=telMazinFloor(p.home.x,p.home.z);
        const post=p.role==='sniper'?TEL_MAZIN.tower:TEL_MAZIN.houses[p.homeId]?.emplacement;
        if(post&&p.alive&&(p.role==='sniper'||p.role==='mg')&&!p.pursuing){
          const {x,y,z}=post;
          Object.assign(p,{x,y,z,home:{x,y,z},crouching:false});
        }else if(p.vehicleId){
          const vehicle=sim.vehicles.find(v=>v.id===p.vehicleId);
          if(vehicle)sim.syncVehicleSeat(p,vehicle);
        }else p.y+=telMazinFloor(p.x,p.z);
      }
      if(Object.hasOwn(crew,p.id)){p.columnCrew=true;p.squadMember=!p.vehicleId;}
      if(p.id==='lasko'||p.id==='stand-in-lasko')p.fieldMedic=true;
      if(p.role==='brigade'){
        p.fieldMedic??=brigadeMedics.has(Number(p.id.split('-').at(-1))-1);
        if(!p.rescue&&p.rescuedBrigade!==false){p.rescuedBrigade=true;p.relief=false;p.squadMember=true;}
        if(p.rescuedBrigade&&p.alive&&!p.downed&&p.weaponSlot===2&&(p.stowedAmmo.ammo||p.stowedAmmo.reserve))sim.equipWeapon(p,1);
      }
      p.medicTarget=null;p.medicProgress=0;p.medicProbe=null;p.medicBlockedUntil=0;
      p.medicBlockedPatient=null;p.medicApproach=null;p.medicAtDoor=false;p.reviver=null;
    }
    for(const key of ['grenades','rockets','bullets','deployables'])sim[key]=structuredClone(save[key]);
    sim.time=save.time;sim.rngState=save.rngState;sim.events=[];sim.eventId=0;sim.botTeams=null;sim.botTeamAt=0;
    Object.assign(this,structuredClone(save.mission));this.fired=new Set(save.mission.fired);
    this.chargesCollected=save.mission.chargesCollected??(this.charges.some(Boolean)||this.flags.breached===true);
    this.nextWaveAt=save.mission.nextWaveAt??null;
    Object.assign(this,{input:{},previous:{},queue:[],radio:null,radioEnd:0,skipHold:0,choices:null,
      latestExplosion:0,failed:null,complete:false,finale:null,extraction:null,prompt:'',interaction:null,progress:0,
      notices:[],playerMedic:null,assaultDoor:null,geometryDirty:true});
    this.latestSave=save.mission.checkpoint?structuredClone(save):null;
    this.saveRevision++;this.epoch++;this.refreshGeometry();
    if(this.fired.has('dismount'))this.dismount(false);
    const newCover=sim.colliders.filter(box=>box.id.startsWith('street-dressing-'));
    for(const p of sim.players.values()){
      if(!p.alive||p.vehicleId)continue;
      const body=uprightBox(p.x,p.y+.025,p.z,.4,p.downed||p.prone?.65:1.65);
      if(newCover.some(box=>overlapsCollider(body,box))||
        migrateTerrain&&sim.collides(p.x,p.z,p.y+.025,.4,p.downed||p.prone?.65:1.65)){
        Object.assign(p,this.safeSpot({x:p.x,y:p.y,z:p.z},p));
      }
    }
    if(this.inTransit)this.say('orlov.road');
    else if(this.stage===1||this.stage===2||this.stage===3||this.stage===4||this.stage===5)this.say(stageRadio[this.stage]);
    return true;
  }
  presentation(){
    const p=this.player,cutscene=this.finale?{id:'finale',elapsed:this.time-this.finale.at,extractionElapsed:this.extraction?.elapsed}:null;
    const objective=this.finale?'finale':this.section?.id??'ride';
    const objectiveState=this.objectiveState();
    const roomStatus={};
    for(const enemy of this.sim.players.values())if(enemy.team===1&&enemy.homeId)
      roomStatus[enemy.homeId]=enemy.alive||roomStatus[enemy.homeId]==='hostile'?'hostile':'clear';
    const brigade=[...this.sim.players.values()].filter(a=>a.rescuedBrigade),losses=[...this.sim.players.values()].filter(a=>a.team===0&&!a.alive).length;
    const medic=p.downed?this.playerMedic:null;
    const medicalResponse=medic?{name:medic.name,distance:Math.round(distance(medic,p)),
      progress:(medic.medicProgress??0)/reviveDuration(medic,MEDIC_TREATMENT_SECONDS)}:null;
    return {missionId:'m03',stage:this.stage,objective,...objectiveState,rideTime:this.rideTime,ride:this.inTransit,cutscene,medicalResponse,
      alert:this.alert(),inside:Boolean(this.inside(p)),time:this.time,checkpoint:this.checkpoint,epoch:this.epoch,
      failed:this.failed,complete:this.complete,flags:{...this.flags},radio:this.radio,radioRemaining:Math.max(0,this.radioEnd-this.time),
      doorStates:this.packedPanels,doorRevision:this.doorRevision,roomStatus,smoke:this.smoke,prompt:this.prompt,progress:this.progress,
      choices:this.choices?.filter((_,index)=>index%2===0)??null,order:this.order,charges:[...this.charges],
      skipHold:this.skipHold,smokeGrenades:p.smokeGrenades??0,syringes:p.syringes,medkits:p.medkits,limp:this.limp,
      fuseRemaining:this.fuseAt!==null&&!this.flags.breached?Math.max(0,this.fuseAt-this.time):null,
      wave:this.defenceWave,waveRemaining:this.nextWaveAt==null?null:Math.max(0,this.nextWaveAt-this.time),
      enemies:this.enemies.length,pendingEnemies:this.pending.length,
      sniperFlash:this.enemies.some(e=>e.role==='sniper'&&e.flashUntil>this.time),
      notices:this.notices.map(notice=>notice.text),temporarySquadIds:brigade.filter(a=>a.alive).map(a=>a.id),
      squadIds:[p.id,...[...this.sim.players.values()].filter(a=>a.squadMember&&!a.rescuedBrigade).map(a=>a.id)],
      stats:{elapsedSeconds:Math.floor(this.time),kills:p.kills,brigade:this.flags.brigade_saved,brigadeAlive:brigade.filter(a=>a.alive).length,losses}};
  }
  objectiveState(){
    const section=this.section;
    if(!section)return {target:null};
    const focus=(target,targetLabel)=>({target,targetLabel});
    const important=this.stage===0?['at','rpg']:this.stage===2?['mg']:this.stage===3?['sniper']:[];
    const threat=this.enemies.filter(e=>important.includes(e.role)).sort((a,b)=>distance(a,this.player)-distance(b,this.player))[0];
    if(threat)return focus({x:threat.x,y:threat.y,z:threat.z},{at:'ПРОТИВОТАНКОВЫЙ РАСЧЁТ',rpg:'ГРАНАТОМЁТЧИК',mg:'ПУЛЕМЁТ',sniper:'СНАЙПЕР'}[threat.role]);
    if(this.stage===4){
      if(!this.chargesCollected)return focus(chargeCache,'ЯЩИК С ЗАРЯДАМИ');
      if(!this.charges.every(Boolean)){const index=this.charges[0]?1:0;return focus(point(this.definition.breach.charges[index]),`ЗАРЯД ${index+1}/2`);}
      return this.flags.breached?focus({x:145,z:0},'ПРОЛОМ'):focus(null,'ОТОЙДИТЕ ОТ ПРОЛОМА');
    }
    if(this.stage===5&&this.defenceWave){
      const remaining=this.enemies.filter(e=>e.defenceWave);
      const attacker=remaining.find(e=>e.role==='truck-gunner'||e.role==='sapper')??remaining[0];
      if(attacker)return focus({x:attacker.x,y:attacker.y,z:attacker.z},attacker.vehicleId?'ГРУЗОВИК':attacker.role==='sapper'?'ПОДРЫВНИК':'АТАКУЮЩИЕ');
      if(!this.defenceThreats()&&this.defenceWave===2)return focus(point(section.target),'К ХАРРАНТИ');
    }
    return focus(point(section.target),['ЧАЙХАНА','МАСТЕРСКИЕ','ПЕРЕКРЁСТОК','РЫНОК','ПРОЛОМ','ДВОР ШТАБА'][this.stage]);
  }
}

export function validMission3Save(save,definition){
  const record=v=>v&&typeof v==='object'&&!Array.isArray(v);
  const position=v=>record(v)&&[v.x,v.y,v.z].every(Number.isFinite)&&Math.abs(v.x)<1024&&Math.abs(v.z)<180;
  const list=(v,max)=>Array.isArray(v)&&v.length<=max;
  const actors=(items,max)=>list(items,max)&&items.every(p=>position(p)&&typeof p.id==='string'&&Number.isFinite(p.hp))&&
    new Set(items.map(p=>p.id)).size===items.length;
  if(!record(save)||save.version!==SAVE_VERSION||save.definitionVersion!==definition.version||save.missionId!=='m03'||
    !['regular','recruit','veteran'].includes(save.difficulty)||!Number.isFinite(save.time)||save.time<0||!Number.isInteger(save.rngState)||
    !actors(save.players,88)||!actors(save.vehicles,10)||!save.players.some(p=>p.id==='local'&&p.team===0&&p.alive))return false;
  for(const p of save.players)if(![0,1].includes(p.team)||!['assault','support','medic','recon'].includes(p.classId)||
    !Number.isFinite(p.yaw)||!record(p.input)||!record(p.stowedAmmo)||p.vehicleId&&!save.vehicles.some(v=>v.id===p.vehicleId&&v.seats?.[p.vehicleSeat]===p.id))return false;
  for(const v of save.vehicles)if(!['tank','humvee'].includes(v.type)||!Array.isArray(v.seats)||!Number.isFinite(v.yaw)||
    !Number.isFinite(v.speed)||!position(v.home)&&!Number.isFinite(v.home?.x))return false;
  const m=save.mission;
  if(!record(m)||!Number.isInteger(m.stage)||m.stage< -1||m.stage>5||!Number.isInteger(m.checkpoint)||m.checkpoint<0||m.checkpoint>4||
    !Number.isFinite(m.rideTime)||m.rideTime<0||!Number.isInteger(m.enemySerial)||m.enemySerial<0||m.enemySerial>66||
    !list(m.fired,32)||!list(m.pending,66)||!list(m.smoke,16)||!list(m.charges,2)||m.charges.length!==2||!record(m.flags)||
    !record(m.carry)||!record(m.supplies)||!record(m.interactives))return false;
  if(!TEL_MAZIN.interactives.every(i=>['closed','open','locked','destroyed'].includes(m.interactives[i.id])))return false;
  for(const k of ['grenades','rockets','bullets','deployables'])if(!list(save[k],256)||!save[k].every(position))return false;
  return true;
}
