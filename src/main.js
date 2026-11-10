import './style.css';
import {GameRenderer} from './renderer.js';
import {Simulation} from '../shared/simulation.js';
import {MAP,CLASSES,CAPTURE_RADIUS} from '../shared/world.js';
import {Multiplayer} from './network.js';
import {CombatAudio} from './audio.js';

const $=id=>document.getElementById(id);
const show=(id,visible=true)=>$(id).classList.toggle('hidden',!visible);
const text=(id,value)=>{$(id).textContent=value;};
const audio=new CombatAudio();
const canvas=$('game');
let renderer,simulation=null,state=null,localId=null,active=false,busy=false;
let selectedClass='assault',yaw=0,pitch=0,locked=false,aim=false,fire=false;
let mode='solo',room='',lastFrame=performance.now(),accumulator=0,hudClock=0,fpsClock=0,frames=0,unlocked=false,unlockedPaused=false;
let wasAlive=false,lastHp=100,hitUntil=0,damageUntil=0,feed=[],seen=new Set(),toastTimer;
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
function clearControls(){keys.clear();pulses.clear();fire=false;aim=false;if(active&&localId){const neutral={yaw,pitch};simulation?.setInput(localId,neutral);multiplayer.clearInput(neutral);}}
function receive(next){
  if(state&&next.time<state.time-1){seen.clear();audio.seen.clear();renderer.seenEvents.clear();renderer.lastShot=-1;feed=[];finished=false;wasAlive=false;show('result',false);show('death',false);toast('Новая операция началась');}
  state=next;const player=local();
  if(!active||!player)return;
  if(player.alive&&!wasAlive){yaw=player.yaw;pitch=player.pitch;lastHp=player.hp;show('death',false);if(active&&!locked&&!unlocked)show('pause');}
  if(!player.alive&&wasAlive){clearControls();document.exitPointerLock?.();show('pause',false);show('death');}
  if(player.hp<lastHp){damageUntil=performance.now()+350;}
  lastHp=player.hp;wasAlive=player.alive;
  for(const event of state.events??[]){
    if(seen.has(event.id))continue;seen.add(event.id);
    if(event.type==='shot'&&event.playerId===localId&&event.hit)hitUntil=performance.now()+130;
    if(event.type==='kill'){feed.push({...event,expires:performance.now()+6500});if(event.killerId===localId){hitUntil=performance.now()+300;toast(`Цель устранена · ${event.victim}`);}}
    if(event.type==='capture'&&state.points.some(p=>p.id===event.pointId))toast(`Точка ${event.pointId} ${event.team===player.team?'захвачена вашим отрядом':'под контролем противника'}`);
    if(event.type==='gadget'&&event.playerId===localId)toast(`${gadgetNames[player.classId]} · Активировано`);
  }
  if(seen.size>1500)seen=new Set([...seen].slice(-700));
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
for(const button of document.querySelectorAll('[data-class]'))button.addEventListener('click',()=>{selectedClass=button.dataset.class;for(const b of document.querySelectorAll('[data-class]')){const chosen=b===button;b.classList.toggle('active',chosen);b.setAttribute('aria-pressed',String(chosen));}text('class-weapon',`${CLASSES[selectedClass].weapon} · ${weaponTypes[selectedClass]}`);audio.click();});
$('resume').addEventListener('click',()=>{if(!active){show('pause',false);return;}audio.unlock();requestControl();});
$('menu-settings').addEventListener('click',()=>{text('pause-title','Настройки');text('pause-description','Подготовь обзор и звук перед высадкой.');$('resume').firstChild.textContent='ГОТОВО ';show('unlocked',false);show('leave',false);show('pause');});
$('unlocked').addEventListener('click',()=>{unlocked=true;unlockedPaused=false;show('pause',false);audio.unlock();toast('WASD — движение. Зажми ПКМ и двигай мышью для обзора; стрелки тоже поворачивают камеру.');});
for(const id of ['leave','death-leave','result-leave'])$(id).addEventListener('click',()=>leave());
$('play-again').addEventListener('click',()=>{if(mode==='solo')solo();else{leave();toast('Создай новую комнату для следующей операции.');}});
$('respawn').addEventListener('click',()=>{if(!local()||local().respawnIn>0)return;if(simulation){simulation.respawn(localId,selectedClass,$('spawn-point').value);receive(simulation.snapshot());}else multiplayer.respawn(selectedClass,$('spawn-point').value);requestControl();if(!simulation)toast('Ожидаем подтверждения высадки…');});
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
document.addEventListener('mousemove',event=>{if(!locked&&!(unlocked&&!unlockedPaused&&active&&aim))return;const factor=.0022*sensitivity*(aim?.65:1);yaw-=event.movementX*factor;pitch=Math.max(-1.45,Math.min(1.45,pitch-event.movementY*factor));});
document.addEventListener('mousedown',event=>{if(!locked&&!(unlocked&&!unlockedPaused&&active&&event.target===canvas))return;if(event.button===0)fire=true;if(event.button===2)aim=true;});
document.addEventListener('mouseup',event=>{if(event.button===0)fire=false;if(event.button===2)aim=false;});
document.addEventListener('contextmenu',event=>{if(active)event.preventDefault();});
document.addEventListener('keydown',event=>{
  if(!active){if(event.code==='Escape')show('pause',false);return;}
  if(event.code==='Escape'&&unlocked){unlockedPaused=!unlockedPaused;show('pause',unlockedPaused);clearControls();return;}
  if(event.code==='Tab'){event.preventDefault();show('scoreboard');return;}
  if(!locked&&!(unlocked&&!unlockedPaused))return;
  if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.code))event.preventDefault();
  keys.add(event.code);if(!event.repeat&&['KeyR','KeyQ','KeyG'].includes(event.code))pulses.add(event.code);
});
document.addEventListener('keyup',event=>{keys.delete(event.code);if(event.code==='Tab'){event.preventDefault();show('scoreboard',false);}});
window.addEventListener('blur',clearControls);
document.addEventListener('visibilitychange',()=>{clearControls();lastFrame=performance.now();accumulator=0;if(document.hidden)audio.ctx?.suspend?.();else if(audioStarted)unlockAudio();});
function input(){const enabled=(locked||(unlocked&&!unlockedPaused))&&local()?.alive&&!finished;return {forward:enabled?Number(keys.has('KeyW'))-Number(keys.has('KeyS')):0,strafe:enabled?Number(keys.has('KeyD'))-Number(keys.has('KeyA')):0,yaw,pitch,sprint:enabled&&(keys.has('ShiftLeft')||keys.has('ShiftRight'))&&!aim,crouch:enabled&&(keys.has('KeyC')||keys.has('ControlLeft')),jump:enabled&&keys.has('Space'),fire:enabled&&fire,aim:enabled&&aim,reload:enabled&&pulses.has('KeyR'),gadget:enabled&&pulses.has('KeyQ'),grenade:enabled&&pulses.has('KeyG')};}

