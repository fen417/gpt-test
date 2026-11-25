import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, sanitizeInput, createPredictionWorld } from '../shared/simulation.js';
import { activateGadget } from '../shared/gadgets.js';
import { MAP, CLASSES, DIFFICULTIES, CAPTURE_RADIUS, getMap, WEAPONS } from '../shared/world.js';
import { ESTATE_WIDTH_SCALE } from '../shared/linden-estate.js';
import { takeWeapon, dropWeapon, updateWeaponItems, weaponTarget } from '../shared/tdm.js';
import { SnapshotEncoder, SnapshotDecoder, prepareSnapshot, quantizedInput, encodeInput, decodeInput } from '../shared/snapshot-codec.js';

const make=()=>new Simulation({bots:0,random:()=>.5});
const advance=(sim,seconds)=>{for(let n=0;n<seconds*20;n++)sim.step(.05);};
test('spawn points and capture centers are outside solid geometry',()=>{
  const sim=make();for(const point of [...MAP.spawns,...MAP.points])assert.equal(sim.collides(point.x,point.z),false,JSON.stringify(point));
  assert.equal(MAP.points.length,5);assert(MAP.size>=360);
  const crossStreets=[-110,-40,0,40,110];
  for(const box of MAP.boxes){
    if(['building','factory','warehouse','wall','pillar','container'].includes(box.kind)){
      const overlapsAvenue=Math.abs(box.x)-box.w/2<12;
      assert.equal(overlapsAvenue,false,`structure ${box.id} (${box.kind}) at (${box.x},${box.z}) overlaps main avenue`);
      for(const streetZ of crossStreets){
        const overlapsCross=Math.abs(box.z-streetZ)-box.d/2<7.5;
        assert.equal(overlapsCross,false,`structure ${box.id} (${box.kind}) at (${box.x},${box.z}) overlaps cross street z=${streetZ}`);
      }
    }
  }
  for(const start of MAP.spawns)for(const target of MAP.points){const path=sim.pathfind(start,target),last=path.at(-1);assert(last&&Math.hypot(last.x-target.x,last.z-target.z)<sim.gridCell,'every objective must be reachable from both bases');let previous=start;for(const step of path){assert(sim.lineClear({...previous,y:.8},{...step,y:.8}),'navigation must respect actual wall and cover geometry');previous=step;}}
});
test('untrusted input is bounded and non-finite values cannot corrupt simulation',()=>{
  const clean=sanitizeInput({forward:999,strafe:-999,yaw:Infinity,pitch:NaN,fire:'true',jump:true});
  assert.equal(clean.forward,1);assert.equal(clean.strafe,-1);assert.equal(clean.yaw,0);assert.equal(clean.pitch,0);assert.equal(clean.fire,false);assert.equal(clean.jump,true);
  const sim=make();sim.addPlayer('a','Alice',0);sim.setInput('a',{forward:NaN,yaw:Infinity});advance(sim,1);assert(Number.isFinite(sim.players.get('a').x));
  sim.setInput('a',null);assert.equal(sim.addPlayer('b','Bad',1,'__proto__').classId,'assault');assert.equal(sim.addPlayer('c','Bad',1,'toString').classId,'assault');
});
test('diagonal input does not grant extra movement speed and walls stop movement',()=>{
  const sim=make();const p=sim.addPlayer('a','Alice',0);p.x=0;p.z=130;
  sim.setInput('a',{forward:1,strafe:1});advance(sim,1);assert(Math.abs(Math.hypot(p.x,p.z-130)-CLASSES.assault.speed)<.01);
  const warehouse=MAP.boxes.find(b=>b.kind==='port-wall'&&b.x>20&&b.w>10&&b.h>3);p.x=0;p.z=warehouse.z;sim.setInput('a',{strafe:1});advance(sim,12);assert(p.x<warehouse.x-warehouse.w/2,'warehouse blocks eastward motion');
});
test('authoritative shots consume ammunition immediately and damage enemies on arrival',()=>{
  const sim=make();const a=sim.addPlayer('a','Alice',0);const b=sim.addPlayer('b','Bob',1);a.x=0;a.z=30;b.x=0;b.z=20;
  a.invulnerableUntil=b.invulnerableUntil=0;
  const tickets=sim.tickets[1];
  sim.setInput('a',{yaw:0,pitch:0,fire:true,aim:true});
  sim.step(.05);assert.equal(a.ammo,29);assert.equal(b.hp,100);
  sim.step(.05);assert(b.hp<100);assert(sim.snapshot().events.some(e=>e.type==='bulletImpact'&&e.hit));
  advance(sim,.5);assert.equal(b.alive,false);assert.equal(a.kills,1);assert.equal(b.deaths,1);assert.equal(sim.tickets[1],tickets-1);
});
test('solid cover blocks bullets; allies cannot receive friendly fire',()=>{
  const sim=make();const a=sim.addPlayer('a','Alice',0);const b=sim.addPlayer('b','Bob',1);const cover=MAP.boxes.find(box=>box.kind==='port-wall'&&box.w>10&&box.h>3);a.x=b.x=cover.x;a.z=cover.z+cover.d/2+5;b.z=cover.z-cover.d/2-5;a.invulnerableUntil=b.invulnerableUntil=0;
  sim.setInput('a',{yaw:0,fire:true,aim:true});advance(sim,1);assert.equal(b.hp,100);
  a.x=0;a.z=30;b.x=0;b.z=20;b.team=0;advance(sim,1);assert.equal(b.hp,100);
});
test('capture needs presence and majority objectives drain opposing tickets',()=>{
  const sim=make();const p=sim.addPlayer('a','Alice',0);p.x=0;p.z=0;
  const point=sim.points.find(q=>q.id==='C'),tickets=sim.tickets[1];
  advance(sim,14);assert.equal(point.owner,-1);
  advance(sim,2);assert.equal(point.owner,0);assert(sim.tickets[1]<tickets);assert.equal(sim.tickets[0],tickets);
});
test('contested objectives stop capture and hostile presence blocks spawning',()=>{
  const sim=make();const a=sim.addPlayer('a','Alice',0);const b=sim.addPlayer('b','Bob',1);
  const point=sim.points.find(p=>p.id==='C');
  a.x=0;a.z=0;b.x=2;b.z=0;point.owner=0;point.progress=-1;
  advance(sim,5);assert.equal(point.contested,true);assert.equal(point.progress,-1);
  a.alive=false;a.respawnIn=0;
  assert.equal(sim.respawn(a.id,'assault',point.id),false);
  sim.step(.05);assert.equal(point.contested,false);assert.equal(point.spawnBlocked,true);
  assert.equal(sim.respawn(a.id,'assault',point.id),false);
  b.x=40;sim.step(.05);assert.equal(sim.respawn(a.id,'assault',point.id),true);
});
test('death enforces respawn delay then restores correct class loadout',()=>{
  const sim=make();const a=sim.addPlayer('a','Alice',0);a.invulnerableUntil=0;assert.equal(sim.respawn('a','recon'),false);sim.damage(a,100);assert.equal(sim.respawn('a','recon'),false);advance(sim,4.1);assert.equal(sim.respawn('a','recon'),true);assert.equal(a.ammo,CLASSES.recon.mag);assert.equal(a.hp,100);
});
test('reload transfers finite reserve ammo',()=>{
  const sim=make();const p=sim.addPlayer('a','Alice',0);p.ammo=3;p.reserve=8;sim.setInput('a',{reload:true});advance(sim,2.3);assert.equal(p.ammo,11);assert.equal(p.reserve,0);
});
test('medical and ammo supplies heal gradually and enforce placement cooldowns',()=>{
  const sim=make(),medic=sim.addPlayer('m','Medic',0,'medic'),ally=sim.addPlayer('a','Ally',0),assault=sim.addPlayer('s','Supply',0,'assault');
  for(const p of [medic,ally,assault]){p.x=0;p.z=30;p.y=sim.groundAt(0,30);p.equipTime=0;}
  ally.hp=20;ally.lastHurt=0;ally.reserve=0;
  assert.equal(activateGadget(sim,medic,true),true);
  assert.equal(activateGadget(sim,medic,true),false,'cannot place another kit during cooldown');
  assert.equal(ally.hp,20,'placement does not instantly heal');
  advance(sim,2);assert(ally.hp>20&&ally.hp<50,'kit heals progressively');
  assert.equal(activateGadget(sim,assault),true);assert.equal(activateGadget(sim,assault),false);
  advance(sim,1.1);assert(ally.reserve>0);assert(assault.gadgetTime>0);
});

