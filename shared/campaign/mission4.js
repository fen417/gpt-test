import {Simulation,sanitizeInput} from '../simulation.js';
import {moveBot,resetNavigation} from '../bot-navigation.js';
import {TANK_CANNON,TANK_MG,tankMuzzle,tankArmorZone} from '../tank.js';
import {vehicleBodyTilt} from '../vehicles.js';
import {zeroedBulletPitch} from '../ballistics.js';
import {campaignTankSight} from './tank-controls.js';
import {SAFRA,SAFRA_GUN,SAFRA_MINES,SAFRA_NEST,SAFRA_SAPPERS,SAFRA_SLABS,SAFRA_WATER} from './safra.js';

const MAX_ENEMIES=16;
const ridge={x:-220,z:-20},field={x:-143,z:8};
const start={x:-335,z:40},backOfNest={x:62,z:-10};
const directions={road:[260,2],north:[116,-113],south:[151,108]};
const tankArmor={front:.55,side:1,rear:1.4,top:1.6};
const allies={
  duran:['Гари Дюран','assault','ar416'],lasko:['Тео Ласко','medic','mcx9'],
  bruno:['Бруно Валь','support','pkp'],kane:['Кейн','recon','sv98'],
};
const infantry={
  rifle:['assault','ar416'],hunter:['medic','mcx9'],rpg:['assault','ak12'],mg:['support','pkp'],
};
const sapperIds=['taver','nyoro','black'];
const stages=['briefing','issue','ridgeScene','ridge','field','assault','prepare','defence','finale'];
const scenes=['briefing','issue','ridgeScene','finale'];
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const angle=n=>Math.atan2(Math.sin(n),Math.cos(n));
const point=([x,z])=>({x,z});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const yawTo=(a,b)=>Math.atan2(a.x-b.x,a.z-b.z);
const eye=(p,height=1.55)=>({x:p.x,y:p.y+height,z:p.z});
const aimVector=(yaw,pitch)=>({x:-Math.sin(yaw)*Math.cos(pitch),y:Math.sin(pitch),z:-Math.cos(yaw)*Math.cos(pitch)});
const mineAt=(x,z)=>SAFRA_MINES.find(m=>Math.abs(x-m.x)<m.w*.5&&Math.abs(z-m.z)<m.d*.5);

export class Mission4Simulation extends Simulation{
  constructor(definition,options={}){
    super({mapId:SAFRA.id,bots:0,difficulty:options.difficulty});
    this.navigationBudgetMs=1.5;
    this.pathBudgetMs=1;
    this.pathRequestsPerTick=1;
    this.rngState=options.seed??41704;
    this.random=()=>{this.rngState=(Math.imul(this.rngState,1664525)+1013904223)>>>0;return this.rngState/4294967296;};
    this.campaign=new BridgeDirector(this,definition,options);
    this.campaign.initialize();
  }
  balanceTeams(){}
  updateVehicleActions(){}
  setInput(id,input={}){
    super.setInput(id,input);
    if(id!=='local')return;
    const c=this.campaign;
    c.input={...c.player.input,use:input.use===true,heal:input.heal===true,selfRevive:input.selfRevive===true};
    c.player.input.interact=false;
    c.player.input.order=false;
    if(c.player.input.toolSlot===1)c.player.input.toolSlot=0;
    if(c.player.heldGadget==='launcher'&&c.input.fire)c.player.input.sprint=false;
  }
  collides(x,z,y,radius,height){
    return Boolean(this.avoidingMines&&mineAt(x,z))||super.collides(x,z,y,radius,height);
  }
  movePlayer(p,input,dt){
    const old=this.avoidingMines;
    this.avoidingMines=p.bot;
    try{
      const wading=p.y<SAFRA_WATER.y&&Math.abs(p.x)<SAFRA_WATER.w/2;
      const pace=p.downed?.19:wading?.6:1;
      super.movePlayer(p,input,dt*pace);
    }finally{this.avoidingMines=old;}
  }
  thinkBot(p,dt){
    if(p.role==='sapper'||p.downed){p.input=sanitizeInput({yaw:p.yaw,crouch:true});return;}
    if(this.campaign.mg.occupant===p.id){
      p.input=sanitizeInput({yaw:this.campaign.mg.yaw,pitch:this.campaign.mg.pitch});return;
    }
    const before=p.botThinkAt;
    super.thinkBot(p,dt);
    if(before===p.botThinkAt)return;
    const c=this.campaign,target=this.players.get(p.ai?.contact?.id);
    p.input.gadget=p.input.secondaryGadget=false;
    if(p.team===0){
      p.input.grenade=false;
      if(c.order==='hold'&&distance(p,c.botGoal(p))<5){p.input.forward=0;p.input.strafe=0;}
      if(c.order==='cover'&&this.time<(c.orderUntil??0)&&target?.alive&&this.lineClear(eye(p),eye(target,.95))){
        Object.assign(p.input,{forward:0,strafe:0,aim:true,fire:p.ammo>0,crouch:true});
      }
      if(p.id==='lasko'&&c.order==='revive'){
        const wounded=c.woundedAlly(p);
        if(wounded)moveBot(this,p,wounded,.05);
      }
    }else if(p.role==='rpg'&&p.rockets>0&&target?.alive&&distance(p,target)>14&&distance(p,target)<60&&this.lineClear(eye(p),eye(target,.8))){
      p.input.secondaryGadget=true;
    }
  }
  moveVehicle(v,input,dt){
    if(v.team===1&&v.routeTarget){
      const wanted=yawTo(v,v.routeTarget),error=angle(wanted-v.yaw);
      super.moveVehicle(v,{forward:Math.abs(error)<.7?.56:0,strafe:clamp(-error*2,-1,1)},dt);
    }else if(v.team===1){v.speed=0;v.steer=0;}
    else super.moveVehicle(v,input,dt);
  }
  updateVehicles(dt){
    const turrets=this.vehicles.filter(v=>v.bridgeTank&&v.hp>0).map(v=>[v,v.aimYaw,v.aimPitch]);
    super.updateVehicles(dt);
    for(const [v,yaw,pitch] of turrets){v.aimYaw=yaw;v.aimPitch=pitch;}
  }
  damage(p,amount,attacker,meta={}){
    const c=this.campaign;
    if(!p?.alive||!c||c.cutscene||p.invulnerableUntil>this.time)return;
    if(p.team===0&&attacker?.team===0&&attacker!==p&&!meta.friendly)return;
    if(p.team===0&&c.mg.occupant===p.id&&attacker){
      if(Math.abs(angle(yawTo(p,attacker)+Math.PI/2))<=Math.PI/4)amount*=.5;
    }
    if(p.team===0&&amount>=p.hp&&!meta.fatal&&p.role!=='sapper'&&!p.downed){
      c.down(p,meta.weapon);
      this.event('damage',{playerId:p.id,attackerId:attacker?.id,amount,x:attacker?.x??p.x,z:attacker?.z??p.z});
      return;
    }
    if(p.downed&&!meta.fatal){
      if(this.time>p.downedAt+2)p.downedUntil-=amount*.035;
      return;
    }
    super.damage(p,amount,attacker,meta);
    if(!p.alive){
      p.downed=false;p.prone=false;
      if(p.id==='local')c.fail(meta.weapon??p.lastWound??'Огонь противника');
      if(p.role==='sapper')c.sapperLost(p);
    }
  }
  damageVehicle(v,amount,attacker,kind,origin,sourceVehicleId){
    if(v.team===0||v.type==='tank'&&kind!=='bullet'&&attacker?.id!=='local'&&kind!=='fire')return;
    const alive=v.hp>0,hit=super.damageVehicle(v,amount,attacker,kind,origin,sourceVehicleId);
    if(v.type==='tank'&&hit?.amount>0&&attacker?.id==='local'){
      this.campaign.feedback={text:`${this.campaign.zoneLabel(tankArmorZone(v,origin))} · −${Math.round(hit.amount)} · ${Math.ceil(v.hp)} БРОНИ`,until:this.time+2.4};
    }
    if(alive&&v.hp<=0){
      v.respawnIn=1e8;v.wreckTime=1e8;
      if(v.type==='tank')this.campaign.tankLost(v,attacker);
    }
    return hit;
  }
  step(dt){
    const c=this.campaign;
    if(c.failed||c.complete)return;
    if(c.cutscene){
      this.time+=dt;
      c.updateScene();
      return;
    }
    c.beforeStep(dt);
    super.step(dt);
    if(!c.failed)c.update(dt);
  }
  snapshot(){
    const state=super.snapshot();
    for(const p of state.players){
      const live=this.players.get(p.id);
      Object.assign(p,{role:live.role,downed:Boolean(live.downed),prone:Boolean(live.prone),
        downedTimer:Math.max(0,(live.downedUntil??0)-this.time),medkits:live.medkits,syringes:live.syringes});
    }
    state.campaign=this.campaign.presentation();
    return state;
  }
}

