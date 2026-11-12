import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, sanitizeInput } from '../shared/simulation.js';
import { MAP, CLASSES, DIFFICULTIES, PROTOCOL_VERSION } from '../shared/world.js';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { WebSocket } from 'ws';

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
  const warehouse=MAP.boxes.find(b=>b.kind==='factory'&&b.z===145);p.x=0;p.z=warehouse.z;sim.setInput('a',{strafe:1});advance(sim,12);assert(p.x<warehouse.x-warehouse.w/2,'warehouse blocks eastward motion');
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
  const sim=make();const a=sim.addPlayer('a','Alice',0);const b=sim.addPlayer('b','Bob',1);const cover=MAP.boxes.find(box=>box.kind==='factory'&&box.z===-145);a.x=b.x=cover.x;a.z=cover.z+cover.d/2+5;b.z=cover.z-cover.d/2-5;a.invulnerableUntil=b.invulnerableUntil=0;
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
test('medic and support gadgets have bounded supply and cooldown',()=>{
  const sim=make();const medic=sim.addPlayer('m','Medic',0,'medic');const ally=sim.addPlayer('a','Alice',0);ally.hp=20;sim.setInput('m',{gadget:true});sim.step(.05);assert.equal(ally.hp,75);sim.step(.05);assert.equal(ally.hp,75);
  const support=sim.addPlayer('s','Support',0,'support');ally.reserve=0;sim.setInput('s',{gadget:true});sim.step(.05);assert.equal(ally.reserve,60);assert(support.gadgetTime>0);
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
  // Verify bots capturing the same objective spread out instead of stacking on one pixel
  const pointC=sim.points.find(p=>p.id==='C');
  const squad=[...sim.players.values()].filter(p=>p.team===0).slice(0,4);
  for(const [idx,bot] of squad.entries()){
    bot.alive=true;bot.hp=100;bot.x=-3+idx*2;bot.z=10;bot.botObjective=pointC;
    bot.botGoal=sim.pickObjectiveSpot(bot,pointC);
    bot.botPath=sim.pathfind(bot,bot.botGoal);
    bot.nextThink=10;
  }
  // Hide enemy bots far away so squad captures peacefully
  for(const bot of sim.players.values())if(bot.team===1){bot.x=0;bot.z=-160;bot.nextThink=99;}
  advance(sim,6);
  for(let i=0;i<squad.length;i++){
    assert(Math.hypot(squad[i].x-pointC.x,squad[i].z-pointC.z)<12,'bot stays within capture radius');
    assert(Math.hypot(squad[i].x-pointC.x,squad[i].z-pointC.z)>1.5,'bot does not stand on exact flag center pixel');
    for(let j=i+1;j<squad.length;j++){
      assert(Math.hypot(squad[i].x-squad[j].x,squad[i].z-squad[j].z)>1.4,'bots maintain separation while capturing');
    }
  }
});
test('a full bot round remains finite, navigates the map, and reaches a winner',()=>{
  let seed=1;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const sim=new Simulation({bots:24,random});const visited=new Map([...sim.players.keys()].map(id=>[id,new Set()]));
  for(let tick=0;tick<36000&&sim.winner===null;tick++){
    sim.step(1/60);
    for(const p of sim.players.values()){
      assert([p.x,p.y,p.z,p.hp].every(Number.isFinite));assert(Math.abs(p.x)<=MAP.size/2&&Math.abs(p.z)<=MAP.size/2);
      visited.get(p.id).add(`${Math.floor(p.x/10)},${Math.floor(p.z/10)}`);
    }
  }
  assert.notEqual(sim.winner,null);assert(sim.time>200&&sim.time<600);assert([...visited.values()].every(cells=>cells.size>15));
  assert([...sim.players.values()].reduce((sum,p)=>sum+p.kills,0)>50);
});
test('snapshots do not leak mutable player state',()=>{
  const sim=make();const p=sim.addPlayer('a','Alice',0);const state=sim.snapshot();state.players[0].hp=0;state.tickets[0]=0;state.points[0].owner=1;assert.equal(p.hp,100);assert.equal(sim.tickets[0],300);assert.equal(sim.points[0].owner,-1);
});

test('real WebSocket server joins players, simulates inputs, rejects client positions and disconnects', {timeout:10000},async(t)=>{
  const child=spawn(process.execPath,['server/index.js'],{cwd:new URL('../',import.meta.url),env:{...process.env,PORT:'0',BOTS:'0'},stdio:['ignore','pipe','pipe']});
  t.after(()=>child.kill());
  const port=await new Promise((resolve,reject)=>{let logs='';child.stdout.on('data',chunk=>{logs+=chunk;const match=logs.match(/localhost:(\d+)/);if(match)resolve(Number(match[1]));});child.once('error',reject);child.once('exit',code=>reject(new Error(`server exited ${code}`)));});
  const health=await(await fetch(`http://localhost:${port}/health`)).json();assert.equal(health.ok,true);
  const a=new WebSocket(`ws://localhost:${port}`), b=new WebSocket(`ws://localhost:${port}`);t.after(()=>{a.terminate();b.terminate();});
  const incoming=new Map([[a,[]],[b,[]]]);for(const socket of [a,b])socket.on('message',raw=>incoming.get(socket).push(JSON.parse(raw)));
  await Promise.all([once(a,'open'),once(b,'open')]);
  const packet=async(socket,predicate)=>{const limit=Date.now()+2500;while(Date.now()<limit){const list=incoming.get(socket),index=list.findIndex(predicate);if(index>=0)return list.splice(index,1)[0];await new Promise(resolve=>setTimeout(resolve,10));}throw new Error('Timed out waiting for server packet');};
  a.send('invalid json');a.send(JSON.stringify({type:'join',protocol:PROTOCOL_VERSION,name:'Alice',classId:'assault'}));b.send(JSON.stringify({type:'join',protocol:PROTOCOL_VERSION,name:'Bob',classId:'medic'}));
  const welcomeA=await packet(a,p=>p.type==='welcome'),welcomeB=await packet(b,p=>p.type==='welcome');assert.notEqual(welcomeA.id,welcomeB.id);
  assert.equal(welcomeA.protocol,PROTOCOL_VERSION);assert.equal(welcomeA.difficulty,'regular');
  const old=new WebSocket(`ws://localhost:${port}`);t.after(()=>old.terminate());incoming.set(old,[]);old.on('message',raw=>incoming.get(old).push(JSON.parse(raw)));await once(old,'open');old.send(JSON.stringify({type:'join',name:'Old cached client'}));const mismatch=await packet(old,p=>p.type==='error');assert.match(mismatch.message,/Обновите страницу/);
  const before=(await packet(a,p=>p.type==='snapshot'&&p.state.players.length===2)).state.players.find(p=>p.id===welcomeA.id);
  a.send(JSON.stringify({type:'input',input:{forward:1,yaw:0,x:99999,z:99999,hp:99999}}));
  const moved=await packet(a,p=>p.type==='snapshot'&&p.state.players.some(q=>q.id===welcomeA.id&&q.z<before.z-.15));const after=moved.state.players.find(p=>p.id===welcomeA.id);
  assert(Math.abs(after.x)<MAP.size/2);assert(Math.abs(after.z)<MAP.size/2);assert.equal(after.hp,100);assert.equal(after.classId,'assault');
  b.close();const left=await packet(a,p=>p.type==='snapshot'&&p.state.players.length===1);assert.equal(left.state.players[0].id,welcomeA.id);
});