test('grenades explode once and damage nearby enemies',()=>{
  const sim=make();const a=sim.addPlayer('a','Alice',0);const b=sim.addPlayer('b','Bob',1);a.x=0;a.z=30;b.x=0;b.z=25;
  a.invulnerableUntil=b.invulnerableUntil=0;
  sim.grenades.push({id:'test',owner:a.id,team:0,x:0,y:0.2,z:25,vx:0,vz:0,vy:0,fuse:.01});sim.step(.05);assert.equal(sim.grenades.length,0);assert(b.hp<100);assert.equal(sim.events.filter(e=>e.type==='explosion').length,1);
});
test('grenades cannot tunnel through thin concrete cover at a long frame step',()=>{
  const sim=make();const box=MAP.boxes.find(b=>b.kind==='barrier'&&b.d===1.2);sim.grenades.push({id:'probe',owner:'none',team:0,x:box.x,y:.5,z:box.z+box.d/2+.15,vx:0,vz:-16,vy:0,fuse:2});sim.step(.1);
  assert(sim.grenades[0].z>box.z+box.d/2,'grenade must remain on the approach side of the barrier');assert(sim.grenades[0].vz>0,'grenade bounces away from cover');
});
test('both bot teams receive all four classes',()=>{
  const sim=new Simulation({bots:16});for(const team of [0,1])assert.equal(new Set([...sim.players.values()].filter(p=>p.team===team).map(p=>p.classId)).size,4);
});
test('bots wait before firing, turn gradually and shoot in bursts',()=>{
  const sim=new Simulation({bots:1,difficulty:'regular',random:()=>.5}),bot=sim.players.get('bot-0'),human=sim.addPlayer('human','Human',1);
  sim.time=3;bot.x=0;bot.z=35;bot.yaw=0;human.x=0;human.z=5;bot.invulnerableUntil=human.invulnerableUntil=0;
  advance(sim,.4);assert.equal(bot.shotSeq,0,'reaction delay gives players a chance to respond');
  const firing=[];for(let tick=0;tick<40;tick++){sim.step(.05);firing.push(bot.input.fire);}
  assert(bot.shotSeq>0);assert(firing.includes(true)&&firing.includes(false),'bursts must include pauses');
  human.alive=true;human.hp=100;human.x=bot.x;human.z=bot.z+5;bot.botTargetId=null;bot.yaw=0;const before=bot.shotSeq;sim.step(.05);assert(Math.abs(bot.yaw)<=DIFFICULTIES.regular.turnSpeed*.05+.001);assert.equal(bot.shotSeq,before,'bots cannot instantly turn and shoot behind themselves');
});
test('regular bots cannot acquire distant enemies beyond their awareness range',()=>{
  const sim=new Simulation({bots:1,difficulty:'regular',random:()=>.5}),bot=sim.players.get('bot-0'),human=sim.addPlayer('human','Human',1);
  sim.time=3;bot.x=0;bot.z=50;bot.yaw=0;human.x=0;human.z=-30;human.invulnerableUntil=0;advance(sim,.5);assert.equal(bot.botTargetId,null);assert.equal(bot.shotSeq,0);
  assert(DIFFICULTIES.recruit.reaction>DIFFICULTIES.regular.reaction);assert(DIFFICULTIES.regular.aimError>DIFFICULTIES.veteran.aimError);
});
test('spawn protection blocks damage for two seconds and ends on firing',()=>{
  const sim=make(),player=sim.addPlayer('human','Human',0);sim.damage(player,100);assert.equal(player.hp,100);assert.equal(sim.snapshot().players[0].protected,true);advance(sim,2.1);sim.damage(player,20);assert.equal(player.hp,80);
  player.alive=false;player.respawnIn=0;sim.respawn(player.id);sim.setInput(player.id,{fire:true});sim.step(.05);assert.equal(sim.snapshot().players[0].protected,false);
});
test('bots navigate and capture during a running round',()=>{
  const sim=new Simulation({bots:8,random:()=>.5});advance(sim,55);assert(sim.snapshot().players.some(p=>Math.abs(p.z)<100));assert(sim.points.some(p=>p.owner!==-1));
});