class BridgeDirector{
  constructor(sim,definition,options){
    Object.assign(this,{sim,definition,options,difficulty:definition.difficulty[sim.difficulty]});
    this.carry=options.campaignProgress?.carry??{};
    this.scriptedVehicles=true;this.fieldDeaths=[];
    this.stage='briefing';this.stageAt=0;this.epoch=0;this.serial=0;
    this.checkpoint=0;this.saveRevision=0;this.failed=null;this.complete=false;
    this.input={};this.previous={};this.pending=[];this.fired=new Set();this.used={};
    this.flags={m4_done:false,m4_radio_code:false,m4_tanks_killed:0,sappers_alive:3};
    this.order='follow';this.prompt='';this.sapperLosses=0;
    this.waves=[];this.mortars=[];this.smoke=[];
    this.mg={rounds:definition.machineGun.capacity,belts:0,heat:0,jammed:false,barrels:definition.machineGun.barrels,
      action:null,readyAt:0,shootAt:0,occupant:null,seq:0,yaw:-Math.PI/2,pitch:0};
  }
  get time(){return this.sim.time;}
  get player(){return this.sim.players.get('local');}
  get cutscene(){return scenes.includes(this.stage)?{id:this.stage,elapsed:this.time-this.stageAt}:null;}
  get sappers(){return sapperIds.map(id=>this.sim.players.get(id));}
  get hostile(){return [...this.sim.players.values()].filter(p=>p.alive&&p.team===1);}
  get fieldTanks(){return this.sim.vehicles.filter(v=>v.bridgeTank==='field');}
  get defenceTanks(){return this.sim.vehicles.filter(v=>v.bridgeTank==='defence');}
  get defenceLimit(){return this.difficulty.defence+this.sapperLosses*this.definition.defence.casualtyPenalty;}
  get commandVoice(){return this.carry.harranti_alive===false?'orlov.brief':'harranti.brief';}

