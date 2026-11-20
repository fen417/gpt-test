import {CampaignSession,readCampaignSave} from './session.js';
import {CampaignPresentation} from './presentation.js';
import {SIDEARMS,WEAPONS} from '../../shared/world.js';
import {describeCampaignOutcome} from './outcome.js';
import {campaignCatalog,readCampaignProgress,saveCampaignProgress,setCampaignDifficulty,
  campaignStorageWarning,campaignMissionStatus,canStartCampaignMission} from './progress.js';
import './style.css';
import './map-screen.css';

const cache=new Map();
let dialog;
export async function campaignData(missionId='m01'){
  if(!campaignCatalog.missions.some(m=>m.id===missionId&&m.implemented))throw Error('Эта миссия ещё не готова.');
  if(cache.has(missionId))return cache.get(missionId);
  const pending=Promise.all(['mission.json','ru.json'].map(async file=>{
    const r=await fetch(new URL(`${import.meta.env.BASE_URL}campaign/${missionId}/${file}`,location.href));
    if(!r.ok)throw Error('Не удалось загрузить данные миссии.');
    return r.json();
  })).then(([definition,locale])=>({definition,locale,missionId}))
    .catch(error=>{cache.delete(missionId);throw error;});
  cache.set(missionId,pending);return pending;
}
const minutes=seconds=>seconds>0?`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(Math.floor(seconds%60)).padStart(2,'0')}`:'—';
const debugUnlock=()=>import.meta.env.DEV===true&&new URLSearchParams(location.search).has('unlockAll');
const statusLabels={locked:'ЗАКРЫТО',planned:'В РАЗРАБОТКЕ',available:'ДОСТУПНА',progress:'КОНТРОЛЬНАЯ ТОЧКА',complete:'ВЫПОЛНЕНО'};

function showMissionPreview(mission,status){
  const frame=dialog.querySelector('.campaign-preview-art');
  if(frame.dataset.previewMission===mission.id&&frame.dataset.status===status&&frame.querySelector('img'))return;

  frame.dataset.previewMission=mission.id;
  frame.dataset.status=status;
  frame.querySelector('img')?.remove();
  if(status==='locked'||!mission.previewImage)return;

  const image=document.createElement('img');
  image.alt=mission.previewAlt;
  image.width=960;
  image.height=540;
  image.loading='lazy';
  image.decoding='async';
  image.addEventListener('load',()=>image.classList.add('is-loaded'),{once:true});
  image.addEventListener('error',()=>image.remove(),{once:true});
  image.src=new URL(`${import.meta.env.BASE_URL}campaign/${mission.previewImage}`,location.href).href;
  frame.append(image);
}