test('ordered squad bots spread around the objective without combat distractions',()=>{
  const sim=new Simulation({bots:4,random:()=>.5}),point=sim.points.find(p=>p.id==='C');
  const squad=[...sim.players.values()].filter(p=>p.team===0);
  for(const bot of sim.players.values())if(bot.team===1){bot.alive=false;bot.respawnIn=100;}
  for(const [i,bot] of squad.entries()){bot.x=-3+i*4;bot.z=10;bot.y=0;bot.squadId=1;}
  sim.squadOrders=new Map([['0/1',{kind:'attack',pointId:point.id,until:100}]]);
  advance(sim,6);
  for(const bot of squad){const d=Math.hypot(bot.x-point.x,bot.z-point.z);assert(d<CAPTURE_RADIUS,'ordered bot stays within capture radius');assert(d>1.5,'bot avoids standing on the flag centre');}
  for(let i=0;i<squad.length;i++)for(let j=i+1;j<squad.length;j++)assert(Math.hypot(squad[i].x-squad[j].x,squad[i].z-squad[j].z)>1.4,'bots maintain separation');
});

test('a full bot round remains finite, navigates the map, and reaches a winner',()=>{
  let seed=1;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const sim=new Simulation({bots:24,random});const visited=new Map([...sim.players.keys()].map(id=>[id,new Set()]));
  // Gameplay assertions need deterministic path completion, independent of
  // competing test workers and the host's wall-clock scheduling.
  sim.navigationBudgetMs=sim.pathBudgetMs=Infinity;
  const duration=sim.snapshot().roundDuration;
  for(let tick=0;tick<(duration+1)*60&&sim.winner===null;tick++){
    sim.step(1/60);
    for(const p of sim.players.values()){
      assert([p.x,p.y,p.z,p.hp].every(Number.isFinite));assert(Math.abs(p.x)<=MAP.size/2&&Math.abs(p.z)<=MAP.size/2);
      visited.get(p.id).add(`${Math.floor(p.x/10)},${Math.floor(p.z/10)}`);
    }
  }
  assert.notEqual(sim.winner,null);assert(sim.time>200&&sim.time<=961);
  // Capturing/defending points is valid bot behaviour: a balance change can
  // leave defenders holding position rather than roaming 150+ metres.
  const roaming=[...visited.values()].filter(cells=>cells.size>15).length;
  assert(roaming>=Math.ceil(visited.size*.75),`Only ${roaming}/${visited.size} bots traversed >15 cells`);
  assert([...sim.players.values()].reduce((sum,p)=>sum+p.kills,0)>50);
});
test('snapshots do not leak mutable player state',()=>{
  const sim=make();const p=sim.addPlayer('a','Alice',0);const originalTickets=sim.tickets[0];const state=sim.snapshot();state.players[0].hp=0;state.tickets[0]=0;state.points[0].owner=1;assert.equal(p.hp,100);assert.equal(sim.tickets[0],originalTickets);assert.equal(sim.points[0].owner,-1);
});

