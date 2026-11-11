import './style.css';
import {GameRenderer} from './renderer.js';
import {Simulation} from '../shared/simulation.js';
import {MAP,CLASSES,CAPTURE_RADIUS} from '../shared/world.js';
import {Multiplayer} from './network.js';
import {CombatAudio} from './audio.js';

const $=id=>document.getElementById(id);
const show=(id,visible=true)=>$(id).classList.toggle('hidden',!visible);
const text=(id,value)=>{const node=$(id),next=String(value);if(node.textContent!==next)node.textContent=next;};
const audio=new CombatAudio();
const canvas=$('game');
let renderer,simulation=null,state=null,localId=null,active=false,busy=false;
let selectedClass='assault',yaw=0,pitch=0,locked=false,aim=false,fire=false;
let fireTap=false, recoilPitch=0, recoilYaw=0;
let mode='solo',room='',lastFrame=performance.now(),accumulator=0,hudClock=0,fpsClock=0,frames=0,unlocked=false,unlockedPaused=false;
let wasAlive=false,lastHp=100,hitUntil=0,damageUntil=0,feed=[],seen=new Set(),toastTimer;
let selectedSpawn='',lastDeathPos=null,hoveredSpawn=null;
let sensitivity=.8,quality='high',lastInput={},finished=false,fov=85,brightness=1,cameraShake=true;
let musicVolume=.45,effectsVolume=.7,musicMuted=false,audioStarted=false;
const difficultyNames={recruit:'НОВОБРАНЦЫ',regular:'ОБЫЧНЫЕ БОЙЦЫ',veteran:'ВЕТЕРАНЫ'};
const keys=new Set(),pulses=new Set();
const gadgetNames={assault:'СТИМУЛЯТОР',medic:'ЛЕЧЕНИЕ',support:'БОЕПРИПАСЫ',recon:'СКАНЕР'};
const weaponTypes={assault:'ШТУРМОВАЯ ВИНТОВКА',medic:'КАРАБИН',support:'ПУЛЕМЁТ',recon:'МАРКСМАНСКАЯ ВИНТОВКА'};
function status(message,error=false){text('status',message);$('status').classList.toggle('error',error);}
function toast(message){text('toast',message);show('toast');clearTimeout(toastTimer);toastTimer=setTimeout(()=>show('toast',false),4500);}
function save(key,value){try{localStorage.setItem(`sector09-${key}`,value);}catch{}}
function read(key,fallback){try{return localStorage.getItem(`sector09-${key}`)??fallback;}catch{return fallback;}}
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
function setBusy(value){busy=value;for(const id of ['solo','host','join-toggle'])$(id).disabled=value;}
function clearControls(){keys.clear();pulses.clear();fire=false;fireTap=false;aim=false;recoilPitch=0;recoilYaw=0;if(active&&localId){const neutral={yaw,pitch};simulation?.setInput(localId,neutral);multiplayer.clearInput(neutral);}}
function aimAngles(){
  return { yaw:yaw+recoilYaw, pitch:Math.max(-1.45,Math.min(1.45,pitch+recoilPitch)) };
}
function selectClass(classId,playClick=false){
  if(!CLASSES[classId])return;
  selectedClass=classId;
  for(const b of document.querySelectorAll('[data-class]')){const chosen=b.dataset.class===classId;b.classList.toggle('active',chosen);b.setAttribute('aria-pressed',String(chosen));}
  for(const b of document.querySelectorAll('[data-deploy-class]')){const chosen=b.dataset.deployClass===classId;b.classList.toggle('active',chosen);b.setAttribute('aria-pressed',String(chosen));}
  const c=CLASSES[classId];
  text('class-weapon',`${c.weapon} · ${weaponTypes[classId]}`);
  text('deploy-weapon-name',c.weapon);
  text('deploy-weapon-type',weaponTypes[classId]);
  text('deploy-ammo-tag',`${c.mag} / ${c.reserve} ПАТР.`);
  text('deploy-gadget-tag',`Q · ${gadgetNames[classId]}`);
  $('stat-dmg').style.width=`${Math.min(100,Math.round(c.damage/65*100))}%`;
  $('stat-rof').style.width=`${Math.min(100,Math.round((1/c.interval)/13*100))}%`;
  $('stat-rng').style.width=`${Math.min(100,Math.round(c.range/240*100))}%`;
  if(playClick)audio.click();
}
function spawnPointAvailable(player,pointId){
  if(!pointId)return true;
  const p=state?.points?.find(q=>q.id===pointId);
  return !!(p&&p.owner===player?.team&&!p.contested);
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
  const point=MAP.points.find(p=>p.id===selectedSpawn);
  text('deploy-selected-label',point?`ТОЧКА: ${point.id} · ${point.name}`:'ТОЧКА: БАЗА КОМАНДЫ');
  if(playClick)audio.click();
  return true;
}
function getDeployTarget(player){
  if(!player)return null;
  if(selectedSpawn){
    const pt=MAP.points.find(p=>p.id===selectedSpawn);
    if(pt)return {x:pt.x,z:pt.z};
  }
  const base=MAP.spawns[player.team]??MAP.spawns[0];
  return {x:base.x,z:base.z};
}
function receive(next){
  if(state&&next.time<state.time-1){seen.clear();audio.seen.clear();renderer.seenEvents.clear();renderer.lastShot=-1;feed=[];finished=false;wasAlive=false;lastDeathPos=null;show('result',false);show('death',false);toast('Новая операция началась');}
  state=next;const player=local();
  if(!active||!player)return;
  if(player.alive&&!wasAlive){yaw=player.yaw;pitch=player.pitch;recoilPitch=0;recoilYaw=0;lastHp=player.hp;show('death',false);if(active&&!locked&&!unlocked)show('pause');}
  if(!player.alive&&wasAlive){
    lastDeathPos={x:player.x,z:player.z};
    if(!spawnPointAvailable(player,selectedSpawn)){
      const owned=state.points.filter(p=>p.owner===player.team&&!p.contested).sort((a,b)=>Math.hypot(a.x-player.x,a.z-player.z)-Math.hypot(b.x-player.x,b.z-player.z));
      selectSpawnPoint(owned[0]?.id||'');
    }else selectSpawnPoint(selectedSpawn);
    clearControls();document.exitPointerLock?.();show('pause',false);show('death');
    updateDeployScreen(player,performance.now());
  }
  if(player.hp<lastHp){damageUntil=performance.now()+350;}
  lastHp=player.hp;wasAlive=player.alive;
  for(const event of state.events??[]){
    if(seen.has(event.id))continue;seen.add(event.id);
    if(event.type==='shot'&&event.playerId===localId){
      const weapon=CLASSES[event.classId]??CLASSES[player.classId];
      const impulse=weapon.recoil*(aim?.76:1)*(lastInput.crouch?.87:1);
      if(player.alive){
        recoilPitch=Math.min(.12,recoilPitch+impulse);
        recoilYaw=Math.max(-.035,Math.min(.035,recoilYaw+Math.sin((event.shotSeq??event.id)*2.1)*impulse*.31));
      }
      if(event.hit){
        hitUntil=performance.now()+(event.headshot?190:130);
        $('hitmarker').classList.toggle('headshot',!!event.headshot);
      }
    }
    if(event.type==='kill'){
      feed.push({...event,expires:performance.now()+6500});
      if(event.killerId===localId){hitUntil=performance.now()+300;toast(`Цель устранена · ${event.victim}`);}
      if(event.victimId===localId){
        text('death-killer',`ВЫВЕДЕН ИЗ СТРОЯ · ПРОТИВНИК: ${event.killer} [${event.weapon||'ГРАНАТА'}]`);
      }
    }
    if(event.type==='capture'&&state.points.some(p=>p.id===event.pointId))toast(`Точка ${event.pointId} ${event.team===player.team?'захвачена вашим отрядом':'под контролем противника'}`);
    if(event.type==='gadget'&&event.playerId===localId)toast(`${gadgetNames[player.classId]} · Активировано`);
  }
  while(seen.size>900)seen.delete(seen.keys().next().value);
  audio.events(state,player);
  if(state.winner!==null&&state.winner!==undefined&&!finished){finished=true;clearControls();document.exitPointerLock?.();show('pause',false);show('death',false);text('result-title',state.winner===player.team?'Сектор удержан':'Сектор потерян');text('result-stats',`${player.kills} устранений · ${player.deaths} потерь · ${Math.floor(state.time/60)} мин боя`);show('result');}
}
const multiplayer=new Multiplayer({onState:receive,onIdentity:id=>{localId=id;},onStatus:message=>{status(message);if(active&&message)toast(message);},onError:message=>{leave(false);status(message,true);toast(message);}});

