import {campaignCatalog} from './campaign/progress.js';

export const PROFILE_MISSIONS=campaignCatalog.missions.filter(mission=>mission.implemented);

export function mergeCampaignResult(previous,next){
  const time=value=>Number.isFinite(value)&&value>0&&value<=604800?value:0;
  const checkpoint=value=>Number.isInteger(value)&&value>=0&&value<=9999?value:0;
  const older=time(previous?.bestSeconds),newer=time(next?.bestSeconds);
  return {
    completed:previous?.completed===true||next?.completed===true,
    checkpoint:Math.max(checkpoint(previous?.checkpoint),checkpoint(next?.checkpoint)),
    bestSeconds:older&&newer?Math.min(older,newer):Math.max(older,newer),
  };
}

export function localCampaignSummary(progress){
  const summary={};
  for(const mission of PROFILE_MISSIONS){
    const id=mission.id,completed=progress.completed.includes(id);
    const checkpoint=progress.checkpoints[id]?.number??0;
    const bestSeconds=progress.best[id]?.elapsedSeconds??0;
    if(completed||checkpoint||bestSeconds)summary[id]={completed,checkpoint,bestSeconds};
  }
  return summary;
}

export function favorite(entries,labels){
  return Object.keys(labels).reduce((best,key)=>(entries?.[key]??0)>(entries?.[best]??0)?key:best,'')||null;
}
