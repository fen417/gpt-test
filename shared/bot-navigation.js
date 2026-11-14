import { SpatialIndex } from './spatial-index.js';
import { rayCollider } from './asset-colliders.js';
import { EYE_HEIGHT, PLAYER_RADIUS } from './world.js';

const caches=new WeakMap(),distance=(a,b)=>{const x=a.x-b.x,z=a.z-b.z;return Math.sqrt(x*x+z*z);};
const down={x:0,y:-1,z:0};
function navigation(sim){
  if(caches.has(sim))return caches.get(sim);
  const size=sim.gridSize,cell=sim.gridCell,origin=sim.gridOrigin;
  const ground=new Map(),layers=new Map(),cover=[],nodes=[],byId=[];
  const key=(x,z)=>Math.floor((z-origin)/cell)*size+Math.floor((x-origin)/cell);
  const insert=(x,y,z)=>{
    const crouch=sim.collides(x,z,y+.025,PLAYER_RADIUS+.04,EYE_HEIGHT);
    if(crouch&&sim.collides(x,z,y+.025,PLAYER_RADIUS+.04,1.1))return;
    const k=key(x,z),list=layers.get(k)??[];
    if(list.some(n=>distance(n,{x,z})<.25&&Math.abs(n.y-y)<.15))return;
    const node={id:size*size+nodes.length,x,y,z,ground:false,crouch};nodes.push(node);byId[node.id]=node;list.push(node);layers.set(k,list);
  };
  for(const b of sim.colliders){
    if(b.kind==='village-stair')insert(b.x,b.h,b.z);
    if(b.kind==='village-floor'){
      for(let z=Math.ceil((b.minZ-origin)/cell)*cell+origin+.1;z<b.maxZ;z+=cell)
        for(let x=Math.ceil((b.minX-origin)/cell)*cell+origin+.1;x<b.maxX;x+=cell){
          const hit=rayCollider({x,y:b.h+.04,z},down,b,b.h-b.minY+.1);
          if(Number.isFinite(hit))insert(x,b.h+.04-hit,z);
        }
    }
    if(b.h-b.minY<.65||b.minY>sim.groundAt(b.x,b.z)+1.3||b.w>65||b.d>65)continue;
    const cx=(b.minX+b.maxX)/2,cz=(b.minZ+b.maxZ)/2;
    for(const side of [-1,1])for(const t of [-.65,0,.65]){
      for(const point of [{x:cx+side*(b.w/2+.72),z:cz+t*b.d/2,nx:side,nz:0},
        {x:cx+t*b.w/2,z:cz+side*(b.d/2+.72),nx:0,nz:side}]){
        point.y=sim.groundAt(point.x,point.z);
        if(!sim.collides(point.x,point.z,point.y+.02,PLAYER_RADIUS+.12,EYE_HEIGHT))cover.push(point);
      }
    }
  }
  for(const node of nodes)for(const [nx,nz] of [[1,0],[-1,0],[0,1],[0,-1]]){
    if(sim.collides(node.x+nx*.8,node.z+nz*.8,node.y+.1,.2,1.25))cover.push({...node,nx:-nx,nz:-nz});
  }
  const getGround=(ix,iz)=>{
    if(ix<0||iz<0||ix>=size||iz>=size)return null;
    const id=iz*size+ix;if(ground.has(id))return ground.get(id);
    const x=origin+(ix+.5)*cell,z=origin+(iz+.5)*cell,y=sim.groundAt(x,z);
    const crouch=sim.collides(x,z,y+.025,PLAYER_RADIUS+.05,EYE_HEIGHT);
    const node=crouch&&sim.collides(x,z,y+.025,PLAYER_RADIUS+.05,1.1)?null:{id,x,y,z,ground:true,crouch};
    ground.set(id,node);if(node)byId[id]=node;return node;
  };
  const nearby=(point,radius=1)=>{
    const ix=Math.floor((point.x-origin)/cell),iz=Math.floor((point.z-origin)/cell),out=[];
    for(let dz=-radius;dz<=radius;dz++)for(let dx=-radius;dx<=radius;dx++){
      const x=ix+dx,z=iz+dz;if(x<0||z<0||x>=size||z>=size)continue;
      const g=getGround(x,z);if(g)out.push(g);
      out.push(...(layers.get(z*size+x)??[]));
    }
    return out;
  };
  const result={ground,layers,cover,nodes,byId,capacity:size*size+nodes.length,workspaces:[],adjacency:new Map(),nearby,coverIndex:new SpatialIndex(cover),nodeIndex:new SpatialIndex(nodes),edges:new Map()};caches.set(sim,result);return result;
}