function prepare(which){
  clearControls();simulation=null;state=null;localId=null;mode=which;room='';seen.clear();audio.seen.clear();renderer.seenEvents.clear();renderer.lastShot=-1;feed=[];finished=false;wasAlive=false;accumulator=0;unlocked=false;unlockedPaused=false;
  const name=$('callsign').value.trim()||'Rookie';save('name',name);unlockAudio();audio.click();return {name,classId:selectedClass,bots:Number($('population').value),difficulty:$('difficulty').value};
}
function enter(){
  active=true;setBusy(false);show('menu',false);show('hud');show('pause',false);show('death',false);show('result',false);document.body.style.overflow='hidden';
  document.body.classList.add('in-battle');audio.setMode?.('battle');
  text('pause-title','Бой продолжается');text('pause-description','Вернись в сектор. Твой отряд ждёт.');$('resume').firstChild.textContent='ПРОДОЛЖИТЬ ';show('unlocked');show('leave');
  if(state)receive(state);
  text('room-badge',mode==='solo'?`БОЙ С БОТАМИ · ${state.players.filter(p=>p.bot).length} · ${difficultyNames[state.difficulty]??difficultyNames[$('difficulty').value]}`:mode==='host'?`КОМНАТА ${room} · ТЫ ХОСТ`:mode==='peer'?`КОМНАТА ${room}`:'ВЫДЕЛЕННЫЙ СЕРВЕР');
  requestControl();
}
async function requestControl(){
  if(!active||!local()?.alive||finished)return;
  if(unlocked){unlockedPaused=false;show('pause',false);return;}
  try{await canvas.requestPointerLock();}catch{show('pause');toast('Нажми «Продолжить», чтобы включить управление мышью.');}
}
function leave(resetStatus=true){
  active=false;clearControls();simulation=null;multiplayer.close();document.exitPointerLock?.();state=null;localId=null;wasAlive=false;finished=false;setBusy(false);show('menu');for(const id of ['hud','pause','death','result'])show(id,false);document.body.style.overflow='';
  document.body.classList.remove('in-battle');audio.setMode?.('menu');
  show('scoreboard',false);if(resetStatus)status('Сектор готов. Выбери класс и вступай в бой.');
}
function solo(){if(busy)return;multiplayer.close();const opts=prepare('solo');simulation=new Simulation({bots:opts.bots,difficulty:opts.difficulty});localId='local';simulation.addPlayer(localId,opts.name,0,opts.classId);state=simulation.snapshot();enter();}
$('solo').addEventListener('click',solo);
$('host').addEventListener('click',async()=>{if(busy)return;const opts=prepare('host');setBusy(true);try{room=await multiplayer.host(opts);enter();toast(`Код комнаты: ${room}. Передай другу. Оставь эту вкладку открытой.`);}catch(error){status(error.message,true);setBusy(false);}});
$('join-toggle').addEventListener('click',()=>{show('join-form',$('join-form').classList.contains('hidden'));$('room-code').focus();});
$('join-form').addEventListener('submit',async event=>{event.preventDefault();if(busy)return;const code=$('room-code').value.trim();if(!code)return;const opts=prepare('peer');setBusy(true);try{room=code.toUpperCase();await multiplayer.join({code,...opts});enter();}catch(error){status(error.message,true);setBusy(false);}});
$('server-form').addEventListener('submit',async event=>{event.preventDefault();if(busy)return;const url=$('server-url').value.trim();if(!url)return;const opts=prepare('server');setBusy(true);try{await multiplayer.connect({url,...opts});enter();}catch(error){status(error.message,true);setBusy(false);}});
for(const button of document.querySelectorAll('[data-class]'))button.addEventListener('click',()=>selectClass(button.dataset.class,true));
for(const button of document.querySelectorAll('[data-deploy-class]'))button.addEventListener('click',()=>selectClass(button.dataset.deployClass,true));
$('spawn-point').addEventListener('change',event=>selectSpawnPoint(event.target.value,true));
$('resume').addEventListener('click',()=>{if(!active){show('pause',false);return;}audio.unlock();requestControl();});
$('menu-settings').addEventListener('click',()=>{text('pause-title','Настройки');text('pause-description','Подготовь обзор и звук перед высадкой.');$('resume').firstChild.textContent='ГОТОВО ';show('unlocked',false);show('leave',false);show('pause');});
$('unlocked').addEventListener('click',()=>{unlocked=true;unlockedPaused=false;show('pause',false);audio.unlock();toast('WASD — движение. Зажми ПКМ и двигай мышью для обзора; стрелки тоже поворачивают камеру.');});
for(const id of ['leave','death-leave','result-leave'])$(id).addEventListener('click',()=>leave());
$('play-again').addEventListener('click',()=>{if(mode==='solo')solo();else{leave();toast('Создай новую комнату для следующей операции.');}});
function triggerRespawn(){
  const p=local();if(!p||p.alive||p.respawnIn>0)return;
  const targetPoint=spawnPointAvailable(p,selectedSpawn)?selectedSpawn:'';
  selectSpawnPoint(targetPoint);
  if(simulation){simulation.respawn(localId,selectedClass,targetPoint);receive(simulation.snapshot());}
  else multiplayer.respawn(selectedClass,targetPoint);
  requestControl();if(!simulation)toast('Ожидаем подтверждения высадки…');
}
$('respawn').addEventListener('click',triggerRespawn);
$('sensitivity').value=read('sensitivity','0.8');sensitivity=Number($('sensitivity').value);
$('sensitivity').addEventListener('input',event=>{sensitivity=Number(event.target.value);save('sensitivity',sensitivity);});
$('quality').value=read('quality','high');quality=$('quality').value;
$('quality').addEventListener('change',event=>{quality=event.target.value;save('quality',quality);});
$('volume').value=read('volume','0.5');audio.volume=Number($('volume').value);
$('volume').addEventListener('input',event=>{audio.volume=Number(event.target.value);save('volume',audio.volume);});
for(const [id,fallback,min,max,assign] of [['fov',85,70,100,value=>fov=value],['brightness',1,.8,1.3,value=>brightness=value],['music-volume',.45,0,1,value=>{musicVolume=value;setMusic();}],['effects-volume',.7,0,1,value=>{effectsVolume=value;audio.setEffectsVolume?.(value);}]]){
  const stored=Number(read(id,String(fallback)));$(id).value=String(Number.isFinite(stored)?Math.max(min,Math.min(max,stored)):fallback);assign(Number($(id).value));$(id).addEventListener('input',event=>{const value=Number(event.target.value);assign(value);save(id,value);});
}
$('camera-shake').checked=read('camera-shake','true')!=='false';cameraShake=$('camera-shake').checked;
$('camera-shake').addEventListener('change',event=>{cameraShake=event.target.checked;save('camera-shake',cameraShake);});
$('sound-toggle').addEventListener('click',()=>{audio.enabled=!audio.enabled;text('sound-toggle',audio.enabled?'ЗВУК ВКЛ.':'ЗВУК ВЫКЛ.');$('sound-toggle').setAttribute('aria-pressed',String(audio.enabled));unlockAudio();musicUI();});
$('music-toggle').addEventListener('click',()=>{if(audioStarted)musicMuted=!musicMuted;else musicMuted=false;save('music-muted',musicMuted);unlockAudio();setMusic();});
canvas.addEventListener('click',()=>{if(active&&!locked)requestControl();});
document.addEventListener('pointerlockchange',()=>{locked=document.pointerLockElement===canvas;if(locked){show('pause',false);audio.unlock();}else{clearControls();if(active&&local()?.alive&&!finished)show('pause');}});
document.addEventListener('pointerlockerror',()=>{if(active){show('pause');toast('Браузер не разрешил захват мыши. Нажми «Продолжить» ещё раз.');}});
document.addEventListener('mousemove',event=>{
  if(!locked&&!(unlocked&&!unlockedPaused&&active&&aim))return;
  const aimScale = aim ? (local()?.classId === 'recon' ? .35 : .65) : 1;
  const factor=.0022*sensitivity*aimScale;
  yaw-=event.movementX*factor;pitch=Math.max(-1.45,Math.min(1.45,pitch-event.movementY*factor));
});
document.addEventListener('mousedown',event=>{if(!locked&&!(unlocked&&!unlockedPaused&&active&&event.target===canvas))return;if(event.button===0){fireTap=!fire;fire=true;}if(event.button===2)aim=true;});
document.addEventListener('mouseup',event=>{if(event.button===0)fire=false;if(event.button===2)aim=false;});
document.addEventListener('contextmenu',event=>{if(active)event.preventDefault();});
document.addEventListener('keydown',event=>{
  if(!active){if(event.code==='Escape')show('pause',false);return;}
  if(!local()?.alive&&!finished&&!$('death').classList.contains('hidden')){
    const classKeys={Digit1:'assault',Digit2:'medic',Digit3:'support',Digit4:'recon'};
    if(classKeys[event.code]){event.preventDefault();selectClass(classKeys[event.code],true);return;}
    if((event.code==='Space'||event.code==='Enter')&&!event.repeat){event.preventDefault();triggerRespawn();return;}
  }
  if(event.code==='Escape'&&unlocked){unlockedPaused=!unlockedPaused;show('pause',unlockedPaused);clearControls();return;}
  if(event.code==='Tab'){event.preventDefault();show('scoreboard');return;}
  if(!locked&&!(unlocked&&!unlockedPaused))return;
  if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.code))event.preventDefault();
  keys.add(event.code);if(!event.repeat&&['KeyR','KeyQ','KeyG'].includes(event.code))pulses.add(event.code);
});
document.addEventListener('keyup',event=>{keys.delete(event.code);if(event.code==='Tab'){event.preventDefault();show('scoreboard',false);}});
window.addEventListener('blur',clearControls);
document.addEventListener('visibilitychange',()=>{clearControls();lastFrame=performance.now();accumulator=0;fpsClock=0;frames=0;if(document.hidden)audio.ctx?.suspend?.();else if(audioStarted)unlockAudio();});
function input(){const enabled=!!((locked||(unlocked&&!unlockedPaused))&&local()?.alive&&!finished), firing=enabled&&(fire||fireTap);return {forward:enabled?Number(keys.has('KeyW'))-Number(keys.has('KeyS')):0,strafe:enabled?Number(keys.has('KeyD'))-Number(keys.has('KeyA')):0,...aimAngles(),sprint:enabled&&(keys.has('ShiftLeft')||keys.has('ShiftRight'))&&!aim&&!firing,crouch:enabled&&(keys.has('KeyC')||keys.has('ControlLeft')),jump:enabled&&keys.has('Space'),fire:firing,aim:enabled&&aim,reload:enabled&&pulses.has('KeyR'),gadget:enabled&&pulses.has('KeyQ'),grenade:enabled&&pulses.has('KeyG')};}

