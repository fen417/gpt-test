export const SQUAD_SIZE=4;
export const SQUAD_NAMES=['Альфа','Браво','Чарли','Дельта','Эхо','Фокстрот','Гольф','Хотел'];
export const SQUAD_COLOR='#91dc78';
export const sameSquad=(a,b)=>Boolean(a&&b&&a.team===b.team&&a.squadId>0&&a.squadId===b.squadId);
export const squadMembers=(players,team,id)=>[...players].filter(p=>p.team===team&&p.squadId===id);

export function aimedSquadPoint(sim,p){
  const yaw=p.orderAim?.yaw??p.input?.yaw??p.yaw,pitch=p.orderAim?.pitch??p.input?.pitch??p.pitch;
  const originY=p.y+(p.crouching?1.05:1.58),cos=Math.cos(pitch),forward={x:-Math.sin(yaw)*cos,y:Math.sin(pitch),z:-Math.cos(yaw)*cos};
  let best=null,alignment=Math.cos(.115);
  for(const point of sim.points){
    const dx=point.x-p.x,dy=(point.y??sim.groundAt(point.x,point.z))+5-originY,dz=point.z-p.z,length=Math.hypot(dx,dy,dz);
    if(length<1)continue;const dot=(dx*forward.x+dy*forward.y+dz*forward.z)/length;
    if(dot>alignment){alignment=dot;best=point;}
  }
  return best;
}

export function reconcileSquads(sim){
  for(let team=0;team<2;team++){
    const members=[...sim.players.values()].filter(p=>p.team===team),groups=Array.from({length:SQUAD_NAMES.length},()=>[]),unassigned=[];
    for(const p of members){const group=groups[p.squadId-1];if(group&&group.length<SQUAD_SIZE)group.push(p);else{p.squadId=0;p.squadLeader=false;unassigned.push(p);}}
    for(const p of unassigned){
      let index=groups.findIndex(group=>group.length<SQUAD_SIZE&&(!p.bot?!group.some(q=>!q.bot):true));
      if(index<0)index=groups.findIndex(group=>group.length<SQUAD_SIZE);
      if(index>=0){p.squadId=index+1;groups[index].push(p);}
    }
    for(const [index,group] of groups.entries()){
      const leader=group.find(p=>!p.bot&&p.squadLeader)||group.find(p=>!p.bot)||group.find(p=>p.squadLeader)||group[0];
      for(const p of group)p.squadLeader=p===leader;
      const key=team+'/'+(index+1),order=sim.squadOrders?.get(key);
      if(order&&order.playerId!==leader?.id)sim.squadOrders.delete(key);
    }
  }
  sim.botTeamAt=0;
}

export function assignSquad(sim,p){
  const members=[...sim.players.values()].filter(q=>q!==p&&q.team===p.team);
  const groups=SQUAD_NAMES.map((_,i)=>squadMembers(members,p.team,i+1));
  let index=groups.findIndex(group=>group.length>0&&group.length<SQUAD_SIZE&&(p.bot||!group.some(q=>!q.bot)));
  // Initial arrivals can take command of an AI squad; manual transfers cannot
  // evict anyone. Move one AI to another slot before seating the new human.
  if(!p.bot&&index<0){
    index=groups.findIndex(group=>group.length===SQUAD_SIZE&&group.every(q=>q.bot));
    if(index>=0){const moved=groups[index].at(-1);moved.squadId=0;moved.squadLeader=false;}
  }
  if(index<0)index=groups.findIndex(group=>!group.length);
  if(index<0)index=groups.findIndex(group=>group.length<SQUAD_SIZE);
  p.squadId=index+1;p.squadLeader=false;reconcileSquads(sim);
}

export function changeSquad(sim,playerId,id){
  const p=sim.players.get(playerId);id=Number(id);
  if(!p||p.bot||!Number.isInteger(id)||id<1||id>SQUAD_NAMES.length)return false;
  if(p.squadId===id)return true;
  if(squadMembers(sim.players.values(),p.team,id).length>=SQUAD_SIZE)return false;
  p.squadId=id;p.squadLeader=false;p.botCommandHeld=false;
  reconcileSquads(sim);return true;
}