function buildScreen(){
  dialog=document.createElement('dialog');
  dialog.className='menu-dialog campaign-menu campaign-map-screen';
  dialog.setAttribute('aria-labelledby','campaign-title');
  dialog.innerHTML=`<div class="campaign-map-paper">
    <header class="campaign-map-head"><button type="button" class="campaign-back" aria-label="Назад">← НАЗАД</button>
      <div><small>ЭКСПЕДИЦИОННАЯ БРИГАДА / ОПЕРАЦИИ</small><h2 id="campaign-title">ПЕСОК И СТАЛЬ</h2><p class="campaign-development-note">КАМПАНИЯ В РАЗРАБОТКЕ · 4 ИЗ 8 МИССИЙ РЕАЛИЗОВАНЫ</p></div>
      <label>СЛОЖНОСТЬ <select id="campaign-difficulty">
        <option value="recruit">Лёгкая</option><option value="regular">Нормальная</option><option value="veteran">Тяжёлая</option>
      </select></label></header>
    <div class="campaign-map-layout">
      <nav class="campaign-mission-list" aria-label="Миссии кампании"></nav>
      <section class="campaign-map-detail" aria-live="polite">
        <div class="campaign-preview-art">
          <svg class="campaign-preview-fallback" viewBox="0 0 900 506" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
            <defs><pattern id="campaign-contours" width="85" height="65" patternUnits="userSpaceOnUse"><path d="M-40 65Q20-15 95 34T195 65" fill="none" stroke="#6a5a40" stroke-width="1.4" opacity=".25"/></pattern></defs>
            <rect width="900" height="506" fill="#b0a17b"/><rect width="900" height="506" fill="url(#campaign-contours)"/>
            <path d="M10 470C160 390 202 268 350 296S615 152 888 42" fill="none" stroke="#4b4333" stroke-width="14" opacity=".24" stroke-dasharray="2 12"/>
            <path d="M10 470C160 390 202 268 350 296S615 152 888 42" fill="none" stroke="#fcf3d4" stroke-width="3" stroke-dasharray="14 12"/>
            <g class="campaign-drawn-nodes" fill="#9d4935" stroke="#3f3a31" stroke-width="2">
              <circle cx="95" cy="435" r="9"/><circle cx="337" cy="296" r="9"/><circle cx="591" cy="190" r="9"/>
              <circle cx="800" cy="96" r="9"/></g>
            <path d="M520 356l52-17 20 34-42 20zM658 311l35-13 14 30-43 12z" fill="#665f4e" opacity=".45"/>
            <g stroke="#55442f" fill="none" stroke-width="3"><path d="M807 76h50m-25-25v50"/><circle cx="832" cy="76" r="31"/></g>
          </svg>
          <div class="campaign-preview-locked" aria-hidden="true">
            <svg viewBox="0 0 64 64" fill="none"><path d="M22 28v-8a10 10 0 0 1 20 0v8" stroke="currentColor" stroke-width="5"/><rect x="13" y="27" width="38" height="28" rx="3" fill="currentColor"/><path d="M32 37v8" stroke="#b5a480" stroke-width="4" stroke-linecap="round"/></svg>
          </div>
        </div>
        <div class="campaign-mission-detail">
          <div class="campaign-mission-meta"><span class="campaign-mission-number"></span><span class="campaign-mission-state"></span></div>
          <h3 class="campaign-mission-title"></h3>
          <div class="campaign-mission-readiness" hidden><span class="campaign-readiness-text"></span><progress class="campaign-readiness-progress" max="100" value="0"></progress></div>
          <p class="campaign-mission-kind"></p><p class="campaign-mission-description"></p>
          <div class="campaign-mission-brief"><div><small>ЗАДАЧА</small><strong class="campaign-mission-objective"></strong></div>
          <div><small>ОПЕРАЦИЯ</small><strong class="campaign-mission-duration"></strong></div></div>
          <fieldset class="campaign-mission-loadout" hidden>
            <legend>Снаряжение Мартена</legend>
            <label>Основное оружие <select name="primary"></select></label>
            <label>Пистолет <select name="sidearm"></select></label>
          </fieldset>
          <p class="campaign-mission-result"></p><p class="campaign-storage-warning" role="status"></p>
          <p class="campaign-menu-error" role="alert"></p>
          <footer class="campaign-mission-buttons"><button type="button" class="campaign-continue panel-secondary">ПРОДОЛЖИТЬ</button>
            <button type="button" class="campaign-play panel-primary">НАЧАТЬ МИССИЮ ↗</button></footer>
        </div>
      </section>
    </div>
    <footer class="campaign-map-foot"><span>ЧАСТОТА «МАЯК» / МАРШРУТ К ЭР-САХИРУ</span><span>← ↑ ↓ ENTER · ESC</span></footer>
  </div>`;
  dialog.querySelector('.campaign-back').onclick=()=>dialog.close();
  const loadout=dialog.querySelector('.campaign-mission-loadout');
  const primary=Object.values(WEAPONS).filter(weapon=>!weapon.sidearm);
  loadout.querySelector('[name="primary"]').replaceChildren(...primary.map(weapon=>new Option(weapon.name,weapon.id)));
  loadout.querySelector('[name="sidearm"]').replaceChildren(...SIDEARMS.map(id=>new Option(WEAPONS[id].name,id)));
  document.body.append(dialog);
  return dialog;
}
function paintCards(selected,progress,selectMission,unlocked){
  const list=dialog.querySelector('.campaign-mission-list');
  list.replaceChildren();
  for(const act of campaignCatalog.acts){
    const heading=document.createElement('h3');
    heading.className='campaign-act-label';heading.textContent=act.title;list.append(heading);
    for(const id of act.missionIds){
      const mission=campaignCatalog.missions.find(m=>m.id===id);
      const status=campaignMissionStatus(id,progress,unlocked);
      const btn=document.createElement('button');
      btn.type='button';btn.className='campaign-map-mission';
      btn.dataset.mission=id;btn.dataset.status=status;
      btn.setAttribute('aria-pressed',String(selected===id));
      const index=document.createElement('span');index.className='campaign-mission-index';index.textContent=String(mission.number).padStart(2,'0');
      const title=document.createElement('span');title.className='campaign-mission-summary';
      const strong=document.createElement('strong');strong.textContent=status==='locked'?`Миссия ${mission.number}`:mission.title;
      const small=document.createElement('small');
      const state=status==='locked'?'Пройдите предыдущую миссию':statusLabels[status];
      small.textContent=Number.isFinite(mission.completionPercent)?`ГОТОВНОСТЬ ${mission.completionPercent}% · ${state}`:state;
      title.append(strong,small);
      const icon=document.createElement('i');icon.textContent=status==='locked'?'▣':status==='complete'?'✓':status==='planned'?'—':'◆';
      btn.append(index,title,icon);btn.onclick=()=>selectMission(id);
      list.append(btn);
    }
  }
}
export async function openCampaignMenu(onStart,{unlockAll=false}={}){
  buildScreenIfNeeded();
  const unlocked=unlockAll||debugUnlock();
  let progress=readCampaignProgress();
  const selector=dialog.querySelector('#campaign-difficulty');
  selector.value=progress.difficulty??'regular';
  selector.onchange=()=>{setCampaignDifficulty(selector.value);progress=readCampaignProgress();};
  let selected=campaignCatalog.missions.find(m=>
    canStartCampaignMission(m.id,progress,unlocked)&&!progress.completed.includes(m.id))?.id??'m01';
  let launching=false;
  const choose=id=>{
    selected=id;progress=readCampaignProgress();
    paintCards(id,progress,choose,unlocked);
    const mission=campaignCatalog.missions.find(m=>m.id===id);
    const status=campaignMissionStatus(id,progress,unlocked);
    dialog.querySelector('.campaign-mission-number').textContent=`МИССИЯ ${String(mission.number).padStart(2,'0')} / 08`;
    showMissionPreview(mission,status);
    dialog.querySelector('.campaign-mission-state').textContent=statusLabels[status];
    dialog.querySelector('.campaign-mission-title').textContent=status==='locked'?`Миссия ${mission.number}`:mission.title;
    const readiness=dialog.querySelector('.campaign-mission-readiness');
    readiness.hidden=!Number.isFinite(mission.completionPercent);
    if(!readiness.hidden){
      dialog.querySelector('.campaign-readiness-text').textContent=`ГОТОВНОСТЬ МИССИИ: ${mission.completionPercent}% · В РАЗРАБОТКЕ`;
      dialog.querySelector('.campaign-readiness-progress').value=mission.completionPercent;
    }
    dialog.querySelector('.campaign-mission-kind').textContent=status==='locked'?'Сведения засекречены':`${mission.kind} · ${mission.character}`;
    dialog.querySelector('.campaign-mission-description').textContent=status==='locked'?'Пройдите предыдущую миссию, чтобы открыть это задание.':mission.preview;
    dialog.querySelector('.campaign-mission-objective').textContent=status==='locked'?'???':mission.objective;
    dialog.querySelector('.campaign-mission-duration').textContent=mission.duration;
    const outcome=progress.outcomes?.[id],best=progress.best[id];
    const result=best
      ?`ЛУЧШЕЕ ВРЕМЯ: ${minutes(best.elapsedSeconds)}${outcome?'':` · ПОТЕРИ: ${best.losses??'—'}`}`
      :progress.checkpoints[id]&&readCampaignSave(id)?`Сохранено: КП ${progress.checkpoints[id].number??0} · ${new Date(progress.checkpoints[id].when).toLocaleString('ru-RU')}`:'';
    dialog.querySelector('.campaign-mission-result').textContent=[result,describeCampaignOutcome(outcome)].filter(Boolean).join(' · ');
    dialog.querySelector('.campaign-storage-warning').textContent=campaignStorageWarning()
      ?'⚠ Хранилище браузера недоступно: прогресс сохранится только до перезагрузки.':'';
    dialog.querySelector('.campaign-menu-error').textContent='';
    dialog.querySelector('.campaign-continue').hidden=!progress.checkpoints[id]||!readCampaignSave(id);
    dialog.querySelector('.campaign-continue').disabled=!mission.implemented||!canStartCampaignMission(id,progress,unlocked);
    const play=dialog.querySelector('.campaign-play');
    play.disabled=!canStartCampaignMission(id,progress,unlocked);
    dialog.querySelector('.campaign-mission-loadout').hidden=id!=='m03'||play.disabled;
    play.textContent=status==='planned'?'В РАЗРАБОТКЕ':status==='locked'?'ЗАКРЫТО':status==='complete'?'ПЕРЕИГРАТЬ ↗':'НАЧАТЬ МИССИЮ ↗';
    dialog.dataset.mission=id;
  };
  const launch=async resume=>{
    if(launching)return;
    const missionId=selected;
    if(!canStartCampaignMission(missionId,progress,unlocked))return;
    const save=resume?readCampaignSave(missionId):null;
    if(resume&&!save){dialog.querySelector('.campaign-menu-error').textContent='Контрольная точка недоступна. Начните миссию заново.';return;}
    if(!resume&&readCampaignSave(missionId)&&!window.confirm('Начать миссию сначала? Последняя контрольная точка будет перезаписана.'))return;
    const loadout=!resume&&missionId==='m03'?{
      primary:dialog.querySelector('.campaign-mission-loadout [name="primary"]').value,
      sidearm:dialog.querySelector('.campaign-mission-loadout [name="sidearm"]').value,
    }:undefined;
    launching=true;
    try{
      const data=await campaignData(missionId);
      dialog.close();
      await onStart({...data,difficulty:resume?save.difficulty:selector.value,save,missionId,campaignProgress:progress,loadout});
    }catch(error){
      dialog.querySelector('.campaign-menu-error').textContent=error?.message??String(error);
      if(!dialog.open)dialog.showModal();
    }finally{launching=false;}
  };
  dialog.querySelector('.campaign-play').onclick=()=>launch(false);
  dialog.querySelector('.campaign-continue').onclick=()=>launch(true);
  dialog.onkeydown=event=>{
    if(event.target?.tagName==='SELECT')return;
    const idx=campaignCatalog.missions.findIndex(m=>m.id===selected);
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){
      event.preventDefault();
      const next=(idx+(event.key==='ArrowDown'?1:-1)+campaignCatalog.missions.length)%campaignCatalog.missions.length;
      choose(campaignCatalog.missions[next].id);
      dialog.querySelector(`[data-mission="${selected}"]`)?.focus({preventScroll:true});
    }else if(event.key==='Enter'&&(
      event.target?.closest?.('.campaign-map-mission')||event.target===dialog
    )){
      event.preventDefault();launch(Boolean(progress.checkpoints[selected]&&readCampaignSave(selected)));
    }
  };
  choose(selected);
  dialog.showModal();
}
function buildScreenIfNeeded(){if(!dialog)buildScreen();}
export {CampaignSession,CampaignPresentation};
