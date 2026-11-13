import { rayCollider } from './asset-colliders.js';
import { EYE_HEIGHT, PLAYER_RADIUS } from './world.js';

const caches=new WeakMap(),distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const down={x:0,y:-1,z:0};
function navigation(sim){
  if(caches.has(sim))return caches.get(sim);
  const size=sim.gridSize,cell=sim.gridCell,origin=sim.gridOrigin;
  const ground=new Map(),layers=new Map(),cover=[],nodes=[];
  const key=(x,z)=>Math.floor((z-origin)/cell)*size+Math.floor((x-origin)/cell);
  const insert=(x,y,z)=>{
    const crouch=sim.collides(x,z,y+.025,PLAYER_RADIUS+.04,EYE_HEIGHT);
    if(crouch&&sim.collides(x,z,y+.025,PLAYER_RADIUS+.04,1.1))return;
    const k=key(x,z),list=layers.get(k)??[];
    if(list.some(n=>distance(n,{x,z})<.25&&Math.abs(n.y-y)<.15))return;
    const node={id:'s'+nodes.length,x,y,z,ground:false,crouch};nodes.push(node);list.push(node);layers.set(k,list);
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
    const node=crouch&&sim.collides(x,z,y+.025,PLAYER_RADIUS+.05,1.1)?null:{id:'g'+id,x,y,z,ground:true,crouch};
    ground.set(id,node);return node;
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
  const result={ground,layers,cover,nodes,nearby,edges:new Map()};caches.set(sim,result);return result;
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
  values=[];
  push(value){const a=this.values;a.push(value);let i=a.length-1;while(i){const p=(i-1)>>1;if(a[p].f<=value.f)break;a[i]=a[p];i=p;}a[i]=value;}
  pop(){const a=this.values,first=a[0],last=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let c=i*2+1;if(c+1<a.length&&a[c+1].f<a[c].f)c++;if(a[c].f>=last.f)break;a[i]=a[c];i=c;}a[i]=last;}return first;}
}

export function findBotPath(sim,start,goal){
  if(!goal)return [];
  const nav=navigation(sim);
  const nearest=(point,source)=>nav.nearby(point,2).filter(n=>!sim.vehicleAt(n.x,n.z,n.y)&&(!source||walkableSegment(sim,point,n)))
    .sort((a,b)=>distance(a,point)+Math.abs(a.y-(point.y??sim.groundAt(point.x,point.z)))*4-distance(b,point)-Math.abs(b.y-(point.y??sim.groundAt(point.x,point.z)))*4)[0];
  const source=nearest(start,true),target=nearest(goal,false);if(!source||!target)return [];
  const open=new Heap(),costs=new Map([[source.id,0]]),previous=new Map(),closed=new Set();
  open.push({node:source,f:distance(source,target)});
  let best=source,bestRange=distance(source,target)+Math.abs(source.y-target.y)*3,expanded=0;
  const context=start.ai,threat=context?.contact??context?.memory;
  let riskBudget=32;
  const deadline=sim.pathBudgetMs?performance.now()+sim.pathBudgetMs:Infinity;
  while(open.values.length&&expanded++<(sim.pathExpansionLimit??6500)){
    if((expanded&31)===0&&performance.now()>deadline)break;
    const {node}=open.pop();if(closed.has(node.id))continue;closed.add(node.id);
    const range=distance(node,target)+Math.abs(node.y-target.y)*3;
    if(range<bestRange){best=node;bestRange=range;}if(node===target)break;
    for(const next of nav.nearby(node)){
      if(next===node||closed.has(next.id)||distance(node,next)>sim.gridCell*1.5+.1)continue;
      if(sim.vehicleAt(next.x,next.z,next.y))continue;
      if((!node.ground||!next.ground)&&Math.abs(next.y-node.y)>.35)continue;
      const edge=node.id+'>'+next.id;
      let clear=nav.edges.get(edge);
      if(clear===undefined){clear=walkableSegment(sim,node,next,false);nav.edges.set(edge,clear);}
      if(!clear)continue;
      let risk=0;
      if(threat&&distance(next,threat)<65&&riskBudget-->0&&sim.lineClear({x:next.x,y:next.y+1.1,z:next.z},{x:threat.x,y:threat.y+1.1,z:threat.z}))risk+=context?.mode==='retreat'?14:4;
      if(context?.blockedSpot&&sim.time<context.blockedSpot.until&&distance(next,context.blockedSpot)<3)risk+=35;
      const squad=sim.botTeams?.[start.team]?.members??[];
      for(const ally of squad)if(ally!==start&&ally.alive&&ally.ai?.goal&&distance(next,ally.ai.goal)<1.6)risk+=1.5;
      const cost=costs.get(node.id)+distance(node,next)+Math.abs(next.y-node.y)*2+risk*(context?.caution??1);
      if(cost>=(costs.get(next.id)??Infinity))continue;
      costs.set(next.id,cost);previous.set(next.id,node);open.push({node:next,f:cost+range});
    }
  }
  const path=[];let current=best;
  while(current&&current!==source){path.push({x:current.x,y:current.y,z:current.z,crouch:current.crouch});current=previous.get(current.id);}path.reverse();
  if(best===target&&walkableSegment(sim,target,goal))path.push({x:goal.x,y:goal.y??sim.groundAt(goal.x,goal.z),z:goal.z,crouch:target.crouch});
  const smooth=[];let anchor={x:start.x,y:start.y,z:start.z};
  for(let i=0;i<path.length;){let end=i;while(end+1<path.length&&end<i+5&&path[end].crouch===path[end+1].crouch&&Math.abs(path[end+1].y-anchor.y)<.3&&walkableSegment(sim,anchor,path[end+1]))end++;
    smooth.push(path[end]);anchor=path[end];i=end+1;}
  return smooth;
}

export function findCover(sim,p,threat,{retreat=false,fire=false}={}){
  const nav=navigation(sim),ai=p.ai;let best=null,score=Infinity;
  const eye={x:threat.x,y:(threat.y??sim.groundAt(threat.x,threat.z))+1.2,z:threat.z};
  const candidates=nav.cover.filter(c=>distance(c,p)<(retreat?24:17)&&Math.abs(c.y-p.y)<2).sort((a,b)=>distance(a,p)-distance(b,p)).slice(0,32);
  for(const point of candidates){
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
  return navigation(sim).nodes.filter(n=>n.y>sim.groundAt(n.x,n.z)+1.8&&distance(n,goal)<38&&distance(n,p)<60);
}

export function moveBot(sim,p,goal,dt,{sprint=true,look=true,cautious=false}={}){
  if(!goal)return false;
  const ai=p.ai;
  if(distance(p,goal)<.55&&Math.abs(p.y-(goal.y??sim.groundAt(goal.x,goal.z)))<.6)return true;
  const changed=!ai.pathGoal||distance(ai.pathGoal,goal)>2||Math.abs((ai.pathGoal.y??0)-(goal.y??0))>.6;
  if((changed||!p.botPath.length||sim.time>ai.pathUntil)&&sim.botPathBudget>0&&sim.time>=(ai.repathAt??0)){
    sim.botPathBudget--;p.botPath=findBotPath(sim,p,goal);ai.pathGoal={...goal};ai.pathUntil=sim.time+3;ai.repathAt=sim.time+.5;
  }
  while(p.botPath.length&&distance(p,p.botPath[0])<.65&&Math.abs(p.y-p.botPath[0].y)<.65)p.botPath.shift();
  let next=p.botPath[0];
  if(!next&&walkableSegment(sim,p,goal))next=goal;
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
