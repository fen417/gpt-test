import {CampaignSimulation,validCampaignSave} from '../../shared/campaign/simulation.js';
import {Mission2Simulation,validMission2Save} from '../../shared/campaign/mission2.js';

let sim,paused=true,last=0,accumulator=0,tick=0,input={},lastSaveRevision=-1;
let musicClock=null;
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
      const second=m.definition.id==='m02';
      sim=second?new Mission2Simulation(m.definition,{...m.options,lines:m.lines}):
        new CampaignSimulation(m.definition,{...m.options,lines:m.lines});
      if(m.save){
        const valid=second?validMission2Save(m.save,m.definition):validCampaignSave(m.save,m.definition);
        if(!valid||!sim.campaign.restore(m.save))
          throw Error('Сохранение кампании повреждено или устарело. Начните миссию заново.');
      }
      last=performance.now();send();return;
    }
    if(!sim)return;
    if(m.type==='paused'){paused=Boolean(m.value);last=performance.now();accumulator=0;musicClock=null;if(paused){input={};sim.setInput('local',{});}return;}
    if(m.type==='musicClock'&&sim.campaign.definition.id==='m02'&&Number.isFinite(m.seconds)&&Math.abs(m.seconds-sim.campaign.elapsed)<2){musicClock={seconds:m.seconds,at:performance.now()};return;}
    if(m.type==='input'){input=m.input;return;}
    if(m.type==='command'){
      // Weapon/order/camera commands must not wipe the current 60Hz driving
      // or aiming controls. In particular, target lock needs the last yaw.
      const liveCommand=sim.campaign?.definition?.id==='m02'&&
        ['weapon','order','repair','targetLock','cruise'].includes(m.command?.type);
      if(!liveCommand){input={};musicClock=null;sim.setInput('local',{});}
      sim.campaign.command(m.command);send();
    }
  }catch(error){self.postMessage({type:'error',message:error.message});}
};
setInterval(()=>{
  const now=performance.now(),elapsed=Math.max(0,(now-last)/1000);last=now;
  if(!sim||paused||sim.campaign.awaitingLoadout||sim.campaign.failed||sim.campaign.complete)return;
  accumulator=Math.min(.1,accumulator+elapsed);let steps=0;
  if(musicClock&&now-musicClock.at<300&&!sim.campaign.cutscene){accumulator=Math.max(0,Math.min(.2,musicClock.seconds+(now-musicClock.at)/1000-sim.campaign.elapsed));}
  try{
    while(accumulator>=1/60&&steps++<(musicClock?12:3)){
      sim.setInput('local',input);sim.step(1/60);accumulator-=1/60;tick++;
      const blocked=sim.campaign.awaitingLoadout||sim.campaign.failed||sim.campaign.complete;
      if(tick%2===0||blocked)send();
      if(blocked)break;
    }
    if(accumulator>=1/60)accumulator%=1/60;
  }catch(error){paused=true;self.postMessage({type:'error',message:error.message});}
},1000/60);
