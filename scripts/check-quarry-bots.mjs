import{Simulation}from'../shared/simulation.js';import{writeFile}from'node:fs/promises';
let seed=417;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296),sim=new Simulation({mapId:'quarry',bots:30,random}),watch=new Map(),stalls=[];
let samples=0,tankBoardings=0,tankCannonShots=0,tankMGShots=0,lastEvent=0;for(let tick=0;tick<300*60;tick++){
  sim.step(1/60);if(tick%60)continue;samples++;
  for(const e of sim.events)if(e.id>lastEvent){if(e.type==='vehicleEnter'&&sim.vehicles.find(v=>v.id===e.vehicleId)?.type==='tank')tankBoardings++;if(e.type==='cannonShot')tankCannonShots++;if(e.type==='shot'&&e.weaponId==='tank-mg')tankMGShots++;}lastEvent=sim.eventId;
  for(const p of sim.players.values()){
    if(![p.x,p.y,p.z,p.hp].every(Number.isFinite))throw Error('Non-finite actor '+p.id);
    const v=p.vehicleId?sim.vehicles.find(v=>v.id===p.vehicleId):null,goal=p.ai?.goal;
    const wants=p.alive&&!p.input.fire&&!p.gadgetAction&&(v?p.vehicleSeat===0&&Math.abs(p.input.forward)+Math.abs(p.input.strafe)>.2:goal&&Math.hypot(goal.x-p.x,goal.z-p.z)>3&&(p.ai?.mode==='blocked'||Math.hypot(p.input.forward,p.input.strafe)>.2));
    const old=watch.get(p.id),moved=!old||Math.hypot(p.x-old.x,p.z-old.z)>1||v&&Math.abs(v.yaw-old.yaw)>.15;
    if(!wants||moved)watch.set(p.id,{x:p.x,z:p.z,yaw:v?.yaw??p.yaw,at:sim.time});
    else if(sim.time-old.at>=10&&!old.reported){stalls.push({id:p.id,mode:p.ai?.mode,vehicle:v?.type,x:p.x,z:p.z,at:sim.time,goal});old.reported=true;}
  }
}
const report={seconds:sim.time,bots:30,samples,tankBoardings,tankCannonShots,tankMGShots,method:'Seed 417, actual runtime navigation budget; 1s samples, >10s without 1m/0.15rad progress while requesting movement, excluding firing, tools and idle guard duty; cumulative shot events survive vehicle respawns',stalls,points:sim.points.map(p=>({id:p.id,owner:p.owner})),tankCrews:sim.vehicles.filter(v=>v.type==='tank').map(v=>({id:v.id,seats:v.seats,shots:v.cannonSeq,gunShots:v.gunSeq})),kills:[...sim.players.values()].reduce((n,p)=>n+p.kills,0)};console.log(JSON.stringify(report,null,2));if(process.argv[2])await writeFile(process.argv[2],JSON.stringify(report,null,2)+'\n');
