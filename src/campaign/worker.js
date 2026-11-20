import {CampaignSimulation,validCampaignSave} from '../../shared/campaign/simulation.js';
import {Mission2Simulation,validMission2Save} from '../../shared/campaign/mission2.js';
import {Mission3Simulation,validMission3Save} from '../../shared/campaign/mission3.js';
import {Mission4Simulation,validMission4Save} from '../../shared/campaign/mission4.js';

const missions={m01:[CampaignSimulation,validCampaignSave],m02:[Mission2Simulation,validMission2Save],
  m03:[Mission3Simulation,validMission3Save],m04:[Mission4Simulation,validMission4Save]};

let sim,paused=true,last=0,accumulator=0,tick=0,input={},lastSaveRevision=-1;
function send(){
  if(!sim)return;
  const state=sim.snapshot();self.postMessage({type:'state',state});
  if(sim.campaign.saveRevision!==lastSaveRevision){
    lastSaveRevision=sim.campaign.saveRevision;
    if(sim.campaign.latestSave)self.postMessage({type:'save',save:sim.campaign.latestSave,complete:sim.campaign.complete,flags:state.campaign.flags});
  }
}
self.onmessage=event=>{
  try{
    const m=event.data;
    if(m.type==='create'){
      const [Sim,valid]=missions[m.definition.id];
      sim=new Sim(m.definition,{...m.options,lines:m.lines});
      if(m.save){
        if(!valid(m.save,m.definition)||!sim.campaign.restore(m.save))
          throw Error('Сохранение кампании повреждено или устарело. Начните миссию заново.');
      }
      last=performance.now();send();return;
    }
    if(!sim)return;
    if(m.type==='paused'){paused=Boolean(m.value);last=performance.now();accumulator=0;if(paused){input={};sim.setInput('local',{});}return;}
    if(m.type==='input'){input=m.input;return;}
    if(m.type==='command'){
      // Weapon/order/camera commands must not wipe the current 60Hz driving
      // or aiming controls. In particular, target lock needs the last yaw.
      const id=sim.campaign?.definition?.id;
      const liveCommand=id==='m01'&&m.command?.type==='nightVision'||
        id==='m02'&&['weapon','order','repair','targetLock','cruise'].includes(m.command?.type)||
        id==='m03'&&['order','smoke','talk','answer'].includes(m.command?.type)||
        id==='m04'&&['order','barrel'].includes(m.command?.type);
      if(!liveCommand){input={};sim.setInput('local',{});}
      sim.campaign.command(m.command);send();
    }
  }catch(error){self.postMessage({type:'error',message:error.message});}
};
setInterval(()=>{
  const now=performance.now(),elapsed=Math.max(0,(now-last)/1000);last=now;
  if(!sim||paused||sim.campaign.awaitingLoadout||sim.campaign.failed||sim.campaign.complete)return;
  // Audio cannot override the fixed simulation clock. Publish at most one
  // snapshot per wake-up, even when the worker catches up several ticks.
  accumulator=Math.min(.1,accumulator+elapsed);let steps=0,sendState=false;
  try{
    while(accumulator>=1/60&&steps++<5){
      sim.setInput('local',input);sim.step(1/60);accumulator-=1/60;tick++;
      const blocked=sim.campaign.awaitingLoadout||sim.campaign.failed||sim.campaign.complete;
      sendState||=tick%2===0||blocked;
      if(blocked)break;
    }
    if(sendState)send();
  }catch(error){paused=true;self.postMessage({type:'error',message:error.message});}
},1000/60);
