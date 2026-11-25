// Shared by both infantry teams; no rendering dependencies.
export function updateTravel(motion,dx,dz,dt,player,reset=false){
  // Rendered positions may repeat for several frames, then jump to the next
  // snapshot. Prefer the continuous simulation velocity when available.
  const reported=Number.isFinite(player.velocityX)&&Number.isFinite(player.velocityZ);
  const rx=dx/dt,rz=dz/dt,renderedSpeed=Math.hypot(rx,rz);
  let vx=reported?player.velocityX:rx,vz=reported?player.velocityZ:rz;
  // Scripted actors can be relocated without populating their velocity fields.
  if(reported&&Math.hypot(vx,vz)<.08&&Number.isFinite(player.moveSpeed)&&player.moveSpeed>.3&&renderedSpeed>.12){
    const scale=Math.min(player.moveSpeed,renderedSpeed)/renderedSpeed;
    vx=rx*scale;vz=rz*scale;
  }
  const wanted=Math.hypot(vx,vz);
  const starting=motion.travelling?wanted>.12:wanted>.28;
  // Debounce brief AI stop/start corrections and suppress sub-step noise.
  motion.stopTime=starting?0:(motion.stopTime??0)+dt;
  motion.travelling=starting||Boolean(motion.travelling&&motion.stopTime<.11);
  const moving=motion.travelling;
  if(!moving){vx=0;vz=0;}
  const blend=reset?1:1-Math.exp(-(moving?12:16)*dt);
  motion.vx+=(vx-motion.vx)*blend;
  motion.vz+=(vz-motion.vz)*blend;
  const speed=Math.hypot(motion.vx,motion.vz);
  motion.speed+=(speed-motion.speed)*(reset?1:1-Math.exp(-14*dt));
  if(!moving&&motion.speed<.035){motion.vx=motion.vz=motion.speed=0;}
  const t=Math.max(0,Math.min(1,(motion.speed-.10)/.52));
  const weight=moving?t*t*(3-2*t):0;
  motion.moving+=(weight-motion.moving)*(reset?1:1-Math.exp(-(moving?12:15)*dt));
  if(!moving&&motion.moving<.008)motion.moving=0;
}

export function cycleTime(phase,duration){return ((phase%1+1)%1)*Math.max(0,duration);}

export function idleSample(duration,clock,upper=false){
  // Fixed legs; the upper body breathes through a narrow, continuously
  // eased section of its pose instead of jumping from clip end to start.
  return Math.max(0,duration)*(upper?.26+.075*Math.sin(clock*1.65):.26);
}
