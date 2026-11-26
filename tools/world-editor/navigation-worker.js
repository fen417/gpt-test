
import {Simulation} from '../../shared/simulation.js';
import {registerLocalMap,EYE_HEIGHT} from '../../shared/world.js';
import {findBotPath,walkableSegment} from '../../shared/bot-navigation.js';
import {QUARRY_M05,M05_EDITOR_BASE,M05_GRID,M05_BASE_HEIGHTS} from '../../shared/campaign/quarry-m05.js';
import {createEditorSandbox} from '../../shared/editor-maps.js';
import {terrainWithEdits,editableMapBoxes} from '../../shared/campaign/m05-editor.js';

function preview(data,config){
 if(config)return createEditorSandbox('editor-0000000000000000',config,data);
 const terrain=terrainWithEdits(M05_GRID,M05_BASE_HEIGHTS,data.terrain);
 const boxes=editableMapBoxes(M05_EDITOR_BASE,data);
 return {...QUARRY_M05,id:'world-editor-nav-preview',terrain,boxes};
}
let simulation;
self.onmessage=({data:message})=>{
 const {id,type}=message;
 try{
  if(type==='grid'){
   const map=preview(message.edits,message.config);registerLocalMap(map);
   simulation=new Simulation({mapId:map.id,bots:0});
   const sim=simulation,positions=[[],[],[]],cell=sim.gridCell;
   // Actual standing and crouching collision checks at the game's grid nodes.
   for(let iz=0;iz<sim.gridSize;iz++)for(let ix=0;ix<sim.gridSize;ix++){
    const x=sim.gridOrigin+(ix+.5)*cell,z=sim.gridOrigin+(iz+.5)*cell,y=sim.groundAt(x,z);
    const area=map.playArea;if(area&&(x<area.minX||x>area.maxX||z<area.minZ||z>area.maxZ))continue;
    if(!Number.isFinite(y))continue;
    const blocked=sim.collides(x,z,y+.025,sim.playerRadius+.05,EYE_HEIGHT),crouch=blocked&&!sim.collides(x,z,y+.025,sim.playerRadius+.05,1.1);
    positions[blocked?(crouch?1:2):0].push(x,y+.14,z);
   }
   const arrays=positions.map(p=>new Float32Array(p));
   self.postMessage({id,type,positions:arrays,counts:arrays.map(p=>p.length/3),cell},arrays.map(p=>p.buffer));
  }else if(type==='path'){
   if(!simulation)throw Error('Сначала пересчитайте навигацию');
   const sim=simulation,point=p=>({x:p[0],z:p[2],y:sim.groundAt(p[0],p[2])}),start=point(message.start),goal=point(message.goal);
   const path=walkableSegment(sim,start,goal)?[goal]:findBotPath(sim,start,goal);
   const end=path.at(-1)??start,reached=Math.hypot(end.x-goal.x,end.z-goal.z)<.1&&Math.abs(end.y-goal.y)<.4;
   self.postMessage({id,type,path:[start,...path].map(p=>[p.x,p.y+.28,p.z]),reached});
  }
 }catch(error){self.postMessage({id,type,error:error.message});}
};
