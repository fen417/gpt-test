import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { Simulation, sanitizeInput, sanitizeSpawnPoint } from '../shared/simulation.js';
import { MAP_LAYOUT_REVISION, PROTOCOL_VERSION } from '../shared/world.js';
import { packSnapshot } from '../shared/snapshot-codec.js';

const port=process.env.PORT===undefined?8080:Number(process.env.PORT);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist');
const maxPlayers=Math.min(32,Math.max(2,Number(process.env.MAX_PLAYERS)||16));
const botCount=Math.min(31,Math.max(0,Number(process.env.BOTS??23)||0));
const difficulty=process.env.DIFFICULTY||'regular';
const mapId=process.env.MAP_ID;
let simulation=new Simulation({bots:botCount,difficulty,mapId});
let roundResetAt=0;
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.woff2':'font/woff2'};
const server=http.createServer(async(req,res)=>{
  if(req.url==='/health'){res.writeHead(200,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});res.end(JSON.stringify({ok:true,players:clients.size,bots:botCount,mapId:simulation.map.id,difficulty:simulation.difficulty,time:simulation.time}));return;}
  try{
    const url=new URL(req.url,'http://localhost');
    const pathname=decodeURIComponent(url.pathname);
    if(pathname==='/editor'){res.writeHead(308,{Location:'/editor/'});res.end();return;}
    const requested=pathname==='/'?'index.html':pathname==='/editor/'?'editor/index.html':pathname.replace(/^\/+/, '');
    const target=path.resolve(root,requested);
    if(!target.startsWith(root+path.sep)&&target!==root)throw new Error('invalid path');
    if(!(await stat(target)).isFile())throw new Error('not found');
    const data=await readFile(target);res.writeHead(200,{'Content-Type':mime[path.extname(target)]||'application/octet-stream','Cache-Control':path.extname(target)==='.html'?'no-cache':'public, max-age=3600'});res.end(data);
  }catch{res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('Not found. Build the client with npm run build, or connect via WebSocket.');}
});
const wss=new WebSocketServer({server,maxPayload:8192});
const clients=new Map();
const packetCache=new WeakMap();
const send=(ws,data)=>{
  if(ws.readyState!==WebSocket.OPEN||ws.bufferedAmount>32768)return false;
  let packet;
  if(data.type==='snapshot'){
    const state=data.state,after=state.time<(ws.stateTime??-1)?0:(ws.eventCursor||0);
    let cache=packetCache.get(state);
    if(!cache){cache=new Map();packetCache.set(state,cache);}
    if(!cache.has(after))cache.set(after,JSON.stringify({type:'snapshot',state:packSnapshot(state,after)}));
    packet=cache.get(after);
    ws.stateTime=state.time;ws.eventCursor=Math.max(after,state.events?.at(-1)?.id||0);
  }else packet=JSON.stringify(data);
  ws.send(packet);return true;
};

