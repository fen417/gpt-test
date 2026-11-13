import { PerformanceSamples } from '../shared/performance-samples.js';
const frameTimes=new PerformanceSamples(),cpuTimes=new PerformanceSamples(),renderTimes=new PerformanceSamples(),simulationTimes=new PerformanceSamples();
import { drawBotDebug } from './bot-debug.js';
﻿import './style.css';
import { CLASS_GADGET, GADGET_NAMES, selectedGadget, isSupplyGadget, gadgetCooldown } from '../shared/gadgets.js';
import {GameRenderer} from './renderer.js';
import {Simulation} from '../shared/simulation.js';
import {MAPS,DEFAULT_MAP_ID,getMap,CLASSES,WEAPONS,CLASS_WEAPONS,SIDEARMS,getSidearm,defaultWeaponId,getWeapon,CAPTURE_RADIUS,canSpawnAtPoint} from '../shared/world.js';
import {Multiplayer,configuredServerUrl,normalizeServerUrl} from './network.js';
import {CombatAudio} from './audio.js';
import {mountChangelog} from './changelog.js';
import './menu.css';
import {mountMenuPanels,closeMenuPanels} from './menu-panels.js';
import {mountRoomBrowser} from './room-browser.js';
import {mountSquadUI} from './squad-ui.js';
import {mountWeaponPreview} from './weapon-preview.js';
import {MAP_ART} from './map-art.js';
import './lobby.css';
import {captureGameKeyboard} from './keyboard-capture.js';
import {sameSquad,SQUAD_COLOR} from '../shared/squads.js';
import './squads.css';
import {VEHICLE_TYPES,TURRET_WEAPON,canFirePassengerWeapon,getVehicleBoardingSeat} from '../shared/vehicles.js';

