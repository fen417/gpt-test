import {Simulation} from '../shared/simulation.js';
import {findBotPath} from '../shared/bot-navigation.js';
import {writeFile} from 'node:fs/promises';
const sim=new Simulation({bots:0,mapId:'quarry'}),rows=[];
const length=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z,(a.y??0)-(b.y??0));
for(const [team,spawn] of sim.map.spawns.entries())for(const goal of sim.map.points){
  const start={...spawn,y:sim.groundAt(spawn.x,spawn.z)},path=findBotPath(sim,start,goal);
  const reached=path.length&&Math.hypot(path.at(-1).x-goal.x,path.at(-1).z-goal.z)<8;
  let metres=0,exposed=0,sampled=0;const cover=new Set();let previous=start;
  for(const end of path){const distance=length(previous,end),steps=Math.max(1,Math.ceil(distance/3));
    for(let i=1;i<=steps;i++){const t=i/steps,x=previous.x+(end.x-previous.x)*t,z=previous.z+(end.z-previous.z)*t;
      const d=Math.hypot(x-goal.x,z-goal.z);
      if(d>=25&&d<=120){sampled+=distance/steps;if(sim.lineClear({x:goal.x,y:goal.y+1.65,z:goal.z},{x,y:sim.groundAt(x,z)+1.2,z}))exposed+=distance/steps;}
      if(metres+distance*t>40)for(const b of sim.map.boxes)if(!b.overhead&&b.h>=1&&Math.hypot(x-b.x,z-b.z)<12+Math.hypot(b.w,b.d)/2)cover.add(b.id);
    }metres+=distance;previous=end;
  }
  rows.push({team,point:goal.id,reached:Boolean(reached),straight:Math.round(Math.hypot(spawn.x-goal.x,spawn.z-goal.z)),pathMetres:reached?Math.round(metres):null,sprintSeconds:reached?+(metres/(6.3*1.3)).toFixed(1):null,exposedPercent:sampled?+(exposed/sampled*100).toFixed(1):null,coverPer100m:metres?+(cover.size/metres*100).toFixed(1):0});
}
const report={method:'Actual findBotPath, 3m samples, standing objective observer vs 1.2m approach target, within 25-120m. Cover counts nearby unique boxes after first 40m. Sprint estimate uses AR-416, excludes stops/turns.',colliders:sim.colliders.length,boxes:sim.map.boxes.length,rows};
console.log(JSON.stringify(report,null,2));if(process.argv[2])await writeFile(process.argv[2],JSON.stringify(report,null,2)+'\n');
