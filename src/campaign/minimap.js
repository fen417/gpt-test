import {getAssetColliders,rayCollider} from '../../shared/asset-colliders.js';

function plot(ctx,x,y,color,radius){
  ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.fill();
}

function heading(ctx,x,y,yaw,color,size){
  ctx.save();ctx.translate(x,y);ctx.rotate(-yaw);
  ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(0,-size);
  ctx.lineTo(size*.55,size*.55);ctx.lineTo(0,size*.28);ctx.lineTo(-size*.55,size*.55);ctx.closePath();
  ctx.fill();ctx.restore();
}

function chart(ctx,renderer,center,radius,size){
  const half=size/2,scale=(half-3)/radius;
  const x=world=>half+(world-center.x)*scale,z=world=>half+(world-center.z)*scale;
  const inView=(worldX,worldZ,pad=0)=>Math.abs(worldX-center.x)<=radius+pad&&Math.abs(worldZ-center.z)<=radius+pad;
  ctx.fillStyle='#141b1b';ctx.fillRect(0,0,size,size);
  ctx.strokeStyle='#a3b49826';ctx.lineWidth=1;
  const interval=radius>160?100:20;
  const minX=Math.floor((center.x-radius)/interval)*interval,minZ=Math.floor((center.z-radius)/interval)*interval;
  ctx.beginPath();
  for(let xp=minX;xp<=center.x+radius;xp+=interval){ctx.moveTo(x(xp),0);ctx.lineTo(x(xp),size);}
  for(let zp=minZ;zp<=center.z+radius;zp+=interval){ctx.moveTo(0,z(zp));ctx.lineTo(size,z(zp));}
  ctx.stroke();
  for(const road of renderer.map.roads??[]){
    if(!inView(road.x,road.z,Math.hypot(road.w,road.d)*.5))continue;
    ctx.fillStyle='#8a7b5961';ctx.save();ctx.translate(x(road.x),z(road.z));ctx.rotate(-(road.yaw??0));
    ctx.fillRect(-road.w*scale/2,-road.d*scale/2,road.w*scale,road.d*scale);ctx.restore();
  }
  const blocks=renderer.map.structures?.length?renderer.map.structures:renderer.map.boxes??[];
  for(const box of blocks){
    if(box.h<.7||!inView(box.x,box.z,Math.hypot(box.w,box.d)*.5))continue;
    ctx.fillStyle=box.enterable?'#72664f':'#454940';
    ctx.fillRect(x(box.x-box.w/2),z(box.z-box.d/2),Math.max(1.2,box.w*scale),Math.max(1.2,box.d*scale));
  }
  return {x,z,half,inView};
}

function enemyVisible(renderer,actor){
  const target={x:actor.x,y:actor.y+(actor.prone||actor.downed?.43:actor.crouch?1.02:1.3),z:actor.z};
  if(!renderer.project(target.x,target.y,target.z).visible)return false;
  const origin=renderer.camera.position;
  const dx=target.x-origin.x,dy=target.y-origin.y,dz=target.z-origin.z,len=Math.hypot(dx,dy,dz);
  if(len<.28)return true;
  const reach=len-.28,direction={x:dx/len,y:dy/len,z:dz/len};
  const colliders=renderer.campaignCoverColliders??getAssetColliders(renderer.map);
  return (renderer.map.terrain?.raycast(origin,direction,reach)??Infinity)>reach&&
    !colliders.some(box=>rayCollider(origin,direction,box,reach)<reach);
}

