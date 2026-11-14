import {validatedRewind} from '../shared/pose-history.js';
import { PerformanceSamples } from '../shared/performance-samples.js';
import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { Simulation, sanitizeInput, sanitizeSpawnPoint } from '../shared/simulation.js';
import { MAPS, MAP_LAYOUT_REVISION, PROTOCOL_VERSION, getMap, getPrimaryWeapon, getSidearm, CLASSES, DIFFICULTIES } from '../shared/world.js';
import { MESSAGE, SnapshotEncoder, prepareSnapshot, decodeInput, encodeEvents, encodeControl, decodeControl } from '../shared/snapshot-codec.js';
import { Reader, Writer } from '../shared/binary.js';

const bounded=(value,min,max,fallback)=>Number.isFinite(Number(value))?Math.max(min,Math.min(max,Number(value))):fallback;
const clean=(s,fallback,max=40)=>String(s??fallback).replace(/[<>\x00-\x1f\x7f]/g,'').trim().slice(0,max)||fallback;
const pulses=['fire','interact','switchSeat','horn','order','grenade','reload','gadget','secondaryGadget'];
const token=()=>randomBytes(24).toString('base64url');
const wireBytes=length=>length+(length<126?2:length<65536?4:10);

// One process, one in-memory room. Importing this module never opens a port.
export function createGameServer(options={}){
  const env={...process.env,...options};
  const config={port:bounded(env.PORT,0,65535,8080),tickHz:bounded(env.TICK_HZ,30,60,60),snapshotHz:bounded(env.SNAPSHOT_HZ,10,30,30),
    maxPlayers:Math.floor(bounded(env.MAX_PLAYERS,2,7,7)),maxBots:Math.floor(bounded(env.MAX_BOTS,0,30,30)),defaultBots:Math.floor(bounded(env.BOTS,0,30,8)),
    reconnectMs:bounded(env.RECONNECT_SECONDS,5,120,30)*1000,emptyMs:bounded(env.EMPTY_ROOM_SECONDS,10,300,60)*1000};
  const tickSamples=new PerformanceSamples(600),loopSamples=new PerformanceSamples(600);
  const origins=new Set(String(env.ALLOWED_ORIGINS??'').split(',').map(x=>x.trim()).filter(Boolean));
  const clients=new Set(),sessions=new Map();let room=null,nextPlayer=0,timer=null,maintenance=null,previous=0,accumulator=0,snapshotClock=0,tick=0,stopping=false;
  const totals={bytes:0,messages:0,snapshots:0,snapshotBytes:0,ticks:0,tickMs:0,tickMaxMs:0,skippedSnapshots:0,overruns:0,droppedSeconds:0};
  let intervalStart=performance.now(),intervalBytes=0,intervalMessages=0,intervalTicks=0,intervalTickMs=0,intervalMax=0,lastCpu=process.cpuUsage(),lastMetrics={};
  let effectiveSnapshotHz=config.snapshotHz;
  const stats=()=>({snapshotHz:effectiveSnapshotHz,uptimeSeconds:Math.round(process.uptime()),room:room?{name:room.name,phase:room.phase,players:connected().length,bots:room.bots,mapId:room.mapId}:null,
    ...lastMetrics,tickMs:tickSamples.summary(),loopDelayMs:loopSamples.summary(),totalBytes:totals.bytes,totalMessages:totals.messages,averageSnapshotBytes:totals.snapshots?Math.round(totals.snapshotBytes/totals.snapshots):0,
    tickLifetimeAverageMs:totals.ticks?+(totals.tickMs/totals.ticks).toFixed(3):0,tickLifetimeMaximumMs:+totals.tickMaxMs.toFixed(3),simulatedTicks:totals.ticks,
    skippedSnapshots:totals.skippedSnapshots,overruns:totals.overruns,droppedSimulationSeconds:+totals.droppedSeconds.toFixed(3),config,
    players:[...sessions.values()].map(s=>({id:s.id,connected:!!s.client,inputQueue:s.inputQueue.length,inputReceived:s.inputReceived??0,inputAck:s.inputAck??0,bytesPerSecond:s.bps??0,totalBytes:s.bytes,averageSnapshotBytes:s.snapshotCount?Math.round(s.snapshotBytes/s.snapshotCount):0}))});
  const server=http.createServer((req,res)=>{
    if(req.url==='/health'){res.writeHead(stopping?503:200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({ok:!stopping,protocol:PROTOCOL_VERSION,room:room?.phase??'empty'}));return;}
    if(req.url==='/metrics'){
      const expected=env.METRICS_TOKEN,received=(req.headers.authorization??'').replace(/^Bearer /,'');
      const local=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
      const expectedBytes=Buffer.from(expected??''),receivedBytes=Buffer.from(received);
      const authorized=expected?receivedBytes.length===expectedBytes.length&&timingSafeEqual(receivedBytes,expectedBytes):local;
      if(!authorized){res.writeHead(403);res.end('Forbidden');return;}
      res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(stats()));return;
    }
    res.writeHead(404,{'Content-Type':'text/plain'});res.end('SECTOR 09 game server. WebSocket: /ws');
  });
  const wss=new WebSocketServer({noServer:true,maxPayload:8192,perMessageDeflate:false});
  server.on('upgrade',(req,socket,head)=>{
    if(stopping||req.url!=='/ws'||clients.size>=24||(origins.size&&!origins.has(req.headers.origin))){socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');socket.destroy();return;}
    socket.setNoDelay(true);wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
  });
  function connected(){return [...sessions.values()].filter(s=>s.client);}
  function send(c,data,kind='control'){
    const ws=c.ws;if(ws.readyState!==WebSocket.OPEN)return false;
    if(kind==='snapshot'&&ws.bufferedAmount>8192){totals.skippedSnapshots++;return false;}
    if(ws.bufferedAmount>262144){ws.close(1013,'Slow connection; reconnect');return false;}
    const packet=typeof data==='object'&&!(data instanceof Uint8Array)?encodeControl(data):data;
    const length=typeof packet==='string'?Buffer.byteLength(packet):packet.byteLength,bytes=wireBytes(length);
    ws.send(packet,{binary:typeof packet!=='string'});totals.bytes+=bytes;totals.messages++;intervalBytes+=bytes;intervalMessages++;
    if(c.session){c.session.bytes+=bytes;c.session.intervalBytes+=bytes;if(kind==='snapshot'){c.session.snapshotBytes+=length;c.session.snapshotCount++;}}
    if(kind==='snapshot'){totals.snapshots++;totals.snapshotBytes+=length;}return true;
  }
  function error(c,message,requestId,code='request'){send(c,{type:'error',message,requestId,code});}
  function listing(){return room?[{id:room.id,name:room.name,mapId:room.mapId,map:getMap(room.mapId).name,mode:room.mode,difficulty:room.difficulty,ownerId:room.ownerId,maxPlayers:room.maxPlayers,players:connected().length,reserved:sessions.size,bots:room.bots,status:room.phase==='lobby'?'Ожидание игроков':room.sim?.winner!==null?'Матч завершён':'В бою'}]:[];}
  function roomsChanged(){const data={type:'rooms',rooms:listing()};for(const c of clients)send(c,data);}
  function lobby(){
    if(!room)return;const map=getMap(room.mapId),players=[...sessions.values()].map(s=>({id:s.id,name:s.name,team:s.team,classId:s.classId,weaponId:s.weaponId,primaryWeaponId:s.weaponId,sidearmId:s.sidearmId,alive:false,hp:100,bot:false,connected:!!s.client,kills:0,deaths:0,score:0}));
    for(let i=0;i<room.bots;i++)players.push({id:'preview-'+i,name:'AI',team:i%2,classId:'assault',bot:true,alive:false,hp:100});
    return {time:0,mapId:map.id,lobby:true,ownerId:room.ownerId,roomName:room.name,botCount:room.bots,difficulty:room.difficulty,players,points:map.points.map(p=>({...p,owner:-1,progress:0})),tickets:[600,600],vehicles:[],events:[],deployables:[],grenades:[],rockets:[],winner:null};
  }
  function lobbyChanged(){if(room?.phase==='lobby'){const data={type:'lobby',state:lobby()};for(const s of connected())send(s.client,data);}roomsChanged();}
  function loadout(s,data){const cls=Object.hasOwn(CLASSES,data.classId)?data.classId:s.classId??'assault';s.classId=cls;s.weaponId=getPrimaryWeapon(cls,data.weaponId??s.weaponId).id;s.sidearmId=getSidearm(data.sidearmId??s.sidearmId).id;if(data.team===0||data.team===1)s.team=data.team;}
  function settings(data){
    if(Object.hasOwn(MAPS,data.mapId))room.mapId=data.mapId;
    if(Object.hasOwn(DIFFICULTIES,data.difficulty))room.difficulty=data.difficulty;
    if(data.bots!==undefined)room.bots=Math.floor(bounded(data.bots,0,config.maxBots,8));
    if(data.maxPlayers!==undefined)room.maxPlayers=Math.max(sessions.size,Math.floor(bounded(data.maxPlayers,2,config.maxPlayers,7)));
  }
  function identity(c,requestId){const s=c.session;send(c,{type:'welcome',requestId,protocol:PROTOCOL_VERSION,layout:MAP_LAYOUT_REVISION,id:s.id,token:s.token,team:s.team,roomName:room.name,roomId:room.id,ownerId:room.ownerId,phase:room.phase});}
  function initialize(s){
    const sim=room.sim;s.encoder=new SnapshotEncoder(sim.map.size);s.eventAck=sim.eventId;s.eventSent=sim.eventId;s.eventLastSent=0;s.inputQueue=[];s.inputReceived=0;s.inputAck=0;s.credit=0;s.heldInput=null;s.finishedSequence=0;s.lastInput=Date.now();
    const p=sim.players.get(s.id);if(p){p.networkControlled=true;p.networkFrames=[];p.networkIdle=true;p.inputAck=0;sim.setInput(s.id,{yaw:p.yaw,pitch:p.pitch});}
    send(s.client,{type:'init',protocol:PROTOCOL_VERSION,layout:MAP_LAYOUT_REVISION,mapId:sim.map.id,size:sim.map.size,difficulty:room.difficulty,roomName:room.name,ownerId:room.ownerId,epoch:room.epoch,eventAck:sim.eventId,inputHz:60,snapshotHz:config.snapshotHz});
    snapshot(s,preparedSnapshot(),true);
  }
  function join(c,data,requestId,resume=false){
    if(c.session)throw Error('Вы уже в комнате.');if(!room)throw Error('Комната уже закрыта. Создайте новую.');
    let s;if(resume){s=[...sessions.values()].find(x=>x.token===data.token);if(!s)throw Error('Время переподключения истекло. Войдите в комнату заново.');if(s.client)throw Error('Этот игрок уже подключён.');}
    else{
      if(data.roomId&&data.roomId!==room.id)throw Error('Комната уже закрыта.');
      if(sessions.size>=room.maxPlayers)throw Error('Комната заполнена. Место отключившегося игрока временно зарезервировано.');
      const counts=[0,0];for(const q of sessions.values())counts[q.team]++;
      s={id:'p'+(++nextPlayer),token:token(),name:clean(data.name,'Боец',20),team:counts[0]<=counts[1]?0:1,bytes:0,intervalBytes:0,snapshotBytes:0,snapshotCount:0,inputQueue:[]};loadout(s,data);sessions.set(s.id,s);
      if(!room.ownerId)room.ownerId=s.id;
      if(room.sim)room.sim.addPlayer(s.id,s.name,s.team,s.classId,s.weaponId,s.sidearmId);
    }
    s.client=c;s.detachedAt=0;c.session=s;room.emptyAt=0;identity(c,requestId);
    if(room.phase==='match'){initialize(s);startLoop();}lobbyChanged();
  }
  function remove(s){
    if(room?.sim)room.sim.removePlayer(s.id);sessions.delete(s.id);if(s.client){s.client.session=null;s.client=null;}
    if(room?.ownerId===s.id)room.ownerId=connected()[0]?.id??sessions.keys().next().value??null;
  }
  function detach(c,explicit=false){
    const s=c.session;if(!s)return;c.session=null;s.client=null;s.detachedAt=Date.now();s.inputQueue=[];
    if(room?.sim){const p=room.sim.players.get(s.id);if(p){p.networkIdle=true;p.networkFrames=null;room.sim.setInput(s.id,{yaw:p.yaw,pitch:p.pitch});}}
    if(explicit)remove(s);
    if(room){if(room.ownerId===s.id)room.ownerId=connected()[0]?.id??s.id;if(!connected().length){room.emptyAt=Date.now();stopLoop();}lobbyChanged();}
  }
  function startMatch(){
    stopLoop();const sim=new Simulation({bots:room.bots,difficulty:room.difficulty,mapId:room.mapId,lagCompensation:env.LAG_COMPENSATION!=='0'});
    sim.pathRequestsPerTick=1;sim.pathExpansionLimit=2200;sim.pathBudgetMs=1.5;
    room.sim=sim;room.phase='match';room.epoch++;room.events=[];room.lastEvent=0;room.eventFloor=0;room.prepared=null;
    for(const s of sessions.values())sim.addPlayer(s.id,s.name,s.team,s.classId,s.weaponId,s.sidearmId);
    for(const s of connected())initialize(s);roomsChanged();startLoop();
  }
  function acknowledge(s,snapshotAck,eventAck,dictAck){s.encoder?.confirm(snapshotAck,dictAck);s.eventAck=Math.max(s.eventAck??0,Math.min(eventAck,s.eventSent??0));}
  function binary(c,raw){
    const s=c.session,r=new Reader(raw),type=r.u8();
    if(type===MESSAGE.PING){const stamp=r.f64();r.done();const w=new Writer(9);w.u8(MESSAGE.PONG);w.f64(stamp);send(c,w.finish());return;}
    if(!s||room?.phase!=='match')return;
    if(type===MESSAGE.INPUT){
      const packet=decodeInput(raw);if(packet.epoch!==room.epoch)return;acknowledge(s,packet.snapshotAck,packet.eventAck,packet.dictAck);if(room.ended)return;
      for(const frame of packet.frames){
        if(frame.sequence<=s.inputReceived)continue;
        if(frame.sequence>s.inputReceived+512||frame.dt<.001||frame.dt>.05||s.inputQueue.length>=120)throw Error('Input queue invalid');
        frame.rewindSeconds=validatedRewind(room.sim.time,s.encoder.history.get(packet.snapshotAck),packet.viewTime);
        frame.input=sanitizeInput(frame.input);s.inputReceived=frame.sequence;s.inputQueue.push(frame);
      }s.lastInput=Date.now();
    }else if(type===MESSAGE.ACK){if(r.u32()!==room.epoch)return;acknowledge(s,r.u32(),r.u32(),r.u16());r.done();}
    else if(type===MESSAGE.RESYNC){r.done();s.encoder.ack=0;s.inputQueue=[];s.credit=0;s.heldInput=null;room.sim.setInput(s.id,{});snapshot(s,preparedSnapshot(),true);}
    else throw Error('Unknown packet');
  }
  function preparedSnapshot(){const sim=room.sim;return room.prepared=prepareSnapshot(sim.snapshot(),sim.map.size,room.prepared);}
  function snapshot(s,prepared,full=false){
    if(!s.client||s.client.ws.bufferedAmount>8192){totals.skippedSnapshots++;return;}
    // Session ACK also advances while seated; movement-only player ACKs do not.
    const p=room.sim.players.get(s.id),packet=s.encoder.encode(prepared,{localId:s.id,inputAck:s.inputAck,tick,full,focus:p?.input?{aim:p.input.aim,classId:p.classId}:{}});
    if(send(s.client,packet.bytes,'snapshot')&&room.sim.winner!==null)s.finishedSequence=packet.sequence;
  }
  function visibleEvent(e,s){
    if(e.type==='score')return e.playerId===s.id;
    if(e.type==='damage')return e.playerId===s.id||e.attackerId===s.id;
    if(!['shot','bulletImpact','dryFire','reload','grenade','horn','explosion'].includes(e.type)||e.playerId===s.id)return true;
    const p=room.sim.players.get(s.id);return !p||!p.alive||Math.hypot((e.x??p.x)-p.x,(e.z??p.z)-p.z)<(p.input.aim&&p.classId==='recon'?450:220);
  }
  function events(s,now){
    const last=room.lastEvent;if(last<=s.eventAck)return;
    if(last===s.eventSent&&now-s.eventLastSent<500)return;
    if(s.client.ws.bufferedAmount>8192)return; // Keep critical events in the log until acknowledged.
    if(s.eventAck<room.eventFloor){s.client.ws.close(1013,'Event baseline expired; reconnect');return;}
    // WebSocket is ordered and reliable; do not resend in-flight events on each new shot.
    const cursor=s.eventSent??s.eventAck;
    if(last<=cursor)return;
    const batch=room.events.filter(e=>e.id>cursor).slice(0,128),through=batch.at(-1)?.id??last;
    if(send(s.client,encodeEvents(batch.filter(e=>visibleEvent(e,s)&&(!['shot','bulletImpact','dryFire','horn'].includes(e.type)||room.sim.time-e.time<.5)),through,s.encoder.dict),'event')){s.eventSent=through;s.eventLastSent=now;}
  }
  function simulationTick(dt){
    const begin=performance.now(),sim=room.sim,now=Date.now();
    for(const s of sessions.values()){
      const p=sim.players.get(s.id);if(!p)continue;s.credit=Math.min(.1,(s.credit??0)+dt);const frames=[];let controls=null;
      const maximumFrames=Math.ceil(dt*60)+(s.inputQueue.length>4?1:0);
      while(frames.length<maximumFrames&&s.inputQueue.length&&s.inputQueue[0].dt<=s.credit+1e-6){
        const f=s.inputQueue.shift();s.credit-=f.dt;frames.push(f);
        if(!controls)controls={...f.input};else{const prior=controls;controls={...f.input};for(const action of pulses)if(prior[action])controls[action]=true;}
        s.inputAck=f.sequence;s.heldInput=f.input;
      }
      p.shotRewind=frames.at(-1)?.rewindSeconds??p.shotRewind??0;
      p.networkControlled=true;p.networkIdle=!s.client||now-s.lastInput>350;
      p.networkFrames=frames.length?frames:null;
      const orderFrame=frames.find(f=>f.input.order);
      p.orderAim=orderFrame?{yaw:orderFrame.input.yaw,pitch:orderFrame.input.pitch}:null;
      if(controls)sim.setInput(s.id,controls);
      else if(p.networkIdle)sim.setInput(s.id,{yaw:p.yaw,pitch:p.pitch});
      // Pulse actions must not repeat during a tick without a fresh command.
      else{for(const action of pulses)if(action!=='fire')p.input[action]=false;p.input.fire=s.heldInput?.fire??false;}
      if(!p.alive){p.inputAck=s.inputAck;p.networkFrames=null;}
    }
    sim.step(dt);tick++;snapshotClock+=dt;
    for(const e of sim.events)if(e.id>room.lastEvent){room.events.push(e);room.lastEvent=e.id;}
    while(room.events.length>4096||(room.events.length&&sim.time-room.events[0].time>12))room.eventFloor=room.events.shift().id;
    for(const s of connected())events(s,now);
    if(snapshotClock>=1/effectiveSnapshotHz){snapshotClock%=1/effectiveSnapshotHz;const prepared=preparedSnapshot();for(const s of connected())snapshot(s,prepared);}
    if(sim.winner!==null&&!room.ended){room.ended=true;const final=preparedSnapshot();for(const s of connected())snapshot(s,final);roomsChanged();}
    const elapsed=performance.now()-begin;tickSamples.add(elapsed);totals.ticks++;totals.tickMs+=elapsed;totals.tickMaxMs=Math.max(totals.tickMaxMs,elapsed);intervalTicks++;intervalTickMs+=elapsed;intervalMax=Math.max(intervalMax,elapsed);
  }
  function pump(){
    if(!room?.sim||!connected().length||room.ended)return stopLoop();
    const now=performance.now(),elapsed=(now-previous)/1000;loopSamples.add(Math.max(0,elapsed*1000-1000/config.tickHz));totals.droppedSeconds+=Math.max(0,elapsed-.25);accumulator+=Math.min(.25,elapsed);previous=now;
    // Bound catch-up work while keeping every physics step fixed.
    const step=1/config.tickHz;let count=0;
    while(accumulator>=step&&count++<3){simulationTick(step);accumulator-=step;if(room.ended)return stopLoop();}
    if(accumulator>=step){totals.overruns++;// Never change the physics step under load; discard only whole overdue ticks.
      const dropped=Math.floor(accumulator/step)*step;totals.droppedSeconds+=dropped;accumulator-=dropped;}
    timer=setTimeout(pump,Math.max(1,(step-accumulator)*1000));
  }
  function startLoop(){if(timer||!room?.sim||!connected().length)return;previous=performance.now();accumulator=0;snapshotClock=0;timer=setTimeout(pump,1000/config.tickHz);}
  function stopLoop(){clearTimeout(timer);timer=null;accumulator=0;}
  wss.on('connection',ws=>{
    const c={ws,session:null,lastSeen:Date.now(),messages:0,window:Date.now(),alive:true};clients.add(c);
    send(c,{type:'hello',protocol:PROTOCOL_VERSION,layout:MAP_LAYOUT_REVISION,maxPlayers:config.maxPlayers,maxBots:config.maxBots,defaultBots:Math.min(config.defaultBots,config.maxBots)});send(c,{type:'rooms',rooms:listing()});
    ws.on('pong',()=>{c.alive=true;c.lastSeen=Date.now();});
    ws.on('message',(raw,isBinary)=>{
      const now=Date.now();c.lastSeen=now;if(now-c.window>1000){c.window=now;c.messages=0;}if(++c.messages>160){ws.close(1008,'Rate limit');return;}
      let requestId;try{
        if(isBinary){binary(c,raw);return;}
        const data=decodeControl(raw.toString());requestId=data.requestId;if(!data||typeof data!=='object')return;
        if(data.protocol!==PROTOCOL_VERSION||data.layout!==MAP_LAYOUT_REVISION){error(c,'Версии клиента, сервера или карт различаются. Обновите игру.',requestId,'version');return;}
        const s=c.session;
        switch(data.type){
          case 'list':send(c,{type:'rooms',requestId,rooms:listing()});break;
          case 'create':
            if(data.gameMode&&data.gameMode!=='conquest')throw Error('Доступен режим «Захват территории».');
            if(room){error(c,'На сервере уже есть комната. Присоединитесь к ней в браузере комнат.',requestId,'room_exists');send(c,{type:'rooms',rooms:listing()});break;}
            room={id:token(),name:clean(data.roomName,'Операция «Рубеж»'),mapId:getMap(data.mapId).id,mode:'conquest',bots:Math.min(config.defaultBots,config.maxBots),maxPlayers:config.maxPlayers,difficulty:'regular',phase:'lobby',ownerId:null,sim:null,epoch:0,emptyAt:0};settings(data);join(c,data,requestId);break;
          case 'join':join(c,data,requestId);break;
          case 'resume':join(c,data,requestId,true);break;
          case 'leave':detach(c,true);send(c,{type:'left',requestId});break;
          case 'loadout':
            if(!s||room?.phase!=='lobby')throw Error('Выбор стороны доступен в лобби.');
            if(data.team!==undefined&&data.team!==0&&data.team!==1)throw Error('Неизвестная сторона.');
            loadout(s,data);lobbyChanged();
            if(requestId!==undefined)send(c,{type:'loadout',requestId,team:s.team});
            break;
          case 'squad':
            if(!s||room?.phase!=='match'||!room.sim.changeSquad(s.id,data.squadId))throw Error('Отряд заполнен или недоступен. Выберите свободное место.');
            send(c,{type:'squad',requestId,squadId:room.sim.players.get(s.id).squadId});break;
          case 'settings':if(!s||s.id!==room.ownerId||room.phase!=='lobby')throw Error('Настройки доступны создателю в лобби.');settings(data);lobbyChanged();break;
          case 'start':if(!s||s.id!==room.ownerId)throw Error('Матч запускает создатель комнаты.');if(room.phase==='match'&&room.sim.winner===null)throw Error('Матч уже идёт.');settings(data);room.ended=false;startMatch();break;
          case 'respawn':if(s&&room.sim){const point=sanitizeSpawnPoint(room.sim.map,data.pointId);room.sim.respawn(s.id,data.classId,point,data.weaponId,data.sidearmId);const p=room.sim.players.get(s.id);s.classId=p.classId;s.weaponId=p.primaryWeaponId;s.sidearmId=p.sidearmId;}break;
          case 'stats':if(s&&now-(c.statsAt??0)>2000){c.statsAt=now;send(c,{type:'stats',stats:stats()});}break;
          default:throw Error('Неизвестная команда.');
        }
      }catch(e){if(isBinary){ws.close(1008,'Malformed binary packet');}else error(c,e.message,requestId);}
    });
    ws.on('close',()=>{detach(c);clients.delete(c);});ws.on('error',()=>{});
  });
  maintenance=setInterval(()=>{
    const now=Date.now();
    for(const c of clients){if(c.ws.bufferedAmount>65536){c.congestedAt??=now;if(now-c.congestedAt>5000||c.ws.bufferedAmount>262144)c.ws.terminate();}else c.congestedAt=0;}
    for(const c of clients)if(now-c.lastSeen>30000){if(!c.alive){c.ws.terminate();continue;}c.alive=false;c.ws.ping();totals.bytes+=2;totals.messages++;intervalBytes+=2;intervalMessages++;if(c.session){c.session.bytes+=2;c.session.intervalBytes+=2;}}
    if(room?.ended)for(const s of connected()){events(s,now);if(!s.finishedSequence||s.encoder.ack<s.finishedSequence)snapshot(s,room.prepared);}
    let expired=false;for(const s of sessions.values())if(!s.client&&now-s.detachedAt>config.reconnectMs){remove(s);expired=true;}if(expired)lobbyChanged();
    if(room&&connected().length===0&&room.emptyAt&&now-room.emptyAt>config.emptyMs){stopLoop();sessions.clear();room=null;roomsChanged();}
    if(performance.now()-intervalStart>=5000){
      const elapsed=(performance.now()-intervalStart)/1000,cpu=process.cpuUsage(lastCpu);lastCpu=process.cpuUsage();
      lastMetrics={bytesPerSecond:Math.round(intervalBytes/elapsed),messagesPerSecond:+(intervalMessages/elapsed).toFixed(1),tickAverageMs:intervalTicks?+(intervalTickMs/intervalTicks).toFixed(3):0,tickMaximumMs:+intervalMax.toFixed(3),cpuCorePercent:+((cpu.user+cpu.system)/1e6/elapsed*100).toFixed(1),rssBytes:process.memoryUsage().rss};
      for(const s of sessions.values()){s.bps=Math.round(s.intervalBytes/elapsed);s.intervalBytes=0;}
      intervalStart=performance.now();intervalBytes=intervalMessages=intervalTicks=intervalTickMs=intervalMax=0;
      if(config.snapshotHz>20){if(lastMetrics.tickAverageMs>4)effectiveSnapshotHz=20;else if(lastMetrics.tickAverageMs<3)effectiveSnapshotHz=config.snapshotHz;}
      if(env.LOG_METRICS==='1'&&room?.sim)console.log(JSON.stringify({type:'metrics',...lastMetrics}));
    }
  },1000);maintenance.unref();
  return {server,config,stats,get room(){return room;},
    listen:()=>new Promise(resolve=>server.listen(config.port,'0.0.0.0',()=>resolve(server.address()))),
    close:async()=>{stopping=true;stopLoop();clearInterval(maintenance);for(const c of clients)c.ws.terminate();await new Promise(resolve=>wss.close(resolve));if(server.listening)await new Promise(resolve=>server.close(resolve));}
  };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const app=createGameServer();app.listen().then(address=>console.log(`SECTOR 09 authoritative server listening on 0.0.0.0:${address.port}; ${app.config.tickHz}Hz simulation / ${app.config.snapshotHz}Hz snapshots`));
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{app.close().then(()=>process.exit(0));setTimeout(()=>process.exit(1),5000).unref();});
}
