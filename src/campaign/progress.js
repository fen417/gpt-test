import catalog from '../../shared/campaign/catalog.json' with {type:'json'};

export const CAMPAIGN_PROGRESS_KEY='campaign.v1';
export const CAMPAIGN_PROFILE_EVENT='sector09:campaign-achievement';
const legacyProgressKey='sector09-campaign-progress-v1';
const initial=()=>({version:1,completed:[],best:{},outcomes:{},checkpoints:{},difficulty:'regular',carry:{}});
let transient=null,lastError=false;

export const campaignCatalog=catalog;
export const campaignRecordKey=id=>catalog.missions.find(m=>m.id===id)?.recordKey??id;
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
  progress.checkpoints[missionId]={number:save.mission?.checkpoint??save.checkpoint??0,when,version:save.version};
  saveCampaignProgress(progress);
  globalThis.dispatchEvent?.(new CustomEvent(CAMPAIGN_PROFILE_EVENT,{detail:{missionId,checkpoint:progress.checkpoints[missionId].number}}));
}
export function markCampaignComplete(missionId,results={},flags={}){
  if(!catalog.missions.some(m=>m.id===missionId))return false;
  const progress=readCampaignProgress();
  if(!progress.completed.includes(missionId))progress.completed.push(missionId);
  delete progress.checkpoints[missionId];
  const elapsed=Math.max(0,Number(results.elapsedSeconds??0));
  const record=campaignRecordKey(missionId),previous=progress.best[record];
  if(!previous||elapsed>0&&(!previous.elapsedSeconds||elapsed<previous.elapsedSeconds))
    progress.best[record]={elapsedSeconds:elapsed,losses:Math.max(0,Number(results.losses??0)),stealth:results.stealth??null};
  if(results.outcome)(progress.outcomes??={})[record]=results.outcome;
  const allowed=new Set(['kane_alive','lasko_alive','bruno_alive','duran_alive','tanks_alive','enemy_order',
    'marten_wounded','m3_done','harranti_alive','brigade_saved','m3_documents','m4_done','m4_radio_code','m4_tanks_killed','sappers_alive',
    'm4_dispatcher_alive','m4_signal_sent','m5_done','m5_fuel_saved','m5_fuel_reserve','m5_mayak_compromised','vos_alive','timo_alive','rafa_alive']);
  for(const [key,value] of Object.entries(flags))if(allowed.has(key))progress.carry[key]=value;
  saveCampaignProgress(progress);
  globalThis.dispatchEvent?.(new CustomEvent(CAMPAIGN_PROFILE_EVENT,{detail:{missionId,completed:true,bestSeconds:elapsed}}));
  return true;
}
export function campaignMissionStatus(missionId,progress=readCampaignProgress(),unlockAll=false){
  const number=catalog.missions.findIndex(m=>m.id===missionId);
  if(number<0)return 'locked';
  const mission=catalog.missions[number];
  const record=campaignRecordKey(missionId);
  if(record===missionId?progress.completed.includes(missionId):Boolean(progress.best[record]))return 'complete';
  if(number>0&&!unlockAll&&!progress.completed.includes(catalog.missions[number-1].id))return 'locked';
  if(!mission.implemented)return 'planned';
  const point=progress.checkpoints[missionId];
  return point&&(!mission.saveVersion||point.version===mission.saveVersion)?'progress':'available';
}
export function canStartCampaignMission(missionId,progress=readCampaignProgress(),unlockAll=false){
  const mission=catalog.missions.find(m=>m.id===missionId);
  return Boolean(mission?.implemented&&campaignMissionStatus(missionId,progress,unlockAll)!=='locked');
}
export function resetCampaignProgress(){
  const state=initial();saveCampaignProgress(state);
  try{
    localStorage.removeItem(legacyProgressKey);
    for(const m of catalog.missions){
      localStorage.removeItem(`sector09-campaign-${m.id}-v1`);
      if(m.saveVersion)localStorage.removeItem(`sector09-campaign-${m.id}-v${m.saveVersion}`);
    }
  }
  catch{lastError=true;}
}
