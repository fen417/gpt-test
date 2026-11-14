export class PoseHistory {
  constructor(capacity=24){this.frames=Array.from({length:capacity},()=>({time:-Infinity,players:new Map(),vehicles:new Map()}));this.cursor=0;this.count=0;}
  capture(time,players,vehicles){
    const frame=this.frames[this.cursor];this.cursor=(this.cursor+1)%this.frames.length;this.count=Math.min(this.count+1,this.frames.length);frame.time=time;
    for(const [kind,entities] of [['players',players.values()],['vehicles',vehicles]]){
      const active=new Set();for(const entity of entities){active.add(entity.id);const pose=frame[kind].get(entity.id)??{};
        for(const key of ['x','y','z','yaw','pitch','vehicleId','vehicleSeat','reviveSeq','hp','alive','team','bodyPitch','bodyRoll','aimYaw','aimPitch'])pose[key]=entity[key];
        pose.crouching=Boolean(entity.crouching||entity.crouch||entity.slideTime>0||entity.input?.crouch);pose.slideTime=0;pose.input={crouch:pose.crouching};frame[kind].set(entity.id,pose);
      }for(const id of frame[kind].keys())if(!active.has(id))frame[kind].delete(id);
    }
  }
  sample(kind,id,time){
    if(!this.count)return null;let before=null,after=null;
    for(let i=0;i<this.count;i++){const frame=this.frames[(this.cursor-this.count+i+this.frames.length)%this.frames.length];if(frame.time<=time)before=frame;if(frame.time>=time){after=frame;break;}}
    before??=after;after??=before;if(!before)return null;
    const a=before[kind].get(id),b=after[kind].get(id);if(!a||!b||a.alive!==b.alive||a.reviveSeq!==b.reviveSeq||a.vehicleId!==b.vehicleId||a.team!==b.team||Math.hypot(a.x-b.x,a.z-b.z)>8)return null;
    const alpha=before===after?0:Math.max(0,Math.min(1,(time-before.time)/(after.time-before.time))),pose={...a};
    for(const key of ['x','y','z'])pose[key]=a[key]+(b[key]-a[key])*alpha;
    for(const key of ['yaw','pitch','bodyPitch','bodyRoll','aimYaw','aimPitch'])if(Number.isFinite(a[key])&&Number.isFinite(b[key]))pose[key]=a[key]+Math.atan2(Math.sin(b[key]-a[key]),Math.cos(b[key]-a[key]))*alpha;
    return pose;
  }
}

export function validatedRewind(now,frame,viewTime){
  if(!frame||!Number.isFinite(viewTime))return 0;
  const bounded=Math.max(frame.time-.2,Math.min(frame.time+.08,viewTime));return Math.max(0,Math.min(.2,now-bounded));
}
