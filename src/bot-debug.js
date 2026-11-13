const enabled=new URLSearchParams(location.search).has('aiDebug');
let panel;
export function drawBotDebug(state){
  if(!enabled)return;
  if(!panel){panel=document.createElement('pre');panel.className='ai-debug';document.body.append(panel);}
  panel.hidden=!state;
  if(!state)return;
  const coord=p=>p?`${p.x.toFixed(1)}, ${p.y?.toFixed(1)??'—'}, ${p.z.toFixed(1)}`:'—';
  panel.textContent='ИИ · задача / роль / цель / укрытие / известный контакт\n'+(state.aiDebug??[]).map(bot=>
    `${bot.name}: ${bot.mode} / ${bot.role}\n  путь ${coord(bot.goal)}; укрытие ${coord(bot.cover)}; враг ${bot.target??'—'}; память ${bot.memory?coord(bot.memory)+' / '+bot.memory.age.toFixed(1)+'с':'—'}`
  ).join('\n');
}
