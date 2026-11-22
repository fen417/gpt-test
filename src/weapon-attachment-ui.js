import {WEAPON_SLOTS,weaponLevel,weaponModules} from '../shared/weapon-modules.js';
import {WEAPONS} from '../shared/world.js';
import {SCOPE_ZOOMS} from './scope-optics.js';

const stockNames={optic:'Штатный прицел',barrel:'Штатный ствол',magazine:'Штатный магазин',stock:'Штатный приклад'};

export function setupAttachmentPicker(root,{onSlot,onSelect}){
  const tabs=root.querySelector('[data-attachment-slots]');
  const list=root.querySelector('[data-attachment-options]');
  for(const [slot,label] of Object.entries(WEAPON_SLOTS)){
    const button=document.createElement('button');
    button.type='button';button.dataset.attachmentSlot=slot;button.textContent=label;
    button.addEventListener('click',()=>onSlot(slot));
    tabs.append(button);
  }
  return ({weaponId,slot,xp,selected,canTest=false,showLocked=false})=>{
    const focused=list.contains(document.activeElement)?document.activeElement.dataset.module:null;
    tabs.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.attachmentSlot===slot)));
    const zooms=SCOPE_ZOOMS[weaponId];
    const name=slot==='optic'&&zooms?'Штатный прицел '+zooms.join('–')+'×':
      slot==='barrel'&&weaponId==='vk45'?'Штатный ствол с глушителем':
      slot==='stock'&&WEAPONS[weaponId]?.sidearm?'Без приклада':stockNames[slot];
    const buttonFor=(id,label,disabled=false)=>{
      const button=document.createElement('button');
      button.type='button';button.className='panel-secondary';button.dataset.module=id;
      button.textContent=label;button.disabled=disabled;
      button.setAttribute('aria-pressed',String(id===selected));
      button.addEventListener('click',()=>onSelect(id));
      return button;
    };
    const items=[buttonFor('stock',name)];
    for(const [id,part] of weaponModules(weaponId,slot)){
      const unlocked=weaponLevel(xp)>=part.level;
      const trial=canTest&&id==='collimator-15';
      if(!unlocked&&!trial&&!showLocked)continue;
      const suffix=unlocked?'':trial?' · тестовый доступ':` · уровень ${part.level}`;
      items.push(buttonFor(id,part.name+suffix,!unlocked&&!trial));
    }
    list.replaceChildren(...items);
    if(focused)items.find(button=>button.dataset.module===focused&&!button.disabled)?.focus();
  };
}
