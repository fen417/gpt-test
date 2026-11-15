import test from 'node:test';import assert from 'node:assert/strict';
import{Simulation}from'../shared/simulation.js';import{Prediction,Multiplayer}from'../src/network.js';import{quantizedInput}from'../shared/snapshot-codec.js';
test('tank driver replays 100ms acknowledgements with 30ms jitter within 20cm',()=>{
  const sim=new Simulation({mapId:'quarry',bots:0}),v=sim.vehicles.find(v=>v.type==='tank'&&v.team===0),p=sim.addPlayer('driver','Driver',0);sim.vehicles=[v];v.seats[0]=p.id;Object.assign(p,{vehicleId:v.id,vehicleSeat:0});sim.syncVehicleSeat(p,v);
  const prediction=new Prediction('quarry'),packets=[];prediction.reconcile(sim.snapshot().players.find(x=>x.id===p.id),0,[{...v}],0);let ack=0,maxError=0;
  for(let n=1;n<=180;n++){
    const frame=quantizedInput(n,{forward:1,strafe:0,yaw:0,pitch:0});sim.time+=frame.dt;sim.moveVehicle(v,frame.input,frame.dt);sim.syncVehicleSeat(p,v);prediction.add(frame);
    packets.push({at:n+6+Math.round(Math.sin(n)*2),ack:n,time:sim.time,player:{...sim.snapshot().players.find(x=>x.id===p.id)},vehicles:[{...v}]});
    for(const packet of packets.filter(x=>x.at===n&&x.ack>ack).sort((a,b)=>a.ack-b.ack)){prediction.reconcile(packet.player,packet.ack,packet.vehicles,packet.time);ack=packet.ack;}
    const predicted=prediction.world.vehicles[0];maxError=Math.max(maxError,Math.hypot(predicted.x-v.x,predicted.z-v.z));
  }
  assert.ok(ack>160);assert.ok(maxError<.2,`maximum error ${maxError}m`);
});
test('six-second tank shells appear immediately and disappear on their explosion timeline',()=>{
  const client=new Multiplayer();client.id='local';client.interpolationMs=client.targetInterpolationMs=0;client.prediction={sample:()=>null,hasPlayed:()=>false};client.motion=new Map();client.lastSample=1000;
  const shell={id:'shell',kind:1,x:0,y:2,z:-5,vx:0,vy:0,vz:-190,lifeAt:6};
  const state={time:.1,winner:null,players:[],vehicles:[],rockets:[shell],grenades:[]};client.state=state;client.frames=[{frame:{time:.1},state,arrival:1000}];client.events=[];
  assert.equal(client.sample(1000).rockets.length,1);
  const after={...state,time:.2,rockets:[]};client.state=after;client.frames.push({frame:{time:.2},state:after,arrival:1100});client.events=[{id:1,type:'explosion',rocketId:'shell',time:.2,x:0,y:2,z:-24}];
  assert.equal(client.sample(1100).rockets.length,0);
});
test('vehicle footprint cache follows translation, rotation and editor scale',()=>{
  const sim=new Simulation({mapId:'quarry',bots:0}),v=sim.vehicles.find(v=>v.type==='tank'&&v.team===0);sim.vehicles=[v];const x=v.x+4,z=v.z;
  assert.equal(sim.vehicleAt(x,z,v.y),false);v.modelScale={x:3,y:1,z:1};assert.equal(sim.vehicleAt(x,z,v.y),true);v.yaw=Math.PI/2;assert.equal(sim.vehicleAt(x,z,v.y),false);v.x+=10;assert.equal(sim.vehicleAt(v.x,v.z,v.y),true);assert.equal(sim.vehicleAt(x,z,v.y),false);
});
