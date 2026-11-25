const trackDust={size:1.38,life:2.15,range:170,color:0xcbb08d,opacity:.46,rise:.38,wind:1.1};
export const convoyTrackDust={size:1.25,life:1.95,range:78,color:0xb8a080,opacity:.48,rise:.47,wind:.95};

export function emitTankTrackDust(renderer,tank,dust,reduced=false){
  const speed=Math.abs(tank.speed??0);
  if(tank.type!=='tank'||tank.hp<=0||speed<.8||renderer.effects.length+2>100)return;
  const sin=Math.sin(tank.yaw),cos=Math.cos(tank.yaw),direction=Math.sign(tank.speed),end=direction*3.1;
  const intensity=Math.min(1,.45+speed*.08);
  for(const side of [-1.4,1.4]){
    const x=tank.x+sin*end+cos*side,z=tank.z+cos*end-sin*side;
    const y=renderer.map.terrain.heightAt(x,z);
    if(Math.abs((tank.y??y)-y)>1.5)continue;
    renderer.smoke(x,y+.25,z,dust.size*(.8+intensity*.2)*(reduced ? .82 : 1),dust.life*(reduced ? .72 : 1),dust.color,{
      kind:'dust',opacity:dust.opacity*intensity,rise:dust.rise,enhanced:true,
      vx:sin*direction*dust.wind+cos*side*.22,vz:cos*direction*dust.wind-sin*side*.22,
    });
  }
}

export function emitTrackDust(renderer,vehicles,reference,dust=trackDust){
  const reduced=renderer.lowQuality||renderer.integratedGpu;
  const nearby=vehicles.filter(tank=>tank.type==='tank'&&tank.hp>0&&Math.abs(tank.speed??0)>=.8&&Math.hypot(tank.x-reference.x,tank.z-reference.z)<=dust.range);
  nearby.sort((a,b)=>Math.hypot(a.x-reference.x,a.z-reference.z)-Math.hypot(b.x-reference.x,b.z-reference.z));
  for(const tank of nearby){
    if(renderer.effects.length+2>(reduced?72:94))break;
    emitTankTrackDust(renderer,tank,dust,reduced);
  }
}
