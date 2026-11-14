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
if(!Number.isInteger(ticks)||ticks<60)throw Error('--ticks must be an integer >= 60');
const summary=values=>{const sorted=[...values].sort((a,b)=>a-b),round=n=>Number(n.toFixed(3));return {avg:round(values.reduce((a,b)=>a+b,0)/values.length),p95:round(sorted[Math.ceil(sorted.length*.95)-1]),p99:round(sorted[Math.ceil(sorted.length*.99)-1]),max:round(sorted.at(-1))};};
const report={schema:1,version:GAME_VERSION,protocol:PROTOCOL_VERSION,createdAt:new Date().toISOString(),environment:{node:process.version,platform:platform(),arch:arch(),cpu:cpus()[0]?.model},scenario:{ticks,bots,humans,tickHz:60,snapshotHz:20,seed:417,input:'moving, aiming, shooting, reloading, respawning',ack:'immediate simulated reliable ACK'},maps:[],warnings:[]};
for(const mapId of ['port','quarry','village']){
  let seed=417;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  const constructAt=performance.now(),sim=new Simulation({bots,mapId,random});
  const constructionMs=performance.now()-constructAt;
  const players=Array.from({length:humans},(_,i)=>sim.addPlayer('bench-'+i,'Benchmark '+i,i%2));
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
    if(tick%3===2){
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
