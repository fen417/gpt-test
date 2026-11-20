import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createGameServer } from '../server/index.js';
import { MAP_LAYOUT_REVISION, PROTOCOL_VERSION } from '../shared/world.js';
import { encodeControl, decodeControl } from '../shared/snapshot-codec.js';

test('multiplayer lobby accepts class-loadout Linden Estate as Team Deathmatch, not conquest', {timeout:12000}, async()=>{
  const server=createGameServer({PORT:0,BOTS:0,MAX_BOTS:0,MAX_PLAYERS:4});
  let socket;
  try{
    const address=await server.listen();
    socket=new WebSocket(`ws://127.0.0.1:${address.port}/ws`);
    const inbox=[],waiters=new Set();
    socket.on('message',(raw,binary)=>{
      if(binary)return;
      const msg=decodeControl(raw.toString());
      inbox.push(msg);
      for(const watcher of [...waiters])watcher();
    });
    await new Promise((resolve,reject)=>{
      socket.once('open',resolve);
      socket.once('error',reject);
    });
    const until=(predicate)=>new Promise((resolve,reject)=>{
      const existing=inbox.find(predicate);
      if(existing)return resolve(existing);
      const timeout=setTimeout(()=>{waiters.delete(check);reject(new Error('Timed out waiting for multiplayer response'))},3000);
      const check=()=>{
        const found=inbox.find(predicate);
        if(found){clearTimeout(timeout);waiters.delete(check);resolve(found);}
      };
      waiters.add(check);
    });
    await until(m=>m.type==='hello');
    const base={type:'create',protocol:PROTOCOL_VERSION,layout:MAP_LAYOUT_REVISION,
      roomName:'Linden TDM',name:'Test player',classId:'assault',weaponId:'ak12',
      sidearmId:'p19',bots:0,killLimit:50,maxPlayers:4};
    socket.send(encodeControl({...base,mapId:'port',gameMode:'tdm',requestId:1}));
    const rejected=await until(m=>m.type==='error'&&m.requestId===1);
    assert.match(rejected.message,/недоступен/);
    socket.send(encodeControl({...base,mapId:'linden_estate',gameMode:'tdm',requestId:2}));
    const welcome=await until(m=>m.type==='welcome'&&m.requestId===2);
    assert.ok(welcome.id);
    const lobby=await until(m=>m.type==='lobby'&&m.state?.mapId==='linden_estate');
    assert.equal(lobby.state.gameMode,'tdm');
    assert.equal(lobby.state.killLimit,50);
    assert.equal(lobby.state.points.length,0);
    const listing=await until(m=>m.type==='rooms'&&m.rooms?.[0]?.mapId==='linden_estate');
    assert.equal(listing.rooms[0].mode,'tdm');
  }finally{
    if(socket&&socket.readyState<=1)socket.close();
    await server.close();
  }
});