  initialize(){
    const p=this.add('local','Ян Мартен',0,'assault','ar416',start,'player',false);
    Object.assign(p,{yaw:-Math.PI/2,rockets:6,reserve:90,grenades:4,syringes:2,medkits:3});
    for(const [index,[id,[name,cls,weapon]]] of Object.entries(allies).entries()){
      if(this.carry[`${id}_alive`]===false){
        this.flags[`${id}_alive`]=false;
        if(id!=='bruno')this.add(`reserve-${id}`,'Боец резерва',0,cls,weapon,{x:-337+index*2,z:43},'reserve');
        continue;
      }
      this.add(id,name,0,cls,weapon,{x:-337+index*2,z:43},id);
    }
    this.flags.harranti_alive=this.carry.harranti_alive!==false;
    if(this.flags.harranti_alive)this.add('harranti','Полковник Харранти',0,'assault','ar416',
      {x:-329.5,z:36.25},'briefing',false);
    this.add('quartermaster','Квартирмейстер',0,'support','pkp',{x:-331.25,z:37},'briefing',false);
    const brigade=clamp(Math.floor(Number(this.carry.brigade_saved??4)||0),0,6)||2;
    for(let i=0;i<brigade;i++)this.add(`brigade-${i}`,`Боец бригады ${i+1}`,0,'assault','ar416',
      {x:-336+i*2,z:46+i%2},'brigade');
    for(const [i,id] of sapperIds.entries())this.add(id,['Сержант Тавер','Сапёр Ньоро','Сапёр Блэк'][i],0,'assault','ar416',
      {x:-332+i*1.8,z:32},'sapper');
    this.supplySites=this.makeSupplies();
    this.say(this.commandVoice);
    this.initialSave=this.serialize();
  }
  add(id,name,team,cls,weapon,where,role,bot=true){
    const p=this.sim.addPlayer(id,name,team,cls,weapon,'p19',bot);
    this.place(p,where);
    Object.assign(p,{role,home:{x:p.x,y:p.y,z:p.z},invulnerableUntil:0,rockets:role==='rpg'?2:0,
      yaw:team===0?-Math.PI/2:Math.PI/2});
    return p;
  }
  place(actor,where){
    for(let i=0;i<60;i++){
      const r=i===0?0:Math.sqrt(i)*.72,a=i*2.39996;
      const x=where.x+Math.cos(a)*r,z=where.z+Math.sin(a)*r,y=this.sim.groundAt(x,z);
      if(mineAt(x,z)||this.sim.collides(x,z,y,.38,1.58))continue;
      Object.assign(actor,{x,y,z,grounded:true,vx:0,vy:0,moveSpeed:0});return;
    }
    Object.assign(actor,{x:where.x,z:where.z,y:this.sim.groundAt(where.x,where.z)});
  }
  say(key,replace=false){
    if(!replace&&this.radio?.until>this.time)return;
    const length=this.options.lines?.[key]?.duration??6;
    this.radio={key,serial:++this.serial,until:this.time+length};
  }
  once(id,condition,fn){
    if(!condition||this.fired.has(id))return false;
    this.fired.add(id);
    fn();
    return true;
  }
  setStage(stage){
    this.stage=stage;
    this.stageAt=this.time;
    this.radio=null;
    this.prompt='';
    this.holdAction=null;
  }
  updateScene(){
    const elapsed=this.time-this.stageAt,c=this.definition.scenes;
    switch(this.stage){
      case 'briefing':
        this.once('brief-field',elapsed>=15,()=>this.say('orlov.field',true));
        this.once('brief-docs',elapsed>=30,()=>this.say(this.carry.m3_documents?'orlov.documents':'orlov.blind',true));
        this.once('brief-window',elapsed>=48,()=>this.say('orlov.window',true));
        if(elapsed>=c.briefing)this.nextScene();
        break;
      case 'issue':
        this.once('issue-line',elapsed>=10,()=>this.say(this.sim.players.has('duran')?'duran.joke':'orlov.absent',true));
        if(elapsed>=c.issue)this.nextScene();
        break;
      case 'ridgeScene':
        if(elapsed>=c.ridge)this.nextScene();
        break;
      case 'finale':
        this.moveConvoy(elapsed);
        this.once('thanks',elapsed>=12+this.convoyCount*.8,()=>this.say('vos.thanks',true));
        this.once('farewell',elapsed>=29,()=>this.say(this.sim.players.get('duran')?.alive?'duran.final':'orlov.final',true));
        if(elapsed>=c.finale)this.finish();
        break;
    }
  }
  nextScene(){
    if(this.stage==='briefing'){
      this.setStage('issue');this.say('quartermaster.issue');return;
    }
    if(this.stage==='issue'){
      this.setStage('ridgeScene');this.deployAtRidge();this.say('orlov.ridge');return;
    }
    if(this.stage==='ridgeScene'){
      this.setStage('ridge');this.combatAt=this.time;this.initialSave=this.serialize();return;
    }
    if(this.stage==='finale')this.finish();
  }
  deployAtRidge(){
    for(const id of ['harranti','quartermaster'])if(this.sim.players.has(id))this.sim.removePlayer(id);
    this.place(this.player,{x:-228,z:-19});
    this.player.yaw=yawTo(this.player,field);
    let index=0;
    for(const p of this.sim.players.values()){
      if(p===this.player||p.role==='sapper')continue;
      this.place(p,{x:-231-index%4*2,z:-16+Math.floor(index/4)*4});
      p.home={x:p.x,y:p.y,z:p.z};
      index++;
    }
    for(const [i,entry] of this.definition.field.tanks.entries()){
      if(i===3&&!this.carry.m3_documents)continue;
      this.spawnTank(`field-tank-${i+1}`,point(entry.at),entry.yaw,'field',i);
    }
  }
  command(command){
    if(command?.type==='retry'){
      this.restore(this.latestSave??this.initialSave);return;
    }
    if(this.cutscene&&command?.type==='skip'){this.nextScene();return;}
    if(this.failed||this.complete||this.cutscene)return;
    if(command?.type==='order'&&['follow','hold','cover','revive'].includes(command.order)){
      this.order=command.order;
      this.orderUntil=this.time+9;
      if(this.order==='hold'||this.order==='cover')for(const p of this.sim.players.values()){
        if(p.team===0&&p.bot&&p.role!=='sapper')p.holdPosition={x:p.x,y:p.y,z:p.z};
      }
    }
    if(this.mg.occupant===this.player.id&&command?.type==='barrel')this.serviceGun('barrel');
  }
  zoneLabel(zone){return {front:'ЛОБ',side:'БОРТ',rear:'КОРМА',top:'КРЫША'}[zone];}
  launcherProfile(p){return p.id==='local'?this.definition.launcher:null;}
  launcherBackblast(p,origin,direction){
    if(p.id!=='local')return;
    const back={x:-direction.x,y:-direction.y,z:-direction.z};
    const tail={x:origin.x+back.x*1.5,y:origin.y+back.y*1.5,z:origin.z+back.z*1.5};
    if(!this.sim.lineClear(origin,tail))this.sim.damage(p,30,p,{weapon:'Обратная струя ПТ-90'});
    for(const ally of this.sim.players.values()){
      if(ally===p||ally.team!==0||!ally.alive)continue;
      const dx=ally.x-origin.x,dy=ally.y+1.05-origin.y,dz=ally.z-origin.z;
      const range=Math.hypot(dx,dy,dz);
      if(range<5&&dx*back.x+dy*back.y+dz*back.z>range*.82&&this.sim.lineClear(origin,eye(ally,1.05)))
        this.sim.damage(ally,30,p,{friendly:true,weapon:'Обратная струя ПТ-90'});
    }
  }
  canSee(a,b){
    if(this.cutscene)return false;
    if(this.smoke.some(s=>s.until>this.time&&this.throughSmoke(a,b,s)))return distance(a,b)<7;
    return true;
  }
  throughSmoke(a,b,s){
    const dx=b.x-a.x,dz=b.z-a.z,len=dx*dx+dz*dz;
    const t=len?clamp(((s.x-a.x)*dx+(s.z-a.z)*dz)/len,0,1):0;
    return Math.hypot(a.x+dx*t-s.x,a.z+dz*t-s.z)<s.radius;
  }
  botGoal(p){
    if(p.team===1){
      if(p.role==='hunter'||p.role==='rpg'&&this.stage==='field'){
        const player=this.player,range=distance(p,player);
        if(p.role==='rpg'&&range<60&&range>30)return {x:p.x,y:p.y,z:p.z};
        const side=(p.huntSlot%4)<2?0:(p.huntSlot%2?-1:1)*12;
        return {x:player.x-5,z:player.z+side};
      }
      if(p.wave)return p.waveGoal;
      return p.home;
    }
    if(this.order==='revive'&&p.id==='lasko'){
      const wounded=this.woundedAlly(p);
      if(wounded)return wounded;
    }
    if(this.order==='hold'||this.order==='cover')return p.holdPosition??p.home;
    if((this.stage==='prepare'||this.stage==='defence')&&this.order==='revive')return p.home;
    if(p.id==='kane'&&this.stage==='field')return p.home;
    return {x:this.player.x-5-p.botSlot%3*2,z:this.player.z+(p.botSlot%5-2)*3};
  }

