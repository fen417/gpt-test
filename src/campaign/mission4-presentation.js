import * as THREE from 'three';
import {getAssetColliders} from '../../shared/asset-colliders.js';
import {NAHAR_GATES,NAHAR_SITES} from '../../shared/campaign/nahar.js';
import {getVehicleSeatPose,vehiclePartPose} from '../../shared/vehicles.js';
import {CampaignAudio} from './audio.js';
import {ColumnMusic} from './column-music.js';
import {placeCampaignMarker} from './markers.js';
import './mission4.css';

const orders={F1:'follow',F2:'hold',KeyQ:'assist'};
const orderText={follow:'Следовать',hold:'Держать позицию',assist:'Помочь диспетчеру'};
const clock=seconds=>`${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;
const angle=value=>Math.atan2(Math.sin(value),Math.cos(value));
const mix=THREE.MathUtils.lerp;
const smooth=THREE.MathUtils.smoothstep;
const names={primary:'Двор депо',alternate:'Ремонтный двор'};

function flightMusic(state,definition){
  const m=state.campaign;
  if(!m.airborne||m.stage==='disembark'||!definition.music?.flight)return {tracks:{},offset:0};
  const level=m.stage==='transfer'?.28:m.stage==='landing'?.48:.84;
  return {tracks:{flight:level},offset:m.time};
}

export class Mission4Presentation{
  constructor(session,{renderer,audio,leave,clearControls,resume,getBindings,keyLabel}){
    Object.assign(this,{session,renderer,combat:audio,clearControls,resume,getBindings,keyLabel,
      locale:session.locale,definition:session.definition});
    const rootUrl=new URL(`${import.meta.env.BASE_URL}campaign/m04/`,location.href);
    this.voice=new CampaignAudio(audio,rootUrl,this.definition);
    this.score=new ColumnMusic(audio,rootUrl,this.definition,flightMusic);
    this.oldMusicOverride=audio.campaignMusicOverride;audio.campaignMusicOverride=true;
    this.root=document.createElement('section');this.root.className='campaign-ui campaign-m04';
    this.root.setAttribute('aria-label','Миссия 04 «Под крышами»');
    this.root.innerHTML=`<header class="campaign-objective"><small>НАХАР · ПОД КРЫШАМИ</small><strong></strong><span></span></header>
      <div class="campaign-subtitle hidden" role="status" aria-live="polite"><b></b><span></span></div>
      <div class="m04-interaction" hidden><span></span><progress max="1" value="0" hidden></progress></div>
      <div class="m04-warning" hidden></div><div class="m04-flight-status" hidden><b></b><span></span><meter min="0" max="100"></meter></div>
      <div class="m04-squad" hidden></div><span class="m04-marker" hidden></span><span class="m04-threat" hidden></span>
      <div class="m04-cinematic" hidden></div>
      <section class="campaign-ending campaign-card hidden"><small></small><h2></h2><p></p><div class="campaign-final-stats"></div>
        <button class="campaign-retry">С контрольной точки</button><button class="campaign-exit">К экрану кампании</button></section>`;
    document.body.append(this.root);
    this.$=selector=>this.root.querySelector(selector);
    this.$('.campaign-exit').onclick=leave;this.$('.campaign-retry').onclick=()=>this.retry();
    this.marker=this.$('.m04-marker');this.threat=this.$('.m04-threat');
    this.dressing=new THREE.Group();this.dressing.name='nahar-interactives';renderer.worldRoot.add(this.dressing);
    this.doorMeshes=Object.fromEntries(Object.entries(NAHAR_GATES).map(([name,b])=>{
      const gate=new THREE.Mesh(new THREE.BoxGeometry(b.w,b.h,b.d),new THREE.MeshStandardMaterial({color:b.color,metalness:.16,roughness:.84}));
      gate.position.set(b.x,b.baseY+b.h/2,b.z);gate.castShadow=true;gate.receiveShadow=true;this.dressing.add(gate);
      return [name,gate];
    }));
    this.original={sun:renderer.sun.intensity,sunOffset:renderer.sunOffset.clone(),hemi:renderer.hemiLight.intensity,
      ambient:renderer.ambientLight.intensity};
    this.renderHook=(r,state,dt,view)=>this.render(r,state,dt,view);
  }
  retry(){this.clearControls();this.session.command({type:'retry'});this.resume();}
  key(event){
    const m=this.session.state?.campaign;
    if(!m||event.repeat||m.complete)return false;
    if(m.failed&&event.code==='Enter'){this.retry();return true;}
    const order=orders[event.code];
    if(!m.airborne&&!m.failed&&!m.cutscene&&order){this.session.command({type:'order',order});return true;}
    return false;
  }
  update(state,paused){
    const m=state?.campaign;if(m?.missionId!=='m04')return;
    const p=state.players.find(a=>a.id==='local');if(!p)return;
    const end=Boolean(m.failed||m.complete),cinematic=Boolean(m.cutscene);
    const hint=(action,fallback)=>this.keyLabel(this.getBindings()[action]??fallback);
    const use=hint('interact','KeyE'),switchSeat=hint('switchSeat','KeyF');
    document.body.classList.add('campaign-active','campaign-m04-active');
    document.body.classList.toggle('campaign-cinematic',cinematic||m.transfer!=null);
    this.root.classList.toggle('campaign-ui-paused',paused&&!end);
    const objective=this.$('.campaign-objective');objective.hidden=end||cinematic||m.transfer!=null;
    objective.querySelector('strong').textContent=this.locale.objectives[m.objective];
    const stageNote=m.airborne?(m.landing?names[m.landing]:p.vehicleSeat===2?'ЛЕВЫЙ БОРТ':'ПРАВЫЙ БОРТ'):
      m.target?`${Math.round(Math.hypot(p.x-m.target.x,p.z-m.target.z))} м`:'';
    objective.querySelector('span').textContent=[m.checkpoint?`КП ${m.checkpoint}/5`:'',stageNote].filter(Boolean).join(' · ');
    const subtitle=this.$('.campaign-subtitle'),line=this.locale.lines[m.radio?.key];
    subtitle.classList.toggle('hidden',!line||end);
    subtitle.querySelector('b').textContent=line?this.locale.speakers[line.speaker]:'';
    subtitle.querySelector('span').textContent=line?.text??'';
    let prompt=m.prompt?`${use} · ${m.prompt}`:'';
    if(m.stage==='approach')prompt=`${switchSeat} · Сменить правое место`;
    if(m.transferReady)prompt=m.transfer!=null?'Переход к минигану':`${switchSeat} · Занять миниган`;
    if(m.disembarkReady)prompt=`${use} · Выйти из вертолёта`;
    const action=this.$('.m04-interaction');action.hidden=!prompt||end||cinematic;
    action.querySelector('span').textContent=prompt;
    const progress=action.querySelector('progress');progress.value=m.transfer??m.progress??0;
    progress.hidden=progress.value<=0;
    const danger=this.$('.m04-warning');danger.hidden=end||cinematic||m.transfer!=null||!(m.threat||m.transmitting&&m.stage==='relay');
    danger.textContent=m.threat?`ПТ-90 · ${Math.max(1,Math.ceil(m.threat.time))} С ДО ВЫСТРЕЛА`:
      m.power?`ПЕРЕДАЧА СХЕМЫ · ${Math.floor(m.sent*100)}%`:`НЕТ ПИТАНИЯ · ПЕРЕДАНО ${Math.floor(m.sent*100)}%`;
    const flight=this.$('.m04-flight-status'),craft=state.vehicles.find(v=>v.id===p.vehicleId);
    flight.hidden=!m.airborne||!craft||end||m.transfer!=null;
    flight.querySelector('b').textContent=`КОРПУС ${m.hull??0}%`;
    flight.querySelector('span').textContent=p.vehicleSeat===2?
      craft?.overheated?'МИНИГАН ПЕРЕГРЕТ':`НАГРЕВ ${Math.round((craft?.heat??0)*100)}%`:
      p.vehicleSeat===4?'ЗАДНЕЕ ПРАВОЕ':'ПЕРЕДНЕЕ ПРАВОЕ';
    const meter=flight.querySelector('meter');meter.value=m.hull??0;
    const squad=this.$('.m04-squad'),dispatcher=state.players.find(a=>a.role==='dispatcher');
    squad.hidden=m.airborne||cinematic||end;
    squad.textContent=`${orderText[m.order]} · F1 ИДТИ · F2 ДЕРЖАТЬ${dispatcher?.alive&&dispatcher.downed?' · Q САНИТАР':''}`;
    const mat=this.$('.m04-cinematic');mat.hidden=!cinematic||Boolean(m.failed);
    if(cinematic)mat.style.setProperty('--end-fade',String(smooth(m.cutscene.elapsed,2.2,5.9)));
    const ending=this.$('.campaign-ending');ending.classList.toggle('hidden',!end);
    if(end){
      ending.querySelector('small').textContent=m.failed?'МИССИЯ ПРЕРВАНА':'МИССИЯ ЗАВЕРШЕНА';
      ending.querySelector('h2').textContent=m.failed?'Операция в Нахаре':'Схема доставлена';
      ending.querySelector('p').textContent=m.failed??'«Маяк» получил координаты топливного узла. Следующая цель — карьер.';
      const dispatcherResult=m.flags.m4_dispatcher_alive?'ДИСПЕТЧЕР СПАСЁН':'ДАННЫЕ ДИСПЕТЧЕРА ПОЛУЧЕНЫ';
      ending.querySelector('.campaign-final-stats').textContent=m.failed?'':
        `${names[m.landing]?.toUpperCase()??''} · ${dispatcherResult} · ${clock(m.stats.elapsedSeconds)}`;
      this.$('.campaign-retry').hidden=!m.failed;
      if(!this.ended){this.clearControls();document.exitPointerLock?.();}
    }
    this.ended=end;
    this.voice.update(state,this.locale,paused||end,this.renderer);
    this.score.update(state,paused||end);
  }
  syncGates(gates){
    const key=`${gates.service}:${gates.tunnel}`;
    if(key===this.gateKey)return;
    this.gateKey=key;const excluded=new Set();
    for(const [name,gate] of Object.entries(this.doorMeshes)){
      gate.visible=!gates[name];if(!gate.visible)excluded.add(NAHAR_GATES[name].id);
    }
    this.renderer.campaignCoverColliders=getAssetColliders(this.renderer.map).filter(b=>!excluded.has(b.id));
  }
  placeMarker(element,r,target,p,label){
    if(!target){element.hidden=true;return;}
    const screen=r.project(target.x,target.y,target.z);
    let location=placeCampaignMarker(screen,r.viewportWidth,r.viewportHeight),direction='';
    if(!location){
      const offset=angle(Math.atan2(p.x-target.x,p.z-target.z)-r.camera.rotation.y),left=offset>0;
      location={x:left?87:r.viewportWidth-87,y:r.viewportHeight*.51};direction=left?'← ':'→ ';
    }
    element.hidden=false;element.style.transform=`translate(${location.x}px,${location.y}px) translate(-50%,-50%)`;
    element.textContent=direction+label;
  }
  render(r,state,dt,view){
    const m=state.campaign;if(m?.missionId!=='m04')return;
    this.syncGates(m.gates);
    const p=state.players.find(a=>a.id==='local'),craft=state.vehicles.find(v=>v.id===p?.vehicleId);
    r.sunOffset.set(-140,86,-60);r.sun.intensity=2.1;r.hemiLight.intensity=1.34;r.ambientLight.intensity=.24;
    if(craft&&m.airborne&&m.transfer!=null){
      const t=smooth(m.transfer,0,1),from=getVehicleSeatPose(craft,p.vehicleSeat),to=vehiclePartPose(craft,-.62,2.5,-.83);
      r.camera.position.set(mix(from.x,to.x,t),mix(from.y,to.y,t)-Math.sin(Math.PI*t)*.22,mix(from.z,to.z,t));
      const yaw=craft.yaw+mix(-Math.PI/2,Math.PI/2,t);
      r.camera.rotation.set(-.105*Math.sin(Math.PI*t),yaw,0,'YXZ');r.weapon.visible=false;
    }else if(craft&&m.airborne&&p.vehicleSeat>=3&&view.shake!==false){
      r.camera.rotation.z=m.bodyRoll*.22;
    }
    if(m.cutscene?.id==='finale'){
      const e=NAHAR_SITES.exit,t=smooth(m.cutscene.elapsed,0,5.8);
      r.camera.position.set(e.x-6+t*3,1.78,e.z+2.3-t*.8);r.camera.lookAt(e.x+9,1.34,e.z-.4);r.weapon.visible=false;
    }
    r.camera.updateMatrixWorld();
    const show=!m.failed&&!m.complete&&!m.cutscene&&p;
    this.placeMarker(this.threat,r,show?m.threat:null,p,'▲ ПТ-90');
    const t=show&&m.target;
    this.placeMarker(this.marker,r,t?{...t,y:t.y+.8}:null,p,t?`◇ ${Math.round(Math.hypot(t.x-p.x,t.z-p.z))} М`:'');
    if(!view.paused&&craft&&m.stage==='landing'&&craft.y<6&&r.clock>=(this.nextDust??0)){
      this.nextDust=r.clock+(view.quality==='low'?.47:.28);
      const a=r.clock*6;
      r.smoke(craft.x+Math.sin(a)*4,.45,craft.z+Math.cos(a)*4.5,2.4,1.75,0xb4a084,{opacity:.3,rise:.34,wind:1.1});
    }
  }
  dispose(){
    this.voice.dispose();this.score.dispose();this.combat.campaignMusicOverride=this.oldMusicOverride;
    const r=this.renderer,o=this.original;r.sun.intensity=o.sun;r.sunOffset.copy(o.sunOffset);
    r.hemiLight.intensity=o.hemi;r.ambientLight.intensity=o.ambient;r.campaignCoverColliders=null;
    for(const gate of Object.values(this.doorMeshes)){gate.geometry.dispose();gate.material.dispose();}
    this.dressing.removeFromParent();this.root.remove();
    document.body.classList.remove('campaign-active','campaign-m04-active','campaign-cinematic');
  }
}
