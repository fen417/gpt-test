import {CAMPAIGN_CASE_MISSIONS,CASE_TYPES,CASE_RARITIES,FIELD_RESERVE,POLAR_CIRCUIT,RELEASE_CASE_VERSION,getCaseType,caseReward,campaignCaseReward} from '../shared/cases.js';
import {WEAPONS} from '../shared/world.js';
import {requestCases} from './network.js';
import {mountWeaponPreview} from './weapon-preview.js';
import {cloneWeaponModel,loadWeaponDetail,loadWeaponModels} from './weapon-models.js';
import {setWeaponSkin,weaponSkinUrl} from './weapon-skins.js';
import './case-panel.css';

const $=id=>document.getElementById(id);
const rarityById=new Map(CASE_RARITIES.map(rarity=>[rarity.id,rarity]));
const campaignDifficulties=['regular','veteran'];
const caseModels=import.meta.glob('./assets/cases/*.glb',{eager:true,query:'?url',import:'default'});

function node(tag,value){
  const item=document.createElement(tag);
  item.textContent=value;
  return item;
}

function rewardLabel(reward,tag='div'){
  const item=document.createElement(tag);
  item.dataset.rarity=reward.rarity;
  item.append(node('small',rarityById.get(reward.rarity).name),node('strong',reward.name),
    node('span',WEAPONS[reward.weaponId].name));
  return item;
}

