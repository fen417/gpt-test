import { MAPS } from '../shared/world.js';

const mapArt={
  port:new URL('./assets/maps/port.svg',import.meta.url).href,
  quarry:new URL('./assets/maps/quarry.svg',import.meta.url).href,
  village:new URL('./assets/maps/village.svg',import.meta.url).href,
};
const difficulties={recruit:'Новобранцы',regular:'Обычные бойцы',veteran:'Ветераны'};
const modes={conquest:'Захват территории'};
const get=id=>document.getElementById(id);
const el=(tag,className,value)=>{const node=document.createElement(tag);node.className=className;if(value!==undefined)node.textContent=value;return node;};

export function mountRoomBrowser({getPing,canResume,onJoin,onRefresh}){
  let rooms=[],timer,loading=false;
  const filters=['rooms-search','rooms-map','rooms-mode','rooms-bots','rooms-ping','rooms-available'];
  for(const map of Object.values(MAPS))get('rooms-map').add(new Option(map.name,map.id));
  function render(next=rooms){
    rooms=next;
    const ping=getPing(),query=get('rooms-search').value.trim().toLocaleLowerCase('ru');
    const map=get('rooms-map').value,mode=get('rooms-mode').value,bots=get('rooms-bots').value,maxPing=Number(get('rooms-ping').value),available=get('rooms-available').checked;
    const filtered=rooms.filter(room=>(!query||room.name.toLocaleLowerCase('ru').includes(query))&&(!map||room.mapId===map)&&(!mode||room.mode===mode)&&(!bots||(bots==='on'?room.bots>0:room.bots===0))&&(!maxPing||(ping>0&&ping<=maxPing))&&(!available||(room.reserved??room.players)<room.maxPlayers||canResume()));
    get('rooms-count').textContent=`${filtered.length} / ${rooms.length}`;
    const list=get('room-list');
    if(!filtered.length){
      const empty=el('div','rooms-empty');
      empty.append(el('span','empty-symbol','⌖'),el('h3','',rooms.length?'Ничего не найдено':'Поле боя свободно'),el('p','',rooms.length?'Попробуй изменить фильтры.':'Создай комнату и позови свой отряд.'));
      list.replaceChildren(empty);return;
    }
    const rows=filtered.map(room=>{
      const row=el('article','room-card'),art=el('div','room-art'),image=document.createElement('img');
      image.src=mapArt[room.mapId]??mapArt.quarry;image.alt='';image.width=200;image.height=128;
      art.append(image,el('span','room-map-label',room.map??MAPS[room.mapId]?.name??'Карта'));
      const description=el('div','room-description');
      description.append(el('span','room-phase',room.status),el('h3','',room.name),el('p','',modes[room.mode]??room.mode));
      const info=el('div','room-metrics');
      const metric=(title,value)=>{const block=el('div','room-metric');block.append(el('small','',title),el('strong','',value));return block;};
      const botsText=room.bots?`${room.bots} · ${difficulties[room.difficulty]??'Сложность не указана'}`:'Без ботов';
      info.append(metric('Игроки',`${room.players} / ${room.maxPlayers}`),metric('Боты',botsText),metric('Пинг',ping>0?`${Math.round(ping)} мс`:'Измеряем…'));
      const button=el('button','room-join','В бой ↗');button.type='button';
      button.disabled=(room.reserved??room.players)>=room.maxPlayers&&!canResume();if(button.disabled)button.textContent='Нет мест';
      button.addEventListener('click',async()=>{button.disabled=true;try{await onJoin(room);}finally{if(button.isConnected)button.disabled=(room.reserved??room.players)>=room.maxPlayers&&!canResume();}});
      row.append(art,description,info,button);return row;
    });
    // Avoid rebuilding a focused join button during background ping updates.
    if(list.contains(document.activeElement))return;
    list.replaceChildren(...rows);
  }
  async function refresh(){
    if(loading)return;loading=true;get('rooms-refresh').disabled=true;
    try{await onRefresh();}finally{loading=false;get('rooms-refresh').disabled=false;}
  }
  for(const id of filters)get(id).addEventListener(id==='rooms-search'?'input':'change',()=>render());
  get('rooms-reset').addEventListener('click',()=>{for(const id of filters){const input=get(id);if(input.type==='checkbox')input.checked=false;else input.value='';}render();});
  get('rooms-refresh').addEventListener('click',refresh);
  new MutationObserver(()=>{
    clearInterval(timer);
    if(get('multiplayer-panel').open){let ticks=0;timer=setInterval(()=>{render();if(++ticks%10===0)refresh();},1000);}
  }).observe(get('multiplayer-panel'),{attributes:true,attributeFilter:['open']});
  render();
  return {render};
}