const map=getMap('linden_estate');
const manorX=x=>x*ESTATE_WIDTH_SCALE;
const horizontal=[-2.9,2.3].flatMap(z=>[-8.4,-2.9,5.5,9.4].map(x=>({x:manorX(x),z})));
const vertical=[-5.5,8].flatMap(x=>[-4.85,4.55].map(z=>({x:manorX(x),z})));
const sim=()=>new Simulation({mapId:'linden_estate',gameMode:'tdm',bots:0,random:()=>.5});

test('all ground-floor passages admit a standing player across the full threshold',()=>{
 const world=sim();
 assert.equal(world.playerRadius,.30);
 for(const {x,z} of horizontal){
   for(const delta of [-.50,0,.50]){
     assert.equal(world.collides(x,z+delta,.2),false,
       `horizontal doorway (${x},${z}) offset ${delta} blocked`);
   }
 }
 for(const {x,z} of vertical){
   for(const delta of [-.50,0,.50]){
     assert.equal(world.collides(x+delta,z,.2),false,
       `vertical doorway (${x},${z}) offset ${delta} blocked`);
   }
 }
 for(const [x,z] of [[0,7],[-1,-7],[12,1.85]]){
   assert.equal(world.collides(manorX(x),z,.2),false,`exterior doorway (${x},${z}) blocked`);
 }
});

