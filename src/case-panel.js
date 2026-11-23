import {CASE_NAME,CASE_RARITIES,CASE_REWARDS,campaignCaseReward} from '../shared/cases.js';
import {requestCases} from './network.js';
import {mountWeaponPreview} from './weapon-preview.js';
import caseModel from './assets/cases/field-reserve.glb?url';
import './case-panel.css';

const $=id=>document.getElementById(id);
const rarityById=new Map(CASE_RARITIES.map(rarity=>[rarity.id,rarity]));
const rewardById=new Map(CASE_REWARDS.map(reward=>[reward.id,reward]));
const campaignMissions=['m01','m02','m03'];
const campaignDifficulties=['regular','veteran'];

function node(tag,value){
  const item=document.createElement(tag);
  item.textContent=value;
  return item;
}

function rewardLabel(reward,tag='div'){
  const item=document.createElement(tag);
  item.dataset.rarity=reward.rarity;
  item.append(node('small',rarityById.get(reward.rarity).name),node('strong',reward.name));
  return item;
}

export function mountCasePanel({getUrl,getToken,getAccount,getGpuDevice,notify}){
  const open=$('case-open'),retry=$('case-retry'),status=$('case-status');
  const roulette=$('case-roulette'),tape=$('case-tape'),result=$('case-result');
  const readyEvents=new EventTarget();
  const queued=new Set();
  let snapshot,refreshing,opening,animation,lastFailure,epoch=0;
  const preview=mountWeaponPreview({
    panelId:'profile-panel',prefix:'case-preview',getGpuDevice,
    getItem:()=>({key:'field-reserve',name:CASE_NAME,async load(){
      const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
      const {scene}=await new GLTFLoader().loadAsync(caseModel);
      return {model:scene,angle:[.48,.48,0]};
    }}),
  });

  for(const rarity of CASE_RARITIES){
    const row=document.createElement('div');
    row.dataset.rarity=rarity.id;
    row.append(node('dt',rarity.name),node('dd',rarity.chance+'%'));
    $('case-odds').append(row);
  }

  function render(){
    const available=snapshot?.available??0;
    $('open-cases').hidden=!available;
    $('home-case-count').textContent=available;
    $('case-inventory-count').textContent=snapshot?`В наличии ${available}`:'В наличии —';
    open.disabled=!available||Boolean(opening);
    const recent=snapshot?.recent.map(item=>rewardById.get(item.rewardId)).filter(Boolean)??[];
    $('case-history').hidden=!recent.length;
    $('case-history-list').replaceChildren(...recent.map(reward=>rewardLabel(reward,'li')));
  }

  function apply(inventory,version){
    if(version!==epoch||inventory.revision<(snapshot?.revision??0))return false;
    snapshot=inventory;
    render();
    readyEvents.dispatchEvent(new Event('change'));
    return true;
  }

  function setStatus(message='',action=null){
    status.textContent=message;
    lastFailure=action;
    retry.hidden=!action;
  }

  async function context(){
    const url=await getUrl();
    const account=getAccount();
    const token=await getToken(url);
    return {url,token,account};
  }

  const claimKey=(url,account,mission,difficulty)=>
    `sector09-case-campaign:${url}:${account??'guest'}:${mission}:${difficulty}`;

  function hasClaim(key){
    try{return queued.has(key)||localStorage.getItem(key)==='1';}
    catch{return queued.has(key);}
  }

  function forgetClaim(key){
    queued.delete(key);
    try{localStorage.removeItem(key);}catch{}
  }

  async function syncCampaign({url,token,account},version){
    for(const missionId of campaignMissions){
      const pending=campaignDifficulties.map(difficulty=>({
        difficulty,key:claimKey(url,account,missionId,difficulty),
      })).filter(({key})=>hasClaim(key));
      const latest=pending.at(-1);
      if(!latest||version!==epoch)continue;
      const previous=snapshot?.campaign[missionId]??0;
      const {inventory}=await requestCases(url,token,'case-campaign',{missionId,difficulty:latest.difficulty});
      pending.forEach(({key})=>forgetClaim(key));
      const awarded=(inventory.campaign[missionId]??0)-previous;
      if(apply(inventory,version)&&awarded>0)notify(awarded===1?'Получен кейс «Полевой резерв»':'Получены 2 кейса «Полевой резерв»');
    }
  }

  function refresh(afterCurrent=false){
    if(refreshing)return afterCurrent?refreshing.then(()=>refresh()):refreshing;
    const version=epoch;
    if(!snapshot&&!opening)setStatus('Загрузка кейсов…');
    refreshing=(async()=>{
      try{
        const connection=await context();
        if(version!==epoch)return;
        const {inventory}=await requestCases(connection.url,connection.token);
        if(version!==epoch)return;
        apply(inventory,version);
        await syncCampaign(connection,version);
        if(version===epoch&&!opening)setStatus();
      }catch(error){
        if(version===epoch&&!opening)setStatus(error.message,'refresh');
      }
    })().finally(()=>{if(version===epoch)refreshing=null;});
    return refreshing;
  }

  async function claimCampaign(missionId,difficulty){
    const count=campaignCaseReward(missionId,difficulty);
    if(!count)return;
    const account=getAccount();
    const url=await getUrl().catch(()=>null);
    if(!url)return;
    // Preserve the owner at completion. A pending reward follows that owner
    // even if the local mission is replayed, reset, or finished while offline.
    const key=claimKey(url,account,missionId,difficulty);
    queued.add(key);
    try{localStorage.setItem(key,'1');}catch{}
    await refresh(true);
  }

  function showPrize(reward,version){
    roulette.hidden=false;
    const winner=29;
    const strip=Array.from({length:35},(_,index)=>rewardLabel(
      index===winner?reward:CASE_REWARDS[Math.floor(Math.random()*CASE_REWARDS.length)],
    ));
    tape.replaceChildren(...strip);
    const offset=roulette.clientWidth/2-strip[winner].offsetLeft-strip[winner].offsetWidth/2;
    const end=`translateX(${offset}px)`;
    tape.style.transform=end;
    if(!roulette.clientWidth||matchMedia('(prefers-reduced-motion: reduce)').matches)return Promise.resolve();
    const motion=tape.animate([{transform:'translateX(0)'},{transform:end}],{
      duration:3650,easing:'cubic-bezier(.12,.66,.14,1)',fill:'none',
    });
    animation=motion;
    return motion.finished.catch(()=>{}).finally(()=>{
      if(version===epoch)animation=null;
    });
  }

  async function openCase(caseId=snapshot?.nextCaseId){
    if(!caseId||opening)return;
    const version=epoch;
    opening=caseId;
    setStatus('Открываем кейс…');
    render();
    result.hidden=true;
    roulette.hidden=true;
    try{
      const connection=await context();
      if(version!==epoch)return;
      const response=await requestCases(connection.url,connection.token,'case-open',{caseId});
      if(version!==epoch)return;
      const reward=rewardById.get(response.rewardId);
      if(!reward)throw Error('Обновите игру, чтобы увидеть награду.');
      await showPrize(reward,version);
      if(version!==epoch)return;
      apply(response.inventory,version);
      roulette.hidden=true;
      result.replaceChildren(rewardLabel(reward));
      result.hidden=false;
      setStatus();
    }catch(error){
      if(version===epoch)setStatus(error.message,caseId);
    }finally{
      if(version===epoch){opening=null;render();}
    }
  }

  open.onclick=()=>void openCase();
  retry.onclick=()=>void (lastFailure==='refresh'?refresh():openCase(lastFailure));
  addEventListener('online',()=>void refresh());
  render();
  return {
    refresh,
    claimCampaign,
    get campaign(){return snapshot?.campaign;},
    events:readyEvents,
    open(){void preview.update();void refresh();},
    reset(){
      epoch++;
      snapshot=refreshing=opening=null;
      animation?.cancel();
      animation=null;
      result.hidden=roulette.hidden=true;
      render();
      readyEvents.dispatchEvent(new Event('change'));
      void refresh();
    },
  };
}