const $=id=>document.getElementById(id);
mountChangelog();
const show=(id,visible=true)=>$(id).classList.toggle('hidden',!visible);
const text=(id,value)=>{const node=$(id),next=String(value);if(node.textContent!==next)node.textContent=next;};
const audio=new CombatAudio();
const canvas=$('game');
let renderer,simulation=null,state=null,localId=null,active=false,busy=false;
let squadUI,weaponPreview,lobbyWeaponPreview;
let currentMap=getMap(DEFAULT_MAP_ID);
let selectedClass='assault',yaw=0,pitch=0,locked=false,aim=false,fire=false;
let lobbyTeamRequest=null,lobbyTeamMessage='';
let fireTap=false, recoilPitch=0, recoilYaw=0;
let scopeZoom=8;
let weaponSlot=1;
let toolSlot=0;
let mode='solo',room='',lastFrame=performance.now(),accumulator=0,hudClock=0,fpsClock=0,frames=0,unlocked=false,unlockedPaused=false;
let wasAlive=false,lastHp=100,hitUntil=0,damageUntil=0,feed=[],scoreFeed=[],scoreStreakTotal=0,scoreStreakExpires=0,seen=new Set(),toastTimer;
let reviveAwaitingControl=false;
const pendingDamage=new Map(),damageSummaryDelay=1000;
function showScore(event,now){
  if(now>scoreStreakExpires)scoreStreakTotal=0;
  scoreStreakTotal+=event.points;
  scoreStreakExpires=now+3400;
  scoreFeed.push({id:event.id,reason:event.reason,points:event.points,kind:event.kind,expires:now+3200});
}
function flushDamage(now){
  for(const [target,item] of pendingDamage)if(now>=item.until){showScore(item,now);pendingDamage.delete(target);}
}
let selectedSpawn='',lastDeathPos=null,hoveredSpawn=null,inLobby=false;
let gfx={shadows:'auto',resolution:'auto'},sensitivity=.8,quality='high',lastInput={},finished=false,fov=85,brightness=1,cameraShake=true;
let musicVolume=.45,effectsVolume=.7,musicMuted=false,audioStarted=false;
const difficultyNames={recruit:'НОВОБРАНЦЫ',regular:'ОБЫЧНЫЕ БОЙЦЫ',veteran:'ВЕТЕРАНЫ'};
const keys=new Set(),pulses=new Set();
const gadgetNames=Object.fromEntries(Object.entries(CLASS_GADGET).map(([classId,kind])=>[classId,GADGET_NAMES[kind]]));
const weaponTypes={assault:'ШТУРМОВАЯ ВИНТОВКА',medic:'ПИСТОЛЕТ-ПУЛЕМЁТ / КАРАБИН',support:'РУЧНОЙ ПУЛЕМЁТ',recon:'МАРКСМАНСКАЯ / СНАЙПЕРСКАЯ'};
const DEFAULT_BINDS={
  forward:'KeyW',
  back:'KeyS',
  left:'KeyA',
  right:'KeyD',
  jump:'Space',
  sprint:'ShiftLeft',
  crouch:'KeyC',
  reload:'KeyR',
  gadget:'Digit3',
  secondaryGadget:'KeyX',
  grenade:'KeyG',
  score:'Tab',
  interact:'KeyE',
  switchSeat:'KeyV',
  horn:'KeyH',
  order:'KeyQ',squad:'KeyO',
};
const BIND_LABELS=[
  ['forward','Вперёд'],
  ['back','Назад'],
  ['left','Влево'],
  ['right','Вправо'],
  ['jump','Прыжок'],
  ['sprint','Бег (спринт)'],
  ['crouch','Присесть'],
  ['reload','Перезарядка'],
  ['secondaryGadget','Достать гранатомёт / аптечку'],
  ['grenade','Граната'],
  ['score','Таблица счёта'],
  ['interact','Сесть в технику / выйти'],
  ['switchSeat','Сменить место в технике'],
  ['squad','Открыть отряды'],
  ['order','Отряд: команда по наведению / за мной'],
  ['horn','Сигнал / позвать ботов в транспорт'],
];
let keybinds={...DEFAULT_BINDS};
let listeningAction=null;
const selectedWeapons={assault:'ar416',medic:'mcx9',support:'mg36',recon:'dmr12'};
function status(message,error=false){for(const id of ['status','solo-status','network-status','create-status']){text(id,message);$(id).classList.toggle('error',error);}}
function toast(message){text('toast',message);show('toast');clearTimeout(toastTimer);toastTimer=setTimeout(()=>show('toast',false),4500);}
function save(key,value){try{localStorage.setItem(`sector09-${key}`,value);}catch{}}
function read(key,fallback){try{return localStorage.getItem(`sector09-${key}`)??fallback;}catch{return fallback;}}
try{
  const savedBinds=JSON.parse(read('keybinds','{}'));
  if(savedBinds&&typeof savedBinds==='object'){
    for(const k of Object.keys(DEFAULT_BINDS)){
      if(k!=='gadget'&&typeof savedBinds[k]==='string'&&savedBinds[k])keybinds[k]=savedBinds[k];
    }
  }
  const savedWeapons=JSON.parse(read('weapons','{}'));
  if(savedWeapons&&typeof savedWeapons==='object'){
    for(const cls of Object.keys(CLASS_WEAPONS)){
      if(CLASS_WEAPONS[cls].includes(savedWeapons[cls]))selectedWeapons[cls]=savedWeapons[cls];
    }
  }
}catch{}
function formatKeyCode(code){
  if(!code)return '—';
  if(code.startsWith('Key'))return code.slice(3).toUpperCase();
  if(code.startsWith('Digit'))return code.slice(5);
  const map={
    Space:'ПРОБЕЛ',ShiftLeft:'L.SHIFT',ShiftRight:'R.SHIFT',
    ControlLeft:'L.CTRL',ControlRight:'R.CTRL',AltLeft:'L.ALT',AltRight:'R.ALT',
    Tab:'TAB',CapsLock:'CAPS',Enter:'ENTER',Backspace:'BACKSPACE',
    ArrowUp:'↑',ArrowDown:'↓',ArrowLeft:'←',ArrowRight:'→',
    Backquote:'~',Minus:'-',Equal:'=',BracketLeft:'[',BracketRight:']',
    Semicolon:';',Quote:"'",Comma:',',Period:'.',Slash:'/',Backslash:'\\',
  };
  return map[code]||code.toUpperCase();
}
function isBound(action,code){
  const bound=keybinds[action];
  if(code===bound)return true;
  if(bound==='ShiftLeft'&&code==='ShiftRight')return true;
  if(bound==='ControlLeft'&&code==='ControlRight')return true;
  return false;
}
function isActionHeld(action){
  const bound=keybinds[action];
  if(keys.has(bound))return true;
  if(bound==='ShiftLeft'&&keys.has('ShiftRight'))return true;
  if(bound==='ControlLeft'&&keys.has('ControlRight'))return true;
  if(action==='crouch'&&bound==='KeyC'&&(keys.has('ControlLeft')||keys.has('ControlRight')))return true;
  return false;
}
function updateKeybindUI(){
  const grid=$('keybinds-grid');
  if(grid){
    grid.replaceChildren(...BIND_LABELS.map(([action,label])=>{
      const row=document.createElement('div');
      row.className='keybind-row';
      const span=document.createElement('span');
      span.textContent=label;
      const btn=document.createElement('button');
      btn.type='button';
      const activeListen=listeningAction===action;
      btn.className=`keybind-btn${activeListen?' listening':''}`;
      btn.textContent=activeListen?'НАЖМИТЕ…':formatKeyCode(keybinds[action]);
      btn.addEventListener('click',()=>{
        listeningAction=listeningAction===action?null:action;
        audio.click();
        updateKeybindUI();
      });
      row.append(span,btn);
      return row;
    }));
  }
  const qKey=formatKeyCode(keybinds.gadget);
  const gKey=formatKeyCode(keybinds.grenade);
  const rKey=formatKeyCode(keybinds.reload);
  text('grenade-label',`${gKey} · ГРАНАТА`);
  text('reload-label',`${rKey} · ПЕРЕЗАРЯДКА`);
  text('deploy-gadget-tag',`${qKey} · ${gadgetNames[selectedClass]}`);
  const p=local();
  text('gadget-label',`${qKey} · ${gadgetNames[p?.classId||selectedClass]}${p?.gadgetCooldown>0?' '+Math.ceil(p.gadgetCooldown)+'с':''}`);
  const help=$('controls-help');
  if(help){
    help.innerHTML=`${formatKeyCode(keybinds.forward)}${formatKeyCode(keybinds.left)}${formatKeyCode(keybinds.back)}${formatKeyCode(keybinds.right)} — движение · ${formatKeyCode(keybinds.sprint)} — бег · ${formatKeyCode(keybinds.crouch)} — присесть / подкат на бегу<br>${formatKeyCode(keybinds.jump)} — прыжок · ${rKey} — перезарядка · 3 / 4 — достать снаряжение · ${formatKeyCode(keybinds.order)} — приказ отряду<br>${gKey} — граната в сторону взгляда · ${formatKeyCode(keybinds.score)} — счёт · Esc — меню<br>${formatKeyCode(keybinds.interact)} — сесть / выйти · ${formatKeyCode(keybinds.switchSeat)} — сменить место<br>1 — основное · 2 — пистолет · 3 / 4 — снаряжение · ЛКМ — применить · ПКМ — прицел`;
  }
}
function currentWeaponId(classId=selectedClass){
  const list=CLASS_WEAPONS[classId]||[];
  const chosen=selectedWeapons[classId];
  return list.includes(chosen)?chosen:defaultWeaponId(classId);
}
function renderWeaponPickers(classId=selectedClass){
  const weaponIds=CLASS_WEAPONS[classId]||[];
  const activeId=currentWeaponId(classId);
  for(const containerId of ['menu-weapons','deploy-weapons','lobby-weapons']){
    const container=$(containerId);
    if(!container)continue;
    container.replaceChildren(...weaponIds.map(wId=>{
      const w=WEAPONS[wId];
      const btn=document.createElement('button');
      btn.type='button';
      const chosen=wId===activeId;
      btn.className=`weapon-btn${chosen?' active':''}`;
      btn.setAttribute('aria-pressed',String(chosen));
      const title=document.createElement('b');
      title.textContent=w.name;
      const sub=document.createElement('small');
      sub.textContent=`Урон ${w.damage} · ${w.mag}/${w.reserve} патр.`;
      btn.append(title,sub);
      btn.addEventListener('click',()=>selectWeapon(wId,true));
      return btn;
    }));
  }
  for(const cls of Object.keys(CLASSES)){
    const w=getWeapon(cls,currentWeaponId(cls));
    for(const b of document.querySelectorAll(`[data-deploy-class="${cls}"] small, [data-lobby-class="${cls}"] small`)){
      b.textContent=w.name;
    }
  }
}
function selectWeapon(weaponId,playClick=false){
  const list=CLASS_WEAPONS[selectedClass]||[];
  if(!list.includes(weaponId))return;
  selectedWeapons[selectedClass]=weaponId;
  save('weapons',JSON.stringify(selectedWeapons));
  selectClass(selectedClass,playClick);
}
let selectedSidearm=getSidearm(read('sidearm','')).id;
const sidearmPickers=['menu-sidearm','deploy-sidearm','lobby-sidearm'].map($);
for(const picker of sidearmPickers){
  picker.replaceChildren(...SIDEARMS.map(id=>new Option(WEAPONS[id].name,id)));
  picker.value=selectedSidearm;
  picker.addEventListener('change',()=>{
    selectedSidearm=getSidearm(picker.value).id;
    save('sidearm',selectedSidearm);
    for(const other of sidearmPickers)other.value=selectedSidearm;
    weaponPreview?.update('sidearm');
    lobbyWeaponPreview?.update('sidearm');
    if(inLobby)multiplayer.setLobbyLoadout({classId:selectedClass,weaponId:currentWeaponId(),sidearmId:selectedSidearm});
    audio.click();
  });
}
$('callsign').value=read('name','Rookie');
musicMuted=read('music-muted','false')==='true';
$('difficulty').value=['recruit','regular','veteran'].includes(read('difficulty','regular'))?read('difficulty','regular'):'regular';
$('population').value=['15','23','31'].includes(read('population','23'))?read('population','23'):'23';
for(const id of ['difficulty','population'])$(id).addEventListener('change',()=>save(id,$(id).value));
function musicUI(){const playing=audioStarted&&audio.enabled&&!musicMuted;document.body.classList.toggle('music-playing',playing);text('music-label',!audioStarted?'ВКЛ. МУЗЫКУ':musicMuted?'МУЗЫКА ВЫКЛ.':'МУЗЫКА ВКЛ.');$('music-toggle').setAttribute('aria-pressed',String(playing));$('music-toggle').setAttribute('aria-label',playing?'Выключить музыку меню':'Включить музыку меню');}
async function unlockAudio(){const started=await audio.unlock();audioStarted=started!==false;musicUI();}
function setMusic(){audio.setMusicVolume?.(musicMuted?0:musicVolume);musicUI();}
document.addEventListener('pointerdown',event=>{if(!event.target.closest?.('#music-toggle'))unlockAudio();},{once:true});
document.addEventListener('keydown',event=>{if(!event.target.closest?.('#music-toggle'))unlockAudio();},{once:true});
function local(){return state?.players.find(p=>p.id===localId);}
function setBusy(value){busy=value;for(const id of ['solo','open-solo','host','join-toggle'])$(id).disabled=value;}
function clearControls(){keys.clear();pulses.clear();fire=false;fireTap=false;aim=false;recoilPitch=0;recoilYaw=0;if(active&&localId){const neutral={yaw,pitch};simulation?.setInput(localId,neutral);multiplayer.clearInput(neutral);}}
function aimAngles(){
  return { yaw:yaw+recoilYaw, pitch:Math.max(-1.45,Math.min(1.45,pitch+recoilPitch)) };
}
function selectClass(classId,playClick=false){
  if(!CLASSES[classId])return;
  selectedClass=classId;
  for(const b of document.querySelectorAll('[data-class]')){const chosen=b.dataset.class===classId;b.classList.toggle('active',chosen);b.setAttribute('aria-pressed',String(chosen));}
  for(const b of document.querySelectorAll('[data-deploy-class]')){const chosen=b.dataset.deployClass===classId;b.classList.toggle('active',chosen);b.setAttribute('aria-pressed',String(chosen));}
  for(const b of document.querySelectorAll('[data-lobby-class]')){const chosen=b.dataset.lobbyClass===classId;b.classList.toggle('active',chosen);b.setAttribute('aria-pressed',String(chosen));}
  const weaponId=currentWeaponId(classId);
  const w=getWeapon(classId,weaponId);
  renderWeaponPickers(classId);
  text('class-weapon',`${w.name||w.weapon} · ${w.type||weaponTypes[classId]}`);
  text('deploy-weapon-name',w.name||w.weapon);
  text('deploy-weapon-type',w.type||weaponTypes[classId]);
  text('deploy-ammo-tag',`${w.mag} / ${w.reserve} ПАТР.`);
  text('deploy-gadget-tag',`${formatKeyCode(keybinds.gadget)} · ${gadgetNames[classId]}`);
  $('stat-dmg').style.width=`${Math.min(100,Math.round(w.damage/95*100))}%`;
  $('stat-rof').style.width=`${Math.min(100,Math.round((1/w.interval)/14*100))}%`;
  $('stat-rng').style.width=`${Math.min(100,Math.round(w.range/260*100))}%`;
  if(inLobby)multiplayer.setLobbyLoadout({classId,weaponId,sidearmId:selectedSidearm});
  if(playClick)audio.click();
  weaponPreview?.update('primary');
  lobbyWeaponPreview?.update('primary');
}
function deploymentPoints(){
  const player=local();
  const beacons=(state?.deployables??[]).filter(item=>item.kind==='beacon'&&item.hp>0&&item.team===player?.team&&item.expires>state.time).map(item=>({
    ...item,beacon:true,squadBeacon:sameSquad(player,item),owner:item.team,name:(sameSquad(player,item)?'МАЯК ОТРЯДА · ':'СОЮЗНЫЙ МАЯК · ')+(state.players.find(p=>p.id===item.ownerId)?.name??'СОЮЗНИК'),
    contested:false,progress:0,spawnBlocked:state.players.some(p=>p.alive&&p.team!==item.team&&Math.hypot(p.x-item.x,p.z-item.z)<8),
  }));
  return [...(state?.points??[]),...beacons];
}
function spawnPointAvailable(player,pointId){
  if(!pointId)return true;
  const p=deploymentPoints().find(q=>q.id===pointId);
  return canSpawnAtPoint(p,player?.team);
}
function selectSpawnPoint(pointId,playClick=false){
  const player=local();
  if(pointId&&player&&!spawnPointAvailable(player,pointId)){
    toast(`Точка ${pointId} недоступна для высадки`);
    return false;
  }
  selectedSpawn=pointId||'';
  const selectEl=$('spawn-point');
  if(selectEl)selectEl.value=selectedSpawn;
  const point=deploymentPoints().find(p=>p.id===selectedSpawn);
  text('deploy-selected-label',point?(point.beacon?point.name:`ТОЧКА: ${point.id} · ${point.name}`):'ТОЧКА: БАЗА КОМАНДЫ');
  if(playClick)audio.click();
  return true;
}
function getDeployTarget(player){
  if(!player)return null;
  if(selectedSpawn){
    const pt=deploymentPoints().find(p=>p.id===selectedSpawn);
    if(pt)return {x:pt.x,z:pt.z};
  }
  const base=currentMap.spawns[player.team]??currentMap.spawns[0];
  return {x:base.x,z:base.z};
}
function updateLobby(){
  if(!state)return;
  $('lobby-map').value=state.mapId;
  $('lobby-difficulty').value=state.difficulty;
  $('lobby-population').value=String(state.botCount??8);
  const code=state.roomName||room||'Операция';
  text('lobby-code',code);
  const humans=state.players.filter(p=>!p.bot);
  const bots=state.players.filter(p=>p.bot);
  const isHost=state.ownerId===localId;
  const difficultyLabel={recruit:'Новобранцы',regular:'Обычные бойцы',veteran:'Ветераны'}[state.difficulty]??'Обычные бойцы';
  text('lobby-role-badge',isHost?'Создатель комнаты':'Участник');
  text('lobby-status',`Захват территории · Игроки: ${humans.length} · Боты: ${bots.length}`);
  text('lobby-map-name',currentMap.name);
  text('lobby-map-info',`${currentMap.size} × ${currentMap.size} м · Точки: ${currentMap.points.length}`);
  text('lobby-bot-summary',`Боты: ${bots.length} · ${difficultyLabel}`);
  const art=MAP_ART[currentMap.id]??MAP_ART.quarry;
  if($('lobby-map-art').getAttribute('src')!==art)$('lobby-map-art').src=art;
  $('lobby-map-art').alt=currentMap.name;
  const capacity=multiplayer.rooms.find(item=>item.id===multiplayer.roomId)?.maxPlayers??multiplayer.hello?.maxPlayers??7;
  text('lobby-capacity',`${humans.length} / ${capacity} игроков`);
  show('lobby-host-controls',isHost);
  show('lobby-start',isHost);
  text('lobby-wait-note',lobbyTeamMessage||(isHost?'Все на месте? Начинай операцию.':'Ожидаем запуска операции создателем комнаты.'));
  $('lobby-start').disabled=Boolean(lobbyTeamRequest);
  $('lobby-switch-team').disabled=Boolean(lobbyTeamRequest)||!local();
  for(const team of [0,1]){
    const teamHumans=humans.filter(p=>p.team===team).sort((a,b)=>Number(b.id===localId)-Number(a.id===localId));
    const teamBots=bots.filter(p=>p.team===team);
    $(`lobby-side-${team}`).classList.toggle('is-own-team',local()?.team===team);
    const choice=$(`lobby-choose-team-${team}`),selected=local()?.team===team;
    choice.disabled=selected||Boolean(lobbyTeamRequest)||!local();
    choice.setAttribute('aria-pressed',String(selected));
    choice.textContent=lobbyTeamRequest?.team===team?'Переходим…':selected?'Вы на этой стороне':`Выбрать сторону ${team===0?'A':'B'}`;
    text(`lobby-team${team}-count`,`Игроки: ${teamHumans.length} · Боты: ${teamBots.length}`);
    const container=$(`lobby-team-${team}`);
    const sig=JSON.stringify(teamHumans.map(p=>[p.id,p.name,p.classId,p.weaponId,p.connected]))+`:bots:${teamBots.length}:${state.ownerId}:${localId}:${state.difficulty}`;
    if(container.dataset.signature!==sig){
      container.dataset.signature=sig;
      const rows=teamHumans.map(p=>{
        const row=document.createElement('div');
        row.className=`lobby-player-row${p.id===localId?' is-local':''}`;
        const avatar=document.createElement('span');avatar.className='lobby-player-avatar';avatar.textContent={assault:'⌖',medic:'✚',support:'⚒',recon:'◎'}[p.classId]??'·';
        const left=document.createElement('div');left.className='lobby-player-identity';
        const nickname=document.createElement('strong');nickname.textContent=p.name+(p.id===localId?' · ТЫ':'');
        const cls=document.createElement('small'),w=getWeapon(p.classId,p.weaponId);
        cls.textContent=`${CLASSES[p.classId]?.name??p.classId} · ${w.name}`;left.append(nickname,cls);
        const meta=document.createElement('div');
        meta.className='lobby-player-meta';
        if(p.id===state.ownerId){
          const h=document.createElement('span');
          h.className='lobby-host-tag';
          h.textContent='Создатель';
          meta.append(h);
        }
        if(p.connected===false){const reconnecting=document.createElement('span');reconnecting.textContent='Нет связи';meta.append(reconnecting);}
        row.append(avatar,left,meta);
        return row;
      });
      if(!teamHumans.length){const empty=document.createElement('p');empty.className='lobby-empty';empty.textContent='Ожидаем бойцов';rows.push(empty);}
      if(teamBots.length>0){
        const botRow=document.createElement('div');
        botRow.className='lobby-player-row is-bot';
        const left=document.createElement('span');
        left.textContent=`AI × ${teamBots.length}`;
        const right=document.createElement('span');
        right.textContent=difficultyLabel;
        botRow.append(left,right);
        rows.push(botRow);
      }
      container.replaceChildren(...rows);
    }
  }
}
function enterLobby(){
  lobbyTeamRequest=null;lobbyTeamMessage='';
  closeMenuPanels();
  inLobby=true;active=false;setBusy(false);
  document.exitPointerLock?.();
  show('menu',false);show('hud',false);show('pause',false);show('death',false);show('result',false);show('lobby',true);
  document.body.classList.remove('in-battle');
  $('lobby-map').value=currentMap.id;
  $('lobby-difficulty').value=state?.difficulty||$('difficulty').value;
  $('lobby-population').value=String(state?.botCount??8);
  updateLobby();
}
function receive(next){
  setBattleMap(next.mapId);
  if(next.lobby){
    state=next;
    if(!inLobby)enterLobby();
    else updateLobby();
    return;
  }
  if(inLobby&&!next.lobby){
    inLobby=false;
    show('lobby',false);
    state=next;
    enter();
    toast('Сервер запустил операцию. В бой!');
    return;
  }
  if(state&&next.time<state.time-1){pendingDamage.clear();seen.clear();audio.seen.clear();renderer.seenEvents.clear();renderer.lastShot=-1;feed=[];scoreFeed=[];scoreStreakTotal=0;scoreStreakExpires=0;finished=false;wasAlive=false;lastDeathPos=null;show('result',false);show('death',false);toast('Новая операция началась');}
  const previousPlayer=local();
  const previousVehicle=state?.vehicles?.find(v=>v.id===previousPlayer?.vehicleId);
  state=next;const player=local();
  const vehicle=next.vehicles?.find(v=>v.id===player?.vehicleId);
  if(vehicle&&player?.alive){
    const role=VEHICLE_TYPES[vehicle.type]?.seats[player.vehicleSeat]?.role;
    if(previousVehicle?.id!==vehicle.id){
      yaw=vehicle.yaw;pitch=0;recoilPitch=0;recoilYaw=0;
    }else if(role!=='gunner'){
      const turn=vehicle.yaw-previousVehicle.yaw;
      yaw+=Math.atan2(Math.sin(turn),Math.cos(turn));
    }
  }
  if(player)document.body.classList.toggle('team-1',player.team===1);
  if(!active||!player)return;
  const requestedTool=selectedGadget(player.classId,toolSlot);
  if(player.alive&&isSupplyGadget(requestedTool)&&gadgetCooldown(player,requestedTool)>0){
    // Clear the persistent input selection as soon as placement is confirmed.
    // The server finishes the gesture, then equips the primary weapon. This
    // also reconciles guests whose input still requested the pistol/tool.
    toolSlot=0;weaponSlot=1;aim=false;fire=false;fireTap=false;
  }
  if(player.alive&&!wasAlive){
    const revived=(player.reviveSeq??0)!==(previousPlayer?.reviveSeq??0)||state.events?.some(event=>event.type==='revive'&&event.playerId===localId&&!seen.has(event.id));
    weaponSlot=player.weaponSlot||1;toolSlot=0;yaw=player.yaw;pitch=player.pitch;recoilPitch=0;recoilYaw=0;lastHp=player.hp;
    show('death',false);
    if(revived){
      closeMenuPanels();
      unlockedPaused=false;reviveAwaitingControl=!locked&&!unlocked;
      show('pause',false);show('revive-control-hint',reviveAwaitingControl);
    }else if(active&&!locked&&!unlocked)show('pause');
  }
  if(!player.alive&&wasAlive){
    reviveAwaitingControl=false;show('revive-control-hint',false);
    lastDeathPos={x:player.x,z:player.z};
    if(!spawnPointAvailable(player,selectedSpawn)){
      const owned=state.points.filter(p=>canSpawnAtPoint(p,player.team)).sort((a,b)=>Math.hypot(a.x-player.x,a.z-player.z)-Math.hypot(b.x-player.x,b.z-player.z));
      selectSpawnPoint(owned[0]?.id||'');
    }else selectSpawnPoint(selectedSpawn);
    clearControls();document.exitPointerLock?.();show('pause',false);show('death');
    updateDeployScreen(player,performance.now());
  }
  if(player.hp<lastHp){damageUntil=performance.now()+350;}
  lastHp=player.hp;wasAlive=player.alive;
  const nowPerf=performance.now();
  for(const event of state.events??[]){
    if(seen.has(event.id))continue;seen.add(event.id);
    if(event.type==='shot'&&event.playerId===localId){
      const weapon=getWeapon(event.classId||player.classId,event.weaponId||player.weaponId);
      const impulse=(event.mounted ? .008 : weapon.recoil)*(aim?.76:1)*(lastInput.crouch?.87:1);
      if(player.alive){
        recoilPitch=Math.min(.12,recoilPitch+impulse);
        recoilYaw=Math.max(-.035,Math.min(.035,recoilYaw+Math.sin((event.shotSeq??event.id)*2.1)*impulse*.31));
      }
    }
    if(event.type==='rocketLaunch'&&event.playerId===localId){recoilPitch=Math.min(.12,recoilPitch+.065);}
    if(event.type==='bulletImpact'&&event.playerId===localId&&(event.hit||event.vehicleHit||event.equipmentHit)){
      hitUntil=nowPerf+(event.headshot?190:130);
      $('hitmarker').classList.toggle('headshot',!!event.headshot);
    }
    if(event.type==='vehicleDestroyed'&&event.attackerId===localId)toast(VEHICLE_TYPES[event.vehicleType]?.name+' · Цель уничтожена');
    if(event.type==='score'&&event.playerId===localId){
      flushDamage(nowPerf);
      if(event.kind==='damage'){
        const target=event.victimId??'damage',previous=pendingDamage.get(target);
        pendingDamage.set(target,{...event,points:(previous?.points??0)+event.points,until:nowPerf+damageSummaryDelay});
      }else showScore(event,nowPerf);
    }
    if(event.type==='kill'){
      feed.push({...event,expires:nowPerf+6500});
      if(event.killerId===localId){hitUntil=nowPerf+300;toast(`Цель устранена · ${event.victim}`);}
      if(event.victimId===localId){
        text('death-killer',`ВЫВЕДЕН ИЗ СТРОЯ · ПРОТИВНИК: ${event.killer} [${event.weapon||'ГРАНАТА'}]`);
      }
    }
    if(event.type==='capture'&&state.points.some(p=>p.id===event.pointId))toast(`Точка ${event.pointId} ${event.team===player.team?'захвачена вашим отрядом':'под контролем противника'}`);
    if(event.type==='gadget'&&event.playerId===localId)toast(`${GADGET_NAMES[event.kind]??gadgetNames[player.classId]} · Активировано`);
    if(event.type==='squadOrder'&&event.playerId===localId)toast(event.kind==='follow'?'ОТРЯД · СЛЕДОВАТЬ ЗА МНОЙ':`ОТРЯД · ${event.kind==='defend'?'ОБОРОНЯТЬ':'ЗАХВАТИТЬ'} ${event.pointId??''}`);
    if(event.type==='revive'&&event.playerId===localId)toast('ТЕБЯ ВОСКРЕСИЛИ · Нажми на игру, чтобы продолжить');
  }
  while(seen.size>900)seen.delete(seen.keys().next().value);
  // Immediate local handling stays responsive; remote/projectile events use
  // the same presentation clock as their visuals below.
  audio.events({...state,events:state.events?.filter(e=>e.playerId===localId&&e.type!=='explosion'&&e.type!=='rocketLaunch')},player);
  if(state.winner!==null&&state.winner!==undefined&&!finished){
    reviveAwaitingControl=false;show('revive-control-hint',false);
    finished=true;clearControls();document.exitPointerLock?.();show('pause',false);show('death',false);show('scoreboard',false);
    renderResultScreen(player);
    show('result');
  }
}
const multiplayer=new Multiplayer({onState:receive,onRooms:renderRooms,onIdentity:id=>{localId=id;},onStatus:message=>{status(message);if(active&&message)toast(message);},onError:message=>{leave(false);status(message,true);toast(message);}});
const roomBrowser=mountRoomBrowser({getPing:()=>multiplayer.rtt,canResume:()=>multiplayer.canResume,onJoin:joinRoom,onRefresh:refreshRooms});