const minimapCanvas=$('minimap');
const mapctx=minimapCanvas.getContext('2d');
const mapBackground=document.createElement('canvas');
const mapSize=minimapCanvas.width,mapScale=mapSize/MAP.size,mapHalf=MAP.size/2;
mapBackground.width=mapBackground.height=mapSize;
{
  const c=mapBackground.getContext('2d'),s=mapSize,scale=mapScale,half=mapHalf,step=s/10;
  c.fillStyle='#15262c';c.fillRect(0,0,s,s);c.strokeStyle='#5d7b802b';c.lineWidth=1;
  for(let n=0;n<10;n++){c.beginPath();c.moveTo(n*step,0);c.lineTo(n*step,s);c.moveTo(0,n*step);c.lineTo(s,n*step);c.stroke();}
  c.fillStyle='#73817c77';for(const b of MAP.boxes)c.fillRect((b.x-b.w/2+half)*scale,(b.z-b.d/2+half)*scale,b.w*scale,b.d*scale);
}
function minimap(player){
  const c=mapctx,scale=mapScale,half=mapHalf;
  c.drawImage(mapBackground,0,0);
  c.font='bold 10px sans-serif';c.textAlign='center';
  for(const p of state.points){const x=(p.x+half)*scale,z=(p.z+half)*scale;c.fillStyle=p.owner===-1?'#ced1bb':p.owner===player.team?'#79c5d2':'#e6b273';c.strokeStyle=c.fillStyle;c.globalAlpha=.15;c.beginPath();c.arc(x,z,CAPTURE_RADIUS*scale,0,Math.PI*2);c.fill();c.globalAlpha=1;c.fillText(p.id,x,z+3.5);}
  for(const p of state.players){if(!p.alive||p.id===localId)continue;const friend=p.team===player.team;if(!friend&&!p.spotted&&Math.hypot(p.x-player.x,p.z-player.z)>28)continue;c.fillStyle=friend?'#79c5d2':'#e6b273';c.beginPath();c.arc((p.x+half)*scale,(p.z+half)*scale,friend?1.8:2.3,0,Math.PI*2);c.fill();}
  c.save();c.translate((player.x+half)*scale,(player.z+half)*scale);c.rotate(-yaw);c.fillStyle='#f0f4e9';c.beginPath();c.moveTo(0,-4.5);c.lineTo(3,3.5);c.lineTo(0,1.8);c.lineTo(-3,3.5);c.closePath();c.fill();c.restore();
}
const deployCanvas=$('deploy-map');
const deployCtx=deployCanvas.getContext('2d');
const deployMapBg=document.createElement('canvas');
const deploySize=deployCanvas.width,deployScale=deploySize/MAP.size,deployHalf=MAP.size/2;
deployMapBg.width=deployMapBg.height=deploySize;
{
  const c=deployMapBg.getContext('2d'),s=deploySize,scale=deployScale,half=deployHalf;
  c.fillStyle='#0c1a20';c.fillRect(0,0,s,s);
  c.fillStyle='#122c36';c.fillRect(0,0,18*scale,s);
  c.fillStyle='#16272e';
  const crossStreets=MAP.size>250?[-110,-40,0,40,110]:[0];
  c.fillRect((half-12)*scale,0,24*scale,s);
  for(const z of crossStreets)c.fillRect(0,(z+half-7.5)*scale,s,15*scale);
  const cols=['A','B','C','D','E','F'],cell=s/6;
  c.strokeStyle='#79c5d21c';c.lineWidth=1;c.font='600 10px sans-serif';c.fillStyle='#6f8e9588';
  for(let i=0;i<6;i++){
    const pos=i*cell;
    c.beginPath();c.moveTo(pos,0);c.lineTo(pos,s);c.moveTo(0,pos);c.lineTo(s,pos);c.stroke();
    c.fillText(cols[i],pos+6,13);
    c.fillText(String(i+1),5,pos+24);
  }
  for(const b of MAP.boxes){
    const x=(b.x-b.w/2+half)*scale,z=(b.z-b.d/2+half)*scale,w=b.w*scale,d=b.d*scale;
    c.fillStyle=b.kind==='wall'||b.kind==='barrier'?'#879693aa':String(b.kind).includes('container')?'#597578aa':'#41565baa';
    c.fillRect(x,z,w,d);
    if(b.h>4){c.strokeStyle='#a5babd44';c.lineWidth=1;c.strokeRect(x+.5,z+.5,Math.max(1,w-1),Math.max(1,d-1));}
  }
  for(const st of MAP.structures||[]){
    const x=(st.x-st.w/2+half)*scale,z=(st.z-st.d/2+half)*scale,w=st.w*scale,d=st.d*scale;
    c.fillStyle='#5c747838';c.fillRect(x,z,w,d);
    c.strokeStyle='#9ab5b866';c.setLineDash([4,3]);c.strokeRect(x,z,w,d);c.setLineDash([]);
  }
}
function pickDeploySpawnAt(clientX,clientY){
  const player=local();if(!player||!state)return null;
  const rect=deployCanvas.getBoundingClientRect();
  const mx=(clientX-rect.left)*(deploySize/rect.width);
  const my=(clientY-rect.top)*(deploySize/rect.height);
  const base=MAP.spawns[player.team]??MAP.spawns[0];
  const bx=(base.x+deployHalf)*deployScale,bz=(base.z+deployHalf)*deployScale;
  if(Math.hypot(mx-bx,my-bz)<=24)return {id:'',available:true};
  for(const p of state.points){
    const px=(p.x+deployHalf)*deployScale,pz=(p.z+deployHalf)*deployScale;
    if(Math.hypot(mx-px,my-pz)<=24){
      return {id:p.id,available:p.owner===player.team&&!p.contested};
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
function drawDeployMap(player,now){
  const c=deployCtx,scale=deployScale,half=deployHalf,pulse=(Math.sin(now*0.006)+1)*0.5;
  c.drawImage(deployMapBg,0,0);
  for(const team of [0,1]){
    const base=MAP.spawns[team],friend=team===player.team;
    const x=(base.x+half)*scale,z=(base.z+half)*scale;
    c.save();
    c.fillStyle=friend?'#133942cc':'#3d2916cc';
    c.strokeStyle=friend?'#79c5d2':'#e6b273';
    c.lineWidth=1.6;
    c.fillRect(x-13,z-10,26,20);
    c.strokeRect(x-13,z-10,26,20);
    c.fillStyle=friend?'#79c5d2':'#e6b273';
    c.font='700 9px sans-serif';c.textAlign='center';c.textBaseline='middle';
    c.fillText(friend?'ШТАБ':'ВРАГ',x,z);
    c.restore();
    if(friend&&(selectedSpawn===''||hoveredSpawn==='')){
      c.save();
      c.strokeStyle='#79c5d2';c.lineWidth=selectedSpawn===''?2:1;
      const r=18+pulse*3;
      c.strokeRect(x-r,z-r*.78,r*2,r*1.56);
      c.restore();
    }
  }
  for(const p of state.points){
    const x=(p.x+half)*scale,z=(p.z+half)*scale;
    const friend=p.owner===player.team,enemy=p.owner!==-1&&!friend;
    const color=friend?'#79c5d2':enemy?'#e6b273':'#ced1bb';
    c.save();
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
    c.fillStyle=friend?'#133a44e6':enemy?'#422c17e6':'#253033e6';
    c.strokeStyle=color;c.lineWidth=1.8;
    c.fillRect(-9,-9,18,18);c.strokeRect(-9,-9,18,18);
    c.rotate(-Math.PI/4);
    c.fillStyle='#f3f6ee';c.font='700 11px sans-serif';c.textAlign='center';c.textBaseline='middle';
    c.fillText(p.id,0,0.5);
    c.fillStyle=color;c.font='600 8px sans-serif';
    c.fillText(p.name,0,19);
    c.restore();
    if(selectedSpawn===p.id||hoveredSpawn===p.id){
      c.save();
      c.strokeStyle=friend&&!p.contested?'#79c5d2':'#e6b273';
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
    c.save();
    c.translate(x,z);
    if(friend){
      c.fillStyle='#79c5d233';c.beginPath();c.arc(0,0,7,0,Math.PI*2);c.fill();
      c.rotate(-(p.yaw||0));
      c.fillStyle='#79c5d2';c.strokeStyle='#08181f';c.lineWidth=1.2;
      c.beginPath();c.moveTo(0,-6.2);c.lineTo(4.4,4.8);c.lineTo(0,2.2);c.lineTo(-4.4,4.8);c.closePath();
      c.fill();c.stroke();
    }else{
      c.rotate(Math.PI/4);
      c.fillStyle='#e6b273';c.strokeStyle='#181008';c.lineWidth=1;
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
  text('death-countdown',ready?'ГОТОВ К ВЫСАДКЕ · ВЫБЕРИ СЕКТОР И НАЖМИ ДИСЛОКАЦИЯ':`ПОДГОТОВКА ВЫСАДКИ · ${Math.ceil(player.respawnIn)} С`);
  $('respawn').disabled=!ready;
  $('deploy-status-dot').classList.toggle('ready',ready);
  if(selectedSpawn&&!spawnPointAvailable(player,selectedSpawn))selectSpawnPoint('');
  const options=state.points.filter(p=>p.owner===player.team&&!p.contested);
  const signature=options.map(p=>p.id).join('');
  const selectEl=$('spawn-point');
  if(selectEl.dataset.signature!==signature){
    selectEl.dataset.signature=signature;
    selectEl.replaceChildren(new Option('База команды',''),...options.map(p=>new Option(`${p.id} · ${p.name}`,p.id)));
    selectEl.value=selectedSpawn;
  }
  const allies=state.players.filter(p=>p.alive&&p.team===player.team&&p.id!==localId);
  text('deploy-allies-count',`СОЮЗНИКОВ В БОЮ: ${allies.length}`);
  const listSig=`${selectedSpawn}:`+state.points.map(p=>{
    const near=allies.filter(a=>Math.hypot(a.x-p.x,a.z-p.z)<32).length;
    return `${p.id}:${p.owner}:${p.contested?1:0}:${near}`;
  }).join('|');
  const listEl=$('deploy-spawn-list');
  if(listEl.dataset.signature!==listSig){
    listEl.dataset.signature=listSig;
    const items=[
      {id:'',badge:'HQ',name:'ШТАБ КОМАНДЫ',sub:'Основная база',tag:'ДОСТУПНО',available:true,hq:true},
      ...state.points.map(p=>{
        const friend=p.owner===player.team,enemy=p.owner!==-1&&!friend;
        const available=friend&&!p.contested;
        const near=allies.filter(a=>Math.hypot(a.x-p.x,a.z-p.z)<32).length;
        const tag=p.contested?'ОСПАРИВАЕТСЯ':available?'ДОСТУПНО':enemy?'ВРАГ':'НЕЙТРАЛЬНО';
        return {id:p.id,badge:p.id,name:p.name,sub:`Союзников рядом: ${near}`,tag,available,enemy,contested:p.contested};
      }),
    ];
    listEl.replaceChildren(...items.map(item=>{
      const btn=document.createElement('button');
      btn.type='button';
      btn.className=`spawn-item${item.hq?' hq':''}${selectedSpawn===item.id?' selected':''}${!item.available?' locked':''}${item.enemy?' enemy-owned':''}${item.contested?' contested':''}`;
      const left=document.createElement('div'),badge=document.createElement('span'),badgeInner=document.createElement('i'),info=document.createElement('div'),title=document.createElement('b'),sub=document.createElement('small'),tag=document.createElement('span');
      left.className='spawn-item-left';badge.className='spawn-badge';badgeInner.textContent=item.badge;badge.append(badgeInner);
      info.className='spawn-info';title.textContent=item.name;sub.textContent=item.sub;info.append(title,sub);
      left.append(badge,info);tag.className='spawn-tag';tag.textContent=item.tag;
      btn.append(left,tag);
      btn.addEventListener('click',()=>selectSpawnPoint(item.id,true));
      btn.addEventListener('dblclick',()=>{if(item.available&&selectSpawnPoint(item.id,false))triggerRespawn();});
      return btn;
    }));
  }
  drawDeployMap(player,now);
}
function hud(now){
  const player=local();if(!player)return;
  const heading=(((-yaw*180/Math.PI)%360)+360)%360;const cardinal=['N','NE','E','SE','S','SW','W','NW'][Math.round(heading/45)%8];text('compass-direction',cardinal);text('compass-degrees',`${String(Math.round(heading)).padStart(3,'0')}°`);
  const nearest=MAP.points.reduce((best,p)=>Math.hypot(player.x-p.x,player.z-p.z)<Math.hypot(player.x-best.x,player.z-best.z)?p:best,MAP.points[0]);text('location-label',nearest?`${nearest.name} / СЕКТОР ${nearest.id}`:'SECTOR 09');text('protection-label',player.protected?'◇ ЗАЩИТА ПОСЛЕ ВЫСАДКИ':'');
  text('tickets-blue',Math.ceil(state.tickets[player.team]));text('tickets-orange',Math.ceil(state.tickets[1-player.team]));$('blue-bar').style.width=`${state.tickets[player.team]/3}%`;$('orange-bar').style.width=`${state.tickets[1-player.team]/3}%`;
  const seconds=Math.floor(state.time);text('match-time',`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`);
  text('health',Math.ceil(player.hp));$('health-bar').style.width=`${player.hp}%`;text('ammo',player.ammo);text('reserve',player.reserve);text('weapon-name',CLASSES[player.classId].weapon);text('ammo-status',player.reloading?'ПЕРЕЗАРЯДКА…':player.ammo===0?'НЕТ ПАТРОНОВ':player.classId==='recon'?'ПОЛУАВТОМАТИЧЕСКИЙ ОГОНЬ':'АВТОМАТИЧЕСКИЙ ОГОНЬ');
  text('kd',`${player.kills} У / ${player.deaths} П`);text('gadget-label',`Q · ${gadgetNames[player.classId]}${player.gadgetCooldown>0?' '+Math.ceil(player.gadgetCooldown)+'с':''}`);
  for(const p of state.points){const el=$(`objective-${p.id}`),owner=p.owner===-1?-1:p.owner===player.team?0:1;el.className=`objective owned${owner}${p.contested?' contested':''}`;el.title=`${p.name} · ${Math.round(Math.abs(p.progress)*100)}%`;}
  const nearby=state.points.find(p=>Math.hypot(p.x-player.x,p.z-player.z)<CAPTURE_RADIUS);
  const capPct=nearby?Math.round(Math.abs(nearby.progress)*100):0;
  const capSig=nearby&&player.alive?`${nearby.id}:${nearby.contested}:${nearby.owner===player.team}:${capPct}`:'';
  const capEl=$('capture-notice');
  if(capEl.dataset.signature!==capSig){
    capEl.dataset.signature=capSig;capEl.replaceChildren();
    if(nearby&&player.alive){const strong=document.createElement('span'),small=document.createElement('small'),track=document.createElement('div'),fill=document.createElement('i');strong.textContent=`${nearby.id} · ${nearby.contested?'ТОЧКА ОСПАРИВАЕТСЯ':nearby.owner===player.team?'УДЕРЖАНИЕ ПОЗИЦИИ':'ЗАХВАТ ТОЧКИ'}`;small.textContent=`${nearby.name} · ${capPct}%`;track.className='capture-track';fill.style.width=`${capPct}%`;track.append(fill);capEl.append(strong,small,track);}
  }
  feed=feed.filter(e=>e.expires>now).slice(-5);
  const feedSig=feed.map(e=>e.id).join(',');
  const feedEl=$('killfeed');
  if(feedEl.dataset.signature!==feedSig){
    feedEl.dataset.signature=feedSig;
    feedEl.replaceChildren(...feed.map(e=>{const row=document.createElement('div'),a=document.createElement('b'),b=document.createElement('em');row.classList.toggle('enemy-kill',e.team!==player.team);a.textContent=e.killer;b.textContent=e.victim;row.append(a,document.createTextNode(`  [${e.weapon||'ГРАНАТА'}]  `),b);return row;}));
  }
  const crosshair=$('crosshair');
  const spread=player.spread??CLASSES[player.classId].spread*.66;
  const projectedSpread=Math.tan(spread)*renderer.viewportHeight/(2*Math.tan(renderer.camera.fov*Math.PI/360));
  const gap=`${Math.max(4,Math.min(28,projectedSpread)).toFixed(1)}px`;
  if(crosshair.dataset.gap!==gap){crosshair.dataset.gap=gap;crosshair.style.setProperty('--spread-gap',gap);}
  crosshair.classList.toggle('aim',aim);crosshair.style.opacity=player.reloading||!player.alive?'0':'';
  $('hitmarker').style.opacity=now<hitUntil?'1':'0';
  const dmgOpacity=now<damageUntil?'.45':player.hp<30?'.15':'0';
  const dmgEl=$('damage-flash');
  if(dmgEl.dataset.opacity!==dmgOpacity){dmgEl.dataset.opacity=dmgOpacity;dmgEl.style.opacity=dmgOpacity;}
  if(!player.alive)updateDeployScreen(player,now);
  if(!$('scoreboard').classList.contains('hidden')){
    const sorted=[...state.players].sort((a,b)=>Number(a.team!==player.team)-Number(b.team!==player.team)||b.kills-a.kills);
    const scoreSig=sorted.map(p=>`${p.id}:${p.alive?1:0}:${p.kills}:${p.deaths}:${p.classId}`).join('|');
    const scoreEl=$('score-rows');
    if(scoreEl.dataset.signature!==scoreSig){
      scoreEl.dataset.signature=scoreSig;
      scoreEl.replaceChildren(...sorted.map(p=>{const row=document.createElement('div');row.className=`score-row team${p.team===player.team?0:1}${p.id===localId?' local':''}`;for(const value of [`${p.alive?'●':'×'} ${p.name}${p.bot?' [AI]':''}`,CLASSES[p.classId].name,`${p.kills} / ${p.deaths}`]){const span=document.createElement('span');span.textContent=value;row.append(span);}return row;}));
    }
  }
  minimap(player);
}
function markers(){
  const player=local();if(!player)return;
  for(const point of state.points){
    const marker=$(`marker-${point.id}`),position=renderer.project(point.x,5,point.z);
    const display=position.visible?'flex':'none';
    if(marker.style.display!==display)marker.style.display=display;
    if(!position.visible)continue;
    const x=Math.round(position.x*2)/2,y=Math.round(position.y*2)/2,posKey=`${x},${y}`;
    if(marker.dataset.pos!==posKey){marker.dataset.pos=posKey;marker.style.transform=`translate3d(${x}px,${y}px,0) translate(-50%,-50%)`;}
    const style=`world-marker ${point.owner===-1?'':point.owner===player.team?'friendly':'enemy'}`;
    if(marker.className!==style)marker.className=style;
    const distance=`${Math.round(Math.hypot(point.x-player.x,point.z-player.z))} м`;
    if(marker.lastChild.textContent!==distance)marker.lastChild.textContent=distance;
  }
}
function frame(now){
  requestAnimationFrame(frame);const elapsed=Math.max(0,(now-lastFrame)/1000),dt=Math.min(elapsed,.08);lastFrame=now;frames++;fpsClock+=elapsed;
  if(fpsClock>=1){text('fps',`${Math.round(frames/fpsClock)} FPS`);fpsClock=0;frames=0;const audioStats=audio.getStats?.();if(audioStats)$('music-toggle').dataset.audio=JSON.stringify(audioStats);canvas.dataset.renderStats=JSON.stringify(renderer.getStats?.()??{});}
  if(active){
    recoilPitch*=Math.exp(-dt*8);recoilYaw*=Math.exp(-dt*10);
    if(locked||(unlocked&&!unlockedPaused)){
      yaw+=(Number(keys.has('ArrowLeft'))-Number(keys.has('ArrowRight')))*dt*1.7;
      pitch=Math.max(-1.45,Math.min(1.45,pitch+(Number(keys.has('ArrowUp'))-Number(keys.has('ArrowDown')))*dt*1.2));
    }
    lastInput=input();
    if(simulation){
      simulation.setInput(localId,lastInput);accumulator+=dt;
      let steps=0;
      while(accumulator>=1/60&&steps<4){simulation.step(1/60);accumulator-=1/60;steps++;}
      if(accumulator>1/60)accumulator=1/60;
      if(steps){receive(simulation.snapshot());pulses.clear();fireTap=false;}
    }else{multiplayer.sendInput(lastInput);pulses.clear();fireTap=false;}
  }
  const currentPlayer=local();
  renderer.render(active?state:null,localId,dt,{...aimAngles(),aim:active&&aim,move:Math.abs(lastInput.forward??0)+Math.abs(lastInput.strafe??0),strafe:lastInput.strafe,sprint:lastInput.sprint,crouch:lastInput.crouch,quality,fov,brightness,shake:cameraShake,deployTarget:active&&currentPlayer&&!currentPlayer.alive?getDeployTarget(currentPlayer):null});
  const scoped=active&&renderer.scoped;
  show('scope-overlay',scoped);
  document.body.classList.toggle('scoped',scoped);
  audio.update?.(dt,{state,local:local(),moving:Math.min(1,Math.abs(lastInput.forward??0)+Math.abs(lastInput.strafe??0)),sprinting:lastInput.sprint,crouching:lastInput.crouch,aim:active&&aim,locked:locked||(unlocked&&!unlockedPaused),inMenu:!active,paused:!$('pause').classList.contains('hidden')});
  if(active&&state){hudClock+=dt;if(hudClock>.08){hudClock=0;hud(now);}markers();}
}
try{
  renderer=new GameRenderer(canvas);renderer.resize();window.addEventListener('resize',()=>renderer.resize());
  if(!read('quality','')&&renderer.integratedGpu){quality='low';$('quality').value='low';}
  for(const p of MAP.points){const objective=document.createElement('div');objective.id=`objective-${p.id}`;objective.className='objective';const label=document.createElement('span');label.textContent=p.id;objective.append(label);$('objective-strip').append(objective);const marker=document.createElement('div');marker.id=`marker-${p.id}`;marker.className='world-marker';const letter=document.createElement('b'),distance=document.createElement('span');letter.textContent=p.id;marker.append(letter,distance);$('world-markers').append(marker);}
  selectClass(selectedClass,false);audio.setMode?.('menu');status('Сектор готов. Выбери класс и вступай в бой.');requestAnimationFrame(frame);
}catch(error){console.error(error);status('Не удалось запустить 3D. Проверь поддержку WebGL 2 и аппаратное ускорение браузера.',true);$('solo').disabled=true;$('host').disabled=true;}
