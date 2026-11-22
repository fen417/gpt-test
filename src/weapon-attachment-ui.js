import {WEAPON_SLOTS,XP_PER_WEAPON_KILL,weaponXpForLevel,weaponModules} from '../shared/weapon-modules.js';
import {WEAPONS} from '../shared/world.js';
import {SCOPE_ZOOMS} from './scope-optics.js';
import {createWeaponStatChart} from './weapon-stat-chart.js';

const stockNames={optic:'Штатный прицел',barrel:'Штатный ствол',magazine:'Штатный магазин',stock:'Штатный приклад'};
const modifierLabels={reload:'Время перезарядки',aimTime:'Время входа в прицел',recoil:'Отдача',
  hipSpreadScale:'Разброс от бедра',adsSpreadScale:'Разброс при прицеливании'};
const magnification=new Intl.NumberFormat('ru-RU');
const percentChange=new Intl.NumberFormat('ru-RU',{style:'percent',signDisplay:'exceptZero',maximumFractionDigits:1});

function attachmentEffects({zoom,zooms,modifiers},weaponId){
  const effects=[];
  if(zoom)effects.push(`Увеличение ${magnification.format(zoom)}×`);
  if(zooms)effects.push(`Увеличение ${zooms.map(value=>magnification.format(value)).join('–')}×`);
  if(modifiers?.mag){
    const capacity=WEAPONS[weaponId].mag;
    effects.push(`Магазин ${capacity} → ${Math.round(capacity*modifiers.mag)} патр.`);
  }
  for(const [stat,label] of Object.entries(modifierLabels)){
    const multiplier=modifiers?.[stat]??1;
    if(multiplier!==1)effects.push(`${label} ${percentChange.format(multiplier-1)}`);
  }
  return effects.join(' · ');
}

export function setupAttachmentPicker(root,{onSlot,onSelect}){
  const tabs=root.querySelector('[data-attachment-slots]');
  const list=root.querySelector('[data-attachment-options]');
  const renderChart=createWeaponStatChart(list);
  for(const [slot,label] of Object.entries(WEAPON_SLOTS)){
    const button=document.createElement('button');
    button.type='button';button.dataset.attachmentSlot=slot;button.textContent=label;
    button.addEventListener('click',()=>onSlot(slot));
    tabs.append(button);
  }
  return ({weaponId,slot,xp,selected,attachments,canTest=false,showLocked=false,networkXp})=>{
    const focused=list.contains(document.activeElement)?document.activeElement.dataset.module:null;
    tabs.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.attachmentSlot===slot)));
    const zooms=SCOPE_ZOOMS[weaponId];
    const name=slot==='optic'&&zooms?'Штатный прицел '+zooms.join('–')+'×':
      slot==='stock'&&WEAPONS[weaponId]?.sidearm?'Без приклада':stockNames[slot];
    const equipped={...attachments,[slot]:selected};
    const showEquipped=()=>renderChart(weaponId,equipped);
    const buttonFor=(id,label,disabled=false,effects='')=>{
      const button=document.createElement('button');
      button.type='button';button.className='panel-secondary';button.dataset.module=id;
      button.textContent=label;
      if(disabled)button.setAttribute('aria-disabled','true');
      if(effects){
        const details=document.createElement('small');
        details.className='attachment-effects';details.textContent=effects;
        button.append(details);
      }
      button.setAttribute('aria-pressed',String(id===selected));
      const inspect=()=>renderChart(weaponId,{...equipped,[slot]:id},label.split(' · ')[0]);
      button.addEventListener('pointerenter',inspect);
      button.addEventListener('pointerleave',()=>{if(document.activeElement!==button)showEquipped();});
      button.addEventListener('focus',inspect);
      button.addEventListener('blur',showEquipped);
      button.addEventListener('click',()=>{if(!disabled)onSelect(id);});
      return button;
    };
    const items=[buttonFor('stock',name)];
    for(const [id,part] of weaponModules(weaponId,slot)){
      const requiresNetworkXp=Boolean(part.modifiers)&&networkXp!==undefined;
      const threshold=weaponXpForLevel(part.level);
      const progress=requiresNetworkXp?networkXp??0:xp;
      const unlocked=progress>=threshold;
      const trial=canTest&&id==='collimator-15';
      if(!unlocked&&!trial&&!showLocked&&!part.modifiers)continue;
      const kills=Math.floor(progress/XP_PER_WEAPON_KILL), required=threshold/XP_PER_WEAPON_KILL;
      const level=requiresNetworkXp?'сетевой уровень':'уровень';
      const suffix=unlocked?'':trial?' · тестовый доступ':
        networkXp===null&&requiresNetworkXp?' · требуется обновление сервера':
        ` · ${level} ${part.level} (${kills} / ${required} устр.)`;
      items.push(buttonFor(id,part.name+suffix,!unlocked&&!trial,attachmentEffects(part,weaponId)));
    }
    list.replaceChildren(...items);
    showEquipped();
    if(focused)items.find(button=>button.dataset.module===focused)?.focus({preventScroll:true});
  };
}
