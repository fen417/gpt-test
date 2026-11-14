import { Multiplayer } from './network.js';
import { decodeControl,encodeControl } from '../shared/snapshot-codec.js';
import { PROTOCOL_VERSION,MAP_LAYOUT_REVISION } from '../shared/world.js';

export class SoloSession {
  constructor(options,{onState=()=>{},onLocalShot=()=>{},WorkerClass=globalThis.Worker}={}){
    this.client=new Multiplayer({onLocalShot});this.client.id='local';this.client.token='solo';this.paused=true;
    this.worker=new WorkerClass(new URL('./solo-worker.js',import.meta.url),{type:'module'});
    this.ready=new Promise((resolve,reject)=>{this.resolveReady=resolve;this.rejectReady=reject;});
    this.readyTimer=setTimeout(()=>this.rejectReady(Error('Симуляция не ответила при загрузке.')),15000);
    this.client.ws={readyState:1,bufferedAmount:0,send:data=>{if(typeof data==='string')this.worker.postMessage(data);else{const copy=data.slice();this.worker.postMessage(copy.buffer,[copy.buffer]);}},close:()=>this.worker.terminate()};
    this.client.onState=state=>{if(!this.started){this.started=true;clearTimeout(this.readyTimer);this.resolveReady(state);}else if(!this.closed)onState(state);};
    this.worker.onmessage=event=>{
      if(this.closed)return;const data=event.data;
      if(typeof data!=='string'){this.client.binary(data);return;}
      const message=decodeControl(data);
      if(message.type==='init'){this.client.initialize(message);this.client.startTimers();}
      if(message.type==='stats'){this.client.serverStats=message.stats;if(message.botDebug){this.client.context.botDebug=message.botDebug;if(this.client.state)this.client.state.botDebug=message.botDebug;}}
      const pending=this.client.requests.get(message.requestId);
      if(pending){clearTimeout(pending.timer);this.client.requests.delete(message.requestId);if(message.type==='error')pending.reject(Error(message.message));else pending.resolve(message);}
      else if(message.type==='error')this.rejectReady(Error(message.message));
    };
    this.worker.onerror=event=>this.rejectReady(Error(event.message??'Не удалось запустить симуляцию.'));
    this.worker.postMessage(encodeControl({type:'create',...options,protocol:PROTOCOL_VERSION,layout:MAP_LAYOUT_REVISION}));
  }
  setPaused(value){if(value===this.paused)return;this.paused=value;if(value){this.client.clearInput();this.client.prediction.pending=[];this.client.sentSequence=this.client.sequence;}this.client.control('settings',{paused:value});}
  advance(input,dt){this.client.advance(input,dt);}
  sample(now){return this.client.sample(now);}
  snapshot(){return this.client.state;}
  async respawn(id,classId,pointId,weaponId,sidearmId){return (await this.client.request('respawn',{classId,pointId,weaponId,sidearmId})).accepted;}
  async changeSquad(id,squadId){await this.client.request('squad',{squadId});return true;}
  close(){if(this.closed)return;this.closed=true;clearTimeout(this.readyTimer);this.rejectReady(Error('Операция отменена.'));this.client.close();}
}