export function walkableSegment(sim,a,b,dynamic=true){
  const length=distance(a,b),rise=(b.y??sim.groundAt(b.x,b.z))-(a.y??sim.groundAt(a.x,a.z));
  if(rise>Math.max(.34,length*.63)||rise< -Math.max(.65,length*.8))return false;
  const steps=Math.max(1,Math.ceil(length/.45));
  for(let i=1;i<=steps;i++){
    const t=i/steps,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;
    const y=(a.y??sim.groundAt(a.x,a.z))+rise*t;
    const bodyHeight=a.crouch||a.crouching||b.crouch?1.1:EYE_HEIGHT;
    if(sim.collides(x,z,y+(sim.stepHeight??0)+.025,PLAYER_RADIUS+.035,bodyHeight-(sim.stepHeight??0))||dynamic&&sim.vehicleAt(x,z,y))return false;
    if(sim.groundAt(x,z)>y+.36)return false;
    if(y-sim.groundAt(x,z)>.4){
      const origin={x,y:y+.33,z};let support=false;
      for(const box of sim.rayBoxes(origin,down,.7))if(rayCollider(origin,down,box,.7)<.7){support=true;break;}
      if(!support)return false;
    }
  }
  return true;
}

class Heap{
  constructor(size){this.ids=new Int32Array(size);this.scores=new Float64Array(size);this.length=0;}
  push(id,f){if(this.length===this.ids.length){const ids=new Int32Array(this.ids.length*2),scores=new Float64Array(this.ids.length*2);ids.set(this.ids);scores.set(this.scores);this.ids=ids;this.scores=scores;}let i=this.length++;while(i){const p=(i-1)>>1;if(this.scores[p]<=f)break;this.ids[i]=this.ids[p];this.scores[i]=this.scores[p];i=p;}this.ids[i]=id;this.scores[i]=f;}
  pop(){const first=this.ids[0],id=this.ids[--this.length],f=this.scores[this.length];if(this.length){let i=0;while(i*2+1<this.length){let c=i*2+1;if(c+1<this.length&&this.scores[c+1]<this.scores[c])c++;if(this.scores[c]>=f)break;this.ids[i]=this.ids[c];this.scores[i]=this.scores[c];i=c;}this.ids[i]=id;this.scores[i]=f;}return first;}
}
function workspace(nav){const work=nav.workspaces.pop()??{g:new Float64Array(nav.capacity),seen:new Uint32Array(nav.capacity),closed:new Uint32Array(nav.capacity),previous:new Int32Array(nav.capacity),heap:new Heap(nav.capacity),generation:0};work.generation=(work.generation+1)>>>0;if(!work.generation){work.seen.fill(0);work.closed.fill(0);work.generation=1;}work.heap.length=0;return work;}
function* neighbors(sim,nav,node){
  if(nav.adjacency.has(node.id))return nav.adjacency.get(node.id);
  const list=[];for(const next of nav.nearby(node)){
    yield;if(next===node||distance(node,next)>sim.gridCell*1.5+.1||(!node.ground||!next.ground)&&Math.abs(next.y-node.y)>.35)continue;
    if(walkableSegment(sim,node,next,false))list.push(next.id);
  }
  const result=Int32Array.from(list);nav.adjacency.set(node.id,result);return result;
}

