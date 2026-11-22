import {LONG_BARREL_ID,WEAPON_SLOTS,XP_PER_WEAPON_KILL,weaponXpForLevel,weaponModules} from '../shared/weapon-modules.js';
import {WEAPONS} from '../shared/world.js';
import {SCOPE_ZOOMS} from './scope-optics.js';

const stockNames={optic:'Штатный прицел',barrel:'Штатный ствол',magazine:'Штатный магазин',stock:'Штатный приклад'};
const spreadLabels={hipSpreadScale:'Разброс от бедра',adsSpreadScale:'Разброс при прицеливании'};
const magnification=new Intl.NumberFormat('ru-RU');
const percentChange=new Intl.NumberFormat('ru-RU',{style:'percent',signDisplay:'exceptZero',maximumFractionDigits:1});

function attachmentEffects({zoom,modifiers}){
  const effects=[];
  if(zoom)effects.push(`Увеличение ${magnification.format(zoom)}×`);
  for(const [stat,label] of Object.entries(spreadLabels)){
    const multiplier=modifiers?.[stat]??1;
    if(multiplier!==1)effects.push(`${label} ${percentChange.format(multiplier-1)}`);
  }
  return effects.join(' · ');
}

export function setupAttachmentPicker(root,{onSlot,onSelect}){
  const tabs=root.querySelector('[data-attachment-slots]');
  const list=root.querySelector('[data-attachment-options]');
  for(const [slot,label] of Object.entries(WEAPON_SLOTS)){
    const button=document.createElement('button');
    button.type='button';button.dataset.attachmentSlot=slot;button.textContent=label;
    button.addEventListener('click',()=>onSlot(slot));
    tabs.append(button);
  }
  return ({weaponId,slot,xp,selected,canTest=false,showLocked=false,networkXp})=>{
    const focused=list.contains(document.activeElement)?document.activeElement.dataset.module:null;
    tabs.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.attachmentSlot===slot)));
    const zooms=SCOPE_ZOOMS[weaponId];
    const name=slot==='optic'&&zooms?'Штатный прицел '+zooms.join('–')+'×':
      slot==='barrel'&&weaponId==='vk45'?'Штатный ствол с глушителем':
      slot==='stock'&&WEAPONS[weaponId]?.sidearm?'Без приклада':stockNames[slot];
    const buttonFor=(id,label,disabled=false,effects='')=>{
      const button=document.createElement('button');
      button.type='button';button.className='panel-secondary';button.dataset.module=id;
      button.textContent=label;button.disabled=disabled;
      if(effects){
        const details=document.createElement('small');
        details.className='attachment-effects';details.textContent=effects;
        button.append(details);
      }
      button.setAttribute('aria-pressed',String(id===selected));
      button.addEventListener('click',()=>onSelect(id));
      return button;
    };
    const items=[buttonFor('stock',name)];
    for(const [id,part] of weaponModules(weaponId,slot)){
      const requiresNetworkXp=id===LONG_BARREL_ID&&networkXp!==undefined;
      const threshold=weaponXpForLevel(part.level);
      const progress=requiresNetworkXp?networkXp??0:xp;
      const unlocked=progress>=threshold;
      const trial=canTest&&id==='collimator-15';
      if(!unlocked&&!trial&&!showLocked&&!requiresNetworkXp&&id!==LONG_BARREL_ID)continue;
      const kills=Math.floor(progress/XP_PER_WEAPON_KILL), required=threshold/XP_PER_WEAPON_KILL;
      const level=requiresNetworkXp?'сетевой уровень':'уровень';
      const suffix=unlocked?'':trial?' · тестовый доступ':
        networkXp===null&&requiresNetworkXp?' · требуется обновление сервера':
        ` · ${level} ${part.level} (${kills} / ${required} устр.)`;
      items.push(buttonFor(id,part.name+suffix,!unlocked&&!trial,attachmentEffects(part)));
    }
    list.replaceChildren(...items);
    if(focused)items.find(button=>button.dataset.module===focused&&!button.disabled)?.focus();
  };
}
