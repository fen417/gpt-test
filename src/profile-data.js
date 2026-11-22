import {campaignCatalog} from './campaign/progress.js';

export const PROFILE_MISSIONS=campaignCatalog.missions.filter(mission=>mission.implemented);
export const DEFAULT_CUSTOMIZATION=Object.freeze({
  soldierSkin:'standard',weaponSkins:{},attachments:{},
});

export const SOLDIER_FINISHES={
  standard:{name:'Штатная расцветка',color:null},
  sand:{name:'Песчаная',color:'#b59c73'},
  forest:{name:'Лесная',color:'#64724c'},
  slate:{name:'Сланцевая',color:'#515e65'},
};

export const WEAPON_FINISHES={
  standard:{name:'Заводская',color:null},
  olive:{name:'Олива',color:'#696d4e'},
  sand:{name:'Песочный',color:'#ad9070'},
  graphite:{name:'Графит',color:'#3e4348'},
};

export function attachmentSlots(weaponId,sidearm){
  const standard=['standard','Штатный'];
  const slots=[
    {id:'optic',name:'Прицел',choices:[
      ['standard',weaponId==='sv98'?'Штатный 2–4×':weaponId==='dmr12'?'Штатный 2×':'Штатный'],
      ['reflex','Коллиматор'],...(!sidearm?[['scope-2x','Оптика 2×'],['scope-4x','Оптика 4×']]:[]),
    ]},
    {id:'muzzle',name:'Дульное устройство',choices:[
      ['standard',weaponId==='vk45'?'Штатный глушитель':'Штатное'],['suppressor','Глушитель'],['compensator','Компенсатор'],
    ]},
  ];
  if(!sidearm)slots.push({id:'grip',name:'Цевьё',choices:[
    standard,['vertical','Вертикальная рукоять'],['angled','Угловая рукоять'],
  ]});
  return slots;
}

export function withCustomization(current,{section,weaponId,slot,value}){
  const customization={...DEFAULT_CUSTOMIZATION,...current};
  if(section==='soldierSkin')return {...customization,soldierSkin:value};
  if(section==='weaponSkins')return {...customization,weaponSkins:{...customization.weaponSkins,[weaponId]:value}};
  const attachments={...customization.attachments};
  const weapon={...attachments[weaponId]};
  if(slot&&value!=='standard')weapon[slot]=value;
  else if(slot)delete weapon[slot];
  if(slot&&Object.keys(weapon).length)attachments[weaponId]=weapon;
  else delete attachments[weaponId];
  return {...customization,attachments};
}

export function mergeCampaignResult(previous,next){
  const time=value=>Number.isFinite(value)&&value>0&&value<=604800?value:0;
  const checkpoint=value=>Number.isInteger(value)&&value>=0&&value<=9999?value:0;
  const older=time(previous?.bestSeconds),newer=time(next?.bestSeconds);
  return {
    completed:previous?.completed===true||next?.completed===true,
    checkpoint:Math.max(checkpoint(previous?.checkpoint),checkpoint(next?.checkpoint)),
    bestSeconds:older&&newer?Math.min(older,newer):Math.max(older,newer),
  };
}

export function localCampaignSummary(progress){
  const summary={};
  for(const mission of PROFILE_MISSIONS){
    const id=mission.id,completed=progress.completed.includes(id);
    const checkpoint=progress.checkpoints[id]?.number??0;
    const bestSeconds=progress.best[id]?.elapsedSeconds??0;
    if(completed||checkpoint||bestSeconds)summary[id]={completed,checkpoint,bestSeconds};
  }
  return summary;
}

export function favorite(entries,labels){
  return Object.keys(labels).reduce((best,key)=>(entries?.[key]??0)>(entries?.[best]??0)?key:best,'')||null;
}
