import { Simulation,sanitizeInput } from './simulation.js';
import { PROTOCOL_VERSION,MAP_LAYOUT_REVISION } from './world.js';
import { MESSAGE,SnapshotEncoder,prepareSnapshot,encodeEvents,encodeControl,decodeControl,decodeInput } from './snapshot-codec.js';
import { Reader,Writer } from './binary.js';
import { PerformanceSamples } from './performance-samples.js';

// Same authoritative simulation and binary snapshots/events/input as the server.
// The worker owns time; a busy rendering frame never requests an unbounded step.
export class SoloAuthority {
  constructor(send){this.send=send;this.paused=true;this.queue=[];this.ack=0;this.tick=0;this.accumulator=0;this.samples=new PerformanceSamples();}
  control(data){this.send(encodeControl(data));}
  snapshot(full=false){
    const state=this.sim.snapshot();this.prepared=prepareSnapshot(state,this.sim.map.size,this.prepared);
    const packet=this.encoder.encode(this.prepared,{localId:'local',inputAck:this.ack,tick:this.tick,full});this.send(packet.bytes);
    if(this.sim.debugBots&&this.tick%6===0)this.control({type:'stats',stats:{snapshotHz:30,workerTickMs:this.samples.summary()},botDebug:state.botDebug});
  }
  message(value){
    try{
      if(typeof value==='string'){
        const data=decodeControl(value);if(data.protocol!==PROTOCOL_VERSION||data.layout!==MAP_LAYOUT_REVISION)throw Error('Версии одиночной симуляции различаются.');
        if(data.type==='create'){
          this.sim=new Simulation(data);this.sim.addPlayer('local',data.name,0,data.classId,data.weaponId,data.sidearmId);
          this.encoder=new SnapshotEncoder(this.sim.map.size);this.sentEvent=this.sim.eventId;this.last=performance.now();
          this.control({type:'init',mapId:this.sim.map.id,size:this.sim.map.size,difficulty:this.sim.difficulty,epoch:1,eventAck:this.sentEvent,snapshotHz:30});
          this.snapshot(true);this.timer=setInterval(()=>this.pump(),1000/60);return;
        }
        if(data.type==='settings'){this.paused=Boolean(data.paused);this.last=performance.now();this.accumulator=0;if(this.paused){this.queue=[];this.sim.setInput('local',{});}return;}
        if(data.type==='respawn'){const accepted=this.sim.respawn('local',data.classId,data.pointId,data.weaponId,data.sidearmId);this.snapshot();this.control({type:'respawn',requestId:data.requestId,accepted});return;}
        if(data.type==='squad'){if(!this.sim.changeSquad('local',data.squadId))throw Error('Отряд заполнен.');this.snapshot();this.control({type:'squad',requestId:data.requestId});return;}
        if(data.type==='stats'){this.control({type:'stats',stats:{snapshotHz:30,workerTickMs:this.samples.summary()},botDebug:this.sim.debugBots?this.sim.snapshot().botDebug:null});return;}
        if(data.type==='leave'){this.close();return;}
        throw Error('Неизвестная команда одиночной игры.');
      }
      const reader=new Reader(value),type=reader.u8();
      if(type===MESSAGE.PING){const time=reader.f64(),w=new Writer(9);w.u8(MESSAGE.PONG);w.f64(time);this.send(w.finish());return;}
      if(type===MESSAGE.INPUT){const packet=decodeInput(value);this.encoder.confirm(packet.snapshotAck,packet.dictAck);for(const frame of packet.frames)if(frame.sequence>(this.received??0)){frame.input=sanitizeInput(frame.input);this.received=frame.sequence;if(this.paused)this.ack=frame.sequence;else this.queue.push(frame);}if(this.queue.length>120)this.queue.splice(0,this.queue.length-120);if(this.paused)this.snapshot();return;}
      if(type===MESSAGE.ACK){reader.u32();const sequence=reader.u32();reader.u32();this.encoder.confirm(sequence,reader.u16());return;}
      if(type===MESSAGE.RESYNC){this.queue=[];this.encoder.ack=0;this.snapshot(true);return;}
    }catch(error){let requestId;try{requestId=typeof value==='string'?decodeControl(value).requestId:undefined;}catch{}this.control({type:'error',requestId,message:error.message});}
  }
  step(){
    const frames=this.queue.splice(0,2),p=this.sim.players.get('local');
    if(frames.length){this.held={...frames.at(-1).input};const input={...this.held};for(const f of frames)for(const key of ['jump','reload','grenade','gadget','secondaryGadget','interact','switchSeat','horn','order'])if(f.input[key])input[key]=true;
      this.sim.setInput('local',input);p.networkFrames=frames;this.ack=frames.at(-1).sequence;
    }else{const input={...this.held};for(const key of ['jump','reload','grenade','gadget','secondaryGadget','interact','switchSeat','horn','order'])input[key]=false;this.sim.setInput('local',input);}
    const order=frames.find(frame=>frame.input.order);p.orderAim=order?{yaw:order.input.yaw,pitch:order.input.pitch}:null;
    p.networkControlled=true;p.networkIdle=false;
    const start=performance.now();this.sim.step(1/60);this.samples.add(performance.now()-start);this.tick++;
    const events=this.sim.events.filter(e=>e.id>this.sentEvent);if(events.length){this.sentEvent=events.at(-1).id;this.send(encodeEvents(events,this.sentEvent,this.encoder.dict));}
    if(this.tick%2===0||this.sim.winner!==null)this.snapshot();
  }
  pump(){
    const now=performance.now(),elapsed=Math.max(0,(now-this.last)/1000);this.last=now;
    if(this.paused||this.sim.winner!==null)return;
    this.accumulator=Math.min(.1,this.accumulator+elapsed);let steps=0;
    while(this.accumulator>=1/60&&steps++<2){this.step();this.accumulator-=1/60;}
    if(this.accumulator>=1/60)this.accumulator%=1/60;
  }
  close(){clearInterval(this.timer);this.timer=null;}
}
