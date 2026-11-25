import {vehiclePartPose} from '../shared/vehicles.js';

// Authored engine deck in art-source/tank/build_rubezh.py:
// plate center (0,1.493,2.12), grille tops at y=1.552.
// Anchor on the plate itself, not the highest point anywhere on the hull.
export const TANK_FIRE_DECK=Object.freeze({x:0,y:1.51,z:2.12});
export function tankFireAnchor(vehicle,rig,out){
  const {x,y,z}=TANK_FIRE_DECK;
  if(rig?.body&&rig.group?.visible!==false){out.set(x,y,z);return rig.body.localToWorld(out);}
  return vehiclePartPose(vehicle,x,y,z,out);
}

// Keep a short, readable flash in ADS, with no large world-space halo.
// The real light continues to illuminate the world, not the FPV optics.
export function adsFlashFactor(aim=0){const t=Math.max(0,Math.min(1,aim));return 1-.82*t*t*(3-2*t);}
export function scriptedTankFire(vehicle,missionId){return missionId==='m03'&&vehicle.type==='tank'&&vehicle.convoyIndex!==undefined&&vehicle.scriptedLoss===true;}

// Keep the lower visible part of an animated flame intersecting the grille.
export const tankFlameCenter=height=>height*.5-.18;
