import {Simulation} from '../shared/simulation.js';import{createVehicle,VEHICLE_TYPES}from'../shared/vehicles.js';import{writeFile}from'node:fs/promises';
const sim=new Simulation({mapId:'quarry',bots:0}),v=createVehicle({id:'probe',type:'tank',team:0,x:0,z:0,y:0,yaw:0});sim.vehicles=[];
const routes=sim.map.vehicleRoutes,nodes=new Map(routes.nodes.map(n=>[n.id,n])),failures=[];let samples=0,maxGrade=0;
for(const[from,to]of routes.edges){const a=nodes.get(from),b=nodes.get(to),length=Math.hypot(b.x-a.x,b.z-a.z),steps=Math.ceil(length/.75),yaw=Math.atan2(-(b.x-a.x),-(b.z-a.z));
  for(let i=0;i<=steps;i++){const t=i/steps,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;v.y=sim.groundAt(x,z);samples++;
    const grade=Math.abs(Math.atan2(sim.groundAt(x-Math.sin(yaw),z-Math.cos(yaw))-sim.groundAt(x+Math.sin(yaw),z+Math.cos(yaw)),2));maxGrade=Math.max(maxGrade,grade);
    if(grade>VEHICLE_TYPES.tank.maxSlope||sim.vehicleCollides(v,x,z,yaw)){failures.push({from,to,x,z,grade});break;}
  }
}
const report={method:'3.6x7m oriented tank footprint at <=0.75m spacing, static map collision and terrain grade; parked vehicles excluded',edges:routes.edges.length,samples,maxGradeDegrees:maxGrade*180/Math.PI,failures};console.log(JSON.stringify(report,null,2));if(process.argv[2])await writeFile(process.argv[2],JSON.stringify(report,null,2)+'\n');if(failures.length)process.exitCode=1;