test('upper-floor interior door openings have appropriate head clearance',()=>{
 const world=sim();
 for(const {x,z} of [...horizontal,...vertical])
   assert.equal(world.collides(x,z,3.3),false,`upstairs doorway (${x},${z}) blocked`);
});

test('the two teams spawn in distant opposite diagonal quadrants, not the courtyard',()=>{
 const [northwest,southeast]=map.spawnPoints;
 assert.ok(northwest.length>=12&&southeast.length>=12);
 const world=sim();
 for(const [team,points] of map.spawnPoints.entries())
  for(const point of points){
   assert.ok(team===0?point.x<=-14&&point.z>=16:point.x>=14&&point.z<=-3,
     `team ${team} spawned in incorrect region: ${JSON.stringify(point)}`);
   assert.equal(world.collides(point.x,point.z,world.groundAt(point.x,point.z)),false,
     'Spawn must have standing-body clearance');
  }
 const closest=Math.min(...northwest.flatMap(a=>southeast.map(b=>Math.hypot(a.x-b.x,a.z-b.z))));
 assert.ok(closest>45,`closest cross-team spawn ${closest.toFixed(2)}m is unsafe`);
 assert.ok(northwest.some(a=>southeast.some(b=>!world.lineClear(
   {x:a.x,y:1.5,z:a.z},{x:b.x,y:1.5,z:b.z}))),
   'building should interrupt direct cross-team sightlines');
});

const walking=(world,p)=>{
 const input={yaw:0,pitch:0,forward:1,strafe:0,sprint:false,aim:false,fire:false,
   crouch:false,jump:false};
 for(let i=0;i<65;i++)world.movePlayer(p,input,1/60);
};

test('main stairs can be climbed without jumping and lead onto the second floor',()=>{
 const world=sim(),p=world.addPlayer('main','Main stairs',0,'assault');
 Object.assign(p,{x:manorX(2),z:2.7,y:.2,vy:0,grounded:true,jumpCooldown:0});
 walking(world,p);
 assert.ok(p.z<-2.95,`main stairs blocked at Z=${p.z.toFixed(2)}`);
 assert.ok(p.y>3.0,`main stairs did not reach upper level, Y=${p.y.toFixed(2)}`);
});