const mapctx=$('minimap').getContext('2d');
function minimap(player){
  const c=mapctx,s=360,scale=s/MAP.size,half=MAP.size/2;c.clearRect(0,0,s,s);c.fillStyle='#15262c';c.fillRect(0,0,s,s);c.strokeStyle='#5d7b802b';c.lineWidth=1;
  for(let n=0;n<10;n++){c.beginPath();c.moveTo(n*36,0);c.lineTo(n*36,s);c.moveTo(0,n*36);c.lineTo(s,n*36);c.stroke();}
  c.fillStyle='#73817c77';for(const b of MAP.boxes)c.fillRect((b.x-b.w/2+half)*scale,(b.z-b.d/2+half)*scale,b.w*scale,b.d*scale);
  for(const p of state.points){const x=(p.x+half)*scale,z=(p.z+half)*scale;c.fillStyle=p.owner===-1?'#ced1bb':p.owner===player.team?'#79c5d2':'#e6b273';c.strokeStyle=c.fillStyle;c.globalAlpha=.15;c.beginPath();c.arc(x,z,CAPTURE_RADIUS*scale,0,Math.PI*2);c.fill();c.globalAlpha=1;c.font='bold 19px sans-serif';c.textAlign='center';c.fillText(p.id,x,z+6);}
  for(const p of state.players){if(!p.alive||p.id===localId)continue;const friend=p.team===player.team;if(!friend&&!p.spotted&&Math.hypot(p.x-player.x,p.z-player.z)>28)continue;c.fillStyle=friend?'#79c5d2':'#e6b273';c.beginPath();c.arc((p.x+half)*scale,(p.z+half)*scale,friend?3:4,0,Math.PI*2);c.fill();}
  c.save();c.translate((player.x+half)*scale,(player.z+half)*scale);c.rotate(-yaw);c.fillStyle='#f0f4e9';c.beginPath();c.moveTo(0,-8);c.lineTo(5,6);c.lineTo(0,3);c.lineTo(-5,6);c.closePath();c.fill();c.restore();
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
  $('capture-notice').replaceChildren();if(nearby&&player.alive){const strong=document.createElement('span'),small=document.createElement('small'),track=document.createElement('div'),fill=document.createElement('i');strong.textContent=`${nearby.id} · ${nearby.contested?'ТОЧКА ОСПАРИВАЕТСЯ':nearby.owner===player.team?'УДЕРЖАНИЕ ПОЗИЦИИ':'ЗАХВАТ ТОЧКИ'}`;small.textContent=`${nearby.name} · ${Math.round(Math.abs(nearby.progress)*100)}%`;track.className='capture-track';fill.style.width=`${Math.abs(nearby.progress)*100}%`;track.append(fill);$('capture-notice').append(strong,small,track);}
  feed=feed.filter(e=>e.expires>now).slice(-5);$('killfeed').replaceChildren(...feed.map(e=>{const row=document.createElement('div'),a=document.createElement('b'),b=document.createElement('em');row.classList.toggle('enemy-kill',e.team!==player.team);a.textContent=e.killer;b.textContent=e.victim;row.append(a,document.createTextNode(`  [${e.weapon||'ГРАНАТА'}]  `),b);return row;}));
  $('crosshair').classList.toggle('aim',aim);$('crosshair').style.opacity=player.reloading?'0':'';$('hitmarker').style.opacity=now<hitUntil?'1':'0';$('damage-flash').style.opacity=now<damageUntil?'.45':player.hp<30?'.15':'0';
  if(!player.alive){text('death-countdown',player.respawnIn>0?`Возвращение в бой через ${Math.ceil(player.respawnIn)} с`:'Выбери точку и возвращайся в бой');$('respawn').disabled=player.respawnIn>0;const options=state.points.filter(p=>p.owner===player.team&&!p.contested),signature=options.map(p=>p.id).join('');if($('spawn-point').dataset.signature!==signature){$('spawn-point').dataset.signature=signature;$('spawn-point').replaceChildren(new Option('База команды',''),...options.map(p=>new Option(`${p.id} · ${p.name}`,p.id)));}}
  if(!$('scoreboard').classList.contains('hidden')){$('score-rows').replaceChildren(...[...state.players].sort((a,b)=>Number(a.team!==player.team)-Number(b.team!==player.team)||b.kills-a.kills).map(p=>{const row=document.createElement('div');row.className=`score-row team${p.team===player.team?0:1}${p.id===localId?' local':''}`;for(const value of [`${p.alive?'●':'×'} ${p.name}${p.bot?' [AI]':''}`,CLASSES[p.classId].name,`${p.kills} / ${p.deaths}`]){const span=document.createElement('span');span.textContent=value;row.append(span);}return row;}));}
  minimap(player);
}
function markers(){if(!renderer.project)return;const player=local();if(!player)return;for(const point of state.points){const marker=$(`marker-${point.id}`),position=renderer.project(point.x,5,point.z);marker.style.display=position.visible?'flex':'none';marker.style.left=`${position.x}px`;marker.style.top=`${position.y}px`;marker.className=`world-marker ${point.owner===-1?'':point.owner===player.team?'friendly':'enemy'}`;marker.lastChild.textContent=`${Math.round(Math.hypot(point.x-player.x,point.z-player.z))} м`;}}
function frame(now){
  requestAnimationFrame(frame);const dt=Math.min((now-lastFrame)/1000,.08);lastFrame=now;frames++;fpsClock+=dt;
  if(fpsClock>=1){text('fps',`${Math.round(frames/fpsClock)} FPS`);fpsClock=0;frames=0;const audioStats=audio.getStats?.();if(audioStats)$('music-toggle').dataset.audio=JSON.stringify(audioStats);canvas.dataset.renderStats=JSON.stringify(renderer.getStats?.()??{});}
  if(active){if(locked||(unlocked&&!unlockedPaused)){yaw+=(Number(keys.has('ArrowLeft'))-Number(keys.has('ArrowRight')))*dt*1.7;pitch=Math.max(-1.45,Math.min(1.45,pitch+(Number(keys.has('ArrowUp'))-Number(keys.has('ArrowDown')))*dt*1.2));}lastInput=input();if(simulation){simulation.setInput(localId,lastInput);accumulator+=dt;let steps=0;while(accumulator>=1/60&&steps<6){simulation.step(1/60);accumulator-=1/60;steps++;}if(steps){receive(simulation.snapshot());pulses.clear();}}else{multiplayer.sendInput(lastInput);pulses.clear();}}
  renderer.render(active?state:null,localId,dt,{yaw,pitch,aim:active&&aim,move:Math.abs(lastInput.forward??0)+Math.abs(lastInput.strafe??0),sprint:lastInput.sprint,crouch:lastInput.crouch,quality,fov,brightness,shake:cameraShake});
  audio.update?.(dt,{state,local:local(),moving:Math.min(1,Math.abs(lastInput.forward??0)+Math.abs(lastInput.strafe??0)),sprinting:lastInput.sprint,crouching:lastInput.crouch,aim:active&&aim,locked:locked||(unlocked&&!unlockedPaused),inMenu:!active,paused:!$('pause').classList.contains('hidden')});
  if(active&&state){hudClock+=dt;if(hudClock>.08){hudClock=0;hud(now);}markers();}
}
try{
  renderer=new GameRenderer(canvas);renderer.resize();window.addEventListener('resize',()=>renderer.resize());
  for(const p of MAP.points){const objective=document.createElement('div');objective.id=`objective-${p.id}`;objective.className='objective';const label=document.createElement('span');label.textContent=p.id;objective.append(label);$('objective-strip').append(objective);const marker=document.createElement('div');marker.id=`marker-${p.id}`;marker.className='world-marker';const letter=document.createElement('b'),distance=document.createElement('span');letter.textContent=p.id;marker.append(letter,distance);$('world-markers').append(marker);}
  text('class-weapon',`${CLASSES.assault.weapon} · ${weaponTypes.assault}`);audio.setMode?.('menu');status('Сектор готов. Выбери класс и вступай в бой.');requestAnimationFrame(frame);
}catch(error){console.error(error);status('Не удалось запустить 3D. Проверь поддержку WebGL 2 и аппаратное ускорение браузера.',true);$('solo').disabled=true;$('host').disabled=true;}
