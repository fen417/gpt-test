import {Simulation,sanitizeInput} from '../simulation.js';
import {ensureBotState,thinkInfantryBot} from '../bot-ai.js';
import {moveBot,resetNavigation} from '../bot-navigation.js';
import {blast} from '../gadgets.js';
import {rayCollider} from '../asset-colliders.js';
import {vehicleBodyTilt} from '../vehicles.js';
import {getWeapon} from '../world.js';
import {TEL_MAZIN,m03ConvoyPose,packPanels} from './tel-mazin.js';

const SAVE_VERSION=1,MAX_ENEMIES=14;
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
const supplySites=[{id:'tea-kit',x:-155,z:12,kind:'aid'},{id:'cross-smoke',x:-46,z:13,kind:'smoke'},
  {id:'market-rpg',x:36,z:-24,kind:'rockets'},{id:'craft-ammo',x:-96,z:48,kind:'ammo'},
  {id:'vos-cache',x:-184,z:6,kind:'crew'}];

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
      if(p.storyCrew||p.relief)return;
      amount*=this.difficulty==='recruit'?.7:this.difficulty==='veteran'?1.25:1;
      if(p.downed){if(!p.rescue&&this.time-p.downedAt>5)p.downedTimer-=amount*.08;return;}
      if(amount>=p.hp){c.down(p);this.event('damage',{playerId:p.id,attackerId:attacker?.id,amount,x:attacker?.x??p.x,z:attacker?.z??p.z});return;}
    }
    if(p.role==='sniper'&&c.carry.kane_alive===false&&!meta.explosive)return;
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
    c.beforeStep(dt);super.step(dt);c.afterStep(dt);
  }
  snapshot(){
    const state=super.snapshot();
    for(const p of state.players){
      const live=this.players.get(p.id);
      Object.assign(p,{role:live.role,downed:Boolean(live.downed),downedTimer:live.downedTimer??0,prone:Boolean(live.prone),
        reviver:live.reviver??null,syringes:live.syringes??0,medkits:live.medkits??0,interior:this.campaign.inside(live)?.id??null});
      if(this.campaign.finale&&['local','harranti'].includes(p.id))p.handshake=this.time-this.campaign.finale.at;
    }
    state.campaign=this.campaign.presentation();return state;
  }
}

