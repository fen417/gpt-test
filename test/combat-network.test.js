import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation,sanitizeInput } from '../shared/simulation.js';
import { PoseHistory,validatedRewind } from '../shared/pose-history.js';
import { shotTrajectory } from '../shared/fire-control.js';
import { Prediction,Multiplayer } from '../src/network.js';
import { encodeInput,decodeInput,SnapshotEncoder,SnapshotDecoder,prepareSnapshot } from '../shared/snapshot-codec.js';
import { SimulatedSocket } from '../src/network-simulator.js';

test('presentation rejoins current shots after a two-second frame stall and sustained slow frames',()=>{
  const client=new Multiplayer();client.id='local';client.interpolationMs=client.targetInterpolationMs=43;
  client.prediction={sample:()=>null,hasPlayed:()=>false};client.motion=new Map();client.renderTime=10;client.lastSample=1000;
  const receive=(time,now)=>{
    const state={time,winner:null,players:[],vehicles:[],rockets:[],grenades:[]};
    client.state=state;client.frames=[{frame:{time},state,arrival:now}];
    client.events=[{id:Math.round(time*100),type:'shot',playerId:'bot',time:time-.06}];
    client.publish();return client.sample(now);
  };
  const afterStall=receive(12,3000);
  assert.ok(afterStall.events.some(e=>e.type==='shot'),'current shots must remain audible after a missed frame');
  assert.ok(12-afterStall.time<.25,'playback cannot remain behind event retention');
  for(let i=1;i<=120;i++){
    const frame=receive(12+i/3,3000+i*1000/3);
    assert.ok(12+i/3-frame.time<.35,'3 FPS must not accumulate an ever-growing playback delay');
  }
});

test('a running target is hit at the viewed position with bounded rewind',()=>{
  const run=lagCompensation=>{
    const sim=new Simulation({bots:0,lagCompensation,random:()=>.5}),a=sim.addPlayer('a','a',0),b=sim.addPlayer('b','b',1);
    Object.assign(a,{x:0,y:0,z:30,invulnerableUntil:0});Object.assign(b,{x:0,y:0,z:20,invulnerableUntil:0});
    sim.poseHistory?.capture(0,sim.players,sim.vehicles);
    for(let i=1;i<=10;i++){b.x=6*i/60;sim.step(1/60);}
    a.shotRewind=.16;sim.setInput(a.id,{fire:true,aim:true,yaw:Math.atan2(-6*(11/60-.16),10),pitch:-.04});sim.step(1/60);
    sim.setInput(a.id,{});for(let i=12;i<=13;i++){b.x=6*i/60;sim.step(1/60);}return b.hp;
  };
  assert.equal(run(false),100,'current pose has moved outside the capsule');
  assert(run(true)<100,'the authoritative projectile tests historical target pose');
  assert.equal(validatedRewind(10,{time:9.9},-100),.2);
  assert.equal(validatedRewind(10,null,9.9),0);
});

test('pose history never blends across revive or teleport discontinuities',()=>{
  const history=new PoseHistory(),players=new Map([['p',{id:'p',x:0,y:0,z:0,alive:true,reviveSeq:0}]]);
  history.capture(1,players,[]);Object.assign(players.get('p'),{x:2,reviveSeq:1});history.capture(1.1,players,[]);
  assert.equal(history.sample('players','p',1.05),null);
});

test('local shot prediction is immediate and reconciliation never repeats cosmetics',()=>{
  const sim=new Simulation({bots:0}),a=sim.addPlayer('a','a',0);Object.assign(a,{x:0,y:0,z:30,equipTime:0,invulnerableUntil:0});
  const own=sim.snapshot().players.find(p=>p.id==='a'),events=[],prediction=new Prediction('port',e=>events.push(e));
  prediction.reconcile(own,0,[],0);
  const command={sequence:1,dt:1/60,input:sanitizeInput({fire:true,aim:true})};prediction.add(command);
  assert.equal(events.length,1);assert.equal(prediction.player.ammo,own.ammo-1);
  assert(prediction.hasPlayed(events[0]));prediction.reconcile(own,0,[],0);assert.equal(events.length,1);
  assert.equal(prediction.player.ammo,own.ammo-1,'pending commands rebuild cosmetic state without replaying sound');
  const shape={...a,input:command.input,shotSeq:1};assert.deepEqual(shotTrajectory(shape),shotTrajectory({...shape}));
});