function prepare(which){
  reviveAwaitingControl=false;show('revive-control-hint',false);
  pendingDamage.clear();
  clearControls();simulation=null;state=null;localId=null;mode=which;room='';inLobby=false;seen.clear();audio.seen.clear();renderer.seenEvents.clear();renderer.lastShot=-1;feed=[];scoreFeed=[];scoreStreakTotal=0;scoreStreakExpires=0;finished=false;wasAlive=false;accumulator=0;unlocked=false;unlockedPaused=false;
  const name=$('callsign').value.trim()||'Rookie';save('name',name);unlockAudio();audio.click();return {name,classId:selectedClass,weaponId:currentWeaponId(selectedClass),sidearmId:selectedSidearm,bots:Number($('population').value),difficulty:$('difficulty').value,mapId:$('map-select').value};
}
function enter(){
  closeMenuPanels();
  show('pause-squads');
  inLobby=false;active=true;setBusy(false);show('menu',false);show('lobby',false);show('hud');show('pause',false);show('death',false);show('result',false);document.body.style.overflow='hidden';
  document.body.classList.add('in-battle');audio.setMode?.('battle');
  text('pause-title','Бой продолжается');text('pause-description','Вернись в сектор. Твой отряд ждёт.');$('resume').firstChild.textContent='ПРОДОЛЖИТЬ ';show('unlocked');show('leave');
  if(state)receive(state);
  text('room-badge',mode==='solo'?`БОЙ С БОТАМИ · ${state?.players?.filter(p=>p.bot).length??0} · ${difficultyNames[state?.difficulty]??difficultyNames[$('difficulty').value]}`:`КОМНАТА · ${state?.roomName||room||'СЕРВЕР'}`);
  requestControl(true);
}
async function requestControl(allowPendingSpawn=false){
  if(!active||inLobby||(!local()?.alive&&!allowPendingSpawn)||finished)return;
  if(unlocked){unlockedPaused=false;reviveAwaitingControl=false;show('revive-control-hint',false);show('pause',false);return;}
  try{
    await canvas.requestPointerLock();
    await captureGameKeyboard().catch(()=>{});
  }catch{
    if(reviveAwaitingControl){show('revive-control-hint');toast('Нажми на игру, чтобы вернуть управление мышью.');}
    else{if(local()?.alive)show('pause');toast('Нажми «Продолжить», чтобы включить управление мышью.');}
  }
}
function leave(resetStatus=true){
  reviveAwaitingControl=false;show('revive-control-hint',false);
  active=false;inLobby=false;clearControls();simulation=null;multiplayer.close();document.exitPointerLock?.();state=null;localId=null;wasAlive=false;finished=false;setBusy(false);show('menu');for(const id of ['hud','lobby','pause','death','result'])show(id,false);document.body.style.overflow='';
  document.body.classList.remove('in-battle','team-1');audio.setMode?.('menu');
  show('scoreboard',false);if(resetStatus)status('Сектор готов к высадке.');
}
function solo(){if(busy)return;multiplayer.close();const opts=prepare('solo');simulation=new Simulation({bots:opts.bots,difficulty:opts.difficulty,mapId:opts.mapId,debugBots:new URLSearchParams(location.search).has('aiDebug')});localId='local';simulation.addPlayer(localId,opts.name,0,opts.classId,opts.weaponId,opts.sidearmId);state=simulation.snapshot();enter();}
$('solo').addEventListener('click',solo);
async function serverAddress(){
  const url=$('server-url').value.trim()||await configuredServerUrl();
  if(!url){document.querySelector('.server-details').open=true;throw Error('Сервер ещё не настроен. Укажите его публичный WSS-адрес в разделе «Адрес игрового сервера».');}
  return normalizeServerUrl(url);
}
function renderRooms(rooms){
  text('rooms-note','Доступные комнаты');roomBrowser.render(rooms);
  if(inLobby&&state?.lobby)updateLobby();
}
async function joinRoom(item){
  if(busy)return;const opts=prepare('server');setBusy(true);
  try{room=await multiplayer.join({...opts,roomId:item.id,url:await serverAddress()});if(multiplayer.phase==='lobby')enterLobby();else enter();}
  catch(error){status(error.message,true);setBusy(false);}
}
async function refreshRooms(){
  text('rooms-note','Обновляем список…');
  try{await multiplayer.browse(await serverAddress());}
  catch(error){text('rooms-note',error.message);status(error.message,true);}
}
for(const map of Object.values(MAPS))$('room-map').add(new Option(map.name,map.id));
$('room-map').value=$('map-select').value;
configuredServerUrl().then(url=>{$('server-url').value=url;}).catch(()=>{});
$('host').addEventListener('click',()=>{$('room-map').value=$('map-select').value;});
$('create-room').addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;const opts=prepare('server');setBusy(true);
  try{room=await multiplayer.host({...opts,url:await serverAddress(),roomName:$('room-name').value,mapId:$('room-map').value,gameMode:$('room-mode').value,maxPlayers:Number($('room-max').value),bots:Number($('room-bots').value),difficulty:$('room-difficulty').value});enterLobby();}
  catch(error){status(error.message,true);setBusy(false);if(multiplayer.rooms.length){show('room-browser');renderRooms(multiplayer.rooms);}}
});
$('join-toggle').addEventListener('click',refreshRooms);
$('server-form').addEventListener('submit',event=>{event.preventDefault();try{const url=normalizeServerUrl($('server-url').value);save('server-url',url);multiplayer.close();status('Адрес сохранён. Откройте браузер комнат или создайте комнату.');}catch(error){status(error.message,true);}});
for(const button of document.querySelectorAll('[data-class]'))button.addEventListener('click',()=>selectClass(button.dataset.class,true));
for(const button of document.querySelectorAll('[data-deploy-class]'))button.addEventListener('click',()=>selectClass(button.dataset.deployClass,true));
for(const button of document.querySelectorAll('[data-lobby-class]'))button.addEventListener('click',()=>selectClass(button.dataset.lobbyClass,true));
async function chooseLobbyTeam(team){
  if(!inLobby||!local()||lobbyTeamRequest||local().team===team)return;
  const pending={team,roomId:multiplayer.roomId};lobbyTeamRequest=pending;
  lobbyTeamMessage='Сервер подтверждает выбор стороны…';audio.click();updateLobby();
  try{
    await multiplayer.chooseLobbyTeam(team);
    if(lobbyTeamRequest===pending)lobbyTeamMessage=`Выбрана сторона ${team===0?'A':'B'}.`;
  }catch(error){if(lobbyTeamRequest===pending)lobbyTeamMessage=error.message;}
  finally{if(lobbyTeamRequest===pending){lobbyTeamRequest=null;if(inLobby&&multiplayer.roomId===pending.roomId)updateLobby();}}
}
for(const team of [0,1])$(`lobby-choose-team-${team}`).addEventListener('click',()=>chooseLobbyTeam(team));
$('lobby-switch-team').addEventListener('click',()=>{const p=local();if(p)chooseLobbyTeam(1-p.team);});
$('lobby-map').addEventListener('change',event=>multiplayer.updateLobbySettings({mapId:event.target.value}));
$('lobby-difficulty').addEventListener('change',event=>{multiplayer.updateLobbySettings({difficulty:event.target.value,bots:Number($('lobby-population').value)});});
$('lobby-population').addEventListener('change',event=>{multiplayer.updateLobbySettings({bots:Number(event.target.value),difficulty:$('lobby-difficulty').value});});
$('lobby-copy').addEventListener('click',async()=>{const url=new URL(location.href);url.search='';url.hash='';try{await navigator.clipboard.writeText(url.href);toast('Ссылка на игру скопирована. Друзья найдут комнату в браузере комнат.');}catch{toast(url.href);}});
$('lobby-start').addEventListener('click',()=>{if(state?.ownerId!==localId)return;audio.click();multiplayer.startMatch({bots:Number($('lobby-population').value),difficulty:$('lobby-difficulty').value,mapId:$('lobby-map').value});});
$('lobby-leave').addEventListener('click',()=>leave());
$('spawn-point').addEventListener('change',event=>selectSpawnPoint(event.target.value,true));
$('resume').addEventListener('click',()=>{if(!active){show('pause',false);return;}audio.unlock();requestControl();});
$('menu-settings').addEventListener('click',()=>{text('pause-title','Настройки');text('pause-description','Подстрой игру под себя.');$('resume').firstChild.textContent='ГОТОВО ';show('unlocked',false);show('leave',false);show('pause-squads',false);show('pause');});
$('unlocked').addEventListener('click',()=>{captureGameKeyboard().catch(()=>{});unlocked=true;unlockedPaused=false;show('pause',false);audio.unlock();toast('WASD — движение. Зажми ПКМ и двигай мышью для обзора; стрелки тоже поворачивают камеру.');});
for(const id of ['leave','death-leave','result-leave'])$(id).addEventListener('click',()=>{
  if(id!=='result-leave'&&performance.now()-lastFireClick<600)return;
  leave();
});
$('play-again').addEventListener('click',()=>{if(mode==='solo')solo();else if(state?.ownerId===localId){multiplayer.startMatch({bots:Number($('lobby-population').value),difficulty:$('lobby-difficulty').value,mapId:$('lobby-map').value});enter();}else{leave();toast('Создай новую комнату для следующей операции.');}});
function triggerRespawn(){
  const p=local();if(!p||p.alive||p.respawnIn>0)return;
  const targetPoint=selectedSpawn;
  if(!spawnPointAvailable(p,targetPoint)){toast('Точка недоступна для высадки');return;}
  selectSpawnPoint(targetPoint);
  yaw=p.team===0?0:Math.PI;pitch=0;recoilPitch=0;recoilYaw=0;
  const weaponId=currentWeaponId(selectedClass);
  const accepted=simulation?simulation.respawn(localId,selectedClass,targetPoint,weaponId,selectedSidearm)
    :multiplayer.respawn(selectedClass,targetPoint,weaponId,selectedSidearm);
  if(!accepted){toast('Дислокация недоступна');return;}
  if(simulation)receive(simulation.snapshot());
  requestControl(true);
}
$('respawn').addEventListener('click',triggerRespawn);
$('sensitivity').value=read('sensitivity','0.8');sensitivity=Number($('sensitivity').value);
$('sensitivity').addEventListener('input',event=>{sensitivity=Number(event.target.value);save('sensitivity',sensitivity);});
$('quality').value=read('quality','high');quality=$('quality').value;
document.body.classList.toggle('low-quality',quality==='low');
$('quality').addEventListener('change',event=>{quality=event.target.value;document.body.classList.toggle('low-quality',quality==='low');save('quality',quality);});
for(const [id,key] of [['gfx-shadows','shadows'],['gfx-resolution','resolution']]){const el=$(id);const stored=read(id,'auto');el.value=[...el.options].some(o=>o.value===stored)?stored:'auto';gfx[key]=el.value;el.addEventListener('change',event=>{gfx[key]=event.target.value;save(id,gfx[key]);});}
$('gfx-aa').value=read('gfx-aa','auto');if(!['auto','on','off'].includes($('gfx-aa').value))$('gfx-aa').value='auto';
$('gfx-aa').addEventListener('change',event=>{save('gfx-aa',event.target.value);toast('Сглаживание применится после перезагрузки страницы.');});
$('volume').value=read('volume','0.5');audio.volume=Number($('volume').value);
$('volume').addEventListener('input',event=>{audio.volume=Number(event.target.value);save('volume',audio.volume);});
for(const [id,fallback,min,max,assign] of [['fov',85,70,100,value=>fov=value],['brightness',1,.8,1.3,value=>brightness=value],['music-volume',.45,0,1,value=>{musicVolume=value;setMusic();}],['effects-volume',.7,0,1,value=>{effectsVolume=value;audio.setEffectsVolume?.(value);}]]){
  const stored=Number(read(id,String(fallback)));$(id).value=String(Number.isFinite(stored)?Math.max(min,Math.min(max,stored)):fallback);assign(Number($(id).value));$(id).addEventListener('input',event=>{const value=Number(event.target.value);assign(value);save(id,value);});
}
$('camera-shake').checked=read('camera-shake','true')!=='false';cameraShake=$('camera-shake').checked;
$('camera-shake').addEventListener('change',event=>{cameraShake=event.target.checked;save('camera-shake',cameraShake);});
$('reset-binds')?.addEventListener('click',()=>{
  keybinds={...DEFAULT_BINDS};
  listeningAction=null;
  save('keybinds',JSON.stringify(keybinds));
  audio.click();
  updateKeybindUI();
  toast('Клавиши управления сброшены по умолчанию');
});
$('sound-toggle').addEventListener('click',()=>{audio.enabled=!audio.enabled;text('sound-toggle',audio.enabled?'ЗВУК ВКЛ.':'ЗВУК ВЫКЛ.');$('sound-toggle').setAttribute('aria-pressed',String(audio.enabled));unlockAudio();musicUI();});
$('music-toggle').addEventListener('click',()=>{if(audioStarted)musicMuted=!musicMuted;else musicMuted=false;save('music-muted',musicMuted);unlockAudio();setMusic();});
mountMenuPanels(()=>{unlockAudio();audio.click();});
weaponPreview=mountWeaponPreview({getRig:()=>renderer?.weaponRig,getLoadout:()=>({classId:selectedClass,weaponId:currentWeaponId(selectedClass),sidearmId:selectedSidearm})});
lobbyWeaponPreview=mountWeaponPreview({getRig:()=>renderer?.weaponRig,getLoadout:()=>({classId:selectedClass,weaponId:currentWeaponId(selectedClass),sidearmId:selectedSidearm}),panelId:'lobby',prefix:'lobby-weapon-preview'});
squadUI=mountSquadUI({getState:()=>state,getLocalId:()=>localId,getKey:()=>formatKeyCode(keybinds.squad),
  getOrderKeys:()=>({order:formatKeyCode(keybinds.order)}),
  onOpen:()=>{clearControls();if(active&&local()?.alive){unlockedPaused=true;document.exitPointerLock?.();show('pause');}audio.click();},
  onChange:async id=>{if(simulation){if(!simulation.changeSquad(localId,id))throw Error('Отряд заполнен.');receive(simulation.snapshot());}else await multiplayer.changeSquad(id);},
});
canvas.addEventListener('click',()=>{if(active&&!locked)requestControl();});
$('revive-control-hint').addEventListener('click',()=>requestControl());
$('keyboard-fullscreen').addEventListener('click',()=>captureGameKeyboard({fullscreen:true}).catch(()=>toast('Браузер не разрешил захват клавиатуры.')));
document.addEventListener('pointerlockchange',()=>{
  locked=document.pointerLockElement===canvas;
  if(locked){
    reviveAwaitingControl=false;show('revive-control-hint',false);
    listeningAction=null;
    show('pause',false);
    audio.unlock();
    captureGameKeyboard().catch(()=>{});
  }else{
    navigator.keyboard?.unlock?.();
    clearControls();
    if(active&&local()?.alive&&!finished&&!reviveAwaitingControl)show('pause');
  }
});
window.addEventListener('beforeunload',event=>{
  if(active&&!finished){
    event.preventDefault();
    event.returnValue='';
  }
});
document.addEventListener('pointerlockerror',()=>{if(active){if(reviveAwaitingControl)show('revive-control-hint');else show('pause');toast(reviveAwaitingControl?'Нажми на игру, чтобы вернуть управление мышью.':'Браузер не разрешил захват мыши. Нажми «Продолжить» ещё раз.');}});
document.addEventListener('mousemove',event=>{
  if(!locked&&!(unlocked&&!unlockedPaused&&active&&aim))return;
  const player=local();
  const aimScale = aim ? (!player?.heldGadget&&player?.classId === 'recon' && player.weaponSlot!==2 ? (player.weaponId==='sv98' ? .35*4/scopeZoom : .35) : .65) : 1;
  const factor=.0022*sensitivity*aimScale;
  yaw-=event.movementX*factor;pitch=Math.max(-1.45,Math.min(1.45,pitch-event.movementY*factor));
});
let lastFireClick=0;
document.addEventListener('wheel',event=>{
  if(!active||!aim||!local()?.alive||local()?.heldGadget||local()?.weaponId!=='sv98'||
    (!locked&&!(unlocked&&!unlockedPaused))||!event.deltaY)return;
  event.preventDefault();
  scopeZoom=Math.max(6,Math.min(12,scopeZoom-Math.sign(event.deltaY)));
},{passive:false});
document.addEventListener('mousedown',event=>{if(event.button===0&&active)lastFireClick=performance.now();if(!locked&&!(unlocked&&!unlockedPaused&&active&&event.target===canvas))return;if(event.button===0){fireTap=!fire;fire=true;}if(event.button===2)aim=true;});
document.addEventListener('mouseup',event=>{if(event.button===0)fire=false;if(event.button===2)aim=false;});
document.addEventListener('contextmenu',event=>{if(active)event.preventDefault();});
document.addEventListener('keydown',event=>{
  if($('patch-notes').open)return;
  if(document.querySelector('dialog.menu-dialog[open]'))return;
  if(listeningAction){
    event.preventDefault();
    event.stopPropagation();
    if(event.code==='Digit3'){listeningAction=null;updateKeybindUI();toast('Клавиша 3 закреплена за снаряжением класса.');return;}
    if(event.code!=='Escape'){
      const previous=keybinds[listeningAction];
      for(const k of Object.keys(keybinds)){
        if(k!==listeningAction&&keybinds[k]===event.code)keybinds[k]=previous;
      }
      keybinds[listeningAction]=event.code;
      save('keybinds',JSON.stringify(keybinds));
      audio.click();
    }
    listeningAction=null;
    updateKeybindUI();
    return;
  }
  if(!active){if(event.code==='Escape')show('pause',false);return;}
  if(isBound('squad',event.code)&&!event.repeat){event.preventDefault();squadUI.open();return;}
  if(!local()?.alive&&!finished&&!$('death').classList.contains('hidden')){
    const classKeys={Digit1:'assault',Digit2:'medic',Digit3:'support',Digit4:'recon'};
    if(classKeys[event.code]){
      event.preventDefault();
      const targetClass=classKeys[event.code];
      if(selectedClass===targetClass){
        const list=CLASS_WEAPONS[targetClass]||[];
        const nextIdx=(list.indexOf(currentWeaponId(targetClass))+1)%list.length;
        if(list[nextIdx])selectWeapon(list[nextIdx],true);
      }else{
        selectClass(targetClass,true);
      }
      return;
    }
    if((event.code==='Space'||event.code==='Enter'||isBound('jump',event.code))&&!event.repeat){event.preventDefault();triggerRespawn();return;}
  }
  if(event.code==='Escape'&&unlocked){unlockedPaused=!unlockedPaused;show('pause',unlockedPaused);clearControls();return;}
  if(event.code==='Escape'&&reviveAwaitingControl){reviveAwaitingControl=false;show('revive-control-hint',false);show('pause');return;}
  if(isBound('score',event.code)){event.preventDefault();show('scoreboard');return;}
  if(!locked&&!(unlocked&&!unlockedPaused))return;
  if(local()?.alive&&!event.repeat&&(event.code==='Digit1'||event.code==='Digit2')){
    event.preventDefault();
    weaponSlot=event.code==='Digit2'?2:1;
    toolSlot=0;
    return;
  }
  if(local()?.alive&&!event.repeat&&(isBound('gadget',event.code)||isBound('secondaryGadget',event.code)||event.code==='Digit3'||event.code==='Digit4')){
    event.preventDefault();
    const slot=isBound('secondaryGadget',event.code)||event.code==='Digit4'?2:1;
    const player=local(),kind=selectedGadget(player.classId,slot);
    if(toolSlot===slot)toolSlot=0;
    else if(kind){
      if(isSupplyGadget(kind)&&gadgetCooldown(player,kind)>0)toast(`${GADGET_NAMES[kind]} · ГОТОВНОСТЬ ЧЕРЕЗ ${Math.ceil(gadgetCooldown(player,kind))}с`);
      else toolSlot=slot;
    }
    return;
  }
  if(event.ctrlKey||['ControlLeft','ControlRight','Space','Tab','ArrowUp','ArrowDown','ArrowLeft','ArrowRight',keybinds.jump,keybinds.score,keybinds.crouch,keybinds.forward,keybinds.back,keybinds.left,keybinds.right].includes(event.code))event.preventDefault();
  keys.add(event.code);
  if(!event.repeat&&(isBound('reload',event.code)||isBound('gadget',event.code)||isBound('secondaryGadget',event.code)||isBound('grenade',event.code)||isBound('interact',event.code)||isBound('switchSeat',event.code)||isBound('horn',event.code)||isBound('order',event.code))){
    pulses.add(event.code);
  }
});
document.addEventListener('keyup',event=>{keys.delete(event.code);if(isBound('score',event.code)){event.preventDefault();show('scoreboard',false);}});
window.addEventListener('blur',clearControls);
document.addEventListener('visibilitychange',()=>{clearControls();lastFrame=performance.now();accumulator=0;fpsClock=0;frames=0;if(document.hidden)audio.ctx?.suspend?.();else if(audioStarted)unlockAudio();});
function input(){
  const enabled=!!((locked||(unlocked&&!unlockedPaused))&&local()?.alive&&!finished);
  const firing=enabled&&(fire||fireTap);
  return {
    forward:enabled?Number(isActionHeld('forward'))-Number(isActionHeld('back')):0,
    strafe:enabled?Number(isActionHeld('right'))-Number(isActionHeld('left')):0,
    ...aimAngles(),
    sprint:enabled&&isActionHeld('sprint')&&!aim&&!firing,
    crouch:enabled&&isActionHeld('crouch'),
    jump:enabled&&isActionHeld('jump'),
    fire:firing,
    aim:enabled&&aim,
    weaponSlot:enabled?weaponSlot:0,
    toolSlot,
    reload:enabled&&pulses.has(keybinds.reload),
    gadget:false,
    secondaryGadget:false,
    grenade:enabled&&pulses.has(keybinds.grenade),
    interact:enabled&&pulses.has(keybinds.interact),
    switchSeat:enabled&&pulses.has(keybinds.switchSeat),
    horn:enabled&&pulses.has(keybinds.horn),
    order:enabled&&pulses.has(keybinds.order),
  };
}

