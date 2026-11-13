import test from 'node:test';
import assert from 'node:assert/strict';
import {sanitizeInput} from '../shared/simulation.js';
import {SnapshotEncoder,SnapshotDecoder,prepareSnapshot,encodeInput,decodeInput,encodeControl,decodeControl} from '../shared/snapshot-codec.js';
import {normalizeServerUrl} from '../src/network.js';

// Replaces the retired browser-host/room-code transport checks.
test('server URLs and untrusted controls are constrained',()=>{
  assert.equal(normalizeServerUrl('wss://example.com'),'wss://example.com/ws');
  assert.throws(()=>normalizeServerUrl('https://example.com'));
  const input=sanitizeInput({forward:999,strafe:-999,yaw:Infinity,pitch:NaN,fire:'true',reload:true,x:1000,hp:999});
  assert.equal(input.forward,1);assert.equal(input.strafe,-1);assert.equal(input.yaw,0);assert.equal(input.pitch,0);assert.equal(input.fire,false);assert.equal(input.reload,true);assert.equal(input.hp,undefined);
});
test('deltas inherit the acknowledged state, not an unacknowledged send',()=>{
  const base={time:1,tickets:[600,600],winner:null,players:[{id:'p1',name:'Friend',team:0,classId:'assault',weaponId:'ar416',alive:true,hp:100,x:10,y:0,z:20}],points:[],vehicles:[]};
  const encoder=new SnapshotEncoder(1000),decoder=new SnapshotDecoder({size:1000,mapId:'port'});
  const prepared=prepareSnapshot(base,1000),first=encoder.encode(prepared,{localId:'p1'});decoder.decode(first.bytes);
  encoder.confirm(first.sequence,decoder.dict.strings.length-1);
  const changed=prepareSnapshot({...base,time:1.05,players:[{...base.players[0],hp:50,x:12}]},1000,prepared);
  encoder.encode(changed,{localId:'p1'}); // Deliberately unacknowledged and never delivered.
  const restored=prepareSnapshot({...base,time:1.1},1000,changed),packet=encoder.encode(restored,{localId:'p1'}),result=decoder.decode(packet.bytes);
  assert.equal(result.state.players[0].hp,100);assert.ok(Math.abs(result.state.players[0].x-10)<.02);
  decoder.history.clear();assert.equal(decoder.decode(packet.bytes).missingBase,true);
  encoder.ack=0;assert.equal(decoder.decode(encoder.encode(restored,{localId:'p1'}).bytes).missingBase,undefined);
});
test('input frames preserve sequence, action flags and compact quantized controls',()=>{
  const bytes=encodeInput([{sequence:42,dt:.016667,input:{forward:1,strafe:-1,yaw:1,pitch:.4,fire:true,grenade:true,weaponSlot:2,toolSlot:1}}],{snapshotAck:8,eventAck:9,dictAck:10});
  const decoded=decodeInput(bytes);assert.equal(decoded.snapshotAck,8);assert.equal(decoded.frames[0].sequence,42);assert.equal(decoded.frames[0].input.grenade,true);assert.equal(decoded.frames[0].input.weaponSlot,2);assert.ok(Math.abs(decoded.frames[0].input.yaw-1)<.0001);
});

test('one authoritative room survives creator loss, resumes players and pauses empty', {timeout:6000},async()=>{
  const {createGameServer}=await import('../server/index.js');
  const {WebSocket}=await import('ws');const {once}=await import('node:events');
  const {PROTOCOL_VERSION,MAP_LAYOUT_REVISION}=await import('../shared/world.js');
  const {decodeEvents,encodeAck,MESSAGE}=await import('../shared/snapshot-codec.js');
  const app=createGameServer({PORT:0,BOTS:8});const address=await app.listen(),sockets=[];
  const delay=ms=>new Promise(r=>setTimeout(r,ms));
  const until=async(predicate)=>{const end=Date.now()+2500;while(!predicate()){if(Date.now()>end)throw Error('Room check timed out');await delay(10);}};
  const connect=async()=>{
    const socket=new WebSocket(`ws://127.0.0.1:${address.port}/ws`),client={socket,messages:[],latest:null};sockets.push(socket);
    socket.on('message',(raw,binary)=>{
      if(!binary){const m=decodeControl(raw.toString());client.messages.push(m);if(m.type==='welcome')client.identity=m;if(m.type==='init'){client.decoder=new SnapshotDecoder(m);client.eventAck=m.eventAck;client.epoch=m.epoch;}return;}
      if(raw[0]===MESSAGE.SNAPSHOT){const result=client.decoder.decode(raw);assert.ok(!result.missingBase);client.latest=result;socket.send(encodeAck(result.sequence,client.eventAck,client.decoder.dict.strings.length-1,client.epoch));}
      else if(raw[0]===MESSAGE.EVENTS){const result=decodeEvents(raw,client.decoder.dict);client.eventAck=result.through;socket.send(encodeAck(client.latest?.sequence??0,client.eventAck,client.decoder.dict.strings.length-1));}
    });
    await once(socket,'open');return client;
  };
  const control=(c,type,data={})=>c.socket.send(encodeControl({type,protocol:PROTOCOL_VERSION,layout:MAP_LAYOUT_REVISION,...data}));
  try{
    const a=await connect();control(a,'create',{roomName:'Friends',mapId:'village',bots:8,maxPlayers:7});await until(()=>a.identity);
    const b=await connect();control(b,'create');await until(()=>b.messages.some(m=>m.code==='room_exists'));
    control(b,'join',{roomId:app.room.id});await until(()=>b.identity);control(a,'start');await until(()=>b.latest);
    assert.equal(b.latest.state.mapId,'village');assert.equal(b.latest.state.players.length,10);
    const before=app.room.sim.time,identity=a.identity;a.socket.terminate();await until(()=>app.room.ownerId===b.identity.id);await delay(50);assert.ok(app.room.sim.time>before);
    const resumed=await connect();control(resumed,'resume',{token:identity.token});await until(()=>resumed.latest);assert.equal(resumed.identity.id,identity.id);
    const previousEpoch=app.room.epoch;app.room.sim.tickets=[0,600];await until(()=>b.latest.state.winner!==null);const ended=app.room.sim.time;await delay(25);assert.equal(app.room.sim.time,ended);
    control(b,'start');b.socket.send(encodeAck(9999,9999,999,previousEpoch));await until(()=>app.room.epoch===previousEpoch+1&&b.latest.state.winner===null);assert.equal(b.socket.readyState,WebSocket.OPEN);
    resumed.socket.terminate();b.socket.terminate();await until(()=>app.stats().room.players===0);const paused=app.room.sim.time;await delay(45);assert.equal(app.room.sim.time,paused);
    assert.ok(app.stats().totalBytes>0);assert.ok(app.stats().simulatedTicks>0);
  }finally{for(const socket of sockets)socket.terminate();await app.close();}
});
