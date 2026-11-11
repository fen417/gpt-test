import { MAP, CLASSES, DIFFICULTIES, PLAYER_RADIUS, EYE_HEIGHT, CAPTURE_RADIUS } from './world.js';

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
const dist = (a,b) => Math.hypot(a.x-b.x,a.z-b.z);
const names = ['Ворон','Север','Волк','Туман','Барс','Кедр','Скат','Риф','Шторм','Каскад','Искра','Дозор','Сокол','Беркут','Гранит'];
const classKeys = Object.keys(CLASSES);
const validClass = value => typeof value==='string' && Object.hasOwn(CLASSES,value);
const angleDifference=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
const neighbors = [[1,0],[-1,0],[0,1],[0,-1]];
const withBounds = box => ({
  ...box,minX:box.x-box.w/2,maxX:box.x+box.w/2,minZ:box.z-box.d/2,maxZ:box.z+box.d/2,
});
const colliders = MAP.boxes.map(withBounds);
const grenadeColliders = MAP.boxes.map(box => withBounds({...box,w:box.w+.24,d:box.d+.24,h:box.h+.12}));
const rayDir = { x: 0, y: 0, z: 0 };
const scratchEye = { x: 0, y: 0, z: 0 };
const scratchTarget = { x: 0, y: 0, z: 0 };

export function sanitizeInput(input = {}) {
  if(!input||typeof input!=='object')input={};
  return {
    forward: clamp(finite(input.forward), -1, 1), strafe: clamp(finite(input.strafe), -1, 1),
    yaw: finite(input.yaw) % (Math.PI * 2), pitch: clamp(finite(input.pitch), -1.45, 1.45),
    sprint:input.sprint===true,crouch:input.crouch===true,jump:input.jump===true,
    fire:input.fire===true,aim:input.aim===true,reload:input.reload===true,
    gadget:input.gadget===true,grenade:input.grenade===true,
  };
}

function rayBox(origin, direction, box, maximum) {
  let near = 0, far = maximum;
  if (Math.abs(direction.x) < 1e-8) {
    if (origin.x < box.minX || origin.x > box.maxX) return Infinity;
  } else {
    const a=(box.minX-origin.x)/direction.x, b=(box.maxX-origin.x)/direction.x;
    near=Math.max(near,Math.min(a,b)); far=Math.min(far,Math.max(a,b));
    if (near > far) return Infinity;
  }
  if (Math.abs(direction.z) < 1e-8) {
    if (origin.z < box.minZ || origin.z > box.maxZ) return Infinity;
  } else {
    const a=(box.minZ-origin.z)/direction.z, b=(box.maxZ-origin.z)/direction.z;
    near=Math.max(near,Math.min(a,b)); far=Math.min(far,Math.max(a,b));
    if (near > far) return Infinity;
  }
  if (Math.abs(direction.y) < 1e-8) return origin.y < 0 || origin.y > box.h ? Infinity : near;
  const a=-origin.y/direction.y, b=(box.h-origin.y)/direction.y;
  near=Math.max(near,Math.min(a,b)); far=Math.min(far,Math.max(a,b));
  return near<=far?near:Infinity;
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
  const weapon = CLASSES[player.classId], input = player.input;
  const movement = clamp(player.moveSpeed / weapon.speed, 0, 1);
  return weapon.spread * (input.aim ? .24 : .66) * (input.crouch ? .81 : 1)
    * (1 + movement * (input.aim ? .85 : 1.3)) * (player.grounded ? 1 : 2)
    * (1 + player.bloom) * (player.bot ? 1.45 : 1);
}

function impactMaterial(kind) {
  if (kind === 'crate' || kind === 'tree' || kind === 'tent') return 'wood';
  if (kind === 'container' || kind === 'pillar' || kind === 'warehouse' || kind === 'truck' || kind === 'car' || kind === 'fueltank' || kind === 'generator' || kind === 'kiosk') return 'metal';
  return 'concrete';
}

