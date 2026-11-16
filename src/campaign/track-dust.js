const trackDust={opacity:.24,rise:.25,wind:1.5};

export function emitTrackDust(renderer,vehicles,reference){
  for(const tank of vehicles){
    if(renderer.effects.length>=85)break;
    if(tank.type!=='tank'||tank.hp<=0||Math.abs(tank.speed)<.8||Math.hypot(tank.x-reference.x,tank.z-reference.z)>170)continue;
    const sin=Math.sin(tank.yaw),cos=Math.cos(tank.yaw),end=Math.sign(tank.speed)*3.1;
    for(const side of [-1.4,1.4]){
      const x=tank.x+sin*end+cos*side,z=tank.z+cos*end-sin*side;
      renderer.smoke(x,renderer.map.terrain.heightAt(x,z)+.22,z,.68,1.15,0xcbb08d,trackDust);
    }
  }
}