const TEAM_HEX=['#79c5d2','#e6b273'];
const TEAM_BG=['#133a44e6','#422c17e6'];
const minimapCanvas=$('minimap');
const mapctx=minimapCanvas.getContext('2d');
const mapBackground=document.createElement('canvas');
const mapSize=minimapCanvas.width;
let mapScale,mapHalf;
mapBackground.width=mapBackground.height=mapSize;
function drawMinimapBackground(){
  const c=mapBackground.getContext('2d'),s=mapSize,scale=mapScale,half=mapHalf,step=s/10;
  c.fillStyle='#15262c';c.fillRect(0,0,s,s);drawHarborChart(c,scale,half);drawMapRelief(c,scale,half);c.strokeStyle='#5d7b802b';c.lineWidth=1;
  for(let n=0;n<10;n++){c.beginPath();c.moveTo(n*step,0);c.lineTo(n*step,s);c.moveTo(0,n*step);c.lineTo(s,n*step);c.stroke();}
  drawMapRoads(c,scale,half);
  for(const b of currentMap.boxes){
    if(b.overhead)continue;
    c.fillStyle=b.kind==='tree'?'#4e7452aa':b.kind==='truck'||b.kind==='car'?'#987654aa':'#73817c77';
    c.fillRect((b.x-b.w/2+half)*scale,(b.z-b.d/2+half)*scale,b.w*scale,b.d*scale);
  }
}
function minimap(player){
  const c=mapctx,scale=mapScale,half=mapHalf;
  c.drawImage(mapBackground,0,0);
  c.font='bold 10px sans-serif';c.textAlign='center';
  for(const p of state.points){const x=(p.x+half)*scale,z=(p.z+half)*scale;c.fillStyle=p.owner===-1?'#ced1bb':TEAM_HEX[p.owner]??'#ced1bb';c.strokeStyle=c.fillStyle;c.globalAlpha=.15;c.beginPath();c.arc(x,z,CAPTURE_RADIUS*scale,0,Math.PI*2);c.fill();c.globalAlpha=1;c.fillText(p.id,x,z+3.5);}
  const orderedPoint=state.points.find(p=>p.id===player.orderPointId);
  if(orderedPoint){const x=(orderedPoint.x+half)*scale,z=(orderedPoint.z+half)*scale;c.strokeStyle=SQUAD_COLOR;c.lineWidth=1.3;c.beginPath();c.arc(x,z,8,0,Math.PI*2);c.moveTo(x-11,z);c.lineTo(x-5,z);c.moveTo(x+5,z);c.lineTo(x+11,z);c.moveTo(x,z-11);c.lineTo(x,z-5);c.moveTo(x,z+5);c.lineTo(x,z+11);c.stroke();}
  for(const item of state.deployables??[]){
    if(item.kind!=='beacon'||item.team!==player.team||item.hp<=0||item.expires<=state.time)continue;
    const x=(item.x+half)*scale,z=(item.z+half)*scale;
    c.fillStyle='#102129';c.strokeStyle=sameSquad(player,item)?SQUAD_COLOR:'#79c5d2';c.lineWidth=1.4;c.beginPath();c.arc(x,z,4,0,Math.PI*2);c.fill();c.stroke();
    c.fillStyle=c.strokeStyle;c.fillRect(x-.8,z-2,1.6,4);
  }
  for(const p of state.players){if(!p.alive||p.id===localId)continue;const friend=p.team===player.team;if(!friend&&!p.spotted&&Math.hypot(p.x-player.x,p.z-player.z)>28)continue;c.fillStyle=sameSquad(player,p)?SQUAD_COLOR:TEAM_HEX[p.team]??'#79c5d2';c.beginPath();c.arc((p.x+half)*scale,(p.z+half)*scale,friend?1.8:2.3,0,Math.PI*2);c.fill();}
  for(const vehicle of state.vehicles??[]){
    if(vehicle.hp<=0||vehicle.team!==player.team||vehicle.id===player.vehicleId)continue;
    c.save();c.translate((vehicle.x+half)*scale,(vehicle.z+half)*scale);c.rotate(-vehicle.yaw);
    c.fillStyle=TEAM_HEX[vehicle.team];c.fillRect(-2,-3,4,6);c.restore();
  }
  c.save();c.translate((player.x+half)*scale,(player.z+half)*scale);c.rotate(-yaw);c.fillStyle=TEAM_HEX[player.team]??'#f0f4e9';c.strokeStyle='#f0f4e9';c.lineWidth=.8;c.beginPath();c.moveTo(0,-4.5);c.lineTo(3,3.5);c.lineTo(0,1.8);c.lineTo(-3,3.5);c.closePath();c.fill();c.stroke();c.restore();
}
const deployCanvas=$('deploy-map');
const deployCtx=deployCanvas.getContext('2d');
const deployMapBg=document.createElement('canvas');
const deploySize=deployCanvas.width;
let deployScale,deployHalf;
deployMapBg.width=deployMapBg.height=deploySize;
function drawDeployBackground(){
  const c=deployMapBg.getContext('2d'),s=deploySize,scale=deployScale,half=deployHalf;
  c.fillStyle='#0c1a20';c.fillRect(0,0,s,s);
  drawHarborChart(c,scale,half);
  drawMapRelief(c,scale,half);drawMapRoads(c,scale,half);
  const cols=['A','B','C','D','E','F'],cell=s/6;
  c.strokeStyle='#79c5d21c';c.lineWidth=1;c.font='600 10px sans-serif';c.fillStyle='#6f8e9588';
  for(let i=0;i<6;i++){
    const pos=i*cell;
    c.beginPath();c.moveTo(pos,0);c.lineTo(pos,s);c.moveTo(0,pos);c.lineTo(s,pos);c.stroke();
    c.fillText(cols[i],pos+6,13);
    c.fillText(String(i+1),5,pos+24);
  }
  for(const b of currentMap.boxes){
    if(b.overhead)continue;
    const x=(b.x-b.w/2+half)*scale,z=(b.z-b.d/2+half)*scale,w=b.w*scale,d=b.d*scale;
    if(b.kind==='tree'){
      c.fillStyle='#4a754ecc';
      c.beginPath();c.arc((b.x+half)*scale,(b.z+half)*scale,Math.max(2.6,w*.95),0,Math.PI*2);c.fill();
      continue;
    }
    c.fillStyle=b.kind==='wall'||b.kind==='barrier'||b.kind==='sandbags'?'#879693aa':b.kind==='truck'||b.kind==='car'?'#9c7a54bb':b.kind==='tent'?'#5c7860bb':String(b.kind).includes('container')||b.kind==='fueltank'?'#597578aa':'#41565baa';
    c.fillRect(x,z,w,d);
    if(b.h>4){c.strokeStyle='#a5babd44';c.lineWidth=1;c.strokeRect(x+.5,z+.5,Math.max(1,w-1),Math.max(1,d-1));}
  }
  c.font='600 9px sans-serif';c.fillStyle='#bdc7b8';c.textAlign='center';
  for(const site of currentMap.landmarks??[]){
    c.fillText(site.name,(site.x+half)*scale,(site.z+half)*scale-7);
  }
  for(const st of currentMap.structures||[]){
    const x=(st.x-st.w/2+half)*scale,z=(st.z-st.d/2+half)*scale,w=st.w*scale,d=st.d*scale;
    c.fillStyle='#5c747838';c.fillRect(x,z,w,d);
    c.strokeStyle='#9ab5b866';c.setLineDash([4,3]);c.strokeRect(x,z,w,d);c.setLineDash([]);
  }
}
function drawHarborChart(c,scale,half){
  if(currentMap.shoreX===undefined)return;
  const quay=(currentMap.shoreX+half)*scale,size=half*2*scale;
  c.fillStyle='#143743';c.fillRect(0,0,quay,size);
  c.strokeStyle='#6caaa488';c.beginPath();c.moveTo(quay,0);c.lineTo(quay,size);c.stroke();
  const ship=currentMap.ship;
  c.fillStyle='#496d76';
  if(ship)c.fillRect((ship.x-ship.w/2+half)*scale,(ship.z-ship.d/2+half)*scale,ship.w*scale,ship.d*scale);
  c.strokeStyle='#9eb5b340';
  for(const track of currentMap.railTracks){
    const x=(track.x+half)*scale;
    const span=track.quayTrack?355:445;
    const start=Math.max(0,(track.z-span/2+half)*scale);
    const end=Math.min(size,(track.z+span/2+half)*scale);
    if(start<end){c.beginPath();c.moveTo(x,start);c.lineTo(x,end);c.stroke();}
  }
}
function drawMapRelief(c,scale,half){
  const terrain=currentMap.terrain;
  if(!terrain)return;
  const step=8;
  for(let z=-half;z<half;z+=step)for(let x=-half;x<half;x+=step){
    const y=terrain.heightAt(x+step/2,z+step/2);
    if(Math.abs(y)<.3)continue;
    const band=Math.floor(Math.abs(y)/4);
    c.globalAlpha=Math.min(.5,.12+band*.055);
    c.fillStyle=y<0?(band%2?'#27606d':'#35717c'):(band%2?'#8f7455':'#aa8a61');
    c.fillRect((x+half)*scale,(z+half)*scale,step*scale+.3,step*scale+.3);
  }
  c.globalAlpha=1;
}
function drawMapRoads(c,scale,half){
  c.fillStyle='#70695455';
  for(const road of currentMap.roads??[]){
    c.save();c.translate((road.x+half)*scale,(road.z+half)*scale);c.rotate(-(road.yaw??0));
    c.fillRect(-road.w*scale/2,-road.d*scale/2,road.w*scale,road.d*scale);c.restore();
  }
}
function setBattleMap(mapId,force=false){
  const map=getMap(mapId);
  if(!force&&map===currentMap)return;
  currentMap=map;
  mapHalf=deployHalf=map.size/2;
  mapScale=mapSize/map.size;deployScale=deploySize/map.size;
  selectedSpawn='';hoveredSpawn=null;
  text('minimap-name',map.name.toUpperCase());
  $('objective-strip').replaceChildren();$('world-markers').replaceChildren();
  for(const p of currentMap.points){const objective=document.createElement('div');objective.id=`objective-${p.id}`;objective.className='objective';const label=document.createElement('span');label.textContent=p.id;objective.append(label);$('objective-strip').append(objective);const marker=document.createElement('div');marker.id=`marker-${p.id}`;marker.className='world-marker';const letter=document.createElement('b'),distance=document.createElement('span');letter.textContent=p.id;marker.append(letter,distance);$('world-markers').append(marker);}
  drawMinimapBackground();drawDeployBackground();
}
function initializeMapPickers(){
  for(const map of Object.values(MAPS)){
    $('map-select').add(new Option(map.name,map.id));
    $('lobby-map').add(new Option(map.name,map.id));
  }
  $('map-select').value=getMap(read('map',DEFAULT_MAP_ID)).id;
  const update=()=>{
    const map=getMap($('map-select').value);
    text('menu-map-name',map.name.toUpperCase());
    text('menu-map-points',String(map.points.length).padStart(2,'0'));
    text('menu-map-info',map.size+' × '+map.size+' м · '+map.points.length+' позиций'+(map.vehicleSpawns?.length?' · Квадроциклы и хамви':map.theme==='desert-village'?' · Пехотный бой':''));
    save('map',map.id);
  };
  $('map-select').addEventListener('change',update);
  update();
}
function pickDeploySpawnAt(clientX,clientY){
  const player=local();if(!player||!state)return null;
  const rect=deployCanvas.getBoundingClientRect();
  const mx=(clientX-rect.left)*(deploySize/rect.width);
  const my=(clientY-rect.top)*(deploySize/rect.height);
  const base=currentMap.spawns[player.team]??currentMap.spawns[0];
  const bx=(base.x+deployHalf)*deployScale,bz=(base.z+deployHalf)*deployScale;
  if(Math.hypot(mx-bx,my-bz)<=24)return {id:'',available:true};
  for(const p of deploymentPoints()){
    const px=(p.x+deployHalf)*deployScale,pz=(p.z+deployHalf)*deployScale;
    if(Math.hypot(mx-px,my-pz)<=24){
      return {id:p.id,available:canSpawnAtPoint(p,player.team)};
    }
  }
  return null;
}
deployCanvas.addEventListener('mousemove',event=>{
  const picked=pickDeploySpawnAt(event.clientX,event.clientY);
  hoveredSpawn=picked?picked.id:null;
  deployCanvas.style.cursor=picked?(picked.available?'pointer':'not-allowed'):'crosshair';
});
deployCanvas.addEventListener('mouseleave',()=>{hoveredSpawn=null;});
deployCanvas.addEventListener('click',event=>{
  const picked=pickDeploySpawnAt(event.clientX,event.clientY);
  if(picked!==null)selectSpawnPoint(picked.id,true);
});
deployCanvas.addEventListener('dblclick',event=>{
  const picked=pickDeploySpawnAt(event.clientX,event.clientY);
  if(picked&&picked.available&&selectSpawnPoint(picked.id,false))triggerRespawn();
});
function beaconTime(point){
  const seconds=Math.max(0,Math.ceil(point.expires-state.time));
  return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
}
function drawBeaconIcon(c){
  c.lineWidth=1.4;c.beginPath();c.moveTo(0,0);c.lineTo(0,7);c.moveTo(-3,7);c.lineTo(3,7);c.stroke();
  c.beginPath();c.arc(0,-1,1.3,0,Math.PI*2);c.fill();
  for(const radius of [4,7]){c.beginPath();c.arc(0,-1,radius,-Math.PI*.35,Math.PI*.35);c.stroke();c.beginPath();c.arc(0,-1,radius,Math.PI*.65,Math.PI*1.35);c.stroke();}
}
function drawDeployMap(player,now){
  const c=deployCtx,scale=deployScale,half=deployHalf,pulse=(Math.sin(now*0.006)+1)*0.5;
  const allyColor=TEAM_HEX[player.team]??'#79c5d2',enemyColor=TEAM_HEX[1-player.team]??'#e6b273';
  c.drawImage(deployMapBg,0,0);
  for(const team of [0,1]){
    const base=currentMap.spawns[team],friend=team===player.team,tColor=TEAM_HEX[team];
    const x=(base.x+half)*scale,z=(base.z+half)*scale;
    c.save();
    c.fillStyle=TEAM_BG[team];
    c.strokeStyle=tColor;
    c.lineWidth=1.6;
    c.fillRect(x-13,z-10,26,20);
    c.strokeRect(x-13,z-10,26,20);
    c.fillStyle=tColor;
    c.font='700 9px sans-serif';c.textAlign='center';c.textBaseline='middle';
    c.fillText(friend?'ШТАБ':'ВРАГ',x,z);
    c.restore();
    if(friend&&(selectedSpawn===''||hoveredSpawn==='')){
      c.save();
      c.strokeStyle=allyColor;c.lineWidth=selectedSpawn===''?2:1;
      const r=18+pulse*3;
      c.strokeRect(x-r,z-r*.78,r*2,r*1.56);
      c.restore();
    }
  }
  for(const p of deploymentPoints()){
    const x=(p.x+half)*scale,z=(p.z+half)*scale;
    const color=p.id===player.orderPointId?SQUAD_COLOR:p.owner===-1?'#ced1bb':TEAM_HEX[p.owner]??'#ced1bb';
    c.save();
    if(p.beacon){
      c.translate(x,z);c.fillStyle=p.squadBeacon?'#15382bea':'#15303bea';c.strokeStyle=p.squadBeacon?SQUAD_COLOR:'#79c5d2';c.lineWidth=1.6;
      c.beginPath();c.arc(0,0,12,0,Math.PI*2);c.fill();c.stroke();
      c.fillStyle=p.squadBeacon?SQUAD_COLOR:'#79c5d2';drawBeaconIcon(c);
      if(selectedSpawn===p.id||hoveredSpawn===p.id){c.lineWidth=1.5;c.beginPath();c.arc(0,0,16+pulse*2,0,Math.PI*2);c.stroke();}
      c.fillStyle=p.squadBeacon?SQUAD_COLOR:'#79c5d2';c.font='600 8px sans-serif';c.textAlign='center';c.textBaseline='middle';
      c.fillText(p.name,0,22);c.fillText(beaconTime(p),0,32);c.restore();continue;
    }
    c.fillStyle=color;c.strokeStyle=color;
    c.globalAlpha=.14;c.beginPath();c.arc(x,z,CAPTURE_RADIUS*scale,0,Math.PI*2);c.fill();
    c.globalAlpha=.45;c.lineWidth=1.2;c.stroke();
    if(Math.abs(p.progress)>0.02&&Math.abs(p.progress)<0.99){
      c.globalAlpha=.9;c.lineWidth=2.4;c.beginPath();
      c.arc(x,z,CAPTURE_RADIUS*scale+3,-Math.PI/2,-Math.PI/2+Math.PI*2*Math.abs(p.progress));
      c.stroke();
    }
    if(p.contested){
      c.globalAlpha=.35+pulse*.45;c.strokeStyle='#ff8e63';c.lineWidth=2;
      c.beginPath();c.arc(x,z,CAPTURE_RADIUS*scale+5+pulse*3,0,Math.PI*2);c.stroke();
    }
    c.globalAlpha=1;
    c.translate(x,z);c.rotate(Math.PI/4);
    c.fillStyle=p.owner===-1?'#253033e6':TEAM_BG[p.owner]??'#253033e6';
    c.strokeStyle=color;c.lineWidth=1.8;
    c.fillRect(-9,-9,18,18);c.strokeRect(-9,-9,18,18);
    c.rotate(-Math.PI/4);
    c.fillStyle='#f3f6ee';c.font='700 11px sans-serif';c.textAlign='center';c.textBaseline='middle';
    c.fillText(p.beacon?'М':p.id,0,0.5);
    c.fillStyle=color;c.font='600 8px sans-serif';
    c.fillText(p.name,0,19);
    c.restore();
    if(selectedSpawn===p.id||hoveredSpawn===p.id){
      c.save();
      c.strokeStyle=canSpawnAtPoint(p,player.team)?allyColor:enemyColor;
      c.lineWidth=selectedSpawn===p.id?2:1.2;
      const r=16+pulse*3;
      for(const [sx,sz] of [[-1,-1],[1,-1],[1,1],[-1,1]]){
        c.beginPath();
        c.moveTo(x+sx*r,z+sz*(r-6));c.lineTo(x+sx*r,z+sz*r);c.lineTo(x+sx*(r-6),z+sz*r);
        c.stroke();
      }
      c.restore();
    }
  }
  for(const p of state.players){
    if(!p.alive||p.id===localId)continue;
    const friend=p.team===player.team;
    if(!friend&&!p.spotted)continue;
    const x=(p.x+half)*scale,z=(p.z+half)*scale;
    const pColor=sameSquad(player,p)?SQUAD_COLOR:friend?'#79c5d2':TEAM_HEX[p.team]??allyColor;
    c.save();
    c.translate(x,z);
    if(friend){
      c.fillStyle=`${pColor}33`;c.beginPath();c.arc(0,0,7,0,Math.PI*2);c.fill();
      c.rotate(-(p.yaw||0));
      c.fillStyle=pColor;c.strokeStyle='#08181f';c.lineWidth=1.2;
      c.beginPath();c.moveTo(0,-6.2);c.lineTo(4.4,4.8);c.lineTo(0,2.2);c.lineTo(-4.4,4.8);c.closePath();
      c.fill();c.stroke();
    }else{
      c.rotate(Math.PI/4);
      c.fillStyle=pColor;c.strokeStyle='#181008';c.lineWidth=1;
      c.fillRect(-3.5,-3.5,7,7);c.strokeRect(-3.5,-3.5,7,7);
    }
    c.restore();
  }
  if(lastDeathPos){
    const dx=(lastDeathPos.x+half)*scale,dz=(lastDeathPos.z+half)*scale;
    c.save();
    c.strokeStyle='#f06b59';c.lineWidth=2.2;
    c.beginPath();c.moveTo(dx-5,dz-5);c.lineTo(dx+5,dz+5);c.moveTo(dx+5,dz-5);c.lineTo(dx-5,dz+5);c.stroke();
    c.strokeStyle='#f06b5966';c.lineWidth=1.2;
    c.beginPath();c.arc(dx,dz,8+pulse*2.5,0,Math.PI*2);c.stroke();
    c.restore();
  }
}
function updateDeployScreen(player,now){
  text('deploy-tickets-blue',Math.ceil(state.tickets[player.team]));
  text('deploy-tickets-orange',Math.ceil(state.tickets[1-player.team]));
  const ready=player.respawnIn<=0;
  text('death-countdown',ready?'ГОТОВ К ВЫСАДКЕ · ВЫБЕРИ СЕКТОР И НАЖМИ ДИСЛОКАЦИЯ':`ДО ВЫСАДКИ ${Math.ceil(player.respawnIn)} С · МЕДИК МОЖЕТ ВОСКРЕСИТЬ`);
  $('respawn').disabled=!ready;
  $('deploy-status-dot').classList.toggle('ready',ready);
  if(selectedSpawn&&!spawnPointAvailable(player,selectedSpawn)){
    selectSpawnPoint('');
    if(document.pointerLockElement===canvas)document.exitPointerLock?.();
  }
  const options=deploymentPoints().filter(p=>canSpawnAtPoint(p,player.team));
  const signature=options.map(p=>p.id).join('');
  const selectEl=$('spawn-point');
  if(selectEl.dataset.signature!==signature){
    selectEl.dataset.signature=signature;
    const points=document.createElement('optgroup'),beacons=document.createElement('optgroup');
    points.label='База и точки захвата';beacons.label='Союзные маяки';
    points.append(new Option('База команды',''),...options.filter(p=>!p.beacon).map(p=>new Option(`${p.id} · ${p.name}`,p.id)));
    beacons.append(...options.filter(p=>p.beacon).map(p=>new Option(p.name,p.id)));
    selectEl.replaceChildren(points,...(beacons.children.length?[beacons]:[]));
    selectEl.value=selectedSpawn;
  }
  const allies=state.players.filter(p=>p.alive&&p.team===player.team&&p.id!==localId);
  text('deploy-allies-count',`СОЮЗНИКОВ В БОЮ: ${allies.length}`);
  const listSig=`${selectedSpawn}:`+deploymentPoints().map(p=>{
    const near=allies.filter(a=>Math.hypot(a.x-p.x,a.z-p.z)<32).length;
    return `${p.id}:${p.squadBeacon?1:0}:${p.owner}:${p.contested?1:0}:${p.spawnBlocked?1:0}:${near}:${p.beacon?beaconTime(p):''}`;
  }).join('|');
  const listEl=$('deploy-spawn-list');
  if(listEl.dataset.signature!==listSig){
    listEl.dataset.signature=listSig;
    const items=[
      {id:'',badge:'HQ',name:'ШТАБ КОМАНДЫ',sub:'Основная база',tag:'ДОСТУПНО',available:true,hq:true},
      ...deploymentPoints().map(p=>{
        const friend=p.owner===player.team,enemy=p.owner!==-1&&!friend;
        const available=canSpawnAtPoint(p,player.team);
        const near=allies.filter(a=>Math.hypot(a.x-p.x,a.z-p.z)<32).length;
        const blocked=p.contested||(friend&&p.spawnBlocked);
        const tag=p.contested?'ОСПАРИВАЕТСЯ':blocked?'ПРОТИВНИК НА ТОЧКЕ':available?'ДОСТУПНО':enemy?'ВРАГ':'НЕЙТРАЛЬНО';
        return {id:p.id,badge:p.id,name:p.name,sub:`${p.beacon?beaconTime(p)+' · ':''}Союзников рядом: ${near}`,tag,available,enemy,contested:blocked,beacon:p.beacon,squadBeacon:p.squadBeacon};
      }),
    ];
    const makeButton=item=>{
      const btn=document.createElement('button');
      btn.type='button';
      btn.className=`spawn-item${item.hq?' hq':''}${item.beacon?' beacon':''}${item.squadBeacon?' squad-beacon':''}${selectedSpawn===item.id?' selected':''}${!item.available?' locked':''}${item.enemy?' enemy-owned':''}${item.contested?' contested':''}`;
      btn.setAttribute('role','option');btn.setAttribute('aria-selected',String(selectedSpawn===item.id));
      const left=document.createElement('div'),badge=document.createElement('span'),badgeInner=document.createElement('i'),info=document.createElement('div'),title=document.createElement('b'),sub=document.createElement('small'),tag=document.createElement('span');
      left.className='spawn-item-left';badge.className='spawn-badge';badgeInner.textContent=item.badge;badge.append(badgeInner);
      if(item.beacon){
        const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),path=document.createElementNS('http://www.w3.org/2000/svg','path');
        svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');
        path.setAttribute('d','M12 11v9m-4 0h8M8 7a6 6 0 0 0 0 8m8-8a6 6 0 0 1 0 8M5 4a10 10 0 0 0 0 14m14-14a10 10 0 0 1 0 14M11 10h2');
        svg.append(path);badgeInner.replaceChildren(svg);
      }
      info.className='spawn-info';title.textContent=item.name;sub.textContent=item.sub;info.append(title,sub);
      left.append(badge,info);tag.className='spawn-tag';tag.textContent=item.tag;
      btn.append(left,tag);
      btn.addEventListener('click',()=>selectSpawnPoint(item.id,true));
      btn.addEventListener('dblclick',()=>{if(item.available&&selectSpawnPoint(item.id,false))triggerRespawn();});
      return btn;
    };
    const heading=label=>{const node=document.createElement('div');node.className='spawn-group-title';node.textContent=label;return node;};
    const beacons=items.filter(item=>item.beacon);
    listEl.replaceChildren(heading('БАЗА И ТОЧКИ ЗАХВАТА'),...items.filter(item=>!item.beacon).map(makeButton),
      ...(beacons.length?[heading(`СОЮЗНЫЕ МАЯКИ · ${beacons.length}`),...beacons.map(makeButton)]:[]));
  }
  drawDeployMap(player,now);
}
function buildScoreRow(p,allyTeam){
  const row=document.createElement('div');
  row.className=`score-row team${p.team===allyTeam?0:1}${p.id===localId?' local':''}`;
  const vals=[
    `${p.alive?'●':'×'} ${p.name}${p.bot?' [AI]':''}`,
    CLASSES[p.classId]?.name??p.classId,
    `${p.kills} / ${p.deaths} / ${p.assists||0}`,
    String(p.score||0),
  ];
  for(const value of vals){
    const span=document.createElement('span');
    span.textContent=value;
    row.append(span);
  }
  return row;
}
function renderResultScreen(player){
  const won=state.winner===player.team;
  text('result-title',won?'Сектор удержан — Победа':'Сектор потерян — Поражение');
  const mins=Math.floor(state.time/60),secs=Math.floor(state.time%60);
  text('result-stats',`Личный вклад: ${player.score||0} очк. · ${player.kills} У / ${player.deaths} П / ${player.assists||0} А · Время операции: ${mins} мин ${String(secs).padStart(2,'0')} с`);
  text('result-tickets-blue',Math.ceil(state.tickets[player.team]));
  text('result-tickets-orange',Math.ceil(state.tickets[1-player.team]));
  const allies=[...state.players].filter(p=>p.team===player.team).sort((a,b)=>(b.score||0)-(a.score||0)||b.kills-a.kills);
  const enemies=[...state.players].filter(p=>p.team!==player.team).sort((a,b)=>(b.score||0)-(a.score||0)||b.kills-a.kills);
  const allyTotal=allies.reduce((sum,p)=>sum+(p.score||0),0);
  const enemyTotal=enemies.reduce((sum,p)=>sum+(p.score||0),0);
  text('result-ally-score',`${allyTotal} ОЧК.`);
  text('result-enemy-score',`${enemyTotal} ОЧК.`);
  $('result-rows-ally').replaceChildren(...allies.map(p=>buildScoreRow(p,player.team)));
  $('result-rows-enemy').replaceChildren(...enemies.map(p=>buildScoreRow(p,player.team)));
}
function updateVehicleHud(player){
  const vehicles=state.vehicles??[];
  const vehicle=vehicles.find(v=>v.id===player.vehicleId);
  const key=formatKeyCode(keybinds.interact);
  const nearby=!vehicle&&player.alive&&Math.abs(player.y-(currentMap.terrain?.heightAt(player.x,player.z)??0))<=.8&&getVehicleBoardingSeat(player,vehicles);
  const seat=VEHICLE_TYPES[vehicle?.type]?.seats[player.vehicleSeat];
  show('vehicle-prompt',!!(nearby||seat));
  if(nearby)text('vehicle-prompt',key+' · СЕСТЬ В ТЕХНИКУ — '+VEHICLE_TYPES[nearby.vehicle.type].name.toUpperCase());
  if(!seat)return null;
  const canExit=Math.abs(vehicle.speed)<=4.5;
  const swap=canExit&&vehicle.seats.includes(null);
  const look=aimAngles();
  const canFire=canFirePassengerWeapon(vehicle,player.vehicleSeat,look.yaw,look.pitch);
  const controls=canExit?key+' · ВЫЙТИ'+(swap?'     '+formatKeyCode(keybinds.switchSeat)+' · СМЕНИТЬ МЕСТО':''):'СБАВЬТЕ СКОРОСТЬ ДЛЯ ВЫХОДА';
  const windowHint=seat.role==='passenger'&&!canFire?'\nНАПРАВЬТЕ ОРУЖИЕ В БОКОВОЕ ИЛИ ЛОБОВОЕ ОКНО':'';
  text('vehicle-prompt',controls+(seat.role==='driver'?'     '+formatKeyCode(keybinds.horn)+' · СИГНАЛ / ПОЗВАТЬ БОТОВ':'')+windowHint);
  if(seat.role==='passenger')return {role:seat.role,canFire};
  text('weapon-name',VEHICLE_TYPES[vehicle.type].name.toUpperCase()+' · '+seat.name.toUpperCase());
  const hp=Math.ceil(vehicle.hp/vehicle.maxHp*100);
  text('ammo',seat.role==='gunner'?Math.round(vehicle.heat*100)+'%':Math.round(Math.abs(vehicle.speed)*3.6));
  text('reserve',seat.role==='gunner'?'НАГРЕВ':'КМ/Ч');
  text('ammo-status',vehicle.overheated&&seat.role==='gunner'?'ПЕРЕГРЕВ · КОРПУС '+hp+'%':'КОРПУС '+hp+'% · ЭКИПАЖ '+vehicle.seats.filter(Boolean).length+'/'+vehicle.seats.length);
  return seat;
}
function hud(now){
  squadUI?.update(state,localId);
  drawBotDebug(state);
  const player=local();if(!player)return;
  const weapon=getWeapon(player.classId,player.weaponId);
  const mounted=updateVehicleHud(player);
  const personalWeapon=!mounted||mounted.role==='passenger';
  const heading=(((-yaw*180/Math.PI)%360)+360)%360;const cardinal=['N','NE','E','SE','S','SW','W','NW'][Math.round(heading/45)%8];text('compass-direction',cardinal);text('compass-degrees',`${String(Math.round(heading)).padStart(3,'0')}°`);
  const districts=currentMap.landmarks?currentMap.districts:currentMap.points;
  const nearest=districts.reduce((best,p)=>Math.hypot(player.x-p.x,player.z-p.z)<Math.hypot(player.x-best.x,player.z-best.z)?p:best,districts[0]);
  const captureId=nearest?.id;
  text('location-label',nearest?nearest.name+(captureId?' / СЕКТОР '+captureId:''):'SECTOR 09');
  text('protection-label',player.protected?'◇ ЗАЩИТА ПОСЛЕ ВЫСАДКИ':'');
  const maxT=state.maxTickets||600;
  text('tickets-blue',Math.ceil(state.tickets[player.team]));text('tickets-orange',Math.ceil(state.tickets[1-player.team]));$('blue-bar').style.width=`${(state.tickets[player.team]/maxT)*100}%`;$('orange-bar').style.width=`${(state.tickets[1-player.team]/maxT)*100}%`;
  const seconds=Math.floor(state.time);text('match-time',`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`);
  text('health',Math.ceil(player.hp));$('health-bar').style.width=`${player.hp}%`;
  if(personalWeapon){
    const tool=player.heldGadget;
    text('ammo',tool?(tool==='launcher'?player.rockets:'—'):player.ammo);text('reserve',tool?(tool==='launcher'?'РАКЕТЫ':'СНАРЯЖЕНИЕ'):player.reserve);
    text('weapon-name',tool?GADGET_NAMES[tool]:`${player.weaponSlot||1} · ${weapon.name||weapon.weapon}`);
    const cooldown=tool==='launcher'||tool==='medkit'?player.secondaryCooldown:player.gadgetCooldown;
    text('ammo-status',player.equipTime>0?'СМЕНА СНАРЯЖЕНИЯ…':tool?(cooldown>0?`ГОТОВНОСТЬ ЧЕРЕЗ ${Math.ceil(cooldown)}с`:tool==='repair'?'УДЕРЖИВАЙ ЛКМ · РЕМОНТ':tool==='launcher'&&player.rockets===0?'НЕТ РАКЕТ · НУЖЕН ЯЩИК ПАТРОНОВ':tool==='launcher'?'ПКМ · ПРИЦЕЛ · ЛКМ · ВЫСТРЕЛ':'ЛКМ · ПРИМЕНИТЬ · 1 / 2 · ОРУЖИЕ'):player.reloading?'ПЕРЕЗАРЯДКА…':
      player.ammo===0?'НЕТ ПАТРОНОВ':(weapon.semi||weapon.semiAuto)?'ПОЛУАВТОМАТИЧЕСКИЙ ОГОНЬ':'АВТОМАТИЧЕСКИЙ ОГОНЬ');
  }
  text('kd',`${player.score||0} ОЧК · ${player.kills}/${player.deaths}/${player.assists||0}`);
  let toolHint=player.heldGadget===CLASS_GADGET[player.classId]?' · В РУКАХ':player.gadgetCooldown>0?' · ГОТОВНОСТЬ ЧЕРЕЗ':' · ДОСТАТЬ';
  if(player.alive&&player.classId==='medic'){
    const casualty=state.players.filter(ally=>!ally.alive&&ally.team===player.team&&ally.respawnIn>0&&
      Math.hypot(ally.x-player.x,ally.z-player.z,ally.y-player.y)<3.1).sort((a,b)=>a.respawnIn-b.respawnIn)[0];
    if(casualty)toolHint=` · ${casualty.name} · ${Math.ceil(casualty.respawnIn)}с`;
  }else if(player.gadgetAction==='repair'){
    const vehicle=state.vehicles?.find(item=>item.id===player.gadgetTargetId);
    if(vehicle)toolHint=` · ${Math.round(vehicle.hp/VEHICLE_TYPES[vehicle.type].maxHp*100)}% · УДЕРЖИВАЙ ЛКМ`;
  }
  text('gadget-label',`${formatKeyCode(keybinds.gadget)} · ${gadgetNames[player.classId]}${toolHint}${player.gadgetCooldown>0?' '+Math.ceil(player.gadgetCooldown)+'с':''}`);
  for(const p of state.points){const el=$(`objective-${p.id}`),owner=p.owner===-1?-1:p.owner===player.team?0:1;el.className=`objective owned${owner}${p.contested?' contested':''}`;el.title=`${p.name} · ${Math.round(Math.abs(p.progress)*100)}%`;}
  const secondary=player.classId==='assault'?`ПТ-90 · ${player.rockets??0}`:player.classId==='medic'?'АПТЕЧКА':'';
  show('secondary-gadget-label',Boolean(secondary));
  text('secondary-gadget-label',`${formatKeyCode(keybinds.secondaryGadget)} · ${secondary}${player.secondaryCooldown>0?' · '+Math.ceil(player.secondaryCooldown)+'с':''}`);
  const nearby=state.points.find(p=>Math.hypot(p.x-player.x,p.z-player.z)<CAPTURE_RADIUS);
  const capPct=nearby?Math.round(Math.abs(nearby.progress)*100):0;
  const capSig=nearby&&player.alive?`${nearby.id}:${nearby.contested}:${nearby.owner===player.team}:${capPct}`:'';
  const capEl=$('capture-notice');
  if(capEl.dataset.signature!==capSig){
    capEl.dataset.signature=capSig;capEl.replaceChildren();
    if(nearby&&player.alive){const strong=document.createElement('span'),small=document.createElement('small'),track=document.createElement('div'),fill=document.createElement('i');strong.textContent=`${nearby.id} · ${nearby.contested?'ТОЧКА ОСПАРИВАЕТСЯ':nearby.owner===player.team?'УДЕРЖАНИЕ ПОЗИЦИИ':'ЗАХВАТ ТОЧКИ'}`;small.textContent=`${nearby.name} · ${capPct}%`;track.className='capture-track';fill.style.width=`${capPct}%`;track.append(fill);capEl.append(strong,small,track);}
  }
  flushDamage(now);
  scoreFeed=scoreFeed.filter(e=>e.expires>now).slice(-5);
  if(now>scoreStreakExpires)scoreStreakTotal=0;
  const scoreFeedSig=scoreFeed.length?`${scoreStreakTotal}:`+scoreFeed.map(e=>`${e.id}:${e.points}`).join(','):'';
  const scoreFeedEl=$('score-feed');
  if(scoreFeedEl&&scoreFeedEl.dataset.signature!==scoreFeedSig){
    scoreFeedEl.dataset.signature=scoreFeedSig;
    if(!scoreFeed.length){
      scoreFeedEl.replaceChildren();
    }else{
      const nodes=[];
      if(scoreStreakTotal>0){
        const totalEl=document.createElement('div');
        totalEl.className='score-feed-total';
        totalEl.textContent=`+${scoreStreakTotal}`;
        nodes.push(totalEl);
      }
      for(const item of [...scoreFeed].reverse()){
        const row=document.createElement('div');
        const isObj=item.kind==='capture'||item.kind==='neutralize'||item.kind==='defense'||item.kind==='attack';
        row.className=`score-feed-item${isObj?' score-feed-objective':''}`;
        const label=document.createElement('span'),pts=document.createElement('b');
        label.textContent=item.reason;
        pts.textContent=`+${item.points}`;
        row.append(label,pts);
        nodes.push(row);
      }
      scoreFeedEl.replaceChildren(...nodes);
    }
  }
  feed=feed.filter(e=>e.expires>now).slice(-5);
  const feedSig=feed.map(e=>e.id).join(',');
  const feedEl=$('killfeed');
  if(feedEl.dataset.signature!==feedSig){
    feedEl.dataset.signature=feedSig;
    feedEl.replaceChildren(...feed.map(e=>{const row=document.createElement('div'),a=document.createElement('b'),b=document.createElement('em');row.classList.toggle('enemy-kill',e.team!==player.team);a.textContent=e.killer;b.textContent=e.victim;row.append(a,document.createTextNode(`  [${e.weapon||'ГРАНАТА'}]  `),b);return row;}));
  }
  const crosshair=$('crosshair');
  const spread=mounted?.role==='gunner'?TURRET_WEAPON.spread:player.spread??weapon.spread*.66;
  const projectedSpread=Math.tan(spread)*renderer.viewportHeight/(2*Math.tan(renderer.camera.fov*Math.PI/360));
  const gap=`${Math.max(4,Math.min(28,projectedSpread)).toFixed(1)}px`;
  if(crosshair.dataset.gap!==gap){crosshair.dataset.gap=gap;crosshair.style.setProperty('--spread-gap',gap);}
  const showCrosshair=player.alive&&(mounted?.role==='gunner'||(personalWeapon&&!player.reloading&&(!mounted||mounted.canFire)));
  crosshair.classList.toggle('aim',aim&&personalWeapon);
  crosshair.style.opacity=showCrosshair?'':'0';
  $('hitmarker').style.opacity=now<hitUntil?'1':'0';
  const dmgOpacity=now<damageUntil?'.45':player.hp<30?'.15':'0';
  const dmgEl=$('damage-flash');
  if(dmgEl.dataset.opacity!==dmgOpacity){dmgEl.dataset.opacity=dmgOpacity;dmgEl.style.opacity=dmgOpacity;}
  if(!player.alive)updateDeployScreen(player,now);
  if(!$('scoreboard').classList.contains('hidden')){
    text('scoreboard-tickets',`${Math.ceil(state.tickets[player.team])} : ${Math.ceil(state.tickets[1-player.team])}`);
    const allies=[...state.players].filter(p=>p.team===player.team).sort((a,b)=>(b.score||0)-(a.score||0)||b.kills-a.kills);
    const enemies=[...state.players].filter(p=>p.team!==player.team).sort((a,b)=>(b.score||0)-(a.score||0)||b.kills-a.kills);
    const allyTotal=allies.reduce((sum,p)=>sum+(p.score||0),0);
    const enemyTotal=enemies.reduce((sum,p)=>sum+(p.score||0),0);
    text('score-ally-total',`${allyTotal} ОЧК.`);
    text('score-enemy-total',`${enemyTotal} ОЧК.`);
    const scoreSig=allies.map(p=>`${p.id}:${p.alive?1:0}:${p.kills}:${p.deaths}:${p.assists||0}:${p.score||0}:${p.classId}`).join('|')+'||'+enemies.map(p=>`${p.id}:${p.alive?1:0}:${p.kills}:${p.deaths}:${p.assists||0}:${p.score||0}:${p.classId}`).join('|');
    const scoreEl=$('scoreboard');
    if(scoreEl.dataset.signature!==scoreSig){
      scoreEl.dataset.signature=scoreSig;
      $('score-rows-ally').replaceChildren(...allies.map(p=>buildScoreRow(p,player.team)));
      $('score-rows-enemy').replaceChildren(...enemies.map(p=>buildScoreRow(p,player.team)));
    }
  }
  minimap(player);
}
const reviveMarkers=new Map();
function markCasualties(player){
  const active=new Set(),container=$('revive-markers');
  if(player.alive&&player.classId==='medic'&&!player.vehicleId){
    for(const ally of state.players){
      const distance=Math.hypot(ally.x-player.x,ally.z-player.z,ally.y-player.y);
      if(ally.alive||ally.team!==player.team||ally.respawnIn<=0||distance>30)continue;
      active.add(ally.id);
      let marker=reviveMarkers.get(ally.id);
      if(!marker){
        marker=document.createElement('div');marker.className='revive-marker';
        const cross=document.createElement('b'),name=document.createElement('strong'),detail=document.createElement('span');
        cross.textContent='+';marker.append(cross,name,detail);container.append(marker);reviveMarkers.set(ally.id,marker);
      }
      const position=renderer.project(ally.x,ally.y+.85,ally.z);
      marker.style.display=position.visible?'flex':'none';
      if(!position.visible)continue;
      marker.style.transform=`translate3d(${Math.round(position.x)}px,${Math.round(position.y)}px,0) translate(-50%,-100%)`;
      marker.classList.toggle('reachable',distance<3.1);
      marker.style.setProperty('--revive-time',`${Math.round(ally.respawnIn/4*360)}deg`);
      if(marker.children[1].textContent!==ally.name)marker.children[1].textContent=ally.name;
      const action=distance<3.1?(player.heldGadget==='defibrillator'?'НАВЕДИСЬ · ЛКМ':`${formatKeyCode(keybinds.gadget)} · ДЕФИБРИЛЛЯТОР`):`${Math.ceil(distance)} м`;
      const label=`${action} · ${Math.ceil(ally.respawnIn)}с`;
      if(marker.lastChild.textContent!==label)marker.lastChild.textContent=label;
    }
  }
  for(const [id,marker] of reviveMarkers)if(!active.has(id)){marker.remove();reviveMarkers.delete(id);}
}
function markers(){
  const player=local();if(!player)return;
  squadUI?.markers(renderer,state,localId);
  markCasualties(player);
  for(const point of state.points){
    const ordered=player.orderPointId===point.id&&(player.orderKind==='attack'||player.orderKind==='defend');
    $(`objective-${point.id}`)?.classList.toggle('squad-objective',ordered);
    const marker=$(`marker-${point.id}`),position=renderer.project(point.x,(point.y??currentMap.terrain?.heightAt(point.x,point.z)??0)+5,point.z);
    const display=position.visible?'flex':'none';
    if(marker.style.display!==display)marker.style.display=display;
    if(!position.visible)continue;
    const x=Math.round(position.x*2)/2,y=Math.round(position.y*2)/2,posKey=`${x},${y}`;
    if(marker.dataset.pos!==posKey){marker.dataset.pos=posKey;marker.style.transform=`translate3d(${x}px,${y}px,0) translate(-50%,-50%)`;}
    const style=`world-marker ${point.owner===-1?'':point.owner===player.team?'friendly':'enemy'}${ordered?' squad-objective':''}`;
    if(marker.className!==style)marker.className=style;
    const distance=`${Math.round(Math.hypot(point.x-player.x,point.z-player.z))} м`;
    if(marker.lastChild.textContent!==distance)marker.lastChild.textContent=distance;
  }
}
function frame(now){
  const cpuBegin=performance.now();
  requestAnimationFrame(frame);const elapsed=Math.max(0,(now-lastFrame)/1000),dt=Math.min(elapsed,.08);lastFrame=now;frames++;fpsClock+=elapsed;
  if(active)frameTimes.add(elapsed*1000);
  if(fpsClock>=1){
    const network=mode==='server'?multiplayer.diagnostics():null;
    const networkLabel=network?` · ПИНГ ${network.rttMs??'—'} мс · ОЧЕРЕДЬ ${network.pendingInputs}${network.server?.tickAverageMs!=null?` · ТИК ${network.server.tickAverageMs} мс`:''}`:'';
    text('fps',`${Math.round(frames/fpsClock)} FPS${networkLabel}`);fpsClock=0;frames=0;
    const audioStats=audio.getStats?.();if(audioStats)$('music-toggle').dataset.audio=JSON.stringify(audioStats);
    canvas.dataset.renderStats=JSON.stringify({...renderer.getStats?.(),frameMs:frameTimes.summary(),cpuMs:cpuTimes.summary(),renderMs:renderTimes.summary(),simulationMs:simulationTimes.summary()});
    if(network)canvas.dataset.networkStats=JSON.stringify(network);else delete canvas.dataset.networkStats;
  }
  if(active){
    recoilPitch*=Math.exp(-dt*8);recoilYaw*=Math.exp(-dt*10);
    if(locked||(unlocked&&!unlockedPaused)){
      yaw+=(Number(keys.has('ArrowLeft'))-Number(keys.has('ArrowRight')))*dt*1.7;
      pitch=Math.max(-1.45,Math.min(1.45,pitch+(Number(keys.has('ArrowUp'))-Number(keys.has('ArrowDown')))*dt*1.2));
    }
    lastInput=input();
    const simulationBegin=performance.now();
    if(simulation){
      accumulator+=dt;
      let steps=0;
      while(accumulator>=1/60&&steps<4){
        simulation.setInput(localId,steps?{...lastInput,interact:false,switchSeat:false,horn:false,order:false}:lastInput);
        simulation.step(1/60);accumulator-=1/60;steps++;
      }
      if(accumulator>1/60)accumulator=1/60;
      if(steps){receive(simulation.snapshot());pulses.clear();fireTap=false;}
    }else{multiplayer.advance(lastInput,dt);pulses.clear();fireTap=false;}
    simulationTimes.add(performance.now()-simulationBegin);
  }
  const currentPlayer=local();
  const renderBegin=performance.now();
  const renderState=active?(simulation?state:multiplayer.sample(now)):null;
  const renderPlayer=renderState?.players.find(p=>p.id===localId);
  renderer.render(renderState,localId,dt,{mapId:inLobby?state?.mapId:$('map-select').value,...aimAngles(),networkInterpolated:mode==='server',aim:active&&aim,move:Math.abs(lastInput.forward??0)+Math.abs(lastInput.strafe??0),strafe:lastInput.strafe,sprint:lastInput.sprint,crouch:lastInput.crouch,quality,fov,scopeZoom,brightness,shake:cameraShake,gfx,deployTarget:active&&currentPlayer&&!currentPlayer.alive?getDeployTarget(currentPlayer):null});
  renderTimes.add(performance.now()-renderBegin);
  const scoped=active&&renderer.scoped;
  show('scope-overlay',scoped);
  const scopedWeapon=currentPlayer&&getWeapon(currentPlayer.classId,currentPlayer.weaponId);
  const magnification=currentPlayer?.weaponId==='sv98'?scopeZoom:4;
  const zoomHint=currentPlayer?.weaponId==='sv98'?' · КОЛЕСО — ЗУМ':'';
  text('scope-zoom',scoped&&scopedWeapon?.zeroRange?`${magnification}× · ПРИСТРЕЛКА ${scopedWeapon.zeroRange} М${zoomHint}`:'');
  document.body.classList.toggle('scoped',scoped);
  if(renderState)audio.events(renderState,renderPlayer);
  audio.update?.(dt,{state:renderState??state,local:renderPlayer??local(),moving:Math.min(1,Math.abs(lastInput.forward??0)+Math.abs(lastInput.strafe??0)),sprinting:lastInput.sprint,crouching:lastInput.crouch,aim:active&&aim&&(renderer.weapon.visible||renderer.scoped),locked:locked||(unlocked&&!unlockedPaused),inMenu:!active,paused:!$('pause').classList.contains('hidden')});
  if(active&&state){hudClock+=dt;if(hudClock>.08){hudClock=0;hud(now);}markers();}
  if(active)cpuTimes.add(performance.now()-cpuBegin);
}
try{
  renderer=new GameRenderer(canvas,{antialias:read('gfx-aa','auto')});renderer.resize();window.addEventListener('resize',()=>renderer.resize());
  if(!read('quality','')&&renderer.integratedGpu){quality='low';$('quality').value='low';document.body.classList.toggle('low-quality',true);}
  initializeMapPickers();
  setBattleMap(DEFAULT_MAP_ID,true);
  selectClass(selectedClass,false);updateKeybindUI();audio.setMode?.('menu');status('Сектор готов к высадке.');requestAnimationFrame(frame);
}catch(error){console.error(error);status('Не удалось запустить 3D. Проверь поддержку WebGL 2 и аппаратное ускорение браузера.',true);$('solo').disabled=true;$('host').disabled=true;}
