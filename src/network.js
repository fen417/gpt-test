import { sanitizeInput, createPredictionWorld } from '../shared/simulation.js';
import { EYE_HEIGHT } from '../shared/world.js';
import { getVehicleSeatPose } from '../shared/vehicles.js';
import { PROTOCOL_VERSION, MAP_LAYOUT_REVISION } from '../shared/world.js';
import { MESSAGE, INPUT_STEP, SnapshotDecoder, decodeEvents, encodeInput, decodeInput, encodeAck, encodeControl, decodeControl } from '../shared/snapshot-codec.js';
import { Reader, Writer } from '../shared/binary.js';

export { sanitizeInput };
const noop=()=>{},clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const difference=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
const pulses=['jump','reload','gadget','secondaryGadget','grenade','interact','switchSeat','horn','orderAttack','orderDefend','orderFollow'];
const safeStorage={get(key){try{return sessionStorage.getItem(key);}catch{return null;}},set(key,value){try{value?sessionStorage.setItem(key,value):sessionStorage.removeItem(key);}catch{}}};
export function normalizeServerUrl(value){
  const url=new URL(String(value).trim());if(!['ws:','wss:'].includes(url.protocol)||url.username||url.password)throw Error('Укажите публичный WSS-адрес игрового сервера.');
  if(globalThis.location?.protocol==='https:'&&url.protocol!=='wss:')throw Error('Для GitHub Pages нужен защищённый адрес wss://.');
  if(!url.pathname||url.pathname==='/')url.pathname='/ws';url.hash='';return url.href;
}
export async function configuredServerUrl(){
  let value=import.meta.env?.VITE_SERVER_URL??'';
  if(!value){try{const response=await fetch(new URL((import.meta.env?.BASE_URL??'./')+'network-config.json',globalThis.location?.href??import.meta.url));if(response.ok)value=(await response.json()).serverUrl??'';}catch{}}
  try{value=localStorage.getItem('sector09-server-url')||value;}catch{}
  return value?normalizeServerUrl(value):'';
}

class Prediction{
  constructor(mapId){this.world=createPredictionWorld(mapId);this.reset();}
  reset(){this.player=null;this.pending=[];this.offset={x:0,y:0,z:0};}
  reconcile(authority,ack,vehicles){
    this.world.vehicles=vehicles.map(v=>({...v}));
    const old=this.player,visual=old?{x:old.x+this.offset.x,y:old.y+this.offset.y,z:old.z+this.offset.z}:null;
    const discontinuity=!old||old.alive!==authority.alive||old.vehicleId!==authority.vehicleId||Math.hypot(old.x-authority.x,old.z-authority.z)>4;
    this.pending=this.pending.filter(f=>f.sequence>ack);this.player={...authority,input:{}};
    for(const frame of this.pending)this.step(frame);
    if(visual&&!discontinuity&&!authority.vehicleId){this.offset.x=visual.x-this.player.x;this.offset.y=visual.y-this.player.y;this.offset.z=visual.z-this.player.z;}
    else this.offset.x=this.offset.y=this.offset.z=0;
  }
  step(frame){
    if(!this.player?.alive)return;
    this.player.input=frame.input;
    if(this.player.vehicleId){const vehicle=this.world.vehicles.find(v=>v.id===this.player.vehicleId);if(vehicle&&this.player.vehicleSeat===0){this.world.moveVehicle(vehicle,frame.input,frame.dt);this.world.syncVehicleSeat(this.player,vehicle);}}
    else{this.world.movePlayer(this.player,frame.input,frame.dt);this.player.crouch=this.player.crouching;this.player.sliding=this.player.slideTime>0;}
  }
  add(frame){this.pending.push(frame);this.step(frame);}
  sample(dt){if(!this.player)return null;const decay=Math.exp(-dt*18);this.offset.x*=decay;this.offset.y*=decay;this.offset.z*=decay;return {...this.player,x:this.player.x+this.offset.x,y:this.player.y+this.offset.y,z:this.player.z+this.offset.z};}
}