export class Simulation {
  constructor({ bots=23, difficulty='regular', random=Math.random }={}) {
    this.random=random;this.time=0;this.players=new Map();this.tickets=[300,300];
    this.difficulty=typeof difficulty==='string'&&Object.hasOwn(DIFFICULTIES,difficulty)?difficulty:'regular';
    this.botSettings=DIFFICULTIES[this.difficulty];
    this.points=MAP.points.map(p=>({...p,owner:-1,progress:0,contested:false}));
    this.events=[];this.eventId=0;this.winner=null;this.grenades=[];this.ticketClock=0;
    this.gridCell=4;this.gridSize=Math.ceil(MAP.size/this.gridCell);this.gridOrigin=-MAP.size/2;
    this.blocked=new Uint8Array(this.gridSize*this.gridSize);
    this.pathPrevious=new Int32Array(this.blocked.length);
    this.pathQueue=new Int32Array(this.blocked.length);
    for(let z=0;z<this.gridSize;z++)for(let x=0;x<this.gridSize;x++){
      const wx=this.gridOrigin+(x+.5)*this.gridCell,wz=this.gridOrigin+(z+.5)*this.gridCell;
      const clearance=this.gridCell/2+PLAYER_RADIUS+.1;
      if(MAP.boxes.some(b=>Math.abs(wx-b.x)<b.w/2+clearance&&Math.abs(wz-b.z)<b.d/2+clearance))this.blocked[z*this.gridSize+x]=1;
    }
    for(let n=0;n<clamp(Math.floor(bots),0,31);n++){
      const p=this.addPlayer(`bot-${n}`,names[n%names.length],n%2,classKeys[Math.floor(n/2)%4]);p.bot=true;p.botSlot=n;p.nextThink=0;p.botPath=[];
    }
  }
  event(type,data={}) { this.events.push({id:++this.eventId,type,time:this.time,...data}); }
  addPlayer(id,name='Боец',team,classId='assault') {
    if(this.players.has(id))return this.players.get(id);
    if(team!==0&&team!==1){let a=0,b=0;for(const p of this.players.values())p.team===0?a++:b++;team=a<=b?0:1;}
    const p={id:String(id),name:String(name||'Боец').replace(/[<>\x00-\x1f]/g,'').slice(0,20),team,classId:validClass(classId)?classId:'assault',x:0,y:0,z:0,yaw:0,pitch:0,hp:100,alive:false,ammo:0,reserve:0,kills:0,deaths:0,respawnIn:0,reloading:false,shotSeq:0,input:sanitizeInput(),cooldown:0,reloadTime:0,gadgetTime:0,grenades:2,vy:0,lastHurt:-100,bot:false};
    this.players.set(p.id,p);this.respawn(p.id);return p;
  }
  removePlayer(id){this.players.delete(id);}
  setInput(id,input){const p=this.players.get(id);if(p&&!p.bot)p.input=sanitizeInput(input);}
  respawn(id,classId,pointId){
    const p=this.players.get(id);if(!p || p.alive || p.respawnIn>0)return false;
    if(validClass(classId))p.classId=classId;
    if(p.bot&&!pointId){const safe=this.points.filter(q=>q.owner===p.team&&!q.contested&&![...this.players.values()].some(enemy=>enemy.alive&&enemy.team!==p.team&&dist(enemy,q)<25)).sort((a,b)=>Math.hypot(a.x,a.z)-Math.hypot(b.x,b.z));pointId=safe[0]?.id;}
    const point=this.points.find(q=>q.id===pointId&&q.owner===p.team&&!q.contested);
    const base=point||MAP.spawns[p.team];let x=base.x,z=base.z;
    for(let n=0;n<25;n++){const tx=base.x+(this.random()-.5)*8,tz=base.z+(this.random()-.5)*8;if(!this.collides(tx,tz,0)){x=tx;z=tz;break;}}
    Object.assign(p,{x,y:0,z,yaw:p.team===0?0:Math.PI,pitch:0,hp:100,alive:true,ammo:CLASSES[p.classId].mag,reserve:CLASSES[p.classId].reserve,respawnIn:0,reloading:false,reloadTime:0,cooldown:0,grenades:2,vy:0,grounded:true,input:sanitizeInput(),lastHurt:this.time,invulnerableUntil:this.time+2,botTargetId:null,botObjective:null,botGoal:null,botWatchYaw:p.team===0?0:Math.PI,botHoldCrouch:false,botPath:[],nextThink:0,jumpHeld:false,grenadeHeld:false});
    Object.assign(p,{bloom:0,moveSpeed:0,lastShotAt:-Infinity,fireHeld:false});
    this.event('spawn',{playerId:p.id,x:p.x,z:p.z,team:p.team});return true;
  }
  collides(x,z,y=0,radius=PLAYER_RADIUS){
    const limit=MAP.size/2-2;
    if(Math.abs(x)>limit||Math.abs(z)>limit)return true;
    for(let i=0;i<colliders.length;i++){
      const b=colliders[i];
      if(y<b.h&&x>b.minX-radius&&x<b.maxX+radius&&z>b.minZ-radius&&z<b.maxZ+radius)return true;
    }
    return false;
  }
  lineClear(a,b){
    const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z;
    const length=Math.hypot(dx,dy,dz);
    if(length<.1)return true;
    rayDir.x=dx/length;rayDir.y=dy/length;rayDir.z=dz/length;
    const minX=Math.min(a.x,b.x),maxX=Math.max(a.x,b.x),minZ=Math.min(a.z,b.z),maxZ=Math.max(a.z,b.z);
    for(let i=0;i<colliders.length;i++){
      const box=colliders[i];
      if(box.maxX<minX||box.minX>maxX||box.maxZ<minZ||box.minZ>maxZ)continue;
      if(rayBox(a,rayDir,box,length)<length-.1)return false;
    }
    return true;
  }
  damage(victim,amount,attacker){
    if(!victim.alive||this.winner!==null||this.time<victim.invulnerableUntil)return;
    victim.hp=Math.max(0,victim.hp-amount);victim.lastHurt=this.time;
    this.event('damage',{playerId:victim.id,attackerId:attacker?.id,amount,x:attacker?.x??victim.x,z:attacker?.z??victim.z});
    if(victim.hp<=0){
      victim.alive=false;victim.deaths++;victim.respawnIn=4;victim.reloading=false;
      this.tickets[victim.team]=Math.max(0,this.tickets[victim.team]-1);
      if(attacker&&attacker.team!==victim.team)attacker.kills++;
      this.event('kill',{killer:attacker?.name||'Окружение',victim:victim.name,killerId:attacker?.id,victimId:victim.id,weapon:attacker?CLASSES[attacker.classId].weapon:'',team:attacker?.team});
    }
  }
  shoot(p){
    const c=CLASSES[p.classId],input=p.input;if(p.cooldown>0||p.reloading||p.ammo<=0)return;
    p.invulnerableUntil=0;
    p.ammo--;p.shotSeq++;p.cooldown+=c.interval;
    const eye=input.crouch?1.05:EYE_HEIGHT;
    const origin={x:p.x,y:p.y+eye,z:p.z};
    const angle = this.random() * Math.PI * 2;
    const radius = Math.sqrt(this.random()) * weaponSpread(p);
    const yaw = p.yaw + Math.cos(angle) * radius;
    const pitch = p.pitch + Math.sin(angle) * radius;
    p.lastShotAt = this.time;
    p.bloom = Math.min(1.25, p.bloom + (input.aim ? .16 : .23));
    const direction={x:-Math.sin(yaw)*Math.cos(pitch),y:Math.sin(pitch),z:-Math.cos(yaw)*Math.cos(pitch)};
    let closest=c.range,target=null,headshot=false,impact=null;
    if (direction.y < 0) {
      const ground = -origin.y / direction.y;
      if (ground < closest) { closest = ground; impact = 'ground'; }
    }
    for(const box of colliders){
      const distance=rayBox(origin,direction,box,closest);
      if(distance<closest){closest=distance;impact=impactMaterial(box.kind);}
    }
    for(const other of this.players.values()){
      if(other===p||!other.alive||other.team===p.team)continue;
      const crouch=other.input.crouch,headY=other.y+(crouch?1.06:1.58);
      const head=raySphere(origin,direction,{x:other.x,y:headY,z:other.z},.15);
      const body=rayCapsule(origin,direction,other.x,other.z,other.y+.26,other.y+(crouch?.79:1.25),.24);
      const hit=Math.min(head,body);
      if(hit<closest){closest=hit;target=other;headshot=head<body;}
    }
    const hit = !!target && this.time >= target.invulnerableUntil;
    if(target)impact=hit?'flesh':'shield';
    this.event('shot',{playerId:p.id,classId:p.classId,team:p.team,shotSeq:p.shotSeq,x:origin.x,y:origin.y,z:origin.z,tx:origin.x+direction.x*closest,ty:origin.y+direction.y*closest,tz:origin.z+direction.z*closest,hit,headshot:hit&&headshot,impact});
    if(hit){const falloff=clamp(1-Math.max(0,closest-35)/300,.65,1);this.damage(target,c.damage*falloff*(headshot?2:1),p);}
  }
  startReload(p){
    const weapon = CLASSES[p.classId];
    if(p.reloading||p.ammo>=weapon.mag||p.reserve<=0)return;
    p.reloading=true;
    p.reloadTime=weapon.reload;
    this.event('reload',{playerId:p.id,classId:p.classId,duration:weapon.reload,empty:p.ammo===0,x:p.x,z:p.z});
  }
  gadget(p){
    if(p.gadgetTime>0)return;p.gadgetTime=12;let count=0;
    for(const ally of this.players.values())if(ally.alive&&ally.team===p.team&&dist(p,ally)<12){
      if(p.classId==='support')ally.reserve=Math.min(CLASSES[ally.classId].reserve,ally.reserve+60);
      else if(p.classId==='medic'||p.classId==='assault')ally.hp=Math.min(100,ally.hp+(p.classId==='medic'?55:25));
      else ally.spottedUntil=this.time+8;
      count++;
    }
    if(p.classId==='recon')for(const enemy of this.players.values())if(enemy.alive&&enemy.team!==p.team&&dist(p,enemy)<50)enemy.spottedUntil=this.time+8;
    this.event('gadget',{playerId:p.id,classId:p.classId,x:p.x,z:p.z,count});
  }
  throwGrenade(p){
    if(!p.grenades||p.grenadeCooldown>0)return;p.grenades--;p.grenadeCooldown=1;
    p.invulnerableUntil=0;
    this.grenades.push({id:`grenade-${++this.eventId}`,owner:p.id,team:p.team,x:p.x,y:p.y+1.4,z:p.z,vx:-Math.sin(p.yaw)*16,vz:-Math.cos(p.yaw)*16,vy:7+Math.sin(p.pitch)*8,fuse:1.8});
    this.event('grenade',{playerId:p.id});
  }
  gridIndex(x,z){return clamp(Math.floor((z-this.gridOrigin)/this.gridCell),0,this.gridSize-1)*this.gridSize+clamp(Math.floor((x-this.gridOrigin)/this.gridCell),0,this.gridSize-1);}
  pathfind(start,goal){
    const source=this.gridIndex(start.x,start.z),target=this.gridIndex(goal.x,goal.z);
    if(source===target)return [];
    const size=this.gridSize,queue=this.pathQueue,prev=this.pathPrevious;
    prev.fill(-1);prev[source]=source;queue[0]=source;
    const targetX=target%size,targetZ=Math.floor(target/size);
    let read=0,write=1,found=source,best=Infinity;
    while(read<write){
      const cur=queue[read++];if(cur===target){found=cur;break;}
      const x=cur%size,z=Math.floor(cur/size),remaining=Math.abs(x-targetX)+Math.abs(z-targetZ);
      if(remaining<best){found=cur;best=remaining;}
      for(const [dx,dz]of neighbors){
        const nx=x+dx,nz=z+dz,n=nz*size+nx;
        if(nx<0||nx>=size||nz<0||nz>=size||this.blocked[n]||prev[n]!==-1)continue;
        prev[n]=cur;queue[write++]=n;
      }
    }
    const result=[];for(let cur=found;cur!==source&&cur!==-1;cur=prev[cur])result.push({x:this.gridOrigin+(cur%size+.5)*this.gridCell,z:this.gridOrigin+(Math.floor(cur/size)+.5)*this.gridCell});return result.reverse();
  }
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
      if(this.collides(tx,tz,0,PLAYER_RADIUS+.35)||this.blocked[this.gridIndex(tx,tz)])continue;
      let minAlly=Infinity;
      for(const ally of this.players.values()){
        if(ally===p||!ally.alive||ally.team!==p.team)continue;
        const ref=ally.botGoal||ally;
        const d=Math.hypot(tx-ref.x,tz-ref.z);
        if(d<minAlly)minAlly=d;
      }
      const coverBonus=this.collides(tx+Math.cos(angle)*1.6,tz+Math.sin(angle)*1.6,0,PLAYER_RADIUS)?2.5:0;
      const score=Math.min(minAlly,8)+coverBonus+(this.random()-.5)*.4;
      if(score>bestScore){bestScore=score;bestSpot={x:tx,z:tz};}
    }
    const enemyBase=MAP.spawns[1-p.team]??{x:0,z:0};
    const outwardYaw=Math.atan2(-(bestSpot.x-point.x),-(bestSpot.z-point.z));
    const frontYaw=Math.atan2(-(enemyBase.x-bestSpot.x),-(enemyBase.z-bestSpot.z));
    p.botWatchYaw=frontYaw+angleDifference(outwardYaw,frontYaw)*.45+((slot%3)-1)*.35;
    p.botHoldCrouch=(slot+Math.floor(this.time))%3===0;
    return bestSpot;
  }
  thinkBot(p,dt){
    if(!p.alive)return;
    p.nextThink-=dt;const settings=this.botSettings;
    let target=null,bestSquared=settings.awareness**2;
    scratchEye.x=p.x;scratchEye.y=p.y+1.65;scratchEye.z=p.z;
    const recentlyHurt=this.time-p.lastHurt<1.5;
    for(const other of this.players.values())if(other.alive&&other.team!==p.team){
      const dx=other.x-p.x,dz=other.z-p.z,distanceSquared=dx*dx+dz*dz;
      if(distanceSquared>=bestSquared||this.time<other.invulnerableUntil)continue;
      const aware=distanceSquared<100||recentlyHurt||other.id===p.botTargetId||Math.abs(angleDifference(Math.atan2(-dx,-dz),p.yaw))<1.9;
      if(aware){
        scratchTarget.x=other.x;scratchTarget.y=other.y+(other.input.crouch?.75:1.1);scratchTarget.z=other.z;
        if(this.lineClear(scratchEye,scratchTarget)){
          target=other;bestSquared=distanceSquared;
        }
      }
    }
    const input=p.input;
    input.forward=0;input.strafe=0;input.sprint=false;input.crouch=false;input.jump=false;
    input.fire=false;input.aim=false;input.reload=false;input.gadget=false;input.grenade=false;
    if(target){
      const best=Math.sqrt(bestSquared);
      if(p.botTargetId!==target.id){p.botTargetId=target.id;p.botReactAt=this.time+settings.reaction+this.random()*settings.reactionVariance;p.botBurstAt=p.botReactAt;p.botAimPhase=this.random()*Math.PI*2;}
      const dx=target.x-p.x,dz=target.z-p.z;
      const phase=p.botAimPhase+this.time*1.5;
      // Error grows with distance, leaving visible near-misses rather than laser aim.
      const error=settings.aimError*(.65+best/settings.awareness);
      const wantedYaw=Math.atan2(-dx,-dz)+Math.sin(phase)*error;
      const wantedPitch=Math.atan2(target.y+(target.input.crouch?.65:1.05)-scratchEye.y,Math.hypot(dx,dz))+Math.cos(phase*.83)*error*.5;
      input.yaw=p.yaw+clamp(angleDifference(wantedYaw,p.yaw),-settings.turnSpeed*dt,settings.turnSpeed*dt);
      input.pitch=p.pitch+clamp(wantedPitch-p.pitch,-dt*1.6,dt*1.6);input.aim=true;
      const cycle=settings.burst+settings.pause,burstPhase=(this.time-p.botBurstAt)%cycle;
      input.fire=this.time>=p.botReactAt&&burstPhase>=0&&burstPhase<settings.burst&&Math.abs(angleDifference(wantedYaw,input.yaw))<.1;
      input.strafe=Math.sin(this.time*.8+p.botAimPhase)>.65?.35:0;
      if(best>32)input.forward=.3;
    }else{
      p.botTargetId=null;
      if(p.nextThink<=0&&this.botPathBudget>0){
        this.botPathBudget--;
        let bestObjective = null, bestScore = Infinity;
        for (const point of this.points) {
          let assigned = 0;
          for (const ally of this.players.values()) {
            if (ally !== p && ally.team === p.team && ally.botObjective?.id === point.id) assigned++;
          }
          const score = dist(p, point) + (point.owner === p.team ? 220 : 0) + this.random() * 25 + assigned * 12;
          if (score < bestScore) { bestObjective = point; bestScore = score; }
        }
        const sameObjective=p.botObjective?.id===bestObjective?.id;
        const insideZone=bestObjective&&dist(p,bestObjective)<CAPTURE_RADIUS-1.5;
        p.botObjective=bestObjective;
        if(bestObjective){
          if(!sameObjective||!p.botGoal||!insideZone||this.random()<.35){
            p.botGoal=this.pickObjectiveSpot(p,bestObjective);
            p.botPath=this.pathfind(p,p.botGoal);
          }else{
            p.botWatchYaw=(p.botWatchYaw??p.yaw)+((p.botSlot??0)%2?1:-1)*(.45+this.random()*.5);
          }
        }
        p.nextThink=3+this.random()*2;
      }
      const goal=p.botGoal||p.botObjective;
      while(p.botPath.length&&dist(p,p.botPath[0])<1.4)p.botPath.shift();
      const next=p.botPath[0]||goal;
      let sepX=0,sepZ=0;
      for(const ally of this.players.values()){
        if(ally===p||!ally.alive)continue;
        const ax=p.x-ally.x,az=p.z-ally.z,d2=ax*ax+az*az;
        if(d2<4.84&&d2>1e-6){
          const d=Math.sqrt(d2),push=(2.2-d)/2.2;
          sepX+=(ax/d)*push;sepZ+=(az/d)*push;
        }
      }
      if(next&&dist(p,next)>1.35){
        const moveX=(next.x-p.x)+sepX*1.8,moveZ=(next.z-p.z)+sepZ*1.8;
        const wantedYaw=Math.atan2(-moveX,-moveZ);
        input.yaw=p.yaw+clamp(angleDifference(wantedYaw,p.yaw),-settings.turnSpeed*dt,settings.turnSpeed*dt);
        const facing=Math.abs(angleDifference(wantedYaw,input.yaw));input.forward=facing<.6?1:facing<1.1?.4:0;input.sprint=facing<.3&&dist(p,goal||next)>7;
      }else{
        const glance=Math.sin(this.time*1.1+(p.botSlot??0)*1.7)*.38;
        const wantedYaw=(p.botWatchYaw??p.yaw)+glance;
        input.yaw=p.yaw+clamp(angleDifference(wantedYaw,p.yaw),-settings.turnSpeed*.7*dt,settings.turnSpeed*.7*dt);
        input.crouch=Boolean(p.botHoldCrouch);
        if(Math.hypot(sepX,sepZ)>.15){
          const sin=Math.sin(input.yaw),cos=Math.cos(input.yaw);
          input.forward=clamp((-sin*sepX-cos*sepZ)*.7,-.5,.5);
          input.strafe=clamp((cos*sepX-sin*sepZ)*.7,-.5,.5);
        }
      }
    }
    if(p.ammo===0||(p.ammo<8&&!target))input.reload=true;
    if((p.hp<60||p.classId==='support')&&p.gadgetTime<=0)input.gadget=true;
    input.yaw=finite(input.yaw)%(Math.PI*2);
    input.pitch=clamp(finite(input.pitch),-1.45,1.45);
  }
  step(rawDt){
    const dt=clamp(finite(rawDt),0,.1);if(!dt)return;this.time+=dt;
    while(this.events.length&&this.time-this.events[0].time>=1.2)this.events.shift();
    if(this.winner!==null)return;
    // Spread route planning across ticks when many bots spawn together.
    this.botPathBudget=2;
    for(const p of this.players.values()){
      if(!p.alive){p.respawnIn=Math.max(0,p.respawnIn-dt);if(p.bot&&p.respawnIn===0)this.respawn(p.id);continue;}
      if(p.bot)this.thinkBot(p,dt);
      const i=p.input,c=CLASSES[p.classId];p.yaw=i.yaw;p.pitch=i.pitch;
      const pressed = i.fire && !p.fireHeld;
      p.fireHeld = i.fire;
      // Carry the fractional tick remainder through a burst so cadence stays on spec.
      const firing = i.fire && !i.sprint;
      const continuous = firing && (p.bot || !c.semiAuto) && !pressed && !p.reloading;
      p.cooldown = Math.max(continuous ? -dt : 0, p.cooldown - dt);
      p.bloom = Math.max(0, p.bloom - dt * (this.time - p.lastShotAt > .16 ? 3.6 : .4));
      p.gadgetTime=Math.max(0,p.gadgetTime-dt);p.grenadeCooldown=Math.max(0,(p.grenadeCooldown||0)-dt);
      if(p.reloading){p.reloadTime-=dt;if(p.reloadTime<=0){const amount=Math.min(c.mag-p.ammo,p.reserve);p.ammo+=amount;p.reserve-=amount;p.reloading=false;}}
      if(i.reload||p.ammo===0)this.startReload(p);
      const norm=Math.max(1,Math.hypot(i.forward,i.strafe));let speed=c.speed*(i.crouch?.5:i.sprint&&!i.fire?1.55:i.aim?.7:1);
      const dx=(-Math.sin(p.yaw)*i.forward+Math.cos(p.yaw)*i.strafe)/norm*speed*dt;
      const dz=(-Math.cos(p.yaw)*i.forward-Math.sin(p.yaw)*i.strafe)/norm*speed*dt;
      const oldX=p.x,oldZ=p.z;
      if(!this.collides(p.x+dx,p.z,p.y))p.x+=dx;if(!this.collides(p.x,p.z+dz,p.y))p.z+=dz;
      p.moveSpeed=Math.hypot(p.x-oldX,p.z-oldZ)/dt;
      if(i.jump&&p.grounded&&!p.jumpHeld){p.vy=6;p.grounded=false;}p.jumpHeld=i.jump;
      const oldY=p.y;p.vy-=18*dt;let nextY=p.y+p.vy*dt;let floor=0;
      if(p.vy<=0)for(const box of MAP.boxes)if(oldY>=box.h-.01&&nextY<=box.h&&Math.abs(p.x-box.x)<box.w/2+PLAYER_RADIUS*.6&&Math.abs(p.z-box.z)<box.d/2+PLAYER_RADIUS*.6)floor=Math.max(floor,box.h);
      p.y=Math.max(floor,nextY);p.grounded=p.y===floor;if(p.grounded)p.vy=0;
      if(firing&&(p.bot||!c.semiAuto||pressed))this.shoot(p);
      if(pressed&&firing&&p.ammo===0&&p.reserve===0&&!p.reloading&&p.cooldown<=0){
        this.event('dryFire',{playerId:p.id,classId:p.classId,x:p.x,z:p.z});
      }
      if(i.gadget)this.gadget(p);
      if(i.grenade&&!p.grenadeHeld)this.throwGrenade(p);p.grenadeHeld=i.grenade;
      if(this.time-p.lastHurt>7&&p.hp<100)p.hp=Math.min(100,p.hp+7*dt);
    }
    for(const grenade of this.grenades){
      grenade.fuse-=dt;grenade.vy-=14*dt;
      const delta={x:grenade.vx*dt,y:grenade.vy*dt,z:grenade.vz*dt},length=Math.hypot(delta.x,delta.y,delta.z);
      const direction=length>0?{x:delta.x/length,y:delta.y/length,z:delta.z/length}:{x:0,y:0,z:0};
      let nearest=length,hit=null;
      for(const box of grenadeColliders){const distance=rayBox(grenade,direction,box,length);if(distance<nearest){nearest=distance;hit=box;}}
      if(hit){
        const travel=Math.max(0,nearest-.02);grenade.x+=direction.x*travel;grenade.y+=direction.y*travel;grenade.z+=direction.z*travel;
        const faces=[['x',Math.abs(Math.abs(grenade.x-hit.x)-hit.w/2)],['z',Math.abs(Math.abs(grenade.z-hit.z)-hit.d/2)],['y',Math.abs(grenade.y-hit.h)]];
        const axis=faces.sort((a,b)=>a[1]-b[1])[0][0];grenade[`v${axis}`]*=-.35;
      }else if(this.collides(grenade.x+delta.x,grenade.z+delta.z,grenade.y+delta.y,.12)){grenade.vx*=-.35;grenade.vz*=-.35;}
      else{grenade.x+=delta.x;grenade.y+=delta.y;grenade.z+=delta.z;}
      if(grenade.y<.15){grenade.y=.15;grenade.vy=Math.abs(grenade.vy)*.3;grenade.vx*=.92;grenade.vz*=.92;}
      if(grenade.fuse<=0){this.event('explosion',{x:grenade.x,y:grenade.y,z:grenade.z});const owner=this.players.get(grenade.owner);for(const p of this.players.values())if(p.alive&&(p.team!==grenade.team||p.id===grenade.owner)){const d=Math.hypot(p.x-grenade.x,p.y+.8-grenade.y,p.z-grenade.z);if(d<10&&this.lineClear(grenade,{x:p.x,y:p.y+.8,z:p.z}))this.damage(p,Math.max(0,140*(1-d/10)),owner);}}
    }
    this.grenades=this.grenades.filter(g=>g.fuse>0);
    for(const point of this.points){
      const nearby=[0,0];for(const p of this.players.values())if(p.alive&&dist(p,point)<CAPTURE_RADIUS)nearby[p.team]++;
      point.contested=nearby[0]>0&&nearby[1]>0;
      const advantage=nearby[0]-nearby[1];
      if(advantage&&!point.contested){const direction=advantage>0?-1:1;point.progress=clamp(point.progress+direction*dt*.14*Math.min(2,Math.abs(advantage)),-1,1);const owner=point.progress<=-1?0:point.progress>=1?1:point.owner;if(owner!==point.owner){point.owner=owner;this.event('capture',{pointId:point.id,team:owner});}}
      if(point.owner===0&&point.progress>=0)point.owner=-1;
      if(point.owner===1&&point.progress<=0)point.owner=-1;
    }
    this.ticketClock+=dt;if(this.ticketClock>=1){this.ticketClock-=1;const held=[this.points.filter(p=>p.owner===0).length,this.points.filter(p=>p.owner===1).length];if(held[0]>held[1])this.tickets[1]=Math.max(0,this.tickets[1]-(held[0]-held[1]));if(held[1]>held[0])this.tickets[0]=Math.max(0,this.tickets[0]-(held[1]-held[0]));}
    if(this.tickets[0]<=0||this.tickets[1]<=0){this.winner=this.tickets[0]<=0?1:0;this.event('roundEnd',{winner:this.winner,reason:'tickets'});}
    else if(this.time>=480){const held=[this.points.filter(p=>p.owner===0).length,this.points.filter(p=>p.owner===1).length];this.winner=this.tickets[0]===this.tickets[1]?(held[0]>=held[1]?0:1):(this.tickets[0]>this.tickets[1]?0:1);this.event('roundEnd',{winner:this.winner,reason:'time'});}
  }
  snapshot(){
    const players=[...this.players.values()].map(p=>({
      id:p.id,name:p.name,team:p.team,classId:p.classId,x:p.x,y:p.y,z:p.z,yaw:p.yaw,pitch:p.pitch,
      hp:p.hp,alive:p.alive,ammo:p.ammo,reserve:p.reserve,kills:p.kills,deaths:p.deaths,respawnIn:p.respawnIn,
      reloading:p.reloading,reloadProgress:p.reloading?clamp(1-p.reloadTime/CLASSES[p.classId].reload,0,1):0,
      shotSeq:p.shotSeq,spread:weaponSpread(p),crouch:p.input.crouch,sprint:p.input.sprint&&p.moveSpeed>CLASSES[p.classId].speed,
      aim:p.input.aim,grounded:p.grounded,bot:p.bot,protected:this.time<p.invulnerableUntil,
      gadgetCooldown:p.gadgetTime,grenades:p.grenades,spotted:p.spottedUntil>this.time,
    }));
    return {
      time:this.time,roundDuration:480,difficulty:this.difficulty,tickets:[...this.tickets],players,
      points:this.points.map(p=>({...p})),events:this.events.map(e=>({...e})),
      grenades:this.grenades.map(g=>({id:g.id,x:g.x,y:g.y,z:g.z,team:g.team})),winner:this.winner,
    };
  }
}