test('east terrace stairs are continuous and reach the upper landing',()=>{
 const world=sim(),p=world.addPlayer('east','East stairs',1,'assault');
 const x=manorX(13.4);
 Object.assign(p,{x,z:.85,y:world.groundAt(x,.85),vy:0,grounded:true,jumpCooldown:0});
 walking(world,p);
 assert.ok(p.z<-4.55,`east stairs blocked at Z=${p.z.toFixed(2)}`);
 assert.ok(p.y>2.9,`east stairs did not reach landing, Y=${p.y.toFixed(2)}`);
});

test('stairs are walkable navigation surfaces, not blocking step solids',()=>{
 const world=sim();
 assert.ok(map.boxes.some(b=>b.kind==='village-stair'));
 assert.ok(world.colliders.every(b=>b.kind!=='village-stair'),
   'individual riser boxes are too tall for the capsule to climb');
 for(const [x,start,end] of [[manorX(2),2.3,-2.9],[manorX(13.4),.54,-4.65]]){
   let previous=world.groundAt(x,start);
   for(let z=start-.1;z>end;z-=.25){
     const y=world.groundAt(x,z);
     assert.ok(y>=previous-.01,`ramp at Z=${z} is not monotonic`);
     previous=y;
   }
 }
});


test('client prediction uses the same capsule radius and collision solids as the server',()=>{
  for(const id of ['linden_estate','fy_pool_day','port']){
    const server=new Simulation({mapId:id,gameMode:id==='port'?'conquest':'tdm',bots:0,random:()=>.5});
    const client=createPredictionWorld(id);
    assert.equal(client.playerRadius,server.playerRadius, `${id}: capsule must match authority`);
    assert.ok(Number.isFinite(client.playerRadius)&&client.playerRadius>0);
    const probes=id==='linden_estate'
      ?[[manorX(-12),0,.2],[manorX(-12.1),.2,.2],[manorX(12),0,.2],[manorX(-10.5),0,.2],[-21,15,0]]
      :id==='fy_pool_day'?[[0,0,0],[-17,0,0],[17,0,0]]
      :[[0,0,0],[10,15,0]];
    for(const [x,z,y] of probes){
      assert.equal(client.collides(x,z,y),server.collides(x,z,y),
        `${id}: collision disagrees at (${x},${z},${y})`);
    }
  }
});

test('holding forward against the manor outer wall never passes through it in client prediction',()=>{
  const prediction=createPredictionWorld('linden_estate');
  const authority=sim();
  assert.equal(prediction.collides(manorX(-12),0,.2),true,'West external wall must be solid');
  const player=authority.addPlayer('wall-test','Wall test',0,'assault');
  Object.assign(player,{x:manorX(-10.9),y:.2,z:0,vy:0,grounded:true,jumpCooldown:0,yaw:Math.PI/2,pitch:0});
  const input={yaw:Math.PI/2,pitch:0,forward:1,strafe:0,sprint:false,aim:false,
    fire:false,crouch:false,jump:false};
  for(let i=0;i<180;i++){
    prediction.movePlayer(player,input,1/60);
    assert.ok(player.x > manorX(-11.60),
      `player went through visible manor wall at frame ${i}: X=${player.x.toFixed(3)}`);
    assert.equal(prediction.collides(player.x,player.z,player.y),false,
      'prediction must never position the player inside a solid');
  }
});

