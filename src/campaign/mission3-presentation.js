import {tankFireAnchor} from '../combat-visuals.js';
import * as THREE from 'three';
import {CampaignAudio} from './audio.js';
import {ColumnMusic} from './column-music.js';
import {CampaignFire} from './fire.js';
import {convoyTrackDust,emitTrackDust} from './track-dust.js';
import {placeCampaignMarker} from './markers.js';
import {InfantryMinimap} from './minimap.js';
import {getAssetColliders} from '../../shared/asset-colliders.js';
import {BLACK_HAWK} from '../../shared/vehicles.js';
import {M03_EXTRACTION} from '../../shared/campaign/mission3-extraction.js';
import {m03ConvoyPose,panelState} from '../../shared/campaign/tel-mazin.js';
import './mission3.css';

const orders={F1:'follow',F2:'hold',F3:'assault',F4:'cover',KeyQ:'revive'};
const orderLabels={follow:'ВПЕРЁД',hold:'ДЕРЖАТЬ',assault:'ШТУРМ',cover:'ПРИКРОЙ',revive:'РЕАНИМАЦИЯ'};
const clock=s=>`${String(Math.floor(Math.max(0,s)/60)).padStart(2,'0')}:${String(Math.floor(Math.max(0,s)%60)).padStart(2,'0')}`;
const wrapped=a=>Math.atan2(Math.sin(a),Math.cos(a));

