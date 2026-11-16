import { performance } from 'node:perf_hooks';
import { cpus, platform, arch } from 'node:os';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Simulation } from '../shared/simulation.js';
import { SnapshotEncoder, prepareSnapshot } from '../shared/snapshot-codec.js';
import { GAME_VERSION } from '../shared/releases.js';
import { PROTOCOL_VERSION } from '../shared/world.js';

const args=process.argv.slice(2),option=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1];};
const ticks=Number(option('--ticks',2400)),bots=30,humans=7,dt=1/60;
const snapshotHz=Number(option('--snapshot-hz',20)),maps=option('--map','port,quarry,village').split(',');
if(![20,30].includes(snapshotHz))throw Error('--snapshot-hz must be 20 or 30');
if(!Number.isInteger(ticks)||ticks<60)throw Error('--ticks must be an integer >= 60');
const summary=values=>{const sorted=[...values].sort((a,b)=>a-b),round=n=>Number(n.toFixed(3));return {avg:round(values.reduce((a,b)=>a+b,0)/values.length),p95:round(sorted[Math.ceil(sorted.length*.95)-1]),p99:round(sorted[Math.ceil(sorted.length*.99)-1]),max:round(sorted.at(-1))};};
const report={schema:1,version:GAME_VERSION,protocol:PROTOCOL_VERSION,createdAt:new Date().toISOString(),environment:{node:process.version,platform:platform(),arch:arch(),cpu:cpus()[0]?.model},scenario:{ticks,bots,humans,tickHz:60,snapshotHz:20,lagCompensation:true,seed:417,input:'moving, aiming, shooting, reloading, respawning',ack:'immediate simulated reliable ACK'},maps:[],warnings:[]};
report.scenario.snapshotHz=snapshotHz;report.scenario.tankCrew=args.includes('--tank-crew');
if(args.includes('--m03')){
  const {Mission3Simulation}=await import('../shared/campaign/mission3.js');
  const definition=JSON.parse(await readFile(new URL('../public/campaign/m03/mission.json',import.meta.url),'utf8'));
  const constructAt=performance.now(),sim=new Mission3Simulation(definition,{seed:417});
  const constructionMs=performance.now()-constructAt,c=sim.campaign;
  c.rideTime=122;sim.time=122;for(const v of sim.vehicles)sim.moveVehicle(v,{},dt);c.updateRide();c.pending=[];
  c.enterStage(1);const local=c.player;
  Object.assign(local,{x:-103,y:0,z:29,dropAt:undefined,grounded:true,invulnerableUntil:0});
  for(const id of ['brigade-1','brigade-2'])c.revive(sim.players.get(id));
  for(const h of sim.navigationHouses)if(h.x>-125&&h.x<-58){c.setPanel(`${h.id}-door--1`,'open');c.setPanel(`${h.id}-door-1`,'open');}
  c.refreshGeometry();c.enqueue([['forge','assault'],['craft-yard','rifle']]);c.flushEnemies();
  if(c.enemies.length!==14)throw Error('M03 benchmark expected 14 hostiles');
  // Keep encounter size constant while AI, movement, projectiles and damage queries run.
  sim.damage=()=>{};
  const steps=[],snapshots=[],start=performance.now();
  for(let tick=0;tick<ticks+120;tick++){
    sim.setInput('local',{yaw:-Math.PI/2+Math.sin(tick*.008)*.7,fire:tick%90<40,reload:local.ammo===0,aim:true});
    const at=performance.now();sim.step(dt);if(tick>=120)steps.push(performance.now()-at);
    if(tick>=120&&tick%Math.round(60/snapshotHz)===0){const at=performance.now();sim.snapshot();snapshots.push(performance.now()-at);}
  }
  report.scenario={mission:'m03',seed:417,ticks,tickHz:60,snapshotHz,hostiles:14,alliedBots:6,humans:1};
  const result={mapId:sim.map.id,constructionMs:Number(constructionMs.toFixed(3)),stepMs:summary(steps),snapshotMs:summary(snapshots),wallMs:Number((performance.now()-start).toFixed(3))};
  report.maps.push(result);
  console.log(`${result.mapId}: step avg ${result.stepMs.avg}, p95 ${result.stepMs.p95}, p99 ${result.stepMs.p99}, max ${result.stepMs.max} ms; snapshot p99 ${result.snapshotMs.p99} ms`);
  if(result.stepMs.p99>6)report.warnings.push(`${result.mapId}: simulation p99 exceeds 6 ms`);
}else for(const mapId of maps){
  let seed=417;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  const constructAt=performance.now(),sim=new Simulation({bots,mapId,random,lagCompensation:true});
  const constructionMs=performance.now()-constructAt;
  const players=Array.from({length:humans},(_,i)=>sim.addPlayer('bench-'+i,'Benchmark '+i,i%2));
  if(args.includes('--tank-crew'))for(let i=0;i<4;i++){
    const p=players[i],v=sim.vehicles.find(v=>v.type==='tank'&&v.team===p.team);if(!v)continue;p.x=v.x+2.6;p.z=v.z;p.y=sim.groundAt(p.x,p.z);if(!sim.mountVehicle(p,v,i<2?0:1))throw Error('Benchmark tank crew could not board '+v.id);
  }
  const encoders=players.map(()=>new SnapshotEncoder(sim.map.size));
  const steps=[],encodes=[],sizes=[];let previous;
  const cpuAt=process.cpuUsage(),start=performance.now();
  for(let tick=0;tick<ticks;tick++){
    for(const [i,p] of players.entries()){
      if(!p.alive&&p.respawnIn<=0)sim.respawn(p.id,p.classId);
      const target=[...sim.players.values()].find(other=>other.alive&&other.team!==p.team);
      const yaw=target?Math.atan2(-(target.x-p.x),-(target.z-p.z)):i;
      sim.setInput(p.id,{forward:Math.sin(tick/180+i)>.2?1:.4,strafe:Math.sin(tick/90+i)*.6,yaw,aim:true,fire:tick%90<65,reload:p.ammo===0});
    }
    const stepAt=performance.now();sim.step(dt);steps.push(performance.now()-stepAt);
    if(tick%Math.round(60/snapshotHz)===Math.round(60/snapshotHz)-1){
      previous=prepareSnapshot(sim.snapshot(),sim.map.size,previous);
      for(const [i,encoder] of encoders.entries()){
        const encodeAt=performance.now(),packet=encoder.encode(previous,{localId:players[i].id,tick});
        encodes.push(performance.now()-encodeAt);sizes.push(packet.bytes.byteLength);
        encoder.confirm(packet.sequence,encoder.dict.strings.length-1);
      }
    }
  }
  const wallMs=performance.now()-start,cpu=process.cpuUsage(cpuAt);
  const result={mapId,constructionMs:Number(constructionMs.toFixed(3)),stepMs:summary(steps),encodeMs:summary(encodes),snapshotBytes:summary(sizes),wallMs:Number(wallMs.toFixed(3)),cpuMsPerSimSecond:Number(((cpu.user+cpu.system)/1000/(ticks*dt)).toFixed(3)),events:sim.eventId};
  report.maps.push(result);
  console.log(`${mapId}: step avg ${result.stepMs.avg}, p95 ${result.stepMs.p95}, p99 ${result.stepMs.p99}, max ${result.stepMs.max} ms; encode avg ${result.encodeMs.avg} ms; snapshot avg ${result.snapshotBytes.avg} bytes`);
  if(result.stepMs.p99>6||result.stepMs.max>10)report.warnings.push(`${mapId}: target exceeded (p99 <= 6 ms, max <= 10 ms)`);
}
const baselinePath=option('--baseline',null);
if(baselinePath){
  let baseline;try{baseline=JSON.parse(await readFile(baselinePath,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
  if(baseline){
    if(JSON.stringify(baseline.scenario)!==JSON.stringify(report.scenario)||baseline.environment.node.split('.')[0]!==report.environment.node.split('.')[0]||['cpu','platform','arch'].some(key=>baseline.environment[key]!==report.environment[key]))report.warnings.push('Baseline scenario/Node major/hardware differs; regression comparison skipped');
    else for(const current of report.maps){const before=baseline.maps.find(m=>m.mapId===current.mapId);if(before&&current.stepMs.p99>before.stepMs.p99*1.2)report.warnings.push(`${current.mapId}: step p99 regressed >20% (${before.stepMs.p99} -> ${current.stepMs.p99} ms)`);}
  }
}
for(const warning of report.warnings)console.warn(args.includes('--ci')?`::warning::${warning}`:warning);
const output=option('--output',null);
if(output){await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');}
if(args.includes('--strict')&&report.warnings.length)process.exitCode=1;