export function mountCasePanel({getUrl,getToken,getAccount,getGpuDevice,getLowWeaponDetail,notify}){
  const open=$('case-open'),retry=$('case-retry'),status=$('case-status');
  const roulette=$('case-roulette'),tape=$('case-tape'),result=$('case-result');
  const readyEvents=new EventTarget();
  const queued=new Set();
  const catalogue=new Map(),equipButton=$('case-equip-skin');
  const choices=new Map();
  let selected=CASE_TYPES[0],selectionMade=false;
  let showing=null,equipping=false,caseLoadout;
  let snapshot,refreshing,opening,animation,lastFailure,epoch=0;
  const preview=mountWeaponPreview({
    panelId:'profile-panel',prefix:'case-preview',getGpuDevice,
    getItem:()=>{
      if(showing){
        const {id,weaponId,name}=showing;
        const lowDetail=getLowWeaponDetail();
        return {
          key:id+(weaponId==='ar416'?(lowDetail?':low':':detailed'):''),name:`${WEAPONS[weaponId].name} · ${name}`,
          async load(){
            await Promise.all([loadWeaponModels(),lowDetail?null:loadWeaponDetail(weaponId)]);
            const model=cloneWeaponModel(weaponId,!lowDetail);
            if(!model)throw Error('Модель оружия недоступна.');
            await setWeaponSkin(model,weaponId,id);
            return {model,angle:[.045,Math.PI/2-.11,0],dispose:()=>void setWeaponSkin(model,weaponId,null)};
          },
        };
      }
      const {id,name}=selected;
      return {
        key:id,name,
        async load(){
          const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
          const {scene}=await new GLTFLoader().loadAsync(caseModels[`./assets/cases/${id}.glb`]);
          return {model:scene,angle:[.48,.48,0],dispose:()=>{
            const geometries=new Set(),materials=new Set(),textures=new Set();
            scene.traverse(mesh=>{
              if(!mesh.isMesh)return;
              geometries.add(mesh.geometry);
              materials.add(mesh.material);
              if(mesh.material.map)textures.add(mesh.material.map);
            });
            for(const resource of [...geometries,...materials,...textures])resource.dispose();
          }};
        },
      };
    },
  });

  for(const type of CASE_TYPES){
    const button=node('button',type.name);
    const count=node('span','—');
    button.type='button';
    button.className='panel-secondary';
    button.append(count);
    button.onclick=()=>{
      selectionMade=true;
      if(selected===type&&!showing)return;
      selected=type;
      result.hidden=true;
      roulette.hidden=true;
      tape.replaceChildren();
      if(lastFailure!=='refresh')setStatus();
      inspect(null);
    };
    choices.set(type.id,{button,count});
    $('case-type-picker').append(button);
  }

  for(const rarity of CASE_RARITIES){
    const row=document.createElement('div');
    row.dataset.rarity=rarity.id;
    row.append(node('dt',rarity.name),node('dd',rarity.chance+'%'));
    $('case-odds').append(row);
  }

  function buildCatalogue(){
    catalogue.clear();
    $('case-skins').replaceChildren();
    for(const reward of selected.rewards){
      const button=rewardLabel(reward,'button');
      button.type='button';
      button.dataset.skin=reward.id;
      button.setAttribute('aria-pressed','false');
      const pattern=node('img','');
      pattern.alt='';
      pattern.width=160;
      pattern.height=50;
      pattern.loading='lazy';
      pattern.src=weaponSkinUrl(reward.id);
      const ownership=node('small','');
      ownership.className='case-skin-ownership';
      button.prepend(pattern);
      button.append(ownership);
      button.onclick=()=>{inspect(reward);$('case-preview').scrollIntoView({block:'nearest'});};
      catalogue.set(reward.id,{button,ownership});
      $('case-skins').append(button);
    }
  }
  buildCatalogue();

  function inspect(reward){
    if(reward)selected=getCaseType(reward.caseType);
    showing=reward;
    if(!catalogue.has(selected.rewards[0].id))buildCatalogue();
    render();
    void preview.update();
  }
  $('case-show-crate').onclick=()=>inspect(null);

  function renderCatalogue(){
    for(const [id,{button,ownership}] of catalogue){
      button.setAttribute('aria-pressed',String(id===showing?.id));
      ownership.textContent=caseLoadout?.owned?.[id]?`В коллекции ×${caseLoadout.owned[id]}`:'';
    }
    $('case-selected-skin').hidden=!showing;
    const owned=caseLoadout?.owned?.[showing?.id];
    const equipped=owned&&caseLoadout.equipped?.[showing.weaponId]===showing.id;
    if(showing){
      const {name,chance}=rarityById.get(showing.rarity);
      $('case-selected-description').textContent=`${name} · ${chance}% на редкость · ${equipped?'Экипирован':owned?'Получен':'Доступен в кейсе'}`;
    }
    equipButton.hidden=!owned;
    equipButton.disabled=equipping||Boolean(opening);
    equipButton.textContent=equipped?'Снять скин':'Экипировать';
  }

  function bucket(typeId){
    return snapshot?.availableByType?.[typeId]??(typeId===FIELD_RESERVE?snapshot:null);
  }

  function render(){
    const available=snapshot?.available??0;
    $('open-cases').hidden=!available;
    $('home-case-count').textContent=available;
    $('case-inventory-count').textContent=snapshot?`В наличии ${bucket(selected.id)?.available??0}`:'В наличии —';
    open.disabled=!bucket(selected.id)?.nextCaseId||Boolean(opening)||equipping;
    for(const [id,{button,count}] of choices){
      count.textContent=snapshot?String(bucket(id)?.available??0):'—';
      button.disabled=Boolean(opening)||equipping;
      button.setAttribute('aria-pressed',String(selected.id===id));
    }
    const recent=snapshot?.recent.map(item=>caseReward(item.rewardId)).filter(Boolean)??[];
    $('case-history').hidden=!recent.length;
    $('case-history-list').replaceChildren(...recent.map(reward=>{
      const label=rewardLabel(reward,'li');
      label.append(node('span',getCaseType(reward.caseType).name));
      return label;
    }));
    renderCatalogue();
  }

  function apply(inventory,version){
    if(version!==epoch||inventory.revision<(snapshot?.revision??0))return false;
    const first=!snapshot;
    snapshot=inventory;
    caseLoadout={owned:inventory.owned??{},equipped:inventory.equipped??{}};
    const stocked=first&&!selectionMade&&!bucket(selected.id)?.available&&
      CASE_TYPES.find(type=>bucket(type.id)?.available);
    if(stocked){selected=stocked;inspect(null);}
    else render();
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

  function loadoutKey({url,account}){
    return `sector09-case-skins:${url}:${account??'guest'}`;
  }

  function remember(context){
    try{localStorage.setItem(loadoutKey(context),JSON.stringify(caseLoadout));}catch{}
  }

  async function equip(weaponId,rewardId){
    if(equipping||opening)return false;
    const version=epoch;
    equipping=true;
    render();
    try{
      const connection=await context();
      if(version!==epoch)return false;
      const {inventory}=await requestCases(connection.url,connection.token,'case-equip',{weaponId,rewardId});
      if(version!==epoch)return false;
      if(apply(inventory,version))remember(connection);
      setStatus();
      return true;
    }catch(error){
      if(version===epoch)notify(error.message);
      return false;
    }finally{
      if(version===epoch){equipping=false;render();}
    }
  }
  equipButton.onclick=()=>{
    const {weaponId,id}=showing;
    void equip(weaponId,caseLoadout.equipped?.[weaponId]===id?null:id);
  };

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
    for(const missionId of CAMPAIGN_CASE_MISSIONS){
      const pending=campaignDifficulties.map(difficulty=>({
        difficulty,key:claimKey(url,account,missionId,difficulty),
      })).filter(({key})=>hasClaim(key));
      const latest=pending.at(-1);
      if(!latest||version!==epoch)continue;
      const previous=snapshot;
      const {inventory}=await requestCases(url,token,'case-campaign',{missionId,difficulty:latest.difficulty});
      if((inventory.polarCampaign?.[missionId]??0)>=campaignCaseReward(missionId,latest.difficulty))
        pending.forEach(({key})=>forgetClaim(key));
      if(!apply(inventory,version))continue;
      const awards=CASE_TYPES.flatMap(type=>{
        const ledger=type.id===FIELD_RESERVE?'campaign':'polarCampaign';
        const count=(inventory[ledger]?.[missionId]??0)-(previous?.[ledger]?.[missionId]??0);
        return count>0?[`«${type.name}» ×${count}`]:[];
      });
      if(awards.length)notify(`Награда за миссию · ${awards.join(' и ')}`);
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
        if(!caseLoadout){
          try{caseLoadout=JSON.parse(localStorage.getItem(loadoutKey(connection)));}catch{}
          if(caseLoadout){renderCatalogue();readyEvents.dispatchEvent(new Event('change'));}
        }
        const {inventory}=await requestCases(connection.url,connection.token,'case-list',{welcomeCase:true,releaseCase:RELEASE_CASE_VERSION});
        if(version!==epoch)return;
        if(apply(inventory,version))remember(connection);
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
    const rewards=getCaseType(reward.caseType).rewards;
    const strip=Array.from({length:35},(_,index)=>rewardLabel(
      index===winner?reward:rewards[Math.floor(Math.random()*rewards.length)],
    ));
    tape.replaceChildren(...strip);
    const offset=roulette.clientWidth/2-strip[winner].offsetLeft-strip[winner].offsetWidth/2;
    const end=`translateX(${offset}px)`;
    tape.style.transform=end;
    if(!roulette.clientWidth||matchMedia('(prefers-reduced-motion: reduce)').matches)return Promise.resolve();
    const motion=tape.animate([{transform:'translateX(0)'},{transform:end}],{
      duration:8395,easing:'cubic-bezier(.12,.66,.14,1)',fill:'none',
    });
    animation=motion;
    return motion.finished.catch(()=>{}).finally(()=>{
      if(version===epoch)animation=null;
    });
  }

  async function openCase(caseId=bucket(selected.id)?.nextCaseId){
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
      const reward=caseReward(response.rewardId);
      if(!reward)throw Error('Обновите игру, чтобы увидеть награду.');
      await showPrize(reward,version);
      if(version!==epoch)return;
      if(apply(response.inventory,version))remember(connection);
      roulette.hidden=true;
      result.replaceChildren(rewardLabel(reward));
      result.hidden=false;
      inspect(reward);
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
    equip,
    get loadout(){return caseLoadout;},
    get campaign(){return snapshot&&{[FIELD_RESERVE]:snapshot.campaign,[POLAR_CIRCUIT]:snapshot.polarCampaign};},
    events:readyEvents,
    open(){void preview.update();void refresh();},
    reset(){
      epoch++;
      snapshot=refreshing=opening=null;
      equipping=false;
      caseLoadout=null;
      selectionMade=false;
      selected=CASE_TYPES[0];
      animation?.cancel();
      animation=null;
      result.hidden=roulette.hidden=true;
      setStatus();
      inspect(null);
      readyEvents.dispatchEvent(new Event('change'));
      void refresh();
    },
  };
}
