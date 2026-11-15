import {CampaignSession,readCampaignSave} from './session.js';
import {CampaignPresentation} from './presentation.js';
import './style.css';

let dataPromise,dialog;
export function campaignData(){
  return dataPromise??=Promise.all(['mission.json','ru.json'].map(async file=>{const r=await fetch(new URL(`${import.meta.env.BASE_URL}campaign/m01/${file}`,location.href));if(!r.ok)throw Error('Не удалось загрузить данные кампании.');return r.json();})).then(([definition,locale])=>({definition,locale})).catch(error=>{dataPromise=null;throw error;});
}
export async function openCampaignMenu(onStart){
  const data=await campaignData();
  if(!dialog){
    dialog=document.createElement('dialog');dialog.className='menu-dialog campaign-menu';dialog.setAttribute('aria-labelledby','campaign-title');
    dialog.innerHTML='<header class="menu-panel-header"><div><span class="section-kicker">ЭКСПЕДИЦИОННАЯ БРИГАДА / КАМПАНИЯ</span><h2 id="campaign-title">Высадка у вади</h2><p>Аль-Хадра · 02:00 · Взвод Дюрана</p></div><button class="panel-close" aria-label="Закрыть">×</button></header><div class="campaign-menu-body"><div class="campaign-intro-map" aria-hidden="true"><span>РУСЛО</span><i>↗</i><span>ГРЯДА</span><i>↗</i><span>СКЛАД</span><i>↗</i><span>АЛЬ-ХАДРА</span></div><p>Пройдите через ночной дозор, уничтожьте тыловой склад и захватите радиостанцию. На рассвете удержите деревню до подхода снабжения.</p><label>Сложность<select id="campaign-difficulty"><option value="recruit">Лёгкая</option><option value="regular" selected>Нормальная</option><option value="veteran">Тяжёлая</option></select></label><p class="campaign-controls">WASD · движение &nbsp; C / Ctrl · присесть &nbsp; Z · лечь<br>V · нож &nbsp; E удерживать · помощь / заряд &nbsp; H · аптечка<br>X удерживать · самореанимация &nbsp; Q · стоять / следовать<br>G · граната &nbsp; 4 · ПТ-90 &nbsp; Пробел / Enter · пропустить сцену</p><p id="campaign-save-note"></p><p id="campaign-menu-error" role="status"></p></div><footer class="menu-panel-footer"><button id="campaign-continue" class="panel-secondary">Продолжить с контрольной точки</button><button id="campaign-new" class="panel-primary">Начать миссию ↗</button></footer>';
    dialog.querySelector('.panel-close').onclick=()=>dialog.close();document.body.append(dialog);
  }
  const save=readCampaignSave();dialog.querySelector('#campaign-continue').disabled=!save;
  dialog.querySelector('#campaign-save-note').textContent=save?`Сохранение: контрольная точка ${save.mission?.checkpoint??0}. Новая миссия заменит его после первого контрольного пункта.`:'Четыре контрольных пункта. Снаряжение выбирается после брифинга.';
  const launch=async resume=>{
    const error=dialog.querySelector('#campaign-menu-error');error.textContent='';
    try{dialog.close();await onStart({ ...data,difficulty:resume?save.difficulty:dialog.querySelector('#campaign-difficulty').value,save:resume?save:null});}
    catch(e){error.textContent=e.message;if(!dialog.open)dialog.showModal();}
  };
  dialog.querySelector('#campaign-new').onclick=()=>launch(false);dialog.querySelector('#campaign-continue').onclick=()=>launch(true);dialog.showModal();
}
export {CampaignSession,CampaignPresentation};
