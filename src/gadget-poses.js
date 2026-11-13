// Visual contact points in metres. Model, hands and camera framing share these
// coordinates; gameplay and projectile origins are independent of this module.
const triggerShiftZ = -.20;
export const LAUNCHER_POSE = {
  triggerShiftZ, supportZ: -.36,
  model: [.05,-.02,.05],
  rightOffset: [.05,0,.045+triggerShiftZ],
  leftContact: [.015,-.090,-.33],
  hip: [.13,-.14,-.52], ads: [-.05,-.125,-.45],
};
export const SUPPLY_POSE = {
  leftWrist: [-.10,-.030,.13], rightWrist: [.10,-.030,.13],
  hip: [0,-.22,-.58], ads: [0,-.19,-.56],
  // Both cases put their bottom on y=0 and their near edge at z=.10.
  ammo: { scale:.55, position:[0,0,.00375] },
  medkit: { scale:1, position:[0,.080,.015] },
};
