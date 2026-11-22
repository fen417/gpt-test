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
  return effects;
}

export function setupAttachmentPicker(root,{chartHost,onSlot,onSelect,onInspect}){
  const tabs=root.querySelector('[data-attachment-slots]');
  const list=root.querySelector('[data-attachment-options]');
  const renderChart=createWeaponStatChart(chartHost);
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
    const show=(id,label)=>{
      const previewed=id!==selected;
      const slots=previewed?{...equipped,[slot]:id}:equipped;
      renderChart(weaponId,slots,previewed?label:null);
      onInspect?.(weaponId,slots);
    };
    const showEquipped=()=>show(selected);
    const buttonFor=(id,label,{locked=false,status='',note='',effects=[]}={})=>{
      const button=document.createElement('button');
      button.type='button';button.className='attachment-choice';button.dataset.module=id;
      if(locked)button.setAttribute('aria-disabled','true');
      const heading=document.createElement('span');heading.className='attachment-choice-name';heading.textContent=label;
      button.append(heading);
      const tag=id===selected?'Установлено':status;
      if(tag){
        const meta=document.createElement('span');meta.className='attachment-choice-state';meta.textContent=tag;
        button.append(meta);
      }
      if(note||effects.length){
        const details=document.createElement('span');details.className='attachment-effects';
        details.textContent=effects.join(' · ');
        if(note){
          const requirement=document.createElement('span');requirement.className='attachment-requirement';requirement.textContent=note;
          details.append(requirement);
        }
        button.append(details);
      }
      button.setAttribute('aria-pressed',String(id===selected));
      const inspect=()=>show(id,label);
      button.addEventListener('pointerenter',inspect);
      button.addEventListener('pointerleave',event=>{if(event.pointerType==='mouse')showEquipped();});
      button.addEventListener('focus',inspect);
      button.addEventListener('blur',showEquipped);
      button.addEventListener('click',()=>{if(locked)inspect();else onSelect(id);});
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
      const locked=!unlocked&&!trial;
      const status=locked?`Ур. ${part.level}`:trial&&!unlocked?'Тест':'';
      const note=!locked?'':networkXp===null&&requiresNetworkXp?'Требуется обновление сервера':
        `${kills} / ${required} ${requiresNetworkXp?'сетевых ':''}устранений`;
      items.push(buttonFor(id,part.name,{locked,status,note,effects:attachmentEffects(part,weaponId)}));
    }
    list.replaceChildren(...items);
    showEquipped();
    if(focused)items.find(button=>button.dataset.module===focused)?.focus({preventScroll:true});
  };
}
