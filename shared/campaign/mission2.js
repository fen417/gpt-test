import {Simulation,sanitizeInput} from '../simulation.js';
import {DIFFICULTIES} from '../world.js';
import {VEHICLE_TYPES} from '../vehicles.js';
import {fireTank} from '../tank.js';
import {zeroedBulletPitch} from '../ballistics.js';
import {ALHADRA_DESERT} from './alhadra-desert.js';

const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const bearing=(from,to)=>Math.atan2(from.x-to.x,from.z-to.z);
const angle=value=>Math.atan2(Math.sin(value),Math.cos(value));
export const M02_SAVE_VERSION=1;

export class Mission2Simulation extends Simulation{
  constructor(definition,options={}){
    super({bots:0,mapId:ALHADRA_DESERT.id,difficulty:options.difficulty??'regular'});
    this.rngState=options.seed??74102;
    this.random=()=>{this.rngState=(Math.imul(this.rngState,1664525)+1013904223)>>>0;return this.rngState/4294967296;};
    this.campaign=new Mission2Director(this,definition,options);
    this.campaign.initialize();
  }
  balanceTeams(){}
  damageVehicle(vehicle,amount,attacker,kind,origin,sourceVehicleId){
    const wasAlive=vehicle.hp>0;
    const hit=super.damageVehicle(vehicle,amount,attacker,kind,origin,sourceVehicleId);
    if(wasAlive&&vehicle.type==='tank'&&vehicle.hp<=0){
      // Campaign wrecks stay as cover and do not respawn like multiplayer vehicles.
      vehicle.respawnIn=1e8;vehicle.wreckTime=1e8;
      this.campaign?.onTankDestroyed(vehicle,attacker);
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
        if(c.lockedTargetId&&!p.input.turretHold){
          const target=this.vehicles.find(other=>other.id===c.lockedTargetId&&other.hp>0);
          const origin={x:v.x,y:v.y+2.2,z:v.z},destination=target&&
            {x:target.x,y:target.y+1.5,z:target.z};
          if(!target||distance(v,target)>850||!this.lineClear(origin,destination))c.lockedTargetId=null;
          else{
            p.input.yaw=bearing(v,target);
            p.input.pitch=clamp(Math.atan2(destination.y-origin.y,distance(v,target)),-.15,.35);
          }
        }
        if(input.brake)p.input.forward=0;
        else if(c.cruise&&Math.abs(p.input.forward)<.01)
          p.input.forward=clamp((c.definition.friendlyCompany.speed-v.speed)*.3,0,1);
        else if(Math.abs(p.input.forward)>.01)c.cruise=false;
        c.braking=Boolean(input.brake);
      }
    }
  }
  thinkBot(p,dt){
    const v=this.vehicles.find(v=>v.id===p.vehicleId);
    if(!v?.hp||!p.alive){p.input=sanitizeInput({yaw:p.yaw});return;}
    if(this.time<(p.nextM02Think??0))return;
    p.nextM02Think=this.time+.09+((p.botSlot??0)%3)*.013;
    const c=this.campaign,enemy=[...this.vehicles].filter(other=>other.hp>0&&other.team!==v.team);
    let target=null,nearest=Infinity;
    for(const other of enemy){
      const d=distance(v,other);
      if(d<nearest){nearest=d;target=other;}
    }
    const route=v.team===0?c.definition.friendlyCompany.route:c.definition.enemyCompany.route;
    let wp=v.m02Waypoint??0;
    let point=route[Math.min(wp,route.length-1)];
    // A tank defending a zone should maintain a safe interval from its
    // neighbours, while moving toward the next authored waypoint.
    // Fixed independent lanes throughout the march: older code aimed every
    // tank at the same waypoint and the entire company jammed on one ridge.
    const lane=v.m02Index%3-1,row=Math.floor(v.m02Index/3);
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
    const combatAllowed=c.started&&c.elapsed>=72;
    const inRange=target&&nearest<(v.team===1?660:715);
    const from={x:v.x,y:(v.y??0)+2.4,z:v.z};
    const to=target?{x:target.x,y:(target.y??0)+1.5,z:target.z}:null;
    const sight=Boolean(target&&this.lineClear(from,to));
    const attack=Boolean(inRange&&combatAllowed&&sight);
    if(attack&&nearest<300)goal={x:v.x,z:v.z};
    const desired=bearing(v,goal),delta=angle(desired-v.yaw);
    const drive=distance(v,goal)>10?clamp(Math.abs(delta)>1.15?.45:1,0,1):0;
    // Reverse direction is disallowed for march formation to avoid
    // AI ping-pong around route corners.
    let turn=clamp(-delta*1.8,-1,1);
    if(Math.abs(v.speed)<.2&&distance(v,goal)>24){
      v.m02Stopped=(v.m02Stopped??0)+.10;
      if(v.m02Stopped>2.5){
        // Attempt a brief reversing turn if blocked by a tank or roadside
        // geometry. Each vehicle alternates direction for stability.
        const turnSide=v.m02Index%2===0?1:-1;
        turn=turnSide*.83;
      }
    }else v.m02Stopped=0;
    const yaw=target?bearing(v,target):v.yaw;
    const flatDistance=Math.max(1,nearest);
    // The AP shells follow real ballistic arcs (20 m/s²). At 600m, raw
    // line-of-sight pitch lands ~20m short; zero the gun to the vehicle roof.
    const directPitch=target?Math.atan2((target.y??0)+1.5-(v.y??0)-2.4,flatDistance):0;
    const pitch=target?clamp(zeroedBulletPitch(directPitch,flatDistance,
      v.campaignWeapons?.ap?.speed??420),-.15,.35):0;
    const aimAligned=target&&Math.abs(angle(yaw-v.aimYaw))<.11&&
      Math.abs(pitch-v.aimPitch)<.055;
    const fire=Boolean(attack&&aimAligned&&nearest<650);
    const reverse=v.m02Stopped>2.5&&v.m02Stopped<4.5;
    if(v.m02Stopped>5.5)v.m02Stopped=0;
    p.input=sanitizeInput({forward:reverse?-.6:drive,strafe:turn,yaw,pitch,fire,weaponSlot:0});
    if(v.team===0&&c.order==='fire')p.input.fire=Boolean(inRange&&aimAligned);
  }
  // Campaign vehicles use the regular collision/suspension/track physics.
  moveVehicle(vehicle,input,dt){
    if(vehicle.controlScheme==='wot'&&vehicle.id==='sokol-7'&&this.campaign.braking){
      // Space applies brake while keeping the tank under steering control.
      input={...input,forward:0};
    }
    super.moveVehicle(vehicle,input,dt);
  }
  step(dt){
    const c=this.campaign;
    if(c.complete||c.failed)return;
    if(c.cutscene){
      this.time+=Math.max(0,dt);
      c.advanceBriefing(dt);
      return;
    }
    super.step(dt);
    // A campaign commander handles driving and gunnery together. In normal
    // multiplayer, only the separate gunner seat calls fireTank().
    for(const v of this.vehicles){
      if(v.hp<=0||v.type!=='tank'||v.controlScheme!=='wot')continue;
      const driver=this.players.get(v.seats[0]);
      if(driver?.alive)fireTank(this,driver,v,dt);
    }
    c.update(dt);
  }
  snapshot(){
    const state=super.snapshot(),c=this.campaign;
    state.vehicles.forEach(v=>{
      const live=this.vehicles.find(q=>q.id===v.id);
      if(!live)return;
      v.controlScheme=live.controlScheme;
      v.m02Shell=live.m02Shell;
      v.shellAmmo=live.shellAmmo?{...live.shellAmmo}:undefined;
    });
    state.campaign=c.presentation();
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
  }
  initialize(){
    const c=this.definition,team=c.friendlyCompany,base=team.start;
    const forward=bearing({x:base[0],z:base[1]},{x:0,z:0});
    const names=team.members;
    const heading=team.route[1],dx=heading[0]-base[0],dz=heading[1]-base[1];
    const norm=Math.max(1,Math.hypot(dx,dz)),ux=dx/norm,uz=dz/norm;
    for(let i=0;i<names.length;i++){
      const meta=names[i],lane=i%3-1,row=Math.floor(i/3);
      const x=base[0]+ux*(35-row*17)-uz*lane*15;
      const z=base[1]+uz*(35-row*17)+ux*lane*15;
      const v=this.sim.createMapVehicle({id:meta.id,type:'tank',team:0,x,z,yaw:forward});
      Object.assign(v,{controlScheme:'wot',m02Index:i,m02Waypoint:0,
        shellAmmo:{ap:c.weapons.ap.ammo,he:c.weapons.he.ammo},
        m02Shell:'ap',campaignWeapons:c.weapons,
        cannonAmmo:c.weapons.ap.ammo,respawnIn:1e8});
      // Re-seed total location from actual collision-free start. All tanks
      // are placed with full physics and remain separate actors.
      this.sim.vehicles.push(v);
      const playerId=i===6?'local':`tank-crew-${i+1}`;
      const driver=this.sim.addPlayer(playerId,meta.name,0,'assault','ar416','p19',i!==6);
      v.seats[0]=driver.id;
      Object.assign(driver,{alive:true,hp:100,respawnIn:0,
        vehicleId:v.id,vehicleSeat:0,invulnerableUntil:0,campaignRole:'tank-driver'});
      this.sim.syncVehicleSeat(driver,v);
    }
    this.say('holt.brief01',6);
  }
  onTankDestroyed(vehicle,attacker){
    if(vehicle.id==='sokol-8'&&!this.flags.baleLost){
      this.flags.baleLost=true;this.say('bale.loss',4);
    }
  }
  say(key,duration=4){
    this.radio={key,serial:++this.radioSerial};this.radioEnd=this.sim.time+duration;
  }
  get player(){return this.sim.players.get('local');}
  get time(){return this.sim.time;}
  get tanksAlive(){return this.sim.vehicles.filter(v=>v.type==='tank'&&v.team===0&&v.hp>0).length;}
  get enemiesAlive(){return this.sim.vehicles.filter(v=>v.type==='tank'&&v.team===1&&v.hp>0).length;}
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
    this.radio=null;this.save(0);
    // Carry surviving squad members' voices forward from mission 1.
    const carry=this.options.campaignProgress?.carry??{};
    this.say(carry.bruno_alive?'bruno.signal':'duran.signal',4);
  }
  command(command){
    if(command?.type==='skip'&&this.cutscene){this.beginCombat();return;}
    if(command?.type==='weapon'){
      const v=this.sim.vehicles.find(x=>x.id==='sokol-7');if(!v)return;
      const type=['ap','he','mg'].includes(command.mode)?command.mode:'ap';
      v.weapon=type==='mg'?1:0;
      v.m02Shell=type==='he'?'he':'ap';
      v.cannonAmmo=v.shellAmmo[v.m02Shell];
      v.weaponReadyAt=this.sim.time+.22;return;
    }
    if(command?.type==='order'&&['forward','fire','hold','help'].includes(command.order)){
      this.order=command.order;return;
    }
    if(command?.type==='repair'){
      const v=this.sim.vehicles.find(x=>x.id==='sokol-7');
      if(v?.hp>0&&this.sim.time>=(v.nextSelfRepair??0)&&v.speed<1){
        v.hp=Math.min(v.maxHp,v.hp+300);v.nextSelfRepair=this.sim.time+35;
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
        const deviation=Math.abs(angle(bearing(v,target)-driver.input.yaw));
        const origin={x:v.x,y:v.y+2.2,z:v.z},point={x:target.x,y:target.y+1.5,z:target.z};
        if(deviation<best&&this.sim.lineClear(origin,point)){best=deviation;nearest=target;}
      }
      this.lockedTargetId=nearest?.id??null;
      return;
    }
    if(command?.type==='cruise'){this.cruise=!this.cruise;return;}
    if(command?.type==='retry'&&this.latestSave){this.restore(this.latestSave);}
  }
  spawnEnemy(count){
    const c=this.definition.enemyCompany,base=c.start;
    const route=c.route,dirX=route[1][0]-base[0],dirZ=route[1][1]-base[1],
      norm=Math.max(1,Math.hypot(dirX,dirZ)),ux=dirX/norm,uz=dirZ/norm;
    for(let i=0;i<count;i++){
      const n=this.enemySerial++,lane=n%3-1,row=Math.floor(n/3);
      // Spawn the second wave in road lanes too, rather than on top of the
      // six tanks already moving toward the village.
      const x=base[0]+ux*(14+row*24)-uz*lane*20,
        z=base[1]+uz*(14+row*24)+ux*lane*20;
      const yaw=bearing({x,z},{x:0,z:0});
      const v=this.sim.createMapVehicle({id:`east-tank-${n+1}`,type:'tank',team:1,x,z,yaw});
      Object.assign(v,{controlScheme:'wot',m02Waypoint:0,m02Index:n,
        cannonAmmo:24,campaignWeapons:this.definition.weapons,m02Shell:'ap',
        shellAmmo:{ap:24,he:0},respawnIn:1e8});
      this.sim.vehicles.push(v);
      const driver=this.sim.addPlayer(`east-crew-${n+1}`,`Восточный корпус ${n+1}`,1,'assault','ak12','p19',true);
      v.seats[0]=driver.id;
      Object.assign(driver,{alive:true,hp:100,respawnIn:0,
        vehicleId:v.id,vehicleSeat:0,invulnerableUntil:0,campaignRole:'tank-driver'});
      this.sim.syncVehicleSeat(driver,v);
    }
  }
  execute(event){
    if(event.type==='spawn')this.spawnEnemy(event.count??1);
    else if(event.type==='radio')this.say(event.key,3);
    else if(event.type==='wingmanLoss'){
      const v=this.sim.vehicles.find(x=>x.id===event.idOfTank);
      if(v?.hp>0){
        const attacker=this.sim.players.get('east-crew-1');
        this.sim.damageVehicle(v,100000,attacker,'blast',{x:v.x+1,y:v.y+.9,z:v.z});
      }
    }else if(event.type==='musicLoop')this.flags.musicLoop=true;
    else if(event.type==='formation')this.flags.formation=event.name;
  }
  update(dt){
    this.elapsed=this.sim.time-this.combatStartedAt;
    for(const event of this.definition.timeline){
      if(this.fired.has(event.id)||this.elapsed+1e-7<event.at)continue;
      this.fired.add(event.id);this.execute(event);
    }
    if(this.radio&&this.sim.time>this.radioEnd)this.radio=null;
    const playerTank=this.sim.vehicles.find(v=>v.id==='sokol-7');
    if(!playerTank||playerTank.hp<=0){this.failed='Танк «Сокол-7» уничтожен.';return;}
    if(this.elapsed>=13)this.stage=2;
    if(this.elapsed>=110)this.stage=3;
    if(this.elapsed>=188){
      this.stage=4;
      if(!this.flags.villageRadio){
        this.flags.villageRadio=true;
        const carry=this.options.campaignProgress?.carry??{};
        this.say(carry.kane_alive?'kane.support':'duran.underFire',4);
      }
    }
    const stage4=this.elapsed>=188&&this.enemySerial===this.definition.enemyCompany.total;
    const enemyDefeated=stage4&&this.enemiesAlive===0;
    if(enemyDefeated&&!this.flags.village){
      this.flags.village=true;this.say('duran.support',5);this.save(2);
    }
    if(enemyDefeated&&distance(playerTank,{x:0,z:0})<165){
      this.flags.enemyOrder=true;this.stage=5;this.say('dargo.final',5);
      this.complete=true;this.save(3);
    }
    if(!this.flags.firstContact&&this.elapsed>=13){this.flags.firstContact=true;this.save(1);}
  }
  save(checkpoint){
    this.checkpoint=checkpoint;
    this.latestSave=this.serialize();this.saveRevision++;
  }
  serialize(){
    return structuredClone({
      version:M02_SAVE_VERSION,missionId:'m02',definitionVersion:this.definition.version,
      difficulty:this.sim.difficulty,time:this.sim.time,rngState:this.sim.rngState,
      vehicles:this.sim.vehicles.map(v=>({...v,runOverHits:undefined})),
      players:[...this.sim.players.values()].map(p=>({...p,damagers:undefined,ai:undefined})),
      mission:{stage:this.stage,started:this.started,combatStartedAt:this.combatStartedAt,
        elapsed:this.elapsed,checkpoint:this.checkpoint,order:this.order,
        flags:this.flags,fired:[...this.fired],enemySerial:this.enemySerial,
        cruise:this.cruise,lockedTargetId:this.lockedTargetId},
    });
  }
  restore(save){
    if(!validMission2Save(save,this.definition))return false;
    this.sim.time=save.time;this.sim.rngState=save.rngState;this.sim.players.clear();
    this.sim.vehicles=structuredClone(save.vehicles);
    for(const p of save.players){
      const created=this.sim.addPlayer(p.id,p.name,p.team,p.classId,p.primaryWeaponId,p.sidearmId,p.bot);
      Object.assign(created,structuredClone(p),{damagers:new Map(),ai:null});
    }
    Object.assign(this,structuredClone(save.mission));
    this.fired=new Set(save.mission.fired);
    this.cutscene=null;this.failed=null;this.complete=false;
    this.braking=false;this.awaitingLoadout=false;this.radio=null;this.radioEnd=0;
    this.latestSave=structuredClone(save);this.saveRevision++;return true;
  }
  presentation(){
    const v=this.sim.vehicles.find(x=>x.id==='sokol-7');
    const enemies=this.sim.vehicles.filter(x=>x.team===1&&x.type==='tank');
    const fallen=this.definition.friendlyCompany.count-this.tanksAlive;
    const phase=this.complete?'debrief':this.flags.village?'village':
      this.elapsed>=110?'battle':this.elapsed>=13?'intercept':'march';
    return {missionId:'m02',title:this.definition.title,stage:this.stage,
      phase,objective:phase,flags:{...this.flags},order:this.order,cutscene:this.cutscene,
      awaitingLoadout:false,failed:this.failed,complete:this.complete,checkpoint:this.checkpoint,
      epoch:0,time:this.elapsed,radio:this.radio,radioRemaining:Math.max(0,this.radioEnd-this.sim.time),
      target:{x:0,z:0},tanksAlive:this.tanksAlive,enemyTanksAlive:this.enemiesAlive,
      enemyTanksSpawned:this.enemySerial,alliedLosses:fallen,
      shell:v?.m02Shell??'ap',weaponMode:v?.weapon===1?'mg':v?.m02Shell??'ap',
      cruise:this.cruise,lockedTargetId:this.lockedTargetId,
      stats:{elapsedSeconds:Math.floor(this.elapsed),losses:fallen,kills:this.player?.kills??0},
      // Progress bridge from mission 1, preserved for contextual dialogue.
      carry:{...(this.options.campaignProgress?.carry??{})}};
  }
}
export function validMission2Save(save,definition){
  return !!(save&&typeof save==='object'&&save.version===M02_SAVE_VERSION
    &&save.missionId==='m02'&&save.definitionVersion===definition.version
    &&Number.isFinite(save.time)&&Array.isArray(save.vehicles)&&save.vehicles.length<=28
    &&Array.isArray(save.players)&&save.players.length<=30
    &&save.mission&&Array.isArray(save.mission.fired)
    &&save.mission.fired.length<100);
}
