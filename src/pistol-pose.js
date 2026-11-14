const clamp=value=>Math.max(0,Math.min(1,Number(value)||0));

// A one-handed high-ready stance. The entire held rig shares this transform,
// so the firing hand stays wrapped around the grip rather than drifting away.
export function applyPistolSprintPose(weapon,sprint,aim,reload,kick,cycle){
  const weight=clamp(sprint)*(1-clamp(aim))*(1-clamp(reload))*(1-clamp(kick*3));
  weapon.position.x+=weight*.08;
  weapon.position.y+=weight*(.135+Math.sin(cycle)*.003);
  weapon.position.z+=weight*.08;
  weapon.rotation.x+=weight*(1.10+Math.cos(cycle)*.012);
  weapon.rotation.y+=weight*.15;
  weapon.rotation.z-=weight*(.12+Math.sin(cycle)*.009);
  return weight;
}