export class Mission3Presentation{
  constructor(session,{renderer,audio,leave,clearControls,resume,getBindings,keyLabel}){
    Object.assign(this,{session,renderer,combat:audio,leave,clearControls,resume,getBindings,keyLabel,locale:session.locale,definition:session.definition});
    const root=new URL(`${import.meta.env.BASE_URL}campaign/m03/`,location.href);
    this.voice=new CampaignAudio(audio,root,this.definition);this.score=new ColumnMusic(audio,root,this.definition);
    this.oldMusicOverride=audio.campaignMusicOverride;audio.campaignMusicOverride=true;
    this.root=document.createElement('section');this.root.className='campaign-ui campaign-m03';
    this.root.setAttribute('aria-label','Миссия 3 — Колонна');
    this.root.innerHTML=`<header class="campaign-objective m03-objective"><small>ТЕЛЬ-МАЗИН · КОЛОННА</small><strong></strong><span></span><p class="m03-status"></p></header>
      <div class="campaign-subtitle hidden" role="status" aria-live="polite"><b></b><span></span></div>
      <div class="m03-interaction"><span></span><progress max="1" value="0" hidden></progress></div>
      <div class="m03-choices" hidden><button type="button"></button><button type="button"></button><button type="button"></button></div>
      <div class="campaign-injury hidden"><b>ТЯЖЁЛОЕ РАНЕНИЕ</b><strong></strong><span></span><progress max="1" hidden></progress></div>
      <div class="m03-bindings"></div><span class="m03-marker" hidden></span>
      <aside class="m03-squad" hidden><div class="m03-temporary"></div><div class="m03-notices" role="status"></div></aside>
      <div class="m03-cinematic" hidden></div>
      <div class="m03-fade" aria-hidden="true" hidden></div>
      <section class="campaign-ending campaign-card hidden"><small></small><h2></h2><p></p><div class="campaign-final-stats"></div>
        <button class="campaign-retry">С контрольной точки</button><button class="campaign-exit">К экрану кампании</button></section>`;
    document.body.append(this.root);this.$=query=>this.root.querySelector(query);
    this.$('.campaign-retry').onclick=()=>this.retry();this.$('.campaign-exit').onclick=()=>leave();
    [...this.$('.m03-choices').children].forEach((button,index)=>button.onclick=()=>this.answer(index));
    this.marker=this.$('.m03-marker');this.minimap=new InfantryMinimap(renderer);
    this.fade=this.$('.m03-fade');this.extractionListener={x:0,y:0,z:0,yaw:0};
    this.original={sun:renderer.sun.intensity,hemi:renderer.hemiLight.intensity,ambient:renderer.ambientLight.intensity,
      sunOffset:renderer.sunOffset.clone()};
    this.props=new THREE.Group();this.props.name='tel-mazin-dynamic';renderer.worldRoot.add(this.props);
    this.meshData=new THREE.Object3D();this.tint=new THREE.Color();
    this.panels=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshLambertMaterial(),renderer.map.interactives.length);
    this.panels.frustumCulled=false;this.panels.castShadow=true;this.panels.receiveShadow=true;this.panels.count=0;this.props.add(this.panels);
    const tower=renderer.map.tower;
    this.glint=new THREE.Mesh(new THREE.SphereGeometry(.13,8,6),new THREE.MeshBasicMaterial({color:'#ff552f',toneMapped:false}));
    this.glint.position.set(tower.x,tower.y+1.47,tower.z+.15);this.glint.visible=false;this.props.add(this.glint);
    this.renderHook=(r,state,dt,view)=>this.render(r,state,dt,view);
  }
  retry(){this.clearControls();this.session.command({type:'retry'});this.resume();}
  answer(index){
    if(!this.session.state?.campaign.choices||this.answerPending)return;
    this.answerPending=true;
    this.session.command({type:'answer',index});
    this.resume();
  }
  key(event){
    const m=this.session.state?.campaign;if(!m||event.repeat)return false;
    if(m.failed&&event.code==='Enter'){this.retry();return true;}
    if(m.failed||m.complete||m.cutscene)return false;
    if(m.ride){
      if(m.choices&&/^(Digit|Numpad)[123]$/.test(event.code)){this.answer(Number(event.code.at(-1))-1);return true;}
      return false;
    }
    const order=orders[event.code];
    if(order){this.session.command({type:'order',order});return true;}
    if(event.code==='KeyT'&&m.smokeGrenades>0){this.session.command({type:'smoke'});return true;}
    return false;
  }
  update(state,paused){
    const m=state?.campaign;if(m?.missionId!=='m03')return;
    const p=state.players.find(p=>p.id==='local'),cutscene=Boolean(m.cutscene),end=Boolean(m.failed||m.complete);
    if(!p)return;
    const blocked=cutscene||end,interact=this.keyLabel(this.getBindings().interact??'KeyE');
    this.root.classList.toggle('campaign-ui-paused',paused&&!end);
    document.body.classList.add('campaign-active','campaign-m03-active');
    document.body.classList.toggle('campaign-m03-ride',m.ride);
    document.body.classList.toggle('campaign-cinematic',cutscene);
    document.body.classList.toggle('campaign-downed',p.downed);
    this.$('.m03-objective').hidden=blocked;
    this.$('.m03-objective strong').textContent=this.locale.objectives[m.objective];
    const range=m.target?Math.round(Math.hypot(p.x-m.target.x,p.z-m.target.z)):null;
    const waiting=m.pendingEnemies?` · ПОДХОДЯТ ${m.pendingEnemies}`:'';
    this.$('.m03-objective > span').textContent=m.ride?`${clock(m.rideTime)} · «СОКОЛ-7»`:
      `КП ${m.checkpoint}/4 · В БОЮ ${m.enemies}${waiting}${m.targetLabel?` · ${m.targetLabel}`:''}${range===null?'':` · ${range} м`}`;
    const line=this.locale.lines[m.radio?.key],subtitle=this.$('.campaign-subtitle');
    subtitle.classList.toggle('hidden',!line||end);
    subtitle.querySelector('b').textContent=line?this.locale.speakers[line.speaker]:'';
    subtitle.querySelector('span').textContent=line?.text??'';
    const interaction=this.$('.m03-interaction');interaction.hidden=blocked;
    interaction.querySelector('span').textContent=m.ride?(m.rideTime<90?'ПРОБЕЛ · УДЕРЖИВАТЬ ДЛЯ УСКОРЕНИЯ':''):
      (m.prompt??'').replace(/^E(?= ·)/,interact);
    const progress=interaction.querySelector('progress');progress.hidden=(m.progress??0)<=0;progress.value=m.progress??0;
    const choices=this.$('.m03-choices'),offered=m.ride&&Boolean(m.choices);
    if(offered&&!this.offered)document.exitPointerLock?.();
    this.offered=offered;
    if(!offered)this.answerPending=false;
    choices.hidden=!offered||this.answerPending;
    if(offered)for(const [i,button] of Array.from(choices.children).entries()){
      const line=this.locale.lines[m.choices[i]];
      button.hidden=!line;
      button.textContent=line?`${i+1}. ${line.text}`:'';
    }
    const injury=this.$('.campaign-injury');injury.classList.toggle('hidden',!p.downed||end);
    injury.querySelector('strong').textContent=`${Math.max(0,Math.ceil(p.downedTimer))} с`;
    const medic=state.players.some(a=>a.team===p.team&&a.alive&&!a.downed&&a.fieldMedic);
    const response=m.medicalResponse,treated=(response?.progress??0)>0;
    injury.querySelector('span').textContent=response?(treated?`${response.name} поднимает вас`:
      `${response.name} идёт к вам · ${response.distance} м`):medic?'Q · позвать медика':'Медик недоступен';
    const treatment=injury.querySelector('progress');treatment.hidden=!treated;treatment.value=response?.progress??0;
    const status=this.$('.m03-status');status.hidden=blocked||m.ride;
    const task=m.fuseRemaining!==null?` · ПОДРЫВ ${Math.ceil(m.fuseRemaining)} с`:
      m.wave?` · ВОЛНА ${m.wave}/2${m.waveRemaining!=null?` · ПОДКРЕПЛЕНИЕ ЧЕРЕЗ ${Math.ceil(m.waveRemaining)} С`:''}`:
        m.objective==='breach'?` · ЗАРЯДЫ ${m.charges.filter(Boolean).length}/2`:'';
    const nearbyWounded=state.players.filter(a=>a.rescue&&a.alive&&a.downed&&a.downedTimer<=115);
    const urgent=nearbyWounded.length?` · ПОМОЩЬ РАНЕНЫМ ${Math.ceil(Math.min(...nearbyWounded.map(a=>a.downedTimer)))} С`:'';
    status.textContent=`АПТЕЧКИ ${p.medkits} · ШПРИЦЫ ${p.syringes} · СПАСЕНО ${m.flags.brigade_saved}/8${urgent}${task}`;
    const binds=this.$('.m03-bindings');binds.hidden=blocked||m.ride;
    binds.textContent=`${orderLabels[m.order]} · F1 ИДТИ · F2 ДЕРЖАТЬ · F3 ШТУРМ · F4 ПРИКРОЙ${medic?' · Q МЕДИК':''}${m.smokeGrenades?' · T ДЫМ':''}`;
    const squad=this.$('.m03-squad'),members=state.players.filter(a=>m.temporarySquadIds?.includes(a.id));
    squad.hidden=blocked||m.ride||(!members.length&&!m.notices?.length);
    const names=members.map(a=>`${a.name}${a.downed?' · ранен':''}`).join(', ');
    const kills=members.reduce((n,a)=>n+a.kills,0),revives=members.reduce((n,a)=>n+a.fieldRevives,0);
    const contribution=[kills&&`Целей снято ${kills}`,revives&&`Реанимаций ${revives}`].filter(Boolean).join(' · ');
    this.$('.m03-temporary').textContent=members.length?`Временный отряд · ${members.length}\n${names}${contribution?'\n'+contribution:''}`:'';
    const notices=this.$('.m03-notices'),notice=(m.notices??[]).join('\n');
    if(notices.textContent!==notice)notices.textContent=notice;
    this.minimap.update(state,p,{hidden:blocked||m.ride||paused});
    this.$('.m03-cinematic').hidden=!cutscene||end;
    const extraction=m.cutscene?.extractionElapsed;
    this.fade.hidden=extraction==null;
    if(extraction!=null)this.fade.style.opacity=THREE.MathUtils.smoothstep(extraction,M03_EXTRACTION.fadeAt,M03_EXTRACTION.end);
    const ending=this.$('.campaign-ending');ending.classList.toggle('hidden',!end);
    if(end){
      ending.querySelector('small').textContent=m.failed?'МИССИЯ ПРЕРВАНА':'МИССИЯ ЗАВЕРШЕНА';
      ending.querySelector('h2').textContent=m.failed?'Колонна потеряла Мартена':'Эвакуация завершена';
      const rescued=m.flags.brigade_saved,survived=m.stats.brigadeAlive;
      ending.querySelector('p').textContent=m.failed??'Мартен увёз карту, которую передал Харранти.';
      ending.querySelector('.campaign-final-stats').textContent=`РЕАНИМИРОВАНО ${rescued}/8 · В СТРОЮ ${survived??0} · ПОТЕРИ ${m.stats.losses??0} · ${clock(m.stats.elapsedSeconds)}`;
      this.$('.campaign-retry').hidden=!m.failed;
    }
    if(end&&!this.ended){this.clearControls();document.exitPointerLock?.();}this.ended=end;
    this.voice.update(state,this.locale,paused||end,this.renderer);this.score.update(state,paused);
  }
  syncPanels(m){
    if(m.doorRevision===this.doorRevision)return;
    this.doorRevision=m.doorRevision;this.panels.count=0;
    const disabled=new Set();
    for(const [index,item] of this.renderer.map.interactives.entries()){
      const state=panelState(m.doorStates,index);
      if(state==='open'||state==='destroyed')disabled.add(item.id);
      if(item.opened&&state!=='open')disabled.add(item.opened.id);
      const part=state==='open'?item.opened:state==='destroyed'?null:item.part;
      if(!part)continue;
      this.meshData.position.set(part.x,part.baseY+part.h/2,part.z);this.meshData.scale.set(part.w,part.h,part.d);
      this.meshData.updateMatrix();const slot=this.panels.count++;
      this.panels.setMatrixAt(slot,this.meshData.matrix);this.panels.setColorAt(slot,this.tint.set(part.color));
    }
    this.panels.instanceMatrix.needsUpdate=true;
    if(this.panels.instanceColor)this.panels.instanceColor.needsUpdate=true;
    this.renderer.campaignCoverColliders=getAssetColliders(this.renderer.map).filter(box=>!disabled.has(box.id));
    this.renderer.interiorVisibility.disabled=disabled;
  }
  renderExtraction(r,state,t,view){
    const camera=r.camera,terrain=r.map.terrain;
    const [lead,wing]=state.vehicles.filter(v=>v.type===BLACK_HAWK);
    if(!lead||!wing)return;
    if(t<M03_EXTRACTION.boardingShot){
      const glide=THREE.MathUtils.smoothstep(t,0,M03_EXTRACTION.boardingShot);
      camera.position.set(210+4*glide,terrain.heightAt(214,7)+3.1+2*glide,7-2*glide);
      camera.lookAt((lead.x+wing.x)*.5,(lead.y+wing.y)*.5+1.5,(lead.z+wing.z)*.5);
    }else if(t<M03_EXTRACTION.wingShot){
      const glide=THREE.MathUtils.smoothstep(t,M03_EXTRACTION.boardingShot,M03_EXTRACTION.wingShot);
      camera.position.set(225+2.8*glide,terrain.heightAt(225,-30)+2.75,-30-1.3*glide);
      camera.lookAt(237.2+1.5*glide,terrain.heightAt(237,-15)+1.7,-16+3*glide);
    }else if(t<M03_EXTRACTION.departureShot){
      const glide=THREE.MathUtils.smoothstep(t,M03_EXTRACTION.wingShot,M03_EXTRACTION.departureShot);
      camera.position.set(239+1.8*glide,terrain.heightAt(239,-5)+3.2,-5-2*glide);
      camera.lookAt(249.5,terrain.heightAt(251,13)+1.85,10.5+1.5*glide);
    }else{
      // Hold on the clearing so both aircraft fly out of the shot.
      camera.position.set(229,terrain.heightAt(229,32)+8,32);
      camera.lookAt(241,terrain.heightAt(241,0)+5,-2);
    }
    const fov=t>=M03_EXTRACTION.departureShot?52:56;
    if(camera.fov!==fov){camera.fov=fov;camera.updateProjectionMatrix();}
    this.engineListener=Object.assign(this.extractionListener,{x:camera.position.x,y:camera.position.y,z:camera.position.z,yaw:camera.rotation.y});
    if(!view.paused&&t>=this.nextRotorDust){
      this.nextRotorDust=t+(view.quality==='low'?.48:.27);
      for(const v of [lead,wing]){
        const ground=terrain.heightAt(v.x,v.z),strength=1-THREE.MathUtils.clamp((v.y-ground)/7,0,1);
        if(strength<=0)continue;
        const angle=t*7+(v===lead?0:Math.PI);
        r.smoke(v.x+4*Math.sin(angle),ground+.45,v.z+4*Math.cos(angle),2.8,2.1,0xb29b77,
          {opacity:strength*.36,rise:.32,wind:1.3});
      }
    }
  }
  render(r,state,dt,view){
    const m=state.campaign;if(m?.missionId!=='m03')return;
    this.syncPanels(m);
    const indoors=m.inside&&!m.cutscene;
    r.sunOffset.set(30,126,16);r.sun.intensity=2.1;
    r.hemiLight.intensity=THREE.MathUtils.damp(r.hemiLight.intensity,indoors?1.17:1.56,6,dt);
    r.ambientLight.intensity=THREE.MathUtils.damp(r.ambientLight.intensity,indoors?.22:.29,6,dt);
    if(m.ride){
      const transport=state.vehicles.find(v=>v.id==='sokol-7');
      if(transport&&!view.paused&&r.clock>=(this.nextTrackDustAt??0)){
        this.nextTrackDustAt=r.clock+(view.quality==='low'?.43:.29);
        emitTrackDust(r,state.vehicles,transport,convoyTrackDust);
      }
      if(transport&&state.players.some(p=>p.id==='local'&&p.vehicleId===transport.id)){
        const heading=transport.yaw+Math.PI;
        const delta=THREE.MathUtils.clamp(wrapped((view.yaw??heading)-heading),-2.094,2.094);
        r.camera.rotation.set(view.pitch??0,heading+delta,0,'YXZ');
      }
      r.weapon.visible=false;
    }
    const extraction=m.cutscene?.extractionElapsed;
    this.engineListener=null;
    if(extraction!=null){
      this.renderExtraction(r,state,extraction,view);
      r.weapon.visible=false;
    }else if(m.cutscene){
      this.nextRotorDust=0;
      const t=THREE.MathUtils.clamp(m.cutscene.elapsed/9,0,1);
      const y=r.map.houses.headquarters.baseY;
      r.camera.position.set(173.25-t*.9,y+1.7,-8.55-t*.4);r.camera.lookAt(174.68,y+1.38,-11);
      r.weapon.visible=false;
    }
    this.glint.visible=m.sniperFlash;
    r.camera.updateMatrixWorld();
    if(!this.fires){
      const convoy=state.vehicles.filter(v=>v.convoyIndex!==undefined);
      const emitters=[convoy[0],convoy.at(-1)].filter(Boolean).map(v=>({...m03ConvoyPose(this.definition,v.convoyIndex,this.definition.convoy.ambushAt),id:v.id,width:1.65,height:2.6,vehicle:true}));
      this.fires=new CampaignFire(r,this.props,emitters);
    }
    this.fireAnchor??=new THREE.Vector3();
    this.fires.update({light:'dawn'},state.time,r.camera,new Set(state.vehicles.filter(v=>v.hp<=0).map(v=>v.id)),id=>{
      const v=state.vehicles.find(v=>v.id===id);if(!v)return null;
      return tankFireAnchor(v,r.vehicleRigs.get(id),this.fireAnchor);
    });
    const objective=m.target&&!m.ride&&!m.cutscene&&!m.failed&&!m.complete?m.target:null;
    const screen=objective?r.project(objective.x,(objective.y??r.map.terrain.heightAt(objective.x,objective.z))+2.35,objective.z):null;
    const p=state.players.find(p=>p.id==='local');
    let direction='';
    let marker=placeCampaignMarker(screen,r.viewportWidth,r.viewportHeight);
    if(!marker&&p&&objective){
      const offset=wrapped(Math.atan2(p.x-objective.x,p.z-objective.z)-(view.yaw??p.yaw)),left=offset>0;
      marker={x:left?125:Math.max(125,r.viewportWidth-125),y:r.viewportHeight*.37};direction=left?'← ':'→ ';
    }
    this.marker.hidden=!marker;
    if(marker){this.marker.style.transform=`translate(${marker.x}px,${marker.y}px) translate(-50%,-50%)`;
      this.marker.textContent=`${direction||'◇ '}${m.targetLabel??'ЦЕЛЬ'} · ${Math.round(Math.hypot(p.x-objective.x,p.z-objective.z))} М`;}
    if(!view.paused&&r.clock>=(this.nextSmoke??0)){
      this.nextSmoke=r.clock+.48;
      if(m.rideTime<118)for(const x of [120,194])r.smoke(x,5,x===120?22:-20,6.5,12,0x675b4d,{rise:3.2,wind:.6});
      for(const smoke of m.smoke)r.smoke(smoke.x+Math.sin(r.clock*2)*2,smoke.y+.8,smoke.z+Math.cos(r.clock*2)*2,2.4,4.4,0xaaa49a,{opacity:.6,rise:.46});
    }
  }
  dispose(){
    this.voice.dispose();this.score.dispose();this.combat.campaignMusicOverride=this.oldMusicOverride;
    this.fires?.dispose();
    const r=this.renderer,o=this.original;r.sun.intensity=o.sun;r.hemiLight.intensity=o.hemi;r.ambientLight.intensity=o.ambient;r.sunOffset.copy(o.sunOffset);
    r.campaignCoverColliders=null;r.interiorVisibility.disabled=null;
    this.props.removeFromParent();for(const obj of [this.panels,this.glint]){obj.geometry.dispose();obj.material.dispose();obj.dispose?.();}
    this.minimap.dispose();this.root.remove();document.body.classList.remove('campaign-active','campaign-m03-active','campaign-m03-ride','campaign-cinematic','campaign-downed');
  }
}
