import {activateGadget} from '../gadgets.js';

export const reviveDuration=(rescuer,seconds)=>seconds*(rescuer?.classId==='medic'?.75:1);

export function dropCampaignMedkit(sim,medic,onDrop){
  if(!medic?.alive||medic.downed||medic.wounded||medic.vehicleId||medic.gadgetAction||medic.pendingGadget)return;
  if(sim.time<(medic.aidCheckAt??0))return;
  medic.aidCheckAt=sim.time+.5;
  medic.nextCampaignAid??=sim.time+40;
  const mates=[...sim.players.values()].filter(p=>p.team===medic.team&&p.alive&&p!==medic);
  if(mates.some(p=>p.reviver===medic.id))return;
  const nearby=mates.some(p=>!p.vehicleId&&!p.downed&&p.hp<85&&
    Math.hypot(p.x-medic.x,p.y-medic.y,p.z-medic.z)<8);
  if(nearby&&sim.time>=(medic.lastCampaignAid??-60)+60)
    medic.nextCampaignAid=Math.min(medic.nextCampaignAid,sim.time+22);
  if(sim.time<medic.nextCampaignAid)return;
  if(activateGadget(sim,medic,true)){
    medic.lastCampaignAid=sim.time;medic.nextCampaignAid=sim.time+280;onDrop();
  }
  else medic.nextCampaignAid=sim.time+1;
}