  spawnTank(id,at,yaw,group,index){
    const v=this.sim.createMapVehicle({id,type:'tank',team:1,...at,yaw});
    Object.assign(v,{hp:1500,maxHp:1500,bridgeTank:group,bridgeIndex:index,camo:'desert',
      armorZones:tankArmor,delayedCookoff:true,nextFire:this.time+this.difficulty.aim,homePosition:at});
    this.sim.vehicles.push(v);return v;
  }
  spawnTechnical(wave){
    const v=this.sim.createMapVehicle({id:`technical-${wave}`,type:'humvee',team:1,x:248,z:wave===2?5:-6,yaw:Math.PI/2});
    Object.assign(v,{hp:270,maxHp:270,technical:true,nextFire:this.time,routeTarget:{x:188,z:wave===2?5:-6}});
    this.sim.vehicles.push(v);
  }
  enqueue(group,at,role='rifle',extra={}){
    this.pending.push({group,at,role,...extra});
  }
  spawnInfantry(){
    let alive=this.hostile.length;
    while(alive<MAX_ENEMIES&&this.pending.length){
      const entry=this.pending.shift(),id=`east-${this.enemySerial=(this.enemySerial??0)+1}`;
      const [cls,weapon]=infantry[entry.role],p=this.add(id,'Боец Восточного корпуса',1,cls,weapon,entry.at,entry.role);
      Object.assign(p,{group:entry.group,wave:entry.wave,waveGoal:entry.goal,huntSlot:entry.huntSlot??0});
      if(entry.role==='rpg')p.hp=62;
      alive++;
    }
  }
  startField(){
    this.setStage('field');
    this.flankAt=this.time+this.definition.field.flankAt;
    this.nextHunterAt=this.time+8;
    this.hunterGroup=0;
    for(const p of this.definition.field.entrenched)this.enqueue('field',point(p));
    if(this.carry.kane_alive===false)this.enqueue('field',{x:-97,z:-43},'mg');
    this.fireCannon(this.fieldTanks[0],ridge);
    this.slabsFallAt=this.time+distance(this.fieldTanks[0],ridge)/TANK_CANNON.speed;
    this.say('orlov.first',true);
    this.feedback={text:'ПТ-90 · ЦЕЛЬТЕСЬ В БОРТ, КОРМУ ИЛИ КРЫШУ',until:this.time+6};
  }
  updateField(){
    this.once('ridge-slabs',this.time>=this.slabsFallAt,()=>{
      this.refreshSlabs();
      for(const b of SAFRA.boxes.filter(box=>SAFRA_SLABS.includes(box.id)))this.addSmoke(b.x,b.z,1.9,7);
    });
    if(this.time>=this.flankAt&&this.fieldTanks.length<4){
      const entry=this.definition.field.tanks[3];
      this.spawnTank('field-tank-4',point(entry.at),entry.yaw,'field',3);
      this.feedback={text:'ТАНК НА СЕВЕРНОМ ФЛАНГЕ',until:this.time+6};
    }
    if(this.hunterGroup<3&&this.time>=this.nextHunterAt){
      const entry=point(this.definition.field.hunterEntries[this.hunterGroup++]);
      for(let i=0;i<5;i++)this.enqueue('field',{x:entry.x+(i%3)*4,z:entry.z+(i-2)*5},
        i===4?'rpg':'hunter',{huntSlot:i});
      this.nextHunterAt=this.time+this.difficulty.hunters;
      this.say('orlov.hunters');
    }
    const killed=this.fieldTanks.filter(t=>t.hp<=0).length;
    if(killed>=2&&this.checkpoint<1)this.save(1);
    if(killed===4){
      this.pending=this.pending.filter(e=>e.group!=='field');
      this.startAssault();this.save(2);
    }
  }
  refreshSlabs(){
    this.sim.refreshCampaignColliders(new Set(this.fired.has('ridge-slabs')?SAFRA_SLABS:[]));
    resetNavigation(this.sim);
  }
  startAssault(){
    this.setStage('assault');this.order='follow';this.say('orlov.smoke');
    this.smokeAt=this.time+this.definition.assault.smokeDelay;
    for(const [i,site] of this.definition.assault.positions.entries())this.enqueue('assault',point(site),i>=10?'mg':'rifle');
    for(const [i,p] of this.sappers.entries())if(p.alive)this.place(p,{x:-58-i*2,z:SAFRA_SAPPERS[i][1]});
  }
  updateAssault(dt){
    this.once('bridge-smoke',this.time>=this.smokeAt,()=>{
      for(const x of [-21,-7,7,21,36,51])this.addSmoke(x,0,8,36);
      this.say('orlov.cross',true);
    });
    for(const [i,p] of this.sappers.entries()){
      if(!p.alive||p.downed||this.player.x<-34)continue;
      const [x,z]=SAFRA_SAPPERS[i];
      p.x=Math.min(x,p.x+dt*2.4);p.z=z;p.y=this.sim.groundAt(p.x,z);
    }
    if(distance(this.player,SAFRA_NEST)>7||this.player.x<63)return;
    if(this.pending.some(e=>e.group==='assault')||this.hostile.some(p=>p.group==='assault'||distance(p,SAFRA_NEST)<16))return;
    this.startPreparation();
    this.save(3);
  }
  startPreparation(){
    this.setStage('prepare');this.order='hold';this.say('taver.prepare');
    this.prepareUntil=this.time+this.definition.defence.prepare;
    this.mg.belts=7;
    const spots=[[65,-21],[74,-3],[70,-8],[75,-16],[61,-3],[76,-20],[79,-2],[60,-18]];
    let index=0;
    for(const p of this.sim.players.values()){
      if(p===this.player||p.team!==0||!p.alive||p.role==='sapper')continue;
      const at=p.id==='bruno'?{x:75,z:-3}:p.id==='lasko'?{x:62,z:-12}:point(spots[index++%spots.length]);
      this.place(p,at);
      if(p.id==='kane'){p.x=70;p.z=-9;p.y=6.08;p.grounded=true;}
      p.holdPosition=null;
      p.home={x:p.x,y:p.y,z:p.z};
    }
    for(const [i,p] of this.sappers.entries())if(p.alive)this.place(p,point(SAFRA_SAPPERS[i]));
    const wounded=this.sim.players.get('black');
    if(wounded.alive&&!wounded.downed){
      this.place(wounded,{x:62,z:-8});this.down(wounded,'Осколочное ранение');
    }
  }
  startDefence(){
    this.setStage('defence');this.defenceAt=this.time;this.say('taver.work',true);
    for(const [i,p] of this.sappers.entries())if(p.alive&&!p.downed)this.place(p,point(SAFRA_SAPPERS[i]));
    if(!this.flags.m4_radio_code)this.addSmoke(62,-12,2,28);
  }
  waveTime(seconds){return seconds*this.difficulty.defence/480;}
  updateDefence(dt){
    const d=this.definition.defence,elapsed=this.time-this.defenceAt;
    for(const [i,wave] of d.waves.entries()){
      const at=this.waveTime(wave.at);
      this.once(`sign-${i}`,elapsed>=at-10,()=>{
        this.warning={wave:i+1,until:this.defenceAt+at,directions:Object.keys(directions).filter(dir=>wave[dir]>0)};
        this.say(`orlov.wave${i+1}`,true);
      });
      this.once(`wave-${i}`,elapsed>=at,()=>this.spawnWave(i+1,wave));
    }
    this.once('replenish',elapsed>=this.waveTime(d.resupplyAt),()=>{
      this.transferred=true;this.mg.belts+=4;this.say('orlov.supply',true);
    });
    if(this.nextMortarAt!==undefined&&this.time>=this.nextMortarAt&&elapsed<this.defenceLimit+10){
      this.queueMortar();
      this.nextMortarAt=this.time+d.mortarInterval;
    }
    const threatened=this.hostile.filter(p=>distance(p,SAFRA_NEST)<20).length;
    if(threatened>=3&&this.time>=(this.nextBreachWarning??0)){
      this.say('orlov.near',true);this.nextBreachWarning=this.time+13;
    }
    this.captureTime=this.hostile.filter(p=>distance(p,SAFRA_NEST)<8).length>=3?(this.captureTime??0)+dt:0;
    if(this.captureTime>=5){this.fail('Восточный корпус захватил гнездо.');return;}
    if(this.checkpoint<4&&this.waves.includes(3)&&
      !this.defenceTanks.some(t=>t.wave===3&&t.hp>0)&&!this.hostile.some(p=>p.wave===3)&&!this.pending.some(p=>p.wave===3))this.save(4);
    if(elapsed<this.defenceLimit||this.waves.length<d.waves.length)return;
    if(this.defenceTanks.some(v=>v.hp>0&&distance(v,SAFRA_NEST)<=150)){
      this.once('column-wait',true,()=>this.say('orlov.wait',true));return;
    }
    if(threatened>=3||this.sappers.every(p=>!p.alive||p.downed))return;
    this.beginFinale();
  }
  spawnWave(number,wave){
    this.waves.push(number);
    for(const [dir,[x,z]] of Object.entries(directions)){
      const count=wave[dir]+(dir==='north'&&[3,4].includes(number)&&!this.sim.players.get('bruno')?.alive?3:0);
      for(let i=0;i<count;i++)this.enqueue('defence',{x:x+(i%3)*5,z:z+(i-Math.floor(count/2))*3},
        number===4&&i===0?'rpg':'rifle',{wave:number,goal:{x:69+i%3,z:-12+i%5}});
    }
    for(let i=0;i<wave.tanks;i++){
      const tank=this.spawnTank(`defence-tank-${number}-${i}`,{x:218+i*24,z:i===0?8:-9},Math.PI/2,'defence',i);
      tank.wave=number;
      tank.routeTarget={x:number===5?48:111,z:i===0?9:-4};
    }
    if(wave.technical)this.spawnTechnical(number);
    if(number===3){this.nextMortarAt=this.time+4;this.say('dargo.tanks',true);}
  }
  queueMortar(){
    const target=this.sappers.filter(p=>p.alive&&!p.downed);
    const work=target[this.mortarIndex=(this.mortarIndex??0)%Math.max(1,target.length)]??{x:27,z:0};
    const pos=[{x:77,z:-18},{x:67,z:-3},{x:work.x,z:work.z}];
    this.mortarIndex++;
    for(const [i,where] of pos.entries()){
      const x=where.x+(this.sim.random()-.5)*5,z=where.z+(this.sim.random()-.5)*5;
      this.mortars.push({id:`mortar-${this.serial}-${i}-${Math.round(this.time*60)}`,x,z,
        y:this.sim.groundAt(x,z)+.1,at:this.time+2+i*.42});
    }
  }
  updateMortars(){
    for(const m of this.mortars)if(!m.warned&&this.time>=m.at-2){
      m.warned=true;
      this.sim.event('safraWarning',{x:m.x,y:m.y,z:m.z,impactAt:m.at});
    }
    for(const m of this.mortars)if(m.warned&&this.time>=m.at)this.explosion(m,3,155,'Миномёт');
    this.mortars=this.mortars.filter(m=>this.time<m.at);
  }
  updateSapperPositions(dt){
    if(this.stage!=='defence')return;
    for(const [i,p] of this.sappers.entries()){
      if(!p.alive||p.downed)continue;
      const [workX,workZ]=SAFRA_SAPPERS[i];
      const mast=this.mortars.find(m=>m.warned&&Math.abs(m.z-workZ)<3.1&&Math.abs(m.x-workX)<4);
      const target=mast?workX+(workX>=mast.x?5:-5):workX;
      p.x+=clamp(target-p.x,-dt*2.85,dt*2.85);
      p.z=workZ;p.y=this.sim.groundAt(p.x,p.z);
    }
  }
  addSmoke(x,z,radius,duration){
    this.smoke.push({x,y:this.sim.groundAt(x,z)+.35,z,radius,until:this.time+duration});
  }
  explosion(at,radius,damage,weapon,attacker=null){
    this.sim.event('explosion',{x:at.x,y:at.y,z:at.z,kind:'rocket'});
    for(const p of this.sim.players.values()){
      const d=Math.hypot(distance(p,at),p.y+.7-at.y);
      if(p.alive&&d<radius&&this.sim.lineClear(at,eye(p,.7)))this.sim.damage(p,damage*(1-d/radius*.62),attacker,{weapon,explosive:true,friendly:true});
    }
  }
  tankLost(t,attacker){
    this.flags.m4_tanks_killed++;
    t.cookoffAt=this.time+6;t.destroyedBy=attacker?.id;
    this.addSmoke(t.x,t.z,2.2,10000);
    this.feedback={text:'ТАНК ГОРИТ · БОЕКОМПЛЕКТ ДЕТОНИРУЕТ ЧЕРЕЗ 6 С',until:this.time+3};
  }
  fireCannon(t,target){
    if(!t?.hp)return;
    const mouth=tankMuzzle(t),eyeY=target.y??this.sim.groundAt(target.x,target.z)+.65;
    const dir=aimVector(yawTo(mouth,target),zeroedBulletPitch(Math.atan2(eyeY-mouth.y,distance(mouth,target)),distance(mouth,target),TANK_CANNON.speed));
    const id=`shell-${t.id}-${++t.cannonSeq}`;
    t.nextFire=this.time+this.difficulty.reload;t.cannonReadyAt=t.nextFire;t.lockAt=null;t.warning=false;
    const inside=eye(t,1.75),origin=this.sim.lineClear(inside,mouth)?mouth:inside;
    this.sim.rockets.push({id,kind:1,vehicleId:t.id,team:1,...origin,life:5,vx:dir.x*TANK_CANNON.speed,
      vy:dir.y*TANK_CANNON.speed,vz:dir.z*TANK_CANNON.speed,campaignShell:'he',
      campaignShellProfile:{damage:500,blastRadius:5,infantryDamage:220}});
    this.sim.event('cannonShot',{vehicleId:t.id,weaponId:'tank-cannon',shotSeq:t.cannonSeq,...origin});
  }
  enemyGun(t,target,damage,interval){
    if(this.time<(t.coaxAt??0))return;
    const mouth=t.type==='tank'?tankMuzzle(t):eye(t,2.35),range=distance(mouth,target);
    if(range>210||!this.sim.lineClear(mouth,eye(target,.9)))return;
    t.coaxAt=this.time+interval;t.gunSeq++;
    const token={id:`${t.id}-gun`,team:1,bot:true,vehicleSeat:1,classId:'support',weaponId:'pkp'};
    const yaw=yawTo(mouth,target)+(this.sim.random()-.5)*.045;
    const pitch=Math.atan2(target.y+.92-mouth.y,range)+(this.sim.random()-.5)*.021;
    this.sim.launchBullet(token,{...TANK_MG,damage},mouth,yaw,pitch,t);
  }
  updateVehicles(dt){
    for(const v of this.sim.vehicles){
      if(v.team!==1)continue;
      if(v.hp<=0){
        if(v.cookoffAt!==undefined&&!v.exploded&&this.time>=v.cookoffAt){
          v.exploded=true;this.explosion(eye(v,1.04),8,210,'Детонация танка',this.sim.players.get(v.destroyedBy));
        }
        continue;
      }
      if(v.routeTarget&&distance(v,v.routeTarget)<4)v.routeTarget=null;
      if(v.technical){this.enemyGun(v,this.player,12,.23);continue;}
      if(this.stage==='ridge'||this.stage==='assault'||this.stage==='prepare'||this.time<(this.graceUntil??0))continue;
      const player=this.player,dist=distance(v,player),yaw=yawTo(v,player);
      const diff=angle(yaw-v.aimYaw);
      v.aimYaw=angle(v.aimYaw+clamp(diff,-.43633*dt,.43633*dt));
      const pitch=Math.atan2(player.y+1-v.y-1.7,Math.max(dist,1));
      v.aimPitch=clamp(pitch,-.15,.35);
      if(Math.abs(diff)>.12||dist>245||!this.canSee(v,player)||!this.sim.lineClear(eye(v,1.7),eye(player,.9))){
        v.lockAt=null;v.warning=false;continue;
      }
      if(this.time<v.nextFire){this.enemyGun(v,player,7,.35);continue;}
      v.lockAt??=this.time+this.difficulty.aim;
      if(!v.warning){
        v.warning=true;
        this.sim.event('safraWarning',{...tankMuzzle(v),vehicleId:v.id,impactAt:v.lockAt});
      }
      if(this.time>=v.lockAt)this.fireCannon(v,eye(player,.9));
    }
    const mobile=this.fieldTanks.find(v=>v.bridgeIndex===2&&v.hp>0);
    if(this.stage==='field'&&mobile&&this.time>=(mobile.patrolAt??this.stageAt+40)){
      mobile.patrol=!mobile.patrol;mobile.patrolAt=this.time+40;
      mobile.routeTarget=point(this.definition.field.tanks[2][mobile.patrol?'patrol':'at']);
    }
  }