// The room creator uses exactly the same connection and prediction as every guest.
export class Multiplayer{
  constructor({onState=noop,onIdentity=noop,onStatus=noop,onError=noop,onRooms=noop}={}){
    Object.assign(this,{onState,onIdentity,onStatus,onError,onRooms});this._mode='offline';this._phase='menu';this.requests=new Map();this.generation=0;this.requestId=0;this.frames=[];this.events=[];this.rooms=[];this.rtt=0;this.jitter=0;this.interpolationMs=100;this.receivedBytes=0;
  }
  get mode(){return this._mode;}get phase(){return this._phase;}get canResume(){return !!(this.token||safeStorage.get('sector-resume:'+this.url));}get roomNameLabel(){return this.roomName??'';}
  async browse(url){await this.open(url);await this.request('list');return this.rooms;}
  async open(url){
    url=normalizeServerUrl(url||this.url||await configuredServerUrl());
    if(this.ws?.readyState===WebSocket.OPEN&&this.url===url)return;
    if(this.connecting&&this.url===url)return this.connecting;
    this.close(false);this.url=url;this.manual=false;this._mode='server';const generation=this.generation;
    this.connecting=this.connectSocket(generation).finally(()=>{this.connecting=null;});return this.connecting;
  }
  connectSocket(generation){
    return new Promise((resolve,reject)=>{
      const ws=new WebSocket(this.url);ws.binaryType='arraybuffer';this.ws=ws;let ready=false;
      const timeout=setTimeout(()=>{reject(Error('Сервер не отвечает. Проверьте его адрес или доступность.'));ws.close();},12000);
      ws.onmessage=event=>{
        if(generation!==this.generation)return;
        try{
          this.receivedBytes+=typeof event.data==='string'?new TextEncoder().encode(event.data).length:event.data.byteLength;
          if(typeof event.data!=='string'){this.binary(event.data);return;}
          const data=decodeControl(event.data);
          if(data.type==='hello'){
            if(data.protocol!==PROTOCOL_VERSION||data.layout!==MAP_LAYOUT_REVISION)throw Error('Версия сервера или карт отличается. Обновите клиент и сервер из одного коммита.');
            ready=true;clearTimeout(timeout);this.hello=data;resolve();this.startTimers();return;
          }
          if(data.type==='error'){
            const pending=this.requests.get(data.requestId);if(pending){clearTimeout(pending.timer);this.requests.delete(data.requestId);pending.reject(Error(data.message));}
            else this.onStatus(data.message);return;
          }
          if(data.type==='rooms'){this.rooms=data.rooms;const current=this.rooms.find(r=>r.id===this.roomId);if(current){this.ownerId=current.ownerId;if(this.context)this.context.ownerId=current.ownerId;if(this.state)this.state.ownerId=current.ownerId;}this.onRooms(this.rooms);}
          if(data.type==='welcome'){
            this.id=data.id;this.token=data.token;this.ownerId=data.ownerId;this.roomName=data.roomName;this.roomId=data.roomId;this._phase=data.phase;
            safeStorage.set('sector-resume:'+this.url,this.token);this.onIdentity(this.id);
          }
          if(data.type==='lobby'){this._phase='lobby';this.state=data.state;this.ownerId=data.state.ownerId;this.onState(data.state);}
          if(data.type==='init')this.initialize(data);
          if(data.type==='stats'){this.serverStats=data.stats;this.onStatus(`Сеть: ${Math.round(data.stats.bytesPerSecond??0)} Б/с · тик ${data.stats.tickAverageMs??0} мс`);}
          const pending=this.requests.get(data.requestId);if(pending){clearTimeout(pending.timer);this.requests.delete(data.requestId);pending.resolve(data);}
        }catch(error){clearTimeout(timeout);if(!ready){reject(error);ws.close();}else{this.onStatus('Синхронизация восстанавливается…');this.send(new Uint8Array([MESSAGE.RESYNC]));}}
      };
      ws.onerror=()=>{if(!ready){clearTimeout(timeout);reject(Error('Не удалось подключиться к серверу. Проверьте WSS-адрес и запуск сервиса.'));}};
      ws.onclose=()=>{
        clearTimeout(timeout);if(generation!==this.generation)return;clearInterval(this.pingTimer);clearInterval(this.flushTimer);
        for(const pending of this.requests.values()){clearTimeout(pending.timer);pending.reject(Error('Соединение прервано.'));}this.requests.clear();
        if(!ready)reject(Error('Сервер недоступен.'));
        if(this.manual)return;
        if(this.token&&this._phase!=='menu')this.reconnect(generation);
        else this.onStatus('Нет соединения с сервером. Откройте браузер комнат повторно.');
      };
    });
  }
  async reconnect(generation){
    if(this.reconnecting)return;this.reconnecting=true;this.onStatus('Связь потеряна. Переподключение…');const started=performance.now();
    while(!this.manual&&generation===this.generation&&performance.now()-started<28000){
      await new Promise(resolve=>setTimeout(resolve,1000));
      try{await this.connectSocket(generation);await this.request('resume',{token:this.token});this.reconnecting=false;this.onStatus('Соединение восстановлено');return;}catch{}
    }
    this.reconnecting=false;if(!this.manual&&generation===this.generation){this.token=null;safeStorage.set('sector-resume:'+this.url,null);this.onError('Время переподключения истекло. Войдите в комнату заново.');}
  }
  request(type,data={}){
    return new Promise((resolve,reject)=>{
      if(this.ws?.readyState!==WebSocket.OPEN){reject(Error('Нет соединения с сервером.'));return;}
      const requestId=++this.requestId,timer=setTimeout(()=>{this.requests.delete(requestId);reject(Error('Сервер не ответил на запрос.'));},12000);
      this.requests.set(requestId,{resolve,reject,timer});this.send({type,...data,requestId,protocol:PROTOCOL_VERSION,layout:MAP_LAYOUT_REVISION});
    });
  }
  control(type,data={}){const sent=this.send({type,...data,protocol:PROTOCOL_VERSION,layout:MAP_LAYOUT_REVISION});if(!sent)this.onStatus('Команда не отправлена: соединение восстанавливается.');return sent;}
  send(data){if(this.ws?.readyState!==WebSocket.OPEN)return false;if(this.ws.bufferedAmount>16384)return false;this.ws.send(data instanceof Uint8Array?data:encodeControl(data));return true;}
  async host(options={}){await this.open(options.url);await this.request('create',options);return this.roomName;}
  async join(options={}){
    await this.open(options.url);const saved=safeStorage.get('sector-resume:'+this.url);
    if(saved){try{await this.request('resume',{token:saved});return this.roomName;}catch{safeStorage.set('sector-resume:'+this.url,null);}}
    await this.request('join',options);return this.roomName;
  }
  setLobbyLoadout(data){this.control('loadout',data);}
  updateLobbySettings(data){this.control('settings',data);}
  startMatch(data={}){this.control('start',data);}
  respawn(classId,pointId,weaponId,sidearmId){return this.control('respawn',{classId,pointId,weaponId,sidearmId});}
  initialize(data){
    this.context={mapId:data.mapId,size:data.size,difficulty:data.difficulty,roomName:data.roomName,ownerId:data.ownerId,lobby:false};
    this.decoder=new SnapshotDecoder(this.context);this.prediction=new Prediction(data.mapId);this.frames=[];this.events=[];this.state=null;this.sequence=0;this.snapshotHz=data.snapshotHz;this.sentSequence=0;this.snapshotAck=0;this.eventAck=data.eventAck;this._phase='match';this.epoch=data.epoch;this.accumulator=0;this.motion=new Map();this.input={};this.pendingPulses={};this.pendingFire=false;this.lastArrival=0;this.lastSample=performance.now();this.onStatus('Подключено к серверному матчу');
  }
  acks(){return {epoch:this.epoch??0,snapshotAck:this.snapshotAck??0,eventAck:this.eventAck??0,dictAck:this.decoder?this.decoder.dict.strings.length-1:0};}
  binary(value){
    const bytes=new Uint8Array(value),now=performance.now();
    if(bytes[0]===MESSAGE.PONG){const r=new Reader(value);r.u8();const sample=now-r.f64();if(sample>=0&&sample<30000)this.rtt=this.rtt?this.rtt*.8+sample*.2:sample;return;}
    if(!this.decoder)return;
    if(bytes[0]===MESSAGE.SNAPSHOT){
      const result=this.decoder.decode(value);if(result.missingBase){this.send(new Uint8Array([MESSAGE.RESYNC]));return;}
      const {frame,state,inputAck,sequence}=result;
      if(sequence<=this.snapshotAck)return;this.snapshotAck=sequence;
      if(this.lastArrival){const interval=now-this.lastArrival,expected=1000/(this.snapshotHz??20);this.jitter=this.jitter*.9+Math.abs(interval-expected)*.1;}
      this.lastArrival=now;this.interpolationMs=clamp(85+this.jitter*2+this.rtt*.1,85,180);
      for(const kind of ['players','vehicles'])for(const p of state[kind]){
        const key=kind+'/'+p.id,track=this.motion.get(key)??{samples:[],period:.05};const last=track.samples.at(-1);
        if(!last||p.motionAt>last.time){if(last)track.period=clamp(p.motionAt-last.time,.04,.6);track.samples.push({time:p.motionAt,arrival:now,pose:p});if(track.samples.length>12)track.samples.shift();this.motion.set(key,track);}
      }
      const aliveKeys=new Set([...state.players.map(p=>'players/'+p.id),...state.vehicles.map(v=>'vehicles/'+v.id)]);for(const key of this.motion.keys())if(!aliveKeys.has(key))this.motion.delete(key);
      this.frames.push({frame,state,arrival:now});while(this.frames.length>40)this.frames.shift();
      if(state.winner!=null)this.prediction.pending=[];
      const own=state.players.find(p=>p.id===this.id);if(own)this.prediction.reconcile(own,inputAck,state.vehicles);
      this.state=state;this.publish();this.ackSoon();
    }else if(bytes[0]===MESSAGE.EVENTS){
      const decoded=decodeEvents(value,this.decoder.dict);for(const event of decoded.events)if(event.id>this.eventAck)this.events.push(event);
      this.eventAck=Math.max(this.eventAck,decoded.through);this.publish();this.ackSoon();
    }
  }
  publish(){if(!this.state)return;this.events=this.events.filter(e=>e.time>this.state.time-1.3);this.state.events=this.events;this.onState(this.state);}
  ackSoon(){this.ackDirty=true;}
  sendInput(input,dt=INPUT_STEP){this.advance(input,dt);}
  advance(input,dt){
    if(this._phase!=='match'||this.state?.winner!=null||!this.prediction||this.ws?.readyState!==WebSocket.OPEN)return;
    this.input=sanitizeInput(input);for(const key of pulses)if(input[key])this.pendingPulses[key]=true;
    if(input.fire)this.pendingFire=true;
    this.accumulator=Math.min(.1,(this.accumulator??0)+dt);let count=0;
    while(this.accumulator>=INPUT_STEP&&count++<6){
      if(this.prediction.pending.length>=120){this.ws.close(1013,'Prediction backlog');return;}
      const merged={...this.input,...this.pendingPulses,fire:this.input.fire||this.pendingFire};
      // Use exactly the quantized command the server receives, including angles.
      const packed=encodeInput([{sequence:++this.sequence,dt:INPUT_STEP,input:merged}],this.acks()),command=decodeInput(packed).frames[0];
      this.prediction.add(command);this.accumulator-=INPUT_STEP;this.pendingPulses={};this.pendingFire=false;
    }
  }
  flush(){
    if(this.ws?.readyState!==WebSocket.OPEN||!this.decoder)return;
    const pending=this.prediction.pending.filter(f=>f.sequence>this.sentSequence).slice(0,8);
    if(pending.length){if(this.send(encodeInput(pending,this.acks()))){this.sentSequence=pending.at(-1).sequence;this.ackDirty=false;}}
    else if(this.ackDirty){const a=this.acks();if(this.send(encodeAck(a.snapshotAck,a.eventAck,a.dictAck,a.epoch)))this.ackDirty=false;}
  }
  clearInput(angles={}){this.input=sanitizeInput(angles);this.pendingPulses={};this.pendingFire=false;}
  startTimers(){
    clearInterval(this.pingTimer);clearInterval(this.flushTimer);
    this.flushTimer=setInterval(()=>this.flush(),1000/30);
    this.pingTimer=setInterval(()=>{const w=new Writer(9);w.u8(MESSAGE.PING);w.f64(performance.now());this.send(w.finish());},5000);
  }
  sample(now=performance.now()){
    if(!this.state||!this.frames.length||this.state.winner!=null)return this.state;
    const latest=this.frames.at(-1),target=latest.frame.time+Math.min(.1,(now-latest.arrival)/1000)-this.interpolationMs/1000;
    let left=this.frames[0],right=latest;
    for(let i=1;i<this.frames.length;i++)if(this.frames[i].frame.time>=target){left=this.frames[i-1];right=this.frames[i];break;}else left=this.frames[i];
    const span=right.frame.time-left.frame.time,alpha=span>0?clamp((target-left.frame.time)/span,0,1):1;
    const a=left.state,b=right.state,render={...this.state,time:Math.max(0,target),events:this.events};
    for(const kind of ['players','vehicles','grenades','rockets']){
      const older=new Map(a[kind].map(p=>[p.id,p]));render[kind]=b[kind].map(p=>{
        const before=older.get(p.id);if(!before||before.alive!==p.alive||before.vehicleId!==p.vehicleId||Math.hypot(p.x-before.x,p.z-before.z)>8)return p;
        const out={...p};for(const key of ['x','y','z'])out[key]=before[key]+(p[key]-before[key])*alpha;
        for(const key of ['yaw','pitch','bodyPitch','bodyRoll','aimYaw','aimPitch'])if(Number.isFinite(p[key]))out[key]=before[key]+difference(p[key],before[key])*alpha;
        return out;
      });
    }
    for(const kind of ['players','vehicles'])render[kind]=this.state[kind].map(p=>this.sampleMotion(kind,p,now));
    const dt=Math.min(.1,(now-this.lastSample)/1000);this.lastSample=now;const predicted=this.prediction.sample(dt);
    if(predicted?.alive&&(!predicted.vehicleId||predicted.vehicleSeat===0)){const index=render.players.findIndex(p=>p.id===this.id);if(index>=0)render.players[index]={...this.state.players.find(p=>p.id===this.id),...predicted,yaw:this.input.yaw??predicted.yaw,pitch:this.input.pitch??predicted.pitch};}
    if(predicted?.vehicleId&&predicted.vehicleSeat===0){const vehicle=this.prediction.world.vehicles.find(v=>v.id===predicted.vehicleId),index=render.vehicles.findIndex(v=>v.id===predicted.vehicleId);if(vehicle&&index>=0)render.vehicles[index]={...vehicle};}
    // Derive every seated body from the very same interpolated/predicted vehicle.
    for(const p of render.players)if(p.vehicleId){const vehicle=render.vehicles.find(v=>v.id===p.vehicleId);if(vehicle){const pose=getVehicleSeatPose(vehicle,p.vehicleSeat);p.x=pose.x;p.y=pose.y-EYE_HEIGHT;p.z=pose.z;}}
    return render;
  }
  sampleMotion(kind,current,now){
    const track=this.motion.get(kind+'/'+current.id);if(!track?.samples.length)return {...current};
    const samples=track.samples,last=samples.at(-1),delay=Math.max(this.interpolationMs/1000,track.period+.02);
    const target=last.time+Math.max(0,(now-last.arrival)/1000)-delay;
    let a=samples[0],b=last;for(let i=1;i<samples.length;i++){if(samples[i].time>=target){a=samples[i-1];b=samples[i];break;}a=samples[i];}
    const out={...current},span=b.time-a.time;
    if(a.pose.alive!==b.pose.alive||a.pose.vehicleId!==b.pose.vehicleId||Math.hypot(a.pose.x-b.pose.x,a.pose.z-b.pose.z)>8)return out;
    const alpha=span>0?clamp((target-a.time)/span,0,1):1;
    for(const key of ['x','y','z'])out[key]=a.pose[key]+(b.pose[key]-a.pose[key])*alpha;
    for(const key of ['yaw','pitch','bodyPitch','bodyRoll','aimYaw','aimPitch'])if(Number.isFinite(current[key]))out[key]=a.pose[key]+difference(b.pose[key],a.pose[key])*alpha;
    if(target>last.time&&samples.length>1){const previous=samples.at(-2),interval=last.time-previous.time,extra=Math.min(.08,target-last.time);if(interval>0&&out.alive!==false&&Math.hypot(last.pose.x-previous.pose.x,last.pose.z-previous.pose.z)<8){out.x+=(last.pose.x-previous.pose.x)/interval*extra;out.z+=(last.pose.z-previous.pose.z)/interval*extra;}}
    return out;
  }
  diagnostics(){return {rttMs:Math.round(this.rtt),interpolationMs:Math.round(this.interpolationMs),pendingInputs:this.prediction?.pending.length??0,receivedBytes:this.receivedBytes,server:this.serverStats};}
  close(forget=true){
    this.manual=true;this.generation++;clearInterval(this.pingTimer);clearInterval(this.flushTimer);
    if(this.ws?.readyState===WebSocket.OPEN&&this.token)this.control('leave');this.ws?.close();this.ws=null;
    for(const pending of this.requests.values()){clearTimeout(pending.timer);pending.reject(Error('Подключение отменено.'));}this.requests.clear();
    if(forget&&this.url)safeStorage.set('sector-resume:'+this.url,null);
    this.token=null;this._mode='offline';this._phase='menu';this.reconnecting=false;this.connecting=null;this.decoder=null;this.prediction=null;this.state=null;this.frames=[];this.events=[];
  }
}