class ColumnDirector{
  constructor(sim,definition,options){
    this.sim=sim;this.definition=definition;this.options=options;this.carry=options.campaignProgress?.carry??{};
    this.input={};this.previous={};this.rideTime=0;this.rideIndex=0;this.skipHold=0;this.stage=-1;
    this.fired=new Set();this.choiceIndex=0;this.queue=[];this.serial=0;this.radio=null;this.radioEnd=0;
    this.checkpoint=0;this.saveRevision=0;this.epoch=0;this.pending=[];this.enemySerial=0;
    this.failed=null;this.complete=false;this.finale=null;this.flags={brigade_saved:0,m3_documents:false};
    this.order='follow';this.progress=0;this.charges=[false,false];this.fuseAt=null;this.defenceAt=null;this.defenceWave=0;
    this.interactives=Object.fromEntries(TEL_MAZIN.interactives.map(item=>[item.id,item.initial]));
    this.smoke=[];this.lossUntil=0;this.supplies={};this.limp=Boolean(this.carry.marten_wounded);this.geometryDirty=true;
  }
  get time(){return this.sim.time;}
  get player(){return this.sim.players.get('local');}
  get inTransit(){return this.stage<0;}
  get enemies(){return [...this.sim.players.values()].filter(p=>p.team===1&&p.alive);}
  get section(){return this.definition.stages[this.stage];}
  initialize(){
    const sim=this.sim,p=this.add('local','Ян Мартен',0,['assault','ar416'],{x:-832,z:-38},'marten',false);
    Object.assign(p,{medkits:2,syringes:2,rockets:0,squadMember:false});
    const count=Math.max(7,Math.min(9,Math.floor(this.carry.tanks_alive??8)));
    for(let n=0;n<count;n++){
      const v=sim.createMapVehicle({id:n===3?'sokol-7':`m03-tank-${n+1}`,type:'tank',team:0,...m03ConvoyPose(this.definition,n,0)});
      v.convoyIndex=n;sim.vehicles.push(v);
    }
    for(const [id,data] of Object.entries(allies)){
      const available=this.carry[`${id}_alive`]!==false;
      const a=this.add(available?id:`stand-in-${id}`,available?data[0]:'Боец бригады',0,data.slice(1),p,available?id:`stand-in-${id}`);
      a.squadMember=true;a.grenades=id==='duran'?2:0;
    }
    for(const [id,name] of Object.entries(crew)){
      const a=this.add(id,name,0,['assault','ar416'],p,id);a.storyCrew=true;
    }
    const mount=(who,v,seat)=>{
      if(!who)return;
      Object.assign(who,{vehicleId:v.id,vehicleSeat:seat,yaw:v.yaw,input:sanitizeInput({yaw:v.yaw})});
      v.seats[seat]=who.id;sim.syncVehicleSeat(who,v);
    };
    const hull=sim.vehicles[3],next=sim.vehicles[4];
    mount(p,hull,4);mount(sim.players.get('timo'),hull,0);mount(sim.players.get('vos'),hull,1);mount(sim.players.get('rafa'),next,1);
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
      const {ambushAt,combatAt}=this.definition.convoy;
      this.skipHold=i.jump?this.skipHold+dt:0;
      const speed=this.skipHold>=1&&this.rideTime<90?10:1;
      this.rideTime=Math.min(combatAt,this.rideTime+Math.min(dt*speed,speed>1?90-this.rideTime:Infinity));
      if(speed>1){this.radio=null;this.queue.length=0;}
      const hull=this.sim.vehicles.find(v=>v.id==='sokol-7'),base=hull.yaw;
      p.input=sanitizeInput({yaw:base+Math.max(-2.094,Math.min(2.094,angle((i.yaw??base)-base))),pitch:i.pitch});
      if(this.rideTime<ambushAt)this.updateLook(dt);
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
      if(!this.radio&&!this.queue.length&&this.time>=this.finale.at+8){this.complete=true;this.flags.m3_done=true;}
      return;
    }
    this.rideTime+=dt;
    this.updateWounds(dt);this.updateMedic(dt);this.processExplosions();this.flushEnemies();
    if(!this.player.alive){this.failed='Мартен погиб. Вернитесь к контрольной точке.';return;}
    const still=this.enemies.length+this.pending.length;
    const safe=still===0,atTarget=distance(this.player,point(this.section.target))<this.section.radius;
    if(this.stage===0){
      // The relief wave and radio keep their original entry-relative times.
      const entry=this.definition.convoy.villageAt;
      this.once('ambush-second',entry+30,()=>this.enqueue(this.section.second));
      this.once('vos-trapped',entry+45,()=>{this.say('vos.trapped');this.placeCrew();});
      if(safe&&atTarget&&this.inside(this.player)?.id==='gate'&&this.fired.has('vos-trapped'))this.enterStage(1);
    }else if(this.stage<4){
      if(safe&&atTarget)this.enterStage(this.stage+1,this.stage);
    }else if(this.stage===4){
      if(this.fuseAt!==null&&this.time>=this.fuseAt&&!this.flags.breached)this.detonate();
      if(this.flags.breached&&safe&&this.player.x>138)this.enterStage(5,4);
    }else this.defend(safe,atTarget,dt);
    this.smoke=this.smoke.filter(s=>s.until>this.time);this.updateRadio();
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
    this.once('lead-hit',d.ambushAt,()=>{this.radio=null;this.queue=[];this.hitTank(this.sim.vehicles[0],{x:-116,z:-9});});
    this.once('tail-hit',d.ambushAt+.8,()=>{
      this.hitTank(this.sim.vehicles.filter(v=>v.convoyIndex!==undefined).at(-1),{x:-181,z:9});
      this.flags.tanks_alive=this.sim.vehicles.filter(v=>v.convoyIndex!==undefined&&v.hp>0).length;
    });
    this.once('ambush-first',d.ambushAt+1.5,()=>this.enqueue(this.definition.stages[0].first));
    this.once('dismount',d.dismountAt,()=>this.dismount());
    this.once('combat',d.combatAt,()=>{this.stage=0;this.stageAt=this.time;});
  }
  updateLook(dt){
    const p=this.player,yaw=p.input.yaw??p.yaw;
    const other=[...this.sim.players.values()].find(a=>a.id!==p.id&&a.squadMember&&!a.lookLine&&a.vehicleId===p.vehicleId&&
      Math.abs(angle(yawTo(p,a)-yaw))<.35);
    if(this.lookId!==other?.id){this.lookId=other?.id;this.lookSeconds=0;}
    if(other&&(this.lookSeconds+=dt)>=1.5){other.lookLine=true;this.say(other.id==='kane'?'kane.quiet':'timo.road');}
    if(this.input.use&&!this.previous.use)this.offerDialogue();
  }
  hitTank(v,source){
    v.scriptedLoss=true;
    const origin={...source,y:1.4},target={x:v.x,y:v.y+.75,z:v.z};
    const rocketId=`m03-ambush-${v.convoyIndex}`;
    this.sim.event('rocketLaunch',{...origin,rocketId,team:1,vx:(target.x-origin.x)*4,vy:(target.y-origin.y)*4,vz:(target.z-origin.z)*4});
    this.sim.damageVehicle(v,100000,null,'blast',origin);
    this.sim.event('m03AmbushHit',{...target,vehicleId:v.id,rocketId,missionTime:this.rideTime});
  }
  dismount(){
    for(const p of this.sim.players.values())if(p.vehicleId&&p.team===0){
      const v=this.sim.vehicles.find(v=>v.id===p.vehicleId),seat=p.vehicleSeat;
      this.sim.dismountVehicle(p,true);
      const spot=this.safeSpot({x:v.x+(seat-2)*1.12,z:seat%2?3.4:-3.4},p);
      const dropHeight=p.id==='local'?1.46:.95;
      Object.assign(p,spot,{y:spot.y+dropHeight,dropHeight,dropAt:this.time,dropDuration:p.id==='local'?1.5:.3+(seat%4)*.16,
        grounded:false,invulnerableUntil:this.time+3.2});
    }
    this.player.invulnerableUntil=this.time+3.5;
    this.choices=null;this.placeCrew();
  }
  placeCrew(){
    for(const [i,id] of Object.keys(crew).entries()){
      const p=this.sim.players.get(id);if(!p||p.vehicleId)continue;
      Object.assign(p,this.safeSpot({x:-184+i*1.4,z:6.8},p),{grounded:true,vy:0});
    }
  }
  offerDialogue(){
    if(this.choices||this.choiceIndex>=this.definition.dialogueChoices.length||this.rideTime<22||this.rideTime>=95)return;
    if(this.choiceIndex===0&&this.carry.lasko_alive===false)this.choiceIndex++;
    this.choices=this.definition.dialogueChoices[this.choiceIndex];
  }
  command(command){
    if(command?.type==='retry'){this.restore(this.latestSave??this.initialSave);return;}
    if(this.failed||this.complete||this.finale)return;
    if(this.inTransit){
      if(command?.type==='talk')this.offerDialogue();
      if(command?.type==='answer'&&this.choices&&[0,1].includes(command.index)){
        const choice=command.index*2;this.say(this.choices[choice]);this.say(this.choices[choice+1]);this.choices=null;this.choiceIndex++;
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
        this.orderTarget={x:door.part.x,y:0,z:door.part.z+Math.sign(door.part.z-this.player.z||1)*2};this.assaultDoor=door.id;
        this.assaultLead=this.sim.players.get('duran')?.alive?'duran':[...this.sim.players.values()].find(p=>p.squadMember&&p.alive&&!p.downed)?.id;
      }
      if(this.order==='hold')for(const p of this.sim.players.values())if(p.squadMember)p.holdAt={x:p.x,y:p.y,z:p.z};
    }
  }
  enterStage(stage,checkpoint=0){
    this.stage=stage;this.stageAt=this.time;
    if(stage<5)this.enqueue(this.section.first);
    else{
      this.setPanel('hq-gate','open');
      const p=this.add('harranti','Полковник Харранти',0,['assault','ar416'],{x:176,z:-11},'harranti');
      p.storyCrew=true;
    }
    if(stage===1)for(const [i,[x,z]] of brigadeSites.entries()){
      const b=this.add(`brigade-${i+1}`,'Раненый боец бригады',0,['assault','ar416'],{x,z},'brigade');
      b.rescue=true;this.down(b);
    }
    this.say(stageRadio[stage]);
    if(checkpoint)this.save(checkpoint);
  }
  enqueue(entries){for(const e of entries)this.pending.push(e);}
  spawnPosition(entry){
    if(typeof entry[0]==='number')return {x:entry[0],z:entry[1]};
    if(entry[0]==='tower')return TEL_MAZIN.tower;
    const house=TEL_MAZIN.houses[entry[0]],inHouse=this.enemies.filter(p=>p.homeId===house.id).length;
    const elevated=entry.at(-1)==='mg'&&house.floors>1;
    return {x:house.x+(inHouse?1.9:0),z:house.z+(elevated?-Math.sign(house.z)*4.6:inHouse?1.9:-2.2),y:elevated?3:0};
  }
  flushEnemies(){
    let capacity=MAX_ENEMIES-this.enemies.length;
    const held=[];
    while(capacity>0&&this.pending.length){
      const entry=this.pending.shift(),role=entry.at(-1),where=this.spawnPosition(entry),p=this.player;
      // Delay reinforcements in the aimed lane; hand-placed rooms already provide cover.
      if(this.stage>0&&typeof entry[0]!=='string'&&!role.startsWith('truck-')&&distance(p,where)<22&&
        Math.abs(angle(yawTo(p,where)-p.yaw))<.8&&this.sim.lineClear(eye(p),{...where,y:(where.y??0)+1.2})){
        const fallback={...where,z:where.z+(where.z<0?-1:1)*13};
        if(this.sim.lineClear(eye(p),{...fallback,y:1.2})){held.push(entry);continue;}
        Object.assign(where,fallback);
      }
      capacity--;
      const id=`m03-enemy-${++this.enemySerial}`;
      const bot=this.add(id,'Восточный корпус',1,soldierTypes[role],where,role);
      bot.homeId=typeof entry[0]==='string'?entry[0]:null;
      bot.invulnerableUntil=this.time+.15;bot.rockets=role==='rpg'?2:0;
      bot.yaw=yawTo(bot,p);bot.input=sanitizeInput({yaw:bot.yaw});
      if(role==='rpg')bot.hp=45;
      if(role==='sniper')bot.nextSniper=this.time+2;
      if(role.startsWith('truck-'))this.mountTruck(bot,role);
    }
    this.pending.push(...held);
  }
  mountTruck(bot,role){
    const id='m03-truck';let truck=this.sim.vehicles.find(v=>v.id===id);
    if(!truck){
      truck=this.sim.createMapVehicle({id,type:'humvee',team:1,x:211,z:0,yaw:Math.PI/2});
      this.sim.vehicles.push(truck);
    }
    const seat=role==='truck-driver'?0:1;
    truck.seats[seat]=bot.id;Object.assign(bot,{vehicleId:id,vehicleSeat:seat});this.sim.syncVehicleSeat(bot,truck);
  }
  inside(p){
    return this.sim.navigationHouses.find(h=>Math.abs(p.x-h.x)<h.w/2-.14&&Math.abs(p.z-h.z)<h.d/2-.14&&p.y<h.h-.1);
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
    if(to.storyCrew||to.relief)return false;
    const a=eye(from),b=eye(to,to.downed?.43:1.2);
    for(const s of this.smoke){
      const dx=b.x-a.x,dz=b.z-a.z,u=Math.max(0,Math.min(1,((s.x-a.x)*dx+(s.z-a.z)*dz)/Math.max(.01,dx*dx+dz*dz)));
      if(Math.hypot(a.x+u*dx-s.x,a.z+u*dz-s.z)<4.5&&a.y+(b.y-a.y)*u<s.y+4)return false;
    }
    return !checkWalls||this.sim.lineClear(a,b);
  }
  botGoal(p){
    if(p.team===1){
      if(p.role==='sapper'||this.stage===5&&!p.homeId)return this.player;
      if(p.homeId&&this.inside(this.player)?.id===p.homeId&&p.ai?.memory){
        const h=TEL_MAZIN.houses[p.homeId];
        if(h&&p.home.y<1)return {x:h.x-h.w*.30,z:h.z+2,y:0};
      }
      return p.home;
    }
    if(this.order==='hold')return p.holdAt??p.home;
    if(this.order==='assault'&&this.orderTarget)return this.orderTarget;
    const angle=p.botSlot*2.399;
    return {x:this.player.x+Math.cos(angle)*5.5,z:this.player.z+Math.sin(angle)*5.5};
  }
  thinkBot(p,dt){
    const sim=this.sim,player=this.player;
    if(this.inTransit&&p.team===0||this.finale||p.storyCrew||p.rescue||p.relief||p.downed){
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
      p.input=sanitizeInput({yaw:Math.PI/2,forward:truck.x>164?.5:0});return true;
    }
    if(p.role==='truck-gunner'&&p.vehicleId){
      p.input=sanitizeInput({yaw:yawTo(p,player),pitch:Math.atan2(player.y-p.y,distance(p,player)),fire:this.canSee(p,player),aim:true});return true;
    }
    if(p.id==='lasko'&&this.medicTarget){
      const wounded=this.medicTarget;
      ensureBotState(sim,p);p.input=sanitizeInput({yaw:p.yaw});
      if(distance(p,wounded)>2.15)moveBot(sim,p,wounded,dt,{sprint:true});
      return true;
    }
    return false;
  }
  afterThink(p,dt){
    if(!p.ai)return;
    const contact=p.ai.contact,target=this.sim.players.get(contact?.id),sim=this.sim;
    p.input.grenade=false;p.input.gadget=false;p.input.secondaryGadget=p.role==='rpg'&&target?.alive&&distance(p,target)>13&&distance(p,target)<42&&this.time>=(p.rpgAt??0);
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
      if(p.role==='mg'){p.input.forward=p.input.strafe=0;p.input.crouch=true;}
      if(p.role==='assault'&&p.homeId){
        const door=TEL_MAZIN.interactives.find(d=>d.type==='door'&&d.id.startsWith(`${p.homeId}-door-`)&&
          distance(p,d.part)<2.6&&['closed','locked'].includes(this.interactives[d.id]));
        if(door&&contact){p.breachDoorAt??=this.time+1.2;if(this.time>=p.breachDoorAt){this.setPanel(door.id,'destroyed');p.breachDoorAt=null;}}
        else p.breachDoorAt=null;
      }
      const grenade=sim.grenades.find(g=>g.team===0&&distance(p,g)<5&&g.fuse<1.4);
      if(grenade){p.avoidGrenadeAt??=this.time+.7;if(this.time>=p.avoidGrenadeAt){const h=TEL_MAZIN.houses[p.homeId];
        if(h)moveBot(sim,p,{x:h.x,z:h.z+Math.sign(p.z-grenade.z||1)*(h.d/2+2),y:0},dt,{sprint:true});}}
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
    const wounded=[...this.sim.players.values()].find(a=>a!==p&&a.team===0&&a.alive&&a.downed&&distance(p,a)<2.65&&
      this.sim.lineClear(eye(p),eye(a,.35)));
    if(wounded){
      this.prompt=`E · удерживать: помочь · ${wounded.name}`;
      wounded.reviver=i.use?p.id:null;
      this.hold(wounded.id,i.use,dt,6,()=>this.revive(wounded));return;
    }
    if(this.stage===4&&!this.flags.breached){
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
      const weapon=getWeapon(p.classId,p.weaponId);p.ammo=weapon.mag;p.reserve=weapon.reserve;p.grenades=Math.max(p.grenades,3);
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
    Object.assign(p,{downed:true,prone:true,hp:1,downedAt:this.time,downedTimer:p.rescue?1e6:25,reviver:null,
      slideTime:0,reloading:false,heldGadget:null});
    this.sim.equipWeapon(p,2);p.equipTime=0;
    if(p.id==='local')this.say('marten.downed');
  }
  revive(p){
    const rescue=p.rescue;
    Object.assign(p,{downed:false,prone:false,rescue:false,hp:50,reviver:null,downedTimer:0,
      reviveSeq:(p.reviveSeq??0)+1,invulnerableUntil:this.time+2});
    if(rescue){
      this.flags.brigade_saved++;
      p.squadMember=[...this.sim.players.values()].filter(a=>a.alive&&a.squadMember).length<6;
      p.relief=!p.squadMember;
    }
    this.sim.event('revive',{playerId:p.id,x:p.x,y:p.y,z:p.z});
  }
  updateWounds(dt){
    for(const p of this.sim.players.values())if(p.alive&&p.downed&&!p.rescue){
      p.downedTimer-=dt;
      if(p.downedTimer<=0){
        p.downed=false;p.prone=false;
        Simulation.prototype.damage.call(this.sim,p,1000,null);
        if(p.id!=='local'){this.lossUntil=this.time+this.definition.music.lossSilence;this.say('orlov.loss');}
      }
    }
  }
  updateMedic(dt){
    const medic=this.sim.players.get('lasko');
    if(!medic?.alive||medic.downed){this.medicTarget=null;return;}
    const candidate=[...this.sim.players.values()].filter(p=>p.alive&&p.downed&&p.team===0&&p!==medic&&
      distance(p,medic)<(this.order==='revive'?27:13)&&!(p.reviver==='local'&&this.input.use))
      .sort((a,b)=>Number(b.id==='local')-Number(a.id==='local')||distance(a,medic)-distance(b,medic))[0];
    if(candidate!==this.medicTarget){
      if(this.medicTarget?.reviver==='lasko')this.medicTarget.reviver=null;
      this.medicProgress=0;this.medicTarget=candidate;
    }
    if(!candidate||distance(candidate,medic)>2.6||!this.sim.lineClear(eye(medic),eye(candidate,.35))){this.medicProgress=0;return;}
    candidate.reviver='lasko';this.medicProgress+=dt;
    if(this.medicProgress+1e-7>=6){this.revive(candidate);this.medicTarget=null;this.medicProgress=0;}
  }
  defend(safe,atTarget,dt){
    if(this.defenceAt===null&&atTarget){this.defenceAt=this.time;this.defenceWave=1;this.enqueue(this.section.first);return;}
    if(this.defenceAt===null)return;
    if(!atTarget){this.defenceAt+=dt;return;}
    const length=this.definition.defenceWaveSeconds;
    if(this.defenceWave===1&&this.time-this.defenceAt>=length){
      this.defenceAt=this.time;this.defenceWave=2;this.enqueue(this.section.second);this.say('harranti.truck');return;
    }
    if(this.defenceWave!==2||!safe||this.time-this.defenceAt<length)return;
    this.finale={at:this.time};this.flags.harranti_alive=true;
    const harranti=this.sim.players.get('harranti');
    Object.assign(this.player,{x:174.1,y:0,z:-11,yaw:-Math.PI/2,prone:false,downed:false,grounded:true,vy:0});
    if(harranti)Object.assign(harranti,{x:175.23,y:0,z:-11,yaw:Math.PI/2,grounded:true,vy:0});
    for(const id of Object.keys(allies))this.flags[`${id}_alive`]=this.sim.players.get(id)?.alive===true;
    for(const [i,id] of Object.keys(crew).entries())Object.assign(this.sim.players.get(id),this.safeSpot({x:166-i*1.6,z:-16.9}));
    this.setPanel('hq-gate','open');this.queue=[];this.radio=null;
    for(const key of ['harranti.final','vos.final','dargo.final'])this.say(key);
  }
  save(number){
    if(this.options.ironman)return;
    this.checkpoint=number;this.latestSave=this.serialize();this.saveRevision++;
  }
  serialize(){
    const sim=this.sim;
    return structuredClone({version:SAVE_VERSION,definitionVersion:this.definition.version,missionId:'m03',difficulty:sim.difficulty,
      time:sim.time,rngState:sim.rngState,players:[...sim.players.values()].map(({ai,damagers,...p})=>p),
      vehicles:sim.vehicles.map(({runOverHits,...v})=>v),grenades:sim.grenades,rockets:sim.rockets,bullets:sim.bullets,deployables:sim.deployables,
      mission:{checkpoint:this.checkpoint,stage:this.stage,stageAt:this.stageAt,rideTime:this.rideTime,rideIndex:this.rideIndex,
        enemySerial:this.enemySerial,flags:this.flags,pending:this.pending,fired:[...this.fired],order:this.order,orderAt:this.orderAt,
        orderTarget:this.orderTarget,charges:this.charges,fuseAt:this.fuseAt,defenceAt:this.defenceAt,defenceWave:this.defenceWave,
        interactives:this.interactives,supplies:this.supplies,limp:this.limp,smoke:this.smoke,carry:this.carry,choiceIndex:this.choiceIndex}});
  }
  restore(save){
    if(!validMission3Save(save,this.definition))return false;
    const sim=this.sim;
    resetNavigation(sim);sim.players.clear();sim.vehicles=structuredClone(save.vehicles);
    for(const actor of save.players){
      const p=sim.addPlayer(actor.id,actor.name,actor.team,actor.classId,actor.primaryWeaponId,actor.sidearmId,actor.bot);
      Object.assign(p,structuredClone(actor),{ai:null,damagers:new Map(),botPath:[]});
    }
    for(const key of ['grenades','rockets','bullets','deployables'])sim[key]=structuredClone(save[key]);
    sim.time=save.time;sim.rngState=save.rngState;sim.events=[];sim.eventId=0;sim.botTeams=null;sim.botTeamAt=0;
    Object.assign(this,structuredClone(save.mission));this.fired=new Set(save.mission.fired);
    Object.assign(this,{input:{},previous:{},queue:[],radio:null,radioEnd:0,skipHold:0,choices:null,
      latestExplosion:0,failed:null,complete:false,finale:null,prompt:'',interaction:null,progress:0,lossUntil:0,
      medicTarget:null,medicProgress:0,assaultDoor:null,geometryDirty:true});
    this.latestSave=save.mission.checkpoint?structuredClone(save):null;
    this.saveRevision++;this.epoch++;this.refreshGeometry();
    if(this.inTransit)this.say('orlov.road');
    return true;
  }
  presentation(){
    const p=this.player,cutscene=this.finale?{id:'finale',elapsed:this.time-this.finale.at}:null;
    const objective=this.finale?'finale':this.section?.id??'ride';
    const target=this.stage===4&&!this.charges.every(Boolean)?point(this.definition.breach.charges[this.charges[0]?1:0]):
      this.section?point(this.section.target):null;
    const roomStatus={};
    for(const enemy of this.sim.players.values())if(enemy.team===1&&enemy.homeId)
      roomStatus[enemy.homeId]=enemy.alive||roomStatus[enemy.homeId]==='hostile'?'hostile':'clear';
    return {missionId:'m03',stage:this.stage,objective,target,rideTime:this.rideTime,ride:this.inTransit,cutscene,
      alert:this.alert(),inside:Boolean(this.inside(p)),time:this.time,checkpoint:this.checkpoint,epoch:this.epoch,
      failed:this.failed,complete:this.complete,flags:{...this.flags},radio:this.radio,radioRemaining:Math.max(0,this.radioEnd-this.time),
      doorStates:this.packedPanels,doorRevision:this.doorRevision,roomStatus,smoke:this.smoke,lossUntil:this.lossUntil,prompt:this.prompt,progress:this.progress,
      choices:this.choices?[this.choices[0],this.choices[2]]:null,order:this.order,charges:[...this.charges],
      skipHold:this.skipHold,smokeGrenades:p.smokeGrenades??0,syringes:p.syringes,medkits:p.medkits,limp:this.limp,
      fuseRemaining:this.fuseAt!==null&&!this.flags.breached?Math.max(0,this.fuseAt-this.time):null,
      wave:this.defenceWave,waveRemaining:this.defenceAt===null?null:Math.max(0,this.definition.defenceWaveSeconds-(this.time-this.defenceAt)),
      enemies:this.enemies.length,sniperFlash:this.enemies.some(e=>e.role==='sniper'&&e.flashUntil>this.time),
      stats:{elapsedSeconds:Math.floor(this.time),kills:p.kills,brigade:this.flags.brigade_saved}};
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
    !list(m.fired,32)||!list(m.pending,14)||!list(m.smoke,16)||!list(m.charges,2)||m.charges.length!==2||!record(m.flags)||
    !record(m.carry)||!record(m.supplies)||!record(m.interactives))return false;
  if(!TEL_MAZIN.interactives.every(i=>['closed','open','locked','destroyed'].includes(m.interactives[i.id])))return false;
  for(const k of ['grenades','rockets','bullets','deployables'])if(!list(save[k],256)||!save[k].every(position))return false;
  return true;
}
