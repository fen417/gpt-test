const trackDust={size:1.38,life:2.15,range:170,color:0xcbb08d,opacity:.46,rise:.38,wind:1.1};
export const convoyTrackDust={size:1.25,life:1.95,range:78,color:0xb8a080,opacity:.48,rise:.47,wind:.95};

// Track dust has a rolling allocation within the existing particle batch.
// Never recycle smoke from cannon blasts, wrecks or explosions.
export function trackDustSlot(effects,owner,reduced=false){
  const limit=reduced?56:80,ownLimit=reduced?16:30;
  let count=0,ownCount=0,oldest=null,oldestOwn=null;
  const phase=e=>e.age/Math.max(.001,e.life);
  for(const e of effects){
    if(e.type!=='smoke'||e.trackOwner==null)continue;
    count++;
    if(!oldest||phase(e)>phase(oldest))oldest=e;
    if(e.trackOwner===owner){
      ownCount++;
      if(!oldestOwn||phase(e)>phase(oldestOwn))oldestOwn=e;
    }
  }
  if(ownCount>=ownLimit)return oldestOwn;
  // Replace the most faded track puff instead of suspending the emitter.
  if(count>=limit||effects.length>=130)return oldest;
  return null;
}

export function emitTankTrackDust(renderer,tank,dust,reduced=false){
  const speed=Math.abs(tank.speed??0);
  if(tank.type!=='tank'||tank.hp<=0||speed<.8)return;
  const sin=Math.sin(tank.yaw),cos=Math.cos(tank.yaw),direction=Math.sign(tank.speed),end=direction*3.1;
  const intensity=Math.min(1,.45+speed*.08);
  for(const side of [-1.4,1.4]){
    const x=tank.x+sin*end+cos*side,z=tank.z+cos*end-sin*side;
    const y=renderer.map.terrain.heightAt(x,z);
    if(Math.abs((tank.y??y)-y)>1.5)continue;
    renderer.smoke(x,y+.25,z,dust.size*(.8+intensity*.2)*(reduced ? .82 : 1),dust.life*(reduced ? .72 : 1),dust.color,{
      kind:'dust',opacity:dust.opacity*intensity,rise:dust.rise,enhanced:true,
      vx:sin*direction*dust.wind+cos*side*.22,vz:cos*direction*dust.wind-sin*side*.22,
      trackOwner:tank.id??`${tank.x}/${tank.z}`,trackReduced:reduced,
    });
  }
}

// The player tank emits steadily. Other emitters are staggered and share
// the remaining budget instead of filling it together and going silent.
export function emitTrackDust(renderer,vehicles,reference,dust=trackDust){
  const reduced=renderer.lowQuality||renderer.integratedGpu;
  const nearby=vehicles.filter(tank=>tank.type==='tank'&&tank.hp>0&&Math.abs(tank.speed??0)>=.8&&Math.hypot(tank.x-reference.x,tank.z-reference.z)<=dust.range);
  nearby.sort((a,b)=>Math.hypot(a.x-reference.x,a.z-reference.z)-Math.hypot(b.x-reference.x,b.z-reference.z));
  const schedule=renderer.trackDustSchedule??=new Map(),now=renderer.clock??0;
  const active=new Set(nearby.map(tank=>tank.id??`${tank.x}/${tank.z}`));
  for(const id of schedule.keys())if(!active.has(id))schedule.delete(id);
  const localInterval=reduced?.24:.15;
  const lifetime=dust.life*(reduced?.72:1);
  const remoteSlots=(reduced?56:80)-Math.ceil(2*lifetime/localInterval);
  const remoteInterval=Math.max(reduced?.32:.24,2*lifetime*Math.max(1,nearby.length-1)/Math.max(16,remoteSlots));
  for(const [i,tank] of nearby.entries()){
    const id=tank.id??`${tank.x}/${tank.z}`;
    const own=tank===reference||tank.id!=null&&tank.id===reference.id;
    const interval=own?localInterval:remoteInterval;
    let next=schedule.get(id);
    if(next==null){
      next=now+(own?0:interval*(i%5)/5);
      schedule.set(id,next);
    }
    if(now+1e-6<next)continue;
    schedule.set(id,Math.max(now,next)+interval);
    emitTankTrackDust(renderer,tank,dust,reduced);
  }
}