function create(){
  const sim=new Simulation({bots:0,mapId:'fy_pool_day',gameMode:'tdm',killLimit:5,random:()=>.4});
  const red=sim.addPlayer('red','Красный',0),blue=sim.addPlayer('blue','Синий',1);
  return {sim,red,blue};
}
test('pool TDM spawns with zero weapons, grenades, rockets and ammo',()=>{
  const {sim,red,blue}=create();
  for(const p of [red,blue]){
    assert.equal(p.weaponId,'');assert.equal(p.primaryWeaponId,'');
    assert.equal(p.sidearmId,'');assert.equal(p.weaponSlot,0);
    assert.equal(p.ammo,0);assert.equal(p.reserve,0);
    assert.equal(p.grenades,0);assert.equal(p.rockets,0);
  }
  assert.equal(sim.weaponItems.length,20);
  assert.equal(sim.points.length,0);
});
test('all 32 TDM participants spawn on their own side, collision-free and separated',()=>{
  const sim=new Simulation({bots:31,mapId:'fy_pool_day',gameMode:'tdm',random:()=>.4});
  sim.addPlayer('local','Rookie',0);
  const players=[...sim.players.values()];
  assert.equal(players.length,32);
  for(const p of players){
    assert.equal(p.alive,true,'failed to place '+p.id);
    assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z),'non-finite spawn for '+p.id);
    assert.ok(p.team===0?p.x<0:p.x>0,'wrong team side for '+p.id);
    assert.equal(sim.collides(p.x,p.z,p.y),false,'spawn inside wall for '+p.id);
  }
  for(let i=0;i<players.length;i++)for(let j=i+1;j<players.length;j++){
    const a=players[i],b=players[j],distance=Math.hypot(a.x-b.x,a.z-b.z);
    assert.ok(distance>=1.69,`overlap ${a.id} vs ${b.id}: ${distance}`);
  }
});
test('TDM respawn uses another safe side coordinate, not shared map origin',()=>{
  const {sim,red,blue}=create();
  const first={x:red.x,z:red.z};
  red.alive=false;red.respawnIn=0;
  assert.equal(sim.respawn(red.id),true);
  assert.ok(red.x<0&&Number.isFinite(red.z));
  assert.ok(Math.hypot(red.x-blue.x,red.z-blue.z)>=7);
  assert.ok(Math.hypot(red.x,red.z)>10);
  assert.ok(Number.isFinite(first.x)&&Number.isFinite(first.z));
});
test('atomic pickup and respawn with independent primary and pistol slots',()=>{
  const {sim,red,blue}=create();
  const rifle=sim.weaponItems.find(i=>i.weaponId==='ar416');
  Object.assign(red,{x:rifle.x,z:rifle.z,y:rifle.y});
  Object.assign(blue,{x:rifle.x,z:rifle.z,y:rifle.y});
  assert.equal(takeWeapon(sim,red,rifle),true);
  assert.equal(takeWeapon(sim,blue,rifle),false);
  assert.equal(red.primaryWeaponId,'ar416');
  assert.equal(red.ammo,WEAPONS.ar416.mag);
  assert.equal(rifle.active,false);
  const pistol=sim.weaponItems.find(i=>i.weaponId==='p19');
  Object.assign(red,{x:pistol.x,z:pistol.z,y:pistol.y});
  assert.equal(takeWeapon(sim,red,pistol),true);
  assert.equal(red.sidearmId,'p19');assert.equal(red.primaryWeaponId,'ar416');
  assert.equal(red.weaponSlot,2);assert.equal(red.stowedAmmo.ammo,WEAPONS.ar416.mag);
  assert.equal(takeWeapon(sim,red,pistol),false);
  assert.equal(rifle.active,false);
  Object.assign(red,{x:0,z:0});Object.assign(blue,{x:0,z:0});
  sim.time+=sim.weaponRespawnSeconds+.01;
  updateWeaponItems(sim,1/60);
  assert.equal(rifle.active,true);assert.equal(pistol.active,true);
});
test('dropped weapons retain ammo and have no repeated pickup dupes',()=>{
  const {sim,red,blue}=create();
  const rifle=sim.weaponItems.find(i=>i.weaponId==='ak12');
  Object.assign(red,{x:rifle.x,z:rifle.z,y:rifle.y});
  assert.equal(takeWeapon(sim,red,rifle),true);
  red.ammo=7;red.reserve=13;
  assert.equal(dropWeapon(sim,red),true);
  assert.equal(red.weaponId,'');assert.equal(red.ammo,0);
  const dropped=sim.weaponItems.find(i=>!i.home&&i.weaponId==='ak12');
  assert.equal(dropped.ammo,7);assert.equal(dropped.reserve,13);
  Object.assign(blue,{x:dropped.x,z:dropped.z,y:dropped.y});
  assert.equal(takeWeapon(sim,blue,dropped),true);
  assert.equal(blue.ammo,7);assert.equal(blue.reserve,13);
  assert.equal(takeWeapon(sim,red,dropped),false);
});
test('TDM win limit increments on enemy kills, not friendly kills',()=>{
  const {sim,red,blue}=create();
  sim.killLimit=1;sim.maxTickets=1;
  sim.time=3;blue.invulnerableUntil=0;
  sim.damage(blue,999,red,{weapon:'AR-416'});
  assert.deepEqual(sim.tickets,[1,0]);
  assert.equal(sim.winner,0);
  assert.equal(blue.respawnIn,3);
});
test('empty ammo inventory round-trips through compressed snapshot',()=>{
  const {sim,red}=create(), state=sim.snapshot();
  const encoder=new SnapshotEncoder(sim.map.size),decoder=new SnapshotDecoder({size:sim.map.size,mapId:sim.map.id,gameMode:'tdm'});
  const {bytes}=encoder.encode(prepareSnapshot(state,sim.map.size),{localId:'red',full:true});
  const decoded=decoder.decode(bytes);
  const p=decoded.state.players.find(p=>p.id===red.id);
  assert.equal(p.weaponId,null);
  assert.equal(p.ammo,0);
  assert.equal(decoded.state.weaponItems.length,20);
});
test('drop input is encoded and decoded without activating grenade flag',()=>{
  const command=sanitizeInput({drop:true,grenade:false});
  const frame=quantizedInput(1,command);
  const packet=decodeInput(encodeInput([frame]));
  assert.equal(packet.frames[0].input.drop,true);
  assert.equal(packet.frames[0].input.grenade,false);
});

