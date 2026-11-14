import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { SoloSession } from '../src/solo-session.js';

class BrowserWorker {
  constructor(){this.worker=new Worker(new URL('./fixtures/solo-node-worker.mjs',import.meta.url));this.worker.on('message',data=>this.onmessage?.({data}));this.worker.on('error',error=>this.onerror?.(error));}
  postMessage(...args){this.worker.postMessage(...args);}terminate(){return this.worker.terminate();}
}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

test('solo authority constructs off thread, transfers snapshots, pauses and changes squads', {timeout:10000},async()=>{
  let heartbeats=0;const heartbeat=setInterval(()=>heartbeats++,5),session=new SoloSession({bots:4,mapId:'village',name:'Local',classId:'assault'},{WorkerClass:BrowserWorker});
  try{
    await session.ready;assert(heartbeats>0,'main event loop remains available while navigation is prepared');
    assert.equal(session.snapshot().players.length,5);
    const initial={...session.snapshot().players.find(p=>p.id==='local')};const start=session.snapshot().time;session.setPaused(false);
    for(let i=0;i<20;i++){session.advance({forward:1,yaw:0},1/60);await sleep(17);}
    assert(session.snapshot().time>start);assert(session.client.frames.length>1);
    const own=session.snapshot().players.find(p=>p.id==='local');assert.equal(own.bot,false);assert(Math.hypot(own.x-initial.x,own.z-initial.z)>.1,'authoritative worker movement consumes binary inputs');
    session.setPaused(true);await sleep(50);const paused=session.snapshot().time;await sleep(100);assert.equal(session.snapshot().time,paused);
    assert.equal(await session.changeSquad('local',8),true);assert.equal(session.snapshot().players.find(p=>p.id==='local').squadId,8);
  }finally{clearInterval(heartbeat);session.close();}
});