wss.on('connection',(ws)=>{
  if(clients.size>=maxPlayers){send(ws,{type:'error',message:'Сервер заполнен'});ws.close(1013,'Server full');return;}
  const client={id:randomUUID(),joined:false,messages:0,window:Date.now(),lastSeen:Date.now(),connectedAt:Date.now(),lastInput:0};clients.set(ws,client);
  send(ws,{type:'hello',protocol:PROTOCOL_VERSION,map:simulation.map.name,mapId:simulation.map.id,difficulty:simulation.difficulty});
  ws.on('message',(raw)=>{
    const now=Date.now();client.lastSeen=now;if(now-client.window>1000){client.window=now;client.messages=0;}
    if(++client.messages>100){ws.close(1008,'Rate limit');return;}
    let message;try{message=JSON.parse(raw.toString());}catch{return;}
    if(!message||typeof message!=='object')return;
    if(message.type==='join'&&!client.joined){
      if(message.protocol!==PROTOCOL_VERSION||(message.layout??'')!==MAP_LAYOUT_REVISION){send(ws,{type:'error',message:'Версии игры или карты различаются. Обновите страницу и подключитесь снова.'});ws.close(1008,'Game version mismatch');return;}
      client.name=typeof message.name==='string'?message.name:'Боец';client.classId=typeof message.classId==='string'?message.classId:'assault';client.weaponId=typeof message.weaponId==='string'?message.weaponId:'';
      const player=simulation.addPlayer(client.id,client.name,undefined,client.classId,client.weaponId,message.sidearmId);client.joined=true;client.team=player.team;client.weaponId=player.primaryWeaponId;client.sidearmId=player.sidearmId;
      send(ws,{type:'welcome',protocol:PROTOCOL_VERSION,layout:MAP_LAYOUT_REVISION,id:client.id,team:player.team,difficulty:simulation.difficulty});send(ws,{type:'snapshot',state:simulation.snapshot()});
    }else if(message.type==='input'&&client.joined){client.lastInput=now;const input=sanitizeInput(message.input);client.interact||=input.interact;client.switchSeat||=input.switchSeat;client.lastControls=input;}
    else if(message.type==='respawn'&&client.joined){
      const validPoint=sanitizeSpawnPoint(simulation.map,message.pointId);
      if(simulation.respawn(client.id,message.classId,validPoint,message.weaponId,message.sidearmId)){
        const spawned=simulation.players.get(client.id);
        client.classId=spawned.classId;client.weaponId=spawned.primaryWeaponId;client.sidearmId=spawned.sidearmId;
        client.lastControls={yaw:spawned.yaw,pitch:spawned.pitch};client.interact=false;client.switchSeat=false;
        const packet={type:'snapshot',state:simulation.snapshot()};
        for(const [sock,c] of clients)if(c.joined)send(sock,packet);
      }
    }
    else if(message.type==='ping'){send(ws,{type:'pong',time:message.time});}
  });
  ws.on('close',()=>{simulation.removePlayer(client.id);clients.delete(ws);});
  ws.on('error',()=>{});
});

let previous=performance.now(),broadcastClock=0;
const loop=setInterval(()=>{
  const now=performance.now(),dt=Math.min(.1,(now-previous)/1000);previous=now;
  for(const c of clients.values()){
    if(!c.joined)continue;
    const controls=c.lastControls??simulation.players.get(c.id)?.input;
    if(!controls)continue;
    simulation.setInput(c.id,Date.now()-c.lastInput>350
      ?{yaw:controls.yaw,pitch:controls.pitch}
      :{...controls,interact:c.interact,switchSeat:c.switchSeat});
    c.interact=false;c.switchSeat=false;
  }
  simulation.step(dt);broadcastClock+=dt;
  if(broadcastClock>=1/20){broadcastClock%=1/20;const packet={type:'snapshot',state:simulation.snapshot()};for(const [ws,c]of clients)if(c.joined)send(ws,packet);}
  if(simulation.winner!==null){if(!roundResetAt)roundResetAt=now+12000;if(now>=roundResetAt){simulation=new Simulation({bots:botCount,difficulty,mapId});for(const [ws,c]of clients)if(c.joined){const p=simulation.addPlayer(c.id,c.name,c.team,c.classId,c.weaponId,c.sidearmId);c.lastControls={yaw:p.yaw,pitch:p.pitch};c.lastInput=0;send(ws,{type:'roundReset'});}roundResetAt=0;}}
  for(const [ws,c]of clients)if(Date.now()-c.lastSeen>120000||(!c.joined&&Date.now()-c.connectedAt>10000))ws.close(1001,'Connection timed out');
},1000/60);
server.listen(port,'0.0.0.0',()=>console.log(`RUBEZH server: http://localhost:${server.address().port} — WebSocket ws://localhost:${server.address().port} — ${botCount} bots`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{clearInterval(loop);for(const ws of clients.keys())ws.close(1001,'Server shutting down');wss.close();server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),3000).unref();});
