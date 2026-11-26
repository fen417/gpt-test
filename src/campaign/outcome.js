const characters={
  duran:'Сержант Гари Дюран',lasko:'Санитар Тео Ласко',bruno:'Радист Бруно Валь',kane:'Рядовой Кейн',
  orlov:'Лейтенант Орлов · «Маяк»',harranti:'Полковник Харранти',bale:'Ник Бэйл · «Сокол-8»',
  holt:'Капитан Холт · «Сокол-1»',grey:'«Старик» Грей · «Сокол-4»',
  vos:'Ирвин Вос · «Сокол-7»',timo:'Тимо Рэй · «Сокол-7»',rafa:'Рафа Ким · «Сокол-7»',
  taver:'Сержант Тавер',nyoro:'Сапёр Ньоро',black:'Сапёр Блэк',marten:'Рядовой Ян Мартен',gunner:'Бортстрелок «Грач»',
};
const knownTankCrew={'sokol-1':'holt','sokol-4':'grey','sokol-8':'bale'};

export function campaignCharacter(player){
  return characters[(player.actorId??player.id).replace(/^m02-/,'')]??player.name;
}

export function campaignOutcome(state){
  const {missionId,tanksAlive}=state.campaign;
  const fallen=[];
  for(const player of state.players){
    if(player.team===0&&player.alive===false&&Object.hasOwn(characters,(player.actorId??player.id).replace(/^m02-/,'')))
      fallen.push(campaignCharacter(player));
  }
  if(missionId==='m02')for(const v of state.vehicles){
    const crew=knownTankCrew[v.id];
    if(crew&&v.hp<=0)fallen.push(characters[crew]);
  }
  const count=state.vehicles.filter(vehicle=>vehicle.team===0&&vehicle.type==='tank'&&vehicle.hp>0).length;
  const tanks=missionId==='m01'||missionId==='m04'?null:missionId==='m02'?tanksAlive??count:count;
  return {tanks,fallen:[...new Set(fallen)],...(missionId==='m05'?{fuelSaved:state.campaign.fuelSaved}:{})};
}

export function describeCampaignOutcome(outcome){
  if(!outcome)return '';
  const tanks=Number.isFinite(outcome.tanks)?`Союзных танков в строю ${outcome.tanks} · `:'';
  const fuel=Number.isInteger(outcome.fuelSaved)?`Заправщики ${outcome.fuelSaved}/3 · `:'';
  return fuel+tanks+(outcome.fallen.length?`Погибли — ${outcome.fallen.join(', ')}`:'Ключевые бойцы выжили');
}

export function showCampaignOutcome(root,state){
  if(!state?.campaign?.complete)return;
  const card=root.querySelector('.campaign-ending,.m02-finale');
  if(!card||card.querySelector('.campaign-outcome'))return;
  const text=document.createElement('p');
  text.className='campaign-outcome';
  text.textContent=describeCampaignOutcome(campaignOutcome(state));
  card.insertBefore(text,card.querySelector(':scope > button'));
}
