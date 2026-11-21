const trackDust={size:.68,life:1.15,range:170,color:0xcbb08d,opacity:.24,rise:.25,wind:1.5};
export const convoyTrackDust={size:1.2,life:1.9,range:78,color:0xb8a080,opacity:.48,rise:.47,wind:.95};

export function emitTrackDust(renderer,vehicles,reference,dust=trackDust){
  for(const tank of vehicles){
    if(renderer.effects.length+2>85)break;
    if(tank.type!=='tank'||tank.hp<=0||Math.abs(tank.speed)<.8||Math.hypot(tank.x-reference.x,tank.z-reference.z)>dust.range)continue;
    const sin=Math.sin(tank.yaw),cos=Math.cos(tank.yaw),end=Math.sign(tank.speed)*3.1;
    for(const side of [-1.4,1.4]){
      const x=tank.x+sin*end+cos*side,z=tank.z+cos*end-sin*side;
      renderer.smoke(x,renderer.map.terrain.heightAt(x,z)+.22,z,dust.size,dust.life,dust.color,dust);
    }
  }
}