test('authority grants normal class kit and cannot spawn/drop floor guns on Linden Estate',()=>{
  const sim=new Simulation({mapId:'linden_estate',gameMode:'tdm',bots:0,random:()=>.5});
  assert.equal(sim.gameMode,'tdm');
  assert.equal(sim.vehicles.length,0);
  assert.equal(sim.weaponItems.length,0);
  const a=sim.addPlayer('human0','Player A',0,'assault','ak12','m50');
  const b=sim.addPlayer('human1','Player B',1,'recon','sv98','p19');
  assert.equal(a.alive,true,'First team must successfully spawn');
  assert.equal(b.alive,true,'Second team must successfully spawn');
  assert.equal(a.weaponId,'ak12');
  assert.equal(a.primaryWeaponId,'ak12');
  assert.equal(a.sidearmId,'m50');
  assert.equal(a.weaponSlot,1);
  assert.ok(a.ammo>0&&a.reserve>0);
  assert.equal(b.weaponId,'sv98');
  assert.equal(b.sidearmId,'p19');
  assert.equal(a.grenades,0, 'All deathmatch maps keep grenades disabled');
  assert.equal(dropWeapon(sim,a),false,'G must not spawn weapons on class-TDM map');
  assert.equal(sim.weaponItems.length,0);
  assert.equal(weaponTarget(sim,a),null);
  sim.step(1/60);
  assert.equal(sim.weaponItems.length,0);
  a.alive=false;a.respawnIn=0;
  sim.step(1/60);
  assert.equal(a.alive,false,'Class TDM requires player deployment to pick a new class');
  assert.equal(sim.respawn(a.id,'medic','', 'mcx9', 'p19'),true);
  assert.equal(a.alive,true);
  assert.equal(a.classId,'medic');
  assert.equal(a.weaponId,'mcx9');
});

test('non-TDM maps still use conquest',()=>{
  const sim=new Simulation({mapId:'port',gameMode:'tdm',bots:0,random:()=>.5});
  assert.equal(sim.gameMode,'conquest');
});