  gunOrigin(){return {x:SAFRA_GUN.x+.65,y:4.58,z:SAFRA_GUN.z};}
  beforeStep(dt){
    const p=this.player;
    if(p.downed)Object.assign(p.input,{fire:false,sprint:false,jump:false,reload:false,toolSlot:0,grenade:false});
    if(this.mg.occupant===p.id){
      Object.assign(p.input,{fire:false,forward:0,strafe:0,sprint:false,jump:false,reload:false,
        toolSlot:0,grenade:false,yaw:-Math.PI/2+clamp(angle(this.input.yaw+Math.PI/2),-1.22173,1.22173),
        pitch:clamp(this.input.pitch,-.08727,.5)});
      this.mg.yaw=p.input.yaw;this.mg.pitch=p.input.pitch;
    }
  }
  down(p,reason){
    Object.assign(p,{hp:1,downed:true,prone:true,downedAt:this.time,downedUntil:this.time+25,lastWound:reason});
    if(this.mg.occupant===p.id)this.mg.occupant=null;
  }
  revive(p){
    Object.assign(p,{hp:55,downed:false,prone:false,downedUntil:0,invulnerableUntil:this.time+2});
    const index=sapperIds.indexOf(p.id);
    if(index>=0)this.place(p,point(SAFRA_SAPPERS[index]));
  }
  woundedAlly(medic){
    return [...this.sim.players.values()].filter(p=>p.team===0&&p.alive&&p.downed&&!p.rescueByPlayer)
      .sort((a,b)=>distance(medic,a)-distance(medic,b))[0];
  }
  updateInjuries(dt){
    const lasko=this.sim.players.get('lasko');
    if(lasko?.alive&&!lasko.downed){
      const injured=this.woundedAlly(lasko);
      if(injured&&distance(lasko,injured)<2.6&&this.sim.lineClear(eye(lasko,.8),eye(injured,.4))){
        injured.medicProgress=(injured.medicProgress??0)+dt;
        if(injured.medicProgress>=6){this.revive(injured);injured.medicProgress=0;}
      }
    }
    for(const p of this.sim.players.values()){
      if(p.downed&&p.alive&&this.time>=p.downedUntil)
        this.sim.damage(p,250,null,{fatal:true,weapon:p.lastWound??'Потеря крови'});
    }
  }
  sapperLost(){
    this.sapperLosses++;
    this.flags.sappers_alive=this.sappers.filter(p=>p.alive).length;
    if(!this.flags.sappers_alive)this.fail('Все сапёры погибли. Мост остался заминирован.');
    else this.say('taver.loss',true);
  }
  hold(id,pressed,dt,seconds,action){
    if(!pressed){this.holdAction=null;return;}
    if(this.holdAction?.id!==id)this.holdAction={id,elapsed:0};
    if(!this.holdAction.done){
      this.holdAction.elapsed+=dt;
      if(this.holdAction.elapsed>=seconds){this.holdAction.done=true;action();}
    }
    this.progress=Math.min(1,this.holdAction?.elapsed/seconds||0);
  }
  makeSupplies(){
    return [
      ...this.definition.field.caches.slice(0,this.difficulty.crates).map((at,i)=>({id:`cache-${i}`,...point(at),type:'rockets',amount:2})),
      {id:'field-aid',x:-154,z:28,type:'aid',amount:1},
      {id:'nest-stock',x:66,z:-12.55,type:'rockets',amount:8,nest:true},
      {id:'nest-kit',x:67,z:-7.4,type:'gear',amount:1,nest:true},
      {id:'reserve-stock',x:64,z:-9,type:'rockets',amount:6,nest:true,late:true},
      {id:'reserve-syringe',x:65,z:-7,type:'syringe',amount:1,nest:true,late:true},
    ];
  }
  get supplies(){
    return this.supplySites.filter(s=>(!s.nest||this.stage==='prepare'||this.stage==='defence')&&(!s.late||this.transferred)
      &&(this.used[s.id]??0)<s.amount);
  }
  supply(item){
    const p=this.player;
    if(item.type==='rockets'){
      const count=Math.min(this.definition.launcher.capacity-p.rockets,item.amount-(this.used[item.id]??0));
      if(count<=0)return;
      p.rockets+=count;this.used[item.id]=(this.used[item.id]??0)+count;
    }else{
      if(item.type==='aid'||item.type==='gear')p.medkits++;
      if(item.type==='gear'){p.grenades+=4;p.reserve+=120;}
      if(item.type==='syringe')p.syringes++;
      this.used[item.id]=item.amount;
    }
  }
  interact(dt){
    const p=this.player,pressed=this.input.use&&!this.previous.use;
    this.prompt='';this.progress=0;
    if(this.input.heal&&!this.previous.heal&&p.medkits>0&&p.hp<100&&!p.downed){
      p.medkits--;p.hp=Math.min(100,p.hp+55);
    }
    if(p.downed){
      this.prompt=p.syringes>0?'X · удерживать шприц':'Дождитесь Ласко';
      this.hold('self',this.input.selfRevive&&p.syringes>0,dt,4,()=>{p.syringes--;this.revive(p);});return;
    }
    if(this.mg.occupant===p.id){
      this.prompt='E · покинуть пулемёт';
      if(pressed)this.mg.occupant=null;
      return;
    }
    const wounded=[...this.sim.players.values()].find(a=>a!==p&&a.team===0&&a.downed&&distance(p,a)<2.65&&this.sim.lineClear(eye(p),eye(a,.4)));
    if(wounded){
      this.prompt=`E · удерживать · поднять ${wounded.name}`;
      this.hold(wounded.id,this.input.use,dt,6,()=>this.revive(wounded));return;
    }
    if(this.stage==='prepare'&&!this.flags.m4_radio_code&&distance(p,{x:65.7,z:-10})<1.8){
      this.prompt='E · забрать радиокод';
      if(pressed){this.flags.m4_radio_code=true;this.say('marten.code',true);}
      return;
    }
    if((this.stage==='prepare'||this.stage==='defence')&&distance(p,SAFRA_GUN)<1.65&&Math.abs(p.y-3)<.85){
      this.prompt='E · занять станковый пулемёт';
      if(pressed){
        const previous=this.sim.players.get(this.mg.occupant);
        if(previous?.bot)this.place(previous,previous.home);
        this.place(p,SAFRA_GUN);
        this.mg.occupant=p.id;
      }
      return;
    }
    const supply=this.supplies.find(item=>distance(p,item)<1.7&&this.sim.lineClear(eye(p),eye({...item,y:this.sim.groundAt(item.x,item.z)},.3)));
    if(supply){
      this.prompt=supply.type==='rockets'&&p.rockets>=this.definition.launcher.capacity?'Боекомплект ПТ-90 полон':
        {rockets:'E · взять выстрелы ПТ-90',aid:'E · взять аптечку',gear:'E · взять патроны, гранаты и аптечку',syringe:'E · взять шприц'}[supply.type];
      if(pressed)this.supply(supply);
      return;
    }
    const duran=this.sim.players.get('duran')??this.sim.players.get('reserve-duran');
    if(this.stage==='field'&&duran?.alive&&!duran.downed&&!this.used.duran&&distance(p,duran)<2.5){
      this.prompt='E · попросить у старшего два выстрела';
      if(pressed&&p.rockets<=this.definition.launcher.capacity-2){p.rockets+=2;this.used.duran=2;}
    }
    if(!this.input.use)this.holdAction=null;
  }
  serviceGun(action){
    const g=this.mg,s=this.definition.machineGun;
    if(g.action||action==='reload'&&(!g.belts||g.rounds===s.capacity)||action==='barrel'&&!g.barrels)return;
    g.action=action;g.readyAt=this.time+(action==='reload'?s.reload:s.barrelChange);
    if(action==='reload')this.sim.event('reload',{playerId:g.occupant,weaponId:'safra-machine-gun',
      duration:s.reload,empty:g.rounds===0,x:SAFRA_GUN.x,z:SAFRA_GUN.z});
  }
  updateGun(dt){
    const g=this.mg,s=this.definition.machineGun;
    if(g.action&&this.time>=g.readyAt){
      if(g.action==='reload'){g.belts--;g.rounds=s.capacity;}
      else{g.barrels--;g.heat=0;g.jammed=false;}
      g.action=null;
    }
    g.heat=Math.max(0,g.heat-dt*s.coolPerSecond);
    if(g.jammed&&g.heat<=.4)g.jammed=false;
    if(g.occupant&&(!this.sim.players.get(g.occupant)?.alive||this.sim.players.get(g.occupant)?.downed))g.occupant=null;
    if(this.stage==='defence'&&g.occupant!==this.player.id){
      const standin=this.sim.players.get('duran');
      const operator=standin?.alive&&!standin.downed?standin:[...this.sim.players.values()].find(p=>p.team===0&&p.role==='brigade'&&p.alive&&!p.downed);
      if(operator&&distance(operator,SAFRA_GUN)<19)g.occupant=operator.id;
    }
    const p=this.sim.players.get(g.occupant);
    if(!p||p.downed)return;
    if(p.bot){
      const mount=SAFRA_GUN;
      if(distance(p,mount)>.17)this.place(p,mount);
      const mouth=this.gunOrigin();
      const target=this.hostile.find(e=>distance(e,mount)<s.range&&Math.abs(angle(yawTo(mount,e)+Math.PI/2))<1.22173&&
        this.sim.lineClear(mouth,eye(e,1.2)));
      if(!g.rounds)this.serviceGun('reload');
      if(g.jammed)this.serviceGun('barrel');
      if(!target||g.action||g.jammed)return;
      g.yaw=yawTo(mount,target);
      g.pitch=clamp(Math.atan2(eye(target,1.2).y-mouth.y,distance(mouth,target)),-.08727,.5);
    }else{
      if(this.input.reload&&!this.previous.reload)this.serviceGun('reload');
      if(!this.input.fire)return;
    }
    if(!g.rounds||g.jammed||g.action||this.time<g.shootAt)return;
    const interval=s.interval*(p.bot?2:1);
    g.shootAt=this.time+interval-.0001;
    g.rounds--;g.seq++;
    g.heat=Math.min(1,g.heat+interval*(s.heatPerSecond+s.coolPerSecond)*(p.bot?1.28:1));
    g.jammed=g.heat>=1;
    const origin=this.gunOrigin(),yaw=g.yaw+(this.sim.random()-.5)*(p.bot?.026:.006),pitch=g.pitch+(this.sim.random()-.5)*.007;
    const projected=aimVector(yaw,pitch);
    const short={x:origin.x+projected.x*.48,y:origin.y+projected.y*.48,z:origin.z+projected.z*.48};
    if(!this.sim.lineClear(origin,short))return;
    p.shotSeq++;
    const shooter={id:p.id,team:p.team,bot:p.bot,classId:'support',weaponId:'pkp',shotSeq:p.shotSeq};
    this.sim.launchBullet(shooter,{...s,weapon:'СТАНКОВЫЙ ПУЛЕМЁТ'},origin,yaw,pitch,null,true);
  }
  update(dt){
    if(mineAt(this.player.x,this.player.z))this.sim.damage(this.player,250,null,{fatal:true,weapon:'Мина'});
    if(this.failed)return;
    if(this.stage==='ridge'&&(this.player.x>=-193||this.time-this.combatAt>=this.definition.field.startAt))this.startField();
    else if(this.stage==='field')this.updateField();
    else if(this.stage==='assault')this.updateAssault(dt);
    else if(this.stage==='prepare'&&this.time>=this.prepareUntil)this.startDefence();
    else if(this.stage==='defence')this.updateDefence(dt);
    if(this.cutscene||this.failed)return;
    this.spawnInfantry();
    this.interact(dt);this.updateGun(dt);
    this.updateInjuries(dt);
    this.updateVehicles(dt);this.updateSapperPositions(dt);this.updateMortars();
    this.smoke=this.smoke.filter(s=>s.until>this.time);
    this.previous=this.input;
  }
  fail(reason){
    if(this.failed)return;
    if(this.stage==='field'){
      const death={x:this.player.x,z:this.player.z};
      const previous=this.fieldDeaths.at(-1);
      if(!previous||distance(previous,death)>22)this.fieldDeaths.length=0;
      this.fieldDeaths.push(death);
    }
    this.failed=reason;
    this.mg.occupant=null;
  }
  beginFinale(){
    this.setStage('finale');this.say('vos.move',true);
    this.mg.occupant=null;
    this.convoyCount=clamp(Math.floor(Number(this.carry.tanks_alive??7)||1),1,7);
    for(let index=0;index<this.convoyCount;index++){
      const v=this.sim.createMapVehicle({id:`sokol-crossing-${index+1}`,type:'tank',team:0,x:-46-index*10,z:0,yaw:-Math.PI/2});
      v.bridgeConvoy=index;this.sim.vehicles.push(v);
    }
    this.memorial=this.sapperLosses>0;
    if(this.memorial){
      const honour=this.sappers.find(p=>p.alive&&!p.downed);
      if(honour){this.place(honour,{x:38.4,z:2.25});honour.yaw=-Math.PI;}
    }
    this.moveConvoy(0);
  }
  moveConvoy(elapsed){
    for(const v of this.sim.vehicles){
      if(v.bridgeConvoy===undefined)continue;
      v.x=-46-v.bridgeConvoy*10+Math.max(0,elapsed-1.4)*5.5;
      v.y=this.sim.groundAt(v.x,0);v.speed=elapsed>1.4?5.5:0;
      Object.assign(v,vehicleBodyTilt(v,this.sim.map.terrain));
    }
  }
  finish(){
    this.flags.m4_done=true;
    this.flags.sappers_alive=this.sappers.filter(p=>p.alive).length;
    for(const id of Object.keys(allies))this.flags[`${id}_alive`]=Boolean(this.sim.players.get(id)?.alive);
    this.complete=true;
  }
  save(checkpoint){
    this.checkpoint=checkpoint;
    if(this.options.ironman)return;
    this.latestSave=this.serialize();this.saveRevision++;
  }
  serialize(){
    const sim=this.sim,mission=Object.fromEntries([
      'stage','stageAt','checkpoint','combatAt','enemySerial','flags','pending','used','carry','order','mg','flankAt',
      'hunterGroup','nextHunterAt','slabsFallAt','smokeAt','prepareUntil','defenceAt','sapperLosses','waves','nextMortarAt','transferred',
    ].map(k=>[k,this[k]]));
    mission.fired=[...this.fired];
    return structuredClone({version:1,missionId:'m04',definitionVersion:this.definition.version,
      time:this.time,rngState:sim.rngState,difficulty:sim.difficulty,mission,
      players:[...sim.players.values()].map(({ai,damagers,...p})=>p),
      vehicles:sim.vehicles.map(({runOverHits,...v})=>v)});
  }
  restore(save){
    if(!validMission4Save(save,this.definition))return false;
    const {sim}=this;
    sim.players.clear();resetNavigation(sim);
    sim.vehicles=structuredClone(save.vehicles);
    for(const data of save.players){
      if(data.team===1)continue;
      const p=sim.addPlayer(data.id,data.name,data.team,data.classId,data.primaryWeaponId,data.sidearmId,data.bot);
      Object.assign(p,structuredClone(data),{ai:null,damagers:new Map(),botPath:[],botThinkAt:0,input:sanitizeInput()});
    }
    sim.time=save.time;sim.rngState=save.rngState;sim.events=[];sim.eventId=0;
    sim.rockets=[];sim.bullets=[];sim.grenades=[];sim.deployables=[];sim.botTeams=null;sim.botTeamAt=0;
    Object.assign(this,Object.fromEntries(Object.keys(this.initialSave.mission).map(k=>[k,undefined])),structuredClone(save.mission));
    this.fired=new Set(save.mission.fired);
    this.refreshSlabs();
    this.mg.occupant=null;
    Object.assign(this,{failed:null,complete:false,warning:null,captureTime:0,radio:null,input:{},previous:{},mortars:[],
      smoke:[],graceUntil:this.time+8,prompt:'',holdAction:null,progress:0,feedback:null,sideHintUntil:0});
    if(this.fieldDeaths.length>=3){
      this.sideHintUntil=this.time+8;
      this.feedback={text:'Обойдите танк и цельтесь в борт, пока башня доворачивается.',until:this.sideHintUntil};
    }
    this.supplySites=this.makeSupplies();
    this.player.invulnerableUntil=this.time+3;
    this.player.lastHurt=this.time;
    for(const t of sim.vehicles){
      t.lockAt=null;t.warning=false;
      if(t.hp<=0&&!t.exploded)t.cookoffAt=this.time+8;
    }
    this.epoch++;
    if(this.checkpoint){this.latestSave=structuredClone(save);this.saveRevision++;}
    if(this.stage==='briefing')this.say(this.commandVoice);
    return true;
  }
  presentation(){
    const p=this.player,at=this.stage==='ridge'?field:this.stage==='field'?this.fieldTanks.find(v=>v.hp>0)??field:
      this.stage==='assault'?backOfNest:SAFRA_GUN;
    let armor=null;
    if((p.heldGadget==='launcher'&&p.input.aim||this.sideHintUntil>this.time)&&!this.cutscene){
      const sight=campaignTankSight(this.sim.map,this.sim.vehicles,eye(p),p.yaw,p.pitch,null);
      const tank=this.sim.vehicles.find(v=>v.id===sight.targetId&&v.bridgeTank);
      if(tank&&sight.range<=this.definition.launcher.range){
        const zone=tankArmorZone(tank,sight);
        armor={id:tank.id,zone,name:this.zoneLabel(zone),damage:Math.round(tankArmor[zone]*this.definition.launcher.damage),hp:tank.hp};
      }
    }
    return {missionId:'m04',stage:this.stage,objective:this.stage,target:{x:at.x,z:at.z},time:this.time,
      combatTime:Math.max(0,this.time-(this.combatAt??this.time)),cutscene:this.cutscene,
      radio:this.radio?.until>this.time?this.radio:null,radioRemaining:Math.max(0,(this.radio?.until??0)-this.time),
      stageAt:this.stageAt,slabsFallen:this.fired.has('ridge-slabs'),
      checkpoint:this.checkpoint,epoch:this.epoch,flags:{...this.flags},order:this.order,
      failed:this.failed,complete:this.complete,prompt:this.prompt,progress:this.progress??0,
      feedback:this.feedback?.until>this.time?this.feedback.text:null,
      fieldKilled:this.fieldTanks.filter(t=>t.hp<=0).length,armor,
      nearMine:SAFRA_MINES.some(m=>Math.abs(p.x-m.x)<m.w*.5+6&&Math.abs(p.z-m.z)<m.d*.5+6),
      tanks:this.sim.vehicles.filter(t=>t.bridgeTank&&t.hp>0).map(t=>({id:t.id,x:t.x,z:t.z,warning:Boolean(t.warning)})),
      warning:this.warning?.until>this.time?this.warning:null,smoke:this.smoke,mortars:this.mortars.filter(m=>m.warned),
      mg:{...this.mg},mounted:this.mg.occupant===p.id,supplies:this.supplies,
      prepareRemaining:this.stage==='prepare'?Math.max(0,this.prepareUntil-this.time):null,
      defenceRemaining:this.stage==='defence'?Math.max(0,this.defenceLimit-this.time+this.defenceAt):null,
      wave:this.waves.at(-1)??0,captureTime:this.captureTime??0,memorial:Boolean(this.memorial),
      sappers:this.sappers.map(a=>({id:a.id,x:a.x,z:a.z,alive:a.alive,downed:Boolean(a.downed)})),
      stats:{elapsedSeconds:Math.floor(this.time),kills:p.kills,losses:[...this.sim.players.values()].filter(a=>a.team===0&&!a.alive).length}};
  }
}

