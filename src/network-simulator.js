// Development only. Preserve message ordering: this models WebSocket/TCP delay,
// jitter and a temporary stall, not an unreliable UDP transport.
export class SimulatedSocket {
  constructor(url,{delayMs=0,jitterMs=0,Socket=WebSocket}={}){
    this.socket=new Socket(url);this.delayMs=delayMs;this.jitterMs=jitterMs;this.queueBytes=0;this.timers=new Set();this.pausedUntil=0;this.sentAt=0;this.receivedAt=0;
    this.socket.onopen=e=>this.onopen?.(e);this.socket.onerror=e=>this.onerror?.(e);
    this.socket.onclose=e=>{for(const timer of this.timers)clearTimeout(timer);this.timers.clear();this.queueBytes=0;this.onclose?.(e);};
    this.socket.onmessage=e=>this.schedule('receivedAt',()=>this.onmessage?.(e));
  }
  get readyState(){return this.socket.readyState;}get bufferedAmount(){return this.socket.bufferedAmount+this.queueBytes;}
  set binaryType(value){this.socket.binaryType=value;}get binaryType(){return this.socket.binaryType;}
  schedule(lane,callback){
    const now=performance.now(),delay=Math.max(0,this.delayMs+(Math.random()*2-1)*this.jitterMs);
    const at=Math.max(now+delay,this.pausedUntil,this[lane]);this[lane]=at+.01;
    const timer=setTimeout(()=>{this.timers.delete(timer);callback();},Math.max(0,at-now));this.timers.add(timer);
  }
  send(data){
    const copy=typeof data==='string'?data:data.slice(0),bytes=typeof copy==='string'?new TextEncoder().encode(copy).byteLength:copy.byteLength;this.queueBytes+=bytes;
    this.schedule('sentAt',()=>{this.queueBytes-=bytes;if(this.readyState===1)this.socket.send(copy);});
  }
  pause(ms){this.pausedUntil=performance.now()+Math.max(0,Math.min(10000,ms));}
  close(...args){this.socket.close(...args);}
}

export function createNetworkSocket(url){
  if(!import.meta.env?.DEV)return new WebSocket(url);
  const params=new URLSearchParams(globalThis.location?.search??'');
  return new SimulatedSocket(url,{delayMs:Math.min(500,Math.max(0,Number(params.get('netDelay'))||0)),jitterMs:Math.min(100,Math.max(0,Number(params.get('netJitter'))||0))});
}