export class InfantryMinimap{
  constructor(renderer){
    this.renderer=renderer;
    const canvas=this.canvas=document.createElement('canvas');
    canvas.className='campaign-infantry-map';canvas.width=canvas.height=168;canvas.hidden=true;
    canvas.setAttribute('aria-label','Тактическая миникарта');
    document.querySelector('#hud .bottom-right')?.append(canvas);
  }
  update(state,player,{hidden=false,radius=55}={}){
    this.canvas.hidden=hidden;
    const now=performance.now();
    if(hidden||now<(this.nextDraw??0))return;
    this.nextDraw=now+140;
    const ctx=this.canvas.getContext('2d'),size=this.canvas.width,renderer=this.renderer;
    const {x,z,half,inView}=chart(ctx,renderer,player,radius,size);
    for(const item of renderer.map.interactives??[])if(item.type==='door'){
      const status=state.campaign.roomStatus?.[item.id.split('-door-')[0]];
      ctx.fillStyle=status==='clear'?'#acd798':'#d8a263';
      ctx.fillRect(x(item.part.x)-1.5,z(item.part.z)-1,3,2);
    }
    const target=state.campaign.target;
    if(target)plot(ctx,Math.max(6,Math.min(size-6,x(target.x))),Math.max(6,Math.min(size-6,z(target.z))),'#f2cc82',3.5);
    for(const actor of state.players){
      if(actor===player||!actor.alive||!inView(actor.x,actor.z)||Math.abs(actor.y-player.y)>13)continue;
      const px=x(actor.x),pz=z(actor.z),ally=actor.team===player.team;
      if(ally&&(actor.downed||actor.rescue)){
        ctx.fillStyle=actor.downedTimer<=25?'#ffc295':'#9be9ca';
        ctx.fillRect(px-1,pz-4,2,8);ctx.fillRect(px-4,pz-1,8,2);
      }else if(ally)plot(ctx,px,pz,'#9be9ca',2.3);
      else if(enemyVisible(renderer,actor)){
        if(actor.y-player.y>2.3)heading(ctx,px,pz,0,'#ee8962',4);
        else plot(ctx,px,pz,'#ee8962',2.9);
      }
    }
    heading(ctx,half,half,player.yaw,'#e8fbef',6);
    ctx.fillStyle='#d5c79e';ctx.font='9px monospace';ctx.fillText('N',half-3,12);
  }
  dispose(){this.canvas.remove();}
}

export function drawArmoredMinimap(canvas,renderer,state,vehicle,radius=state.campaign.phase==='village'?220:430){
  const ctx=canvas.getContext('2d'),m=state.campaign,size=canvas.width,half=size/2;
  ctx.clearRect(0,0,size,size);ctx.save();ctx.beginPath();ctx.arc(half,half,half-2,0,Math.PI*2);ctx.clip();
  const {x,z,inView}=chart(ctx,renderer,vehicle,radius,size);
  const visible=new Set(m.visibleEnemies??[...state.vehicles,...state.players]
    .filter(item=>item.team!==vehicle.team&&inView(item.x,item.z)&&enemyVisible(renderer,item)).map(item=>item.id));
  for(const t of state.vehicles){
    if(t.id===vehicle.id||t.hp<=0||!inView(t.x,t.z)||t.team!==vehicle.team&&!visible.has(t.id))continue;
    heading(ctx,x(t.x),z(t.z),t.yaw,t.team===vehicle.team?'#9be9ca':'#f09c77',5);
  }
  for(const p of state.players)if(p.alive&&!p.vehicleId&&inView(p.x,p.z)&&(p.team===vehicle.team||visible.has(p.id)))
    plot(ctx,x(p.x),z(p.z),p.team===vehicle.team?(p.downed?'#ffd68b':'#a7d9a2'):'#ed9671',2.2);
  if(m.phase==='village')for(const gun of m.guns)if(gun.alive&&inView(gun.x,gun.z))plot(ctx,x(gun.x),z(gun.z),'#efb18a',3);
  if(m.target){
    const dx=x(m.target.x)-half,dz=z(m.target.z)-half,ratio=Math.min(1,(half-11)/Math.max(1,Math.hypot(dx,dz)));
    plot(ctx,half+dx*ratio,half+dz*ratio,'#ffe19b',4);
  }
  ctx.strokeStyle='#d4dabeaa';ctx.beginPath();ctx.moveTo(half,half);
  ctx.lineTo(half-Math.sin(vehicle.aimYaw)*28,half-Math.cos(vehicle.aimYaw)*28);ctx.stroke();
  heading(ctx,half,half,vehicle.yaw,'#e9f5d8',8);
  ctx.fillStyle='#e4d5b0';ctx.font='11px monospace';ctx.fillText('N',half-3,16);
  ctx.restore();
}