test('wire format carries bounded presentation metadata and snapshots keep private gun state',()=>{
  const packet=decodeInput(encodeInput([{sequence:1,dt:1/60,input:{}}],{viewTime:8.75,interpolationMs:70}));
  assert.equal(packet.viewTime,8.75);assert.equal(packet.interpolationMs,70);
  const sim=new Simulation({bots:0}),own=sim.addPlayer('own','own',0),other=sim.addPlayer('other','other',1);own.bloom=other.bloom=.5;
  const encoded=new SnapshotEncoder(sim.map.size).encode(prepareSnapshot(sim.snapshot(),sim.map.size),{localId:own.id});
  const state=new SnapshotDecoder({size:sim.map.size}).decode(encoded.bytes).state;
  assert.equal(state.players.find(p=>p.id===own.id).bloom,.5);assert.equal(state.players.find(p=>p.id===other.id).bloom,0);
});

test('predicted automatic cadence, ammo and deterministic trace match authority',()=>{
  const sim=new Simulation({bots:0}),p=sim.addPlayer('same','same',0);Object.assign(p,{x:0,y:0,z:30,equipTime:0,invulnerableUntil:0});
  const events=[],prediction=new Prediction('port',e=>events.push(e));prediction.reconcile(sim.snapshot().players[0],0,[],0);
  const input=sanitizeInput({fire:true,aim:true});
  for(let i=1;i<=30;i++){sim.setInput(p.id,input);sim.step(1/60);prediction.add({sequence:i,dt:1/60,input});}
  assert.equal(prediction.player.ammo,p.ammo);assert.equal(prediction.player.shotSeq,p.shotSeq);
  const authoritative=sim.events.find(e=>e.type==='shot'&&e.shotSeq===3),predicted=events.find(e=>e.shotSeq===3);
  for(const axis of ['vx','vy','vz'])assert(Math.abs(authoritative[axis]-predicted[axis])<1e-6,axis);
});

for(const delayMs of [25,50,75])test(`development transport preserves TCP order at RTT +${delayMs*2} ms with jitter`,async()=>{
  class Socket{readyState=1;bufferedAmount=0;sent=[];send(data){this.sent.push(data);}close(){this.onclose?.({});}}
  const socket=new SimulatedSocket('ws://local',{Socket,delayMs,jitterMs:15}),received=[];socket.onmessage=e=>received.push(e.data);
  for(let i=0;i<4;i++){socket.send(String(i));socket.socket.onmessage({data:String(i)});}
  try{
    const until=performance.now()+3000;
    while((socket.socket.sent.length<4||received.length<4)&&performance.now()<until)await new Promise(resolve=>setTimeout(resolve,10));
    assert.deepEqual(socket.socket.sent,['0','1','2','3']);assert.deepEqual(received,['0','1','2','3']);
  }finally{socket.close();}
});

test('prediction backlog requests a full state without closing the socket',()=>{
  const multiplayer=new Multiplayer(),sent=[];let closed=false;
  multiplayer.ws={readyState:1,bufferedAmount:0,send:data=>sent.push(data),close(){closed=true;}};
  multiplayer._phase='match';multiplayer.state={winner:null};multiplayer.prediction={pending:Array(120).fill({})};
  multiplayer.reconcileLatest=()=>{};multiplayer.sequence=120;multiplayer.accumulator=1/60;
  multiplayer.advance({},1/60);assert.equal(closed,false);assert(multiplayer.awaitingResync);assert.equal(sent.length,1);
});
