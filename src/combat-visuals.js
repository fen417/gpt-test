import {vehiclePartPose,TANK_TURRET_BASE_Y} from '../shared/vehicles.js';

// +Z is the rear of the tank. Use the stable body parent, not the turret
// (which is thrown aside on destruction) or the ground-level vehicle root.
export function tankFireAnchor(vehicle,rig,out){
  const hull=rig?.levels?.[0]?.hull?.geometry;
  if(hull&&!hull.boundingBox)hull.computeBoundingBox();
  const bounds=hull?.boundingBox;
  const deck=Math.max(TANK_TURRET_BASE_Y,bounds?.max.y??0)+.10;
  const rear=(bounds?.max.z??3.38)*.56;
  if(rig?.body){out.set(0,deck,rear);return rig.body.localToWorld(out);}
  const p=vehiclePartPose(vehicle,0,deck,rear,out);return p;
}

// Keep a short, readable flash in ADS, with no large world-space halo.
// The real light continues to illuminate the world, not the FPV optics.
export function adsFlashFactor(aim=0){const t=Math.max(0,Math.min(1,aim));return 1-.82*t*t*(3-2*t);}
export function scriptedTankFire(vehicle,missionId){return missionId==='m03'&&vehicle.type==='tank'&&vehicle.convoyIndex!==undefined&&vehicle.scriptedLoss===true;}