export function validMission4Save(save,definition){
  if(save?.version!==1||save.missionId!=='m04'||save.definitionVersion!==definition.version||
     !Object.hasOwn(definition.difficulty,save.difficulty)||!Number.isFinite(save.time)||save.time<0||
     !Number.isInteger(save.rngState))return false;
  const m=save.mission;
  if(!m||!stages.includes(m.stage)||!Number.isInteger(m.checkpoint)||m.checkpoint<0||m.checkpoint>4||
    !Number.isFinite(m.stageAt)||m.stageAt>save.time||!m.flags||!m.mg||!m.used||!m.carry||
    !Array.isArray(m.pending)||m.pending.length>100||!Array.isArray(m.waves)||m.waves.length>5||
    !Array.isArray(m.fired)||m.fired.length>25)return false;
  const stagesAtCheckpoint=[['briefing','ridge'],['field'],['assault'],['prepare'],['defence']];
  if(!stagesAtCheckpoint[m.checkpoint].includes(m.stage)||!['follow','hold','revive','cover'].includes(m.order)||
    !m.pending.every(e=>e&&Object.hasOwn(infantry,e.role)&&Number.isFinite(e.at?.x)&&Number.isFinite(e.at?.z))||
    !m.waves.every((wave,i)=>wave===i+1)||
    ![m.mg.rounds,m.mg.belts,m.mg.heat,m.mg.barrels,m.mg.readyAt,m.mg.shootAt,m.mg.yaw,m.mg.pitch].every(Number.isFinite))return false;
  if(m.stage==='defence'&&!Number.isFinite(m.defenceAt)||m.stage==='prepare'&&!Number.isFinite(m.prepareUntil)||
    m.stage==='field'&&(!Number.isFinite(m.flankAt)||!Number.isFinite(m.nextHunterAt)))return false;
  const entities=(list,max)=>Array.isArray(list)&&list.length<=max&&list.every(item=>
    item&&typeof item.id==='string'&&[item.x,item.y,item.z,item.hp].every(Number.isFinite)&&Math.abs(item.x)<=384&&Math.abs(item.z)<=250)&&
    new Set(list.map(item=>item.id)).size===list.length;
  return entities(save.players,112)&&entities(save.vehicles,16)&&save.players.some(p=>p.id==='local'&&p.team===0&&p.alive)&&
    sapperIds.every(id=>save.players.some(p=>p.id===id&&p.team===0))&&
    save.vehicles.every(v=>['tank','humvee'].includes(v.type)&&Array.isArray(v.seats));
}
