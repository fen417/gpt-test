import catalog from '../../shared/campaign/catalog.json' with {type:'json'};

export const CAMPAIGN_PROGRESS_KEY='campaign.v1';
const legacyProgressKey='sector09-campaign-progress-v1';
const initial=()=>({version:1,completed:[],best:{},checkpoints:{},difficulty:'regular',carry:{}});
let transient=null,lastError=false;

export const campaignCatalog=catalog;
export function readCampaignProgress(){
  if(transient)return structuredClone(transient);
  try{
    const stored=JSON.parse(localStorage.getItem(CAMPAIGN_PROGRESS_KEY)??'null');
    const state=stored?.version===1?{...initial(),...stored}:initial();
    if(!state.completed.includes('m01')){
      const old=JSON.parse(localStorage.getItem(legacyProgressKey)??'null');
      if(old?.m01===true){
        state.completed.push('m01');
        state.carry={...state.carry,documents:Boolean(old.documents),courier:Boolean(old.courier)};
      }
    }
    lastError=false;return state;
  }catch{
    lastError=true;transient??=initial();return structuredClone(transient);
  }
}
export function campaignStorageWarning(){return lastError;}
export function saveCampaignProgress(progress){
  const next={...initial(),...progress,version:1};
  transient=structuredClone(next);
  try{localStorage.setItem(CAMPAIGN_PROGRESS_KEY,JSON.stringify(next));transient=null;lastError=false;return true;}
  catch{lastError=true;return false;}
}
export function setCampaignDifficulty(difficulty){
  if(!['recruit','regular','veteran'].includes(difficulty))return;
  const progress=readCampaignProgress();progress.difficulty=difficulty;saveCampaignProgress(progress);
}
export function recordCampaignCheckpoint(missionId,save,when=Date.now()){
  const progress=readCampaignProgress();
  if(!catalog.missions.some(m=>m.id===missionId)||!save)return;
  progress.checkpoints[missionId]={number:save.mission?.checkpoint??save.checkpoint??0,when};
  saveCampaignProgress(progress);
}
export function markCampaignComplete(missionId,results={},flags={}){
  if(!catalog.missions.some(m=>m.id===missionId))return false;
  const progress=readCampaignProgress();
  if(!progress.completed.includes(missionId))progress.completed.push(missionId);
  delete progress.checkpoints[missionId];
  const elapsed=Math.max(0,Number(results.elapsedSeconds??0));
  const previous=progress.best[missionId];
  if(!previous||elapsed>0&&(!previous.elapsedSeconds||elapsed<previous.elapsedSeconds))
    progress.best[missionId]={elapsedSeconds:elapsed,losses:Math.max(0,Number(results.losses??0)),stealth:results.stealth??null};
  const allowed=new Set(['kane_alive','lasko_alive','bruno_alive','duran_alive','tanks_alive','enemy_order']);
  for(const [key,value] of Object.entries(flags))if(allowed.has(key))progress.carry[key]=value;
  saveCampaignProgress(progress);return true;
}
export function campaignMissionStatus(missionId,progress=readCampaignProgress(),unlockAll=false){
  const number=catalog.missions.findIndex(m=>m.id===missionId);
  if(number<0)return 'locked';
  const mission=catalog.missions[number];
  if(progress.completed.includes(missionId))return 'complete';
  if(number>0&&!unlockAll&&!progress.completed.includes(catalog.missions[number-1].id))return 'locked';
  if(!mission.implemented)return 'planned';
  return progress.checkpoints[missionId]?'progress':'available';
}
export function canStartCampaignMission(missionId,progress=readCampaignProgress(),unlockAll=false){
  const mission=catalog.missions.find(m=>m.id===missionId);
  return Boolean(mission?.implemented&&campaignMissionStatus(missionId,progress,unlockAll)!=='locked');
}
export function resetCampaignProgress(){
  const state=initial();saveCampaignProgress(state);
  try{localStorage.removeItem(legacyProgressKey);localStorage.removeItem('sector09-campaign-m01-v1');localStorage.removeItem('sector09-campaign-m02-v1');}
  catch{lastError=true;}
}