function* pathJob(sim,start,goal){
  if(!goal)return [];
  const nav=navigation(sim);
  function* nearest(point,source){let best=null,score=Infinity;
    for(const n of nav.nearby(point,2)){yield;
      if(sim.vehicleAt(n.x,n.z,n.y)||source&&!walkableSegment(sim,point,n))continue;
      const value=distance(n,point)+Math.abs(n.y-(point.y??sim.groundAt(point.x,point.z)))*4;
      if(value<score){score=value;best=n;}
    }return best;
  }
  const source=yield* nearest(start,true),target=yield* nearest(goal,false);if(!source||!target)return [];
  const work=workspace(nav),generation=work.generation,open=work.heap;work.g[source.id]=0;work.seen[source.id]=generation;
  try{
  open.push(source.id,distance(source,target));
  let best=source,bestRange=distance(source,target)+Math.abs(source.y-target.y)*3,expanded=0;
  const context=start.ai,threat=context?.contact??context?.memory;
  let riskBudget=32;

  while(open.length&&expanded++<(sim.pathExpansionLimit??6500)){
    yield;
    const node=nav.byId[open.pop()];if(work.closed[node.id]===generation)continue;work.closed[node.id]=generation;
    const range=distance(node,target)+Math.abs(node.y-target.y)*3;
    if(range<bestRange){best=node;bestRange=range;}if(node===target)break;
    for(const nextId of yield* neighbors(sim,nav,node)){
      yield;const next=nav.byId[nextId];
      if(work.closed[nextId]===generation||sim.vehicleAt(next.x,next.z,next.y))continue;
      let risk=0;
      if(threat&&distance(next,threat)<65&&riskBudget-->0&&sim.lineClear({x:next.x,y:next.y+1.1,z:next.z},{x:threat.x,y:threat.y+1.1,z:threat.z}))risk+=context?.mode==='retreat'?14:4;
      if(context?.blockedSpot&&sim.time<context.blockedSpot.until&&distance(next,context.blockedSpot)<3)risk+=35;
      const squad=sim.botTeams?.[start.team]?.members??[];
      for(const ally of squad)if(ally!==start&&ally.alive&&ally.ai?.goal&&distance(next,ally.ai.goal)<1.6)risk+=1.5;
      const cost=work.g[node.id]+distance(node,next)+Math.abs(next.y-node.y)*2+risk*(context?.caution??1);
      if(cost>=(work.seen[next.id]===generation?work.g[next.id]:Infinity))continue;
      work.seen[next.id]=generation;work.g[next.id]=cost;work.previous[next.id]=node.id;open.push(next.id,cost+range);
    }
  }
  const path=[];let current=best;
  while(current&&current!==source){path.push({x:current.x,y:current.y,z:current.z,crouch:current.crouch});current=nav.byId[work.previous[current.id]];}path.reverse();
  yield;
  if(best===target&&walkableSegment(sim,target,goal))path.push({x:goal.x,y:goal.y??sim.groundAt(goal.x,goal.z),z:goal.z,crouch:target.crouch});
  const smooth=[];let anchor={x:start.x,y:start.y,z:start.z};
  for(let i=0;i<path.length;){yield;let end=i;while(end+1<path.length&&end<i+5&&path[end].crouch===path[end+1].crouch&&Math.abs(path[end+1].y-anchor.y)<.3&&walkableSegment(sim,anchor,path[end+1]))end++;
    smooth.push(path[end]);anchor=path[end];i=end+1;}
  return smooth;
  }finally{nav.workspaces.push(work);}
}

export function findCover(sim,p,threat,{retreat=false,fire=false}={}){
  const nav=navigation(sim),ai=p.ai;let best=null,score=Infinity;
  const eye={x:threat.x,y:(threat.y??sim.groundAt(threat.x,threat.z))+1.2,z:threat.z};
  const radius=retreat?24:17;
  const candidates=nav.coverIndex.query(p.x-radius,p.z-radius,p.x+radius,p.z+radius,nav.coverCandidates??=[]).filter(c=>distance(c,p)<(retreat?24:17)&&Math.abs(c.y-p.y)<2).sort((a,b)=>distance(a,p)-distance(b,p)).slice(0,32);
  for(const point of candidates){
    if(performance.now()>(sim.navigationDeadline??Infinity))break;
    if(sim.lineClear(eye,{x:point.x,y:point.y+1,z:point.z}))continue;
    let occupied=false;
    for(const ally of sim.players.values())if(ally!==p&&ally.alive&&ally.team===p.team&&distance(ally.ai?.cover??ally,point)<1.1){occupied=true;break;}
    if(occupied)continue;
    let peek=null;
    if(fire)for(const side of [ai?.peekSide??1,-(ai?.peekSide??1)]){
      const candidate={x:point.x-point.nz*side*1.15,y:point.y,z:point.z+point.nx*side*1.15};
      if(walkableSegment(sim,point,candidate)&&sim.lineClear({x:candidate.x,y:candidate.y+1.35,z:candidate.z},eye)){peek=candidate;break;}
    }
    const value=distance(p,point)+(fire&&!peek?10:0)+(retreat?-distance(point,threat)*.3:0)+(ai?.lastCover&&distance(ai.lastCover,point)<2?8:0);
    if(value<score){score=value;best={...point,peek};}
  }
  return best;
}

export function elevatedSpots(sim,p,goal){
  return navigation(sim).nodeIndex.query(goal.x-38,goal.z-38,goal.x+38,goal.z+38).filter(n=>n.y>sim.groundAt(n.x,n.z)+1.8&&distance(n,goal)<38&&distance(n,p)<60);
}

