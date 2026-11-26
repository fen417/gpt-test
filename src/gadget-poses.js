// Visual contact points in metres. Model, hands and camera framing share these
// coordinates; gameplay and projectile origins are independent of this module.
const triggerShiftZ = -.20;
export const LAUNCHER_POSE = {
  triggerShiftZ, supportZ: -.36,
  model: [.05,-.02,.05],
  rightOffset: [.05,0,.045+triggerShiftZ],
  leftContact: [.015,-.090,-.33],
  hip: [.13,-.14,-.55], ads: [-.05,-.125,-.50],
  remoteModel: [.024,.145,.160],
  remoteSupport: [.001,.085,-.205],
  remoteShoulder: [.024,.048,.235],
};
export const RIFLE_SUPPORT_POSE = {
  origin:[-.018,-.075,-.36], wrist:[-.077,-.112,-.355], palm:[-.035,-.043,-.423],
};
export const RIFLE_TRIGGER_WRIST = [.040,-.205,.154];
export const SUPPLY_POSE = {
  leftWrist: [-.150,-.052,.102], rightWrist: [.150,-.052,.102],
  hip: [0,-.22,-.58], ads: [0,-.19,-.56],
  // Both cases put their bottom on y=0 and their near edge at z=.10.
  ammo: { scale:.55, position:[0,0,.00375], handSpread:.008 },
  medkit: { scale:1, position:[0,0,.015], handSpread:0 },
  claymore: { scale:.78, position:[0,-.027,.022], handSpread:.029 },
};
export const DEFIB_POSE = {
  leftWrist:[-.070,.115,.070], rightWrist:[.070,.115,.070],
  left:[-.17,0,-.22], right:[.17,0,-.22],
  paddleYaw:.48,
  unit:[0,-.092,.015],
  hip:[0,-.22,-.50], ads:[0,-.19,-.53],
};
export const BINOCULAR_POSE = {
  hip:[0,-.255,-.47],ads:[0,-.085,-.255],
  scale:1,position:[0,-.018,.015],handSpread:0,
  leftWrist:[-.119,-.037,.130],rightWrist:[.119,-.037,.130],
};
