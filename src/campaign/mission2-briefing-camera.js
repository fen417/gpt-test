export function mission2BriefingCamera(terrain,tanks,lead,briefing,elapsed){
  // Offsets follow the moving formation in hull coordinates.
  const path=briefing.cameraOffsets;
  const progress=Math.min(1,Math.max(0,elapsed/briefing.duration))*(path.length-1);
  const i=Math.min(Math.floor(progress),path.length-2),t=progress-i;
  const blend=t*t*(3-2*t);
  const offset=axis=>path[i][axis]+(path[i+1][axis]-path[i][axis])*blend;
  const target={x:0,y:0,z:0};
  for(const tank of tanks){
    target.x+=tank.x/tanks.length;
    target.y+=(tank.y+1.5)/tanks.length;
    target.z+=tank.z/tanks.length;
  }
  const sin=Math.sin(lead.yaw),cos=Math.cos(lead.yaw);
  const forward=offset('forward'),right=offset('right');
  const x=target.x-sin*forward+cos*right,z=target.z-cos*forward-sin*right;
  const y=Math.max(target.y+offset('height'),terrain.heightAt(x,z)+4);
  return {target,position:{x,y,z,yaw:Math.atan2(x-target.x,z-target.z)}};
}