export function moveBot(sim,p,goal,dt,{sprint=true,look=true,cautious=false}={}){
  if(!goal)return false;
  const ai=p.ai;
  if(distance(p,goal)<.55&&Math.abs(p.y-(goal.y??sim.groundAt(goal.x,goal.z)))<.6)return true;
  const changed=!ai.pathGoal||distance(ai.pathGoal,goal)>2||Math.abs((ai.pathGoal.y??0)-(goal.y??0))>.6;
  if((changed||!p.botPath.length||sim.time>ai.pathUntil)&&(sim.botPathBudget>0||ai.pathJob||ai.pathResult)&&sim.time>=(ai.repathAt??0)){
    if(!ai.pathJob&&!ai.pathResult)sim.botPathBudget--;const result=resumeBotPath(sim,p,goal);
    if(result){p.botPath=result;ai.pathGoal={...goal};ai.pathUntil=sim.time+3;ai.repathAt=sim.time+.5;}
  }
  while(p.botPath.length&&distance(p,p.botPath[0])<.65&&Math.abs(p.y-p.botPath[0].y)<.65)p.botPath.shift();
  let next=p.botPath[0];
  if(!next&&distance(p,goal)<8&&walkableSegment(sim,p,goal))next=goal;
  if(!next){p.input.forward=p.input.strafe=0;ai.mode='blocked';return false;}
  let dx=next.x-p.x,dz=next.z-p.z;
  for(const ally of sim.players.values()){
    if(ally===p||!ally.alive||Math.abs(ally.y-p.y)>1.5)continue;
    const d=distance(p,ally);if(d>.05&&d<1.35){dx+=(p.x-ally.x)/d*(1.35-d)*1.5;dz+=(p.z-ally.z)/d*(1.35-d)*1.5;}
  }
  const length=Math.max(.001,Math.hypot(dx,dz));dx/=length;dz/=length;
  const yaw=Math.atan2(-dx,-dz),turn=sim.botSettings.turnSpeed*dt;
  if(look)p.input.yaw=p.yaw+Math.max(-turn,Math.min(turn,Math.atan2(Math.sin(yaw-p.yaw),Math.cos(yaw-p.yaw))));
  const sin=Math.sin(p.input.yaw),cos=Math.cos(p.input.yaw),scale=cautious?.5:1;
  p.input.forward=(-sin*dx-cos*dz)*scale;p.input.strafe=(cos*dx-sin*dz)*scale;
  const probeY=p.y+(next.y-p.y)*Math.min(1,.7/Math.max(.1,distance(p,next)));
  if(next.crouch)p.input.crouch=true;
  const movingClear=walkableSegment(sim,p,{x:p.x+dx*.7,y:probeY,z:p.z+dz*.7,crouch:next.crouch});
  if(!movingClear){p.input.forward=p.input.strafe=0;ai.repathAt=0;ai.pathUntil=0;}
  p.input.sprint=sprint&&movingClear&&!p.input.crouch&&distance(p,goal)>8&&Math.abs(p.input.strafe)<.35&&!p.input.aim&&Math.abs(next.y-p.y)<.3;
  ai.probe??={x:p.x,z:p.z,at:sim.time};
  if(sim.time-ai.probe.at>1.1){
    if(distance(p,ai.probe)<.35){ai.blockedSpot={x:next.x,z:next.z,until:sim.time+8};p.botPath=[];ai.pathUntil=0;ai.repathAt=sim.time+.25;ai.yieldUntil=sim.time+.45;}
    ai.probe={x:p.x,z:p.z,at:sim.time};
  }
  if(sim.time<(ai.yieldUntil??0)){p.input.forward=-.25;p.input.strafe=(p.botSlot%2?1:-1)*.4;p.input.sprint=false;}
  return false;
}

// Build immutable navigation before the match starts, never in a combat tick.
export function prepareNavigation(sim){navigation(sim);}
export function findBotPath(sim,start,goal){if(start.bot&&start.ai)return resumeBotPath(sim,start,goal)??start.botPath??[];const job=pathJob(sim,start,goal);let result;do{result=job.next();}while(!result.done);return result.value;}
function resumeBotPath(sim,p,goal){
  const ai=p.ai;
  const changed=!ai.pathJobGoal||distance(ai.pathJobGoal,goal)>2||Math.abs((ai.pathJobGoal.y??0)-(goal.y??0))>.6;
  if(changed||ai.pathJobStart&&distance(ai.pathJobStart,p)>3){ai.pathJob?.return();ai.pathJob=null;ai.pathResult=null;}
  if(ai.pathResult){const path=ai.pathResult;ai.pathResult=null;return path;}
  if(!ai.pathJob){
    ai.pathJob=pathJob(sim,{...p}, {...goal});ai.pathJobGoal={...goal};ai.pathJobStart={x:p.x,z:p.z};
    (sim.navigationQueue??=[]).push({p,ai,job:ai.pathJob});
  }
  return null;
}
export function beginNavigationTick(sim){
  sim.navigationDeadline=performance.now()+(sim.navigationBudgetMs??3);
  const pathDeadline=Math.min(sim.navigationDeadline,performance.now()+(sim.pathBudgetMs??1.8));
  const queue=sim.navigationQueue??=[];let remaining=queue.length;
  while(remaining-->0&&queue.length&&performance.now()<pathDeadline){
    const task=queue.shift(),{p,ai,job}=task;
    if(!p.alive||p.ai!==ai||ai.pathJob!==job){job.return();continue;}
    const slice=Math.min(pathDeadline,performance.now()+.45);let result;
    do{result=job.next();}while(!result.done&&performance.now()<slice);
    if(result.done){ai.pathJob=null;ai.pathResult=result.value;}else queue.push(task);
  }
}
