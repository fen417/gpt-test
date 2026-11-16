import * as THREE from 'three';
import {CampaignAudio} from './audio.js';
import {ColumnMusic} from './column-music.js';
import {CampaignFire} from './fire.js';
import {placeCampaignMarker} from './markers.js';
import {getAssetColliders} from '../../shared/asset-colliders.js';
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
    this.root.innerHTML=`<header class="campaign-objective m03-objective"><small>ТЕЛЬ-МАЗИН · КОЛОННА</small><strong></strong><span></span></header>
      <div class="campaign-subtitle hidden" role="status" aria-live="polite"><b></b><span></span></div>
      <div class="m03-interaction"><span></span><progress max="1" value="0" hidden></progress></div>
      <div class="m03-choices" hidden><button type="button"></button><button type="button"></button></div>
      <div class="campaign-injury hidden"><b>ТЯЖЁЛОЕ РАНЕНИЕ</b><strong></strong></div>
      <div class="m03-status"></div><div class="m03-bindings"></div><span class="m03-marker" hidden></span>
      <canvas class="m03-map" width="168" height="168" aria-label="Карта Тель-Мазина" hidden></canvas>
      <div class="m03-cinematic" hidden></div>
      <section class="campaign-ending campaign-card hidden"><small></small><h2></h2><p></p><div class="campaign-final-stats"></div>
        <button class="campaign-retry">С контрольной точки</button><button class="campaign-exit">К экрану кампании</button></section>`;
    document.body.append(this.root);this.$=query=>this.root.querySelector(query);
    this.$('.campaign-retry').onclick=()=>this.retry();this.$('.campaign-exit').onclick=()=>leave();
    [...this.$('.m03-choices').children].forEach((button,index)=>button.onclick=()=>this.answer(index));
    this.marker=this.$('.m03-marker');this.mapCanvas=this.$('.m03-map');
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
      if(m.choices&&/^(Digit|Numpad)[12]$/.test(event.code)){this.answer(Number(event.code.at(-1))-1);return true;}
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
    this.$('.m03-objective > span').textContent=m.ride?`${clock(m.rideTime)} · «СОКОЛ-7»`:
      `КП ${m.checkpoint}/4 · ${orderLabels[m.order]} · ПРОТИВНИКОВ ${m.enemies}${range===null?'':` · ${range} м`}`;
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
    if(offered)m.choices.forEach((key,i)=>choices.children[i].textContent=`${i+1}. ${this.locale.lines[key]?.text??''}`);
    const injury=this.$('.campaign-injury');injury.classList.toggle('hidden',!p.downed||end);
    injury.querySelector('strong').textContent=`${Math.max(0,Math.ceil(p.downedTimer))} с`;
    const status=this.$('.m03-status');status.hidden=blocked||m.ride;
    const task=m.fuseRemaining!==null?` · ПОДРЫВ ${Math.ceil(m.fuseRemaining)} с`:
      m.wave?` · ВОЛНА ${m.wave}/2 · ${clock(m.waveRemaining)}`:m.objective==='breach'?` · ЗАРЯДЫ ${m.charges.filter(Boolean).length}/2`:'';
    status.textContent=`АПТЕЧКИ ${p.medkits} · ШПРИЦЫ ${p.syringes} · СПАСЕНО ${m.flags.brigade_saved}/8${task}`;
    const binds=this.$('.m03-bindings');binds.hidden=blocked||m.ride;
    binds.textContent=`F1 ИДТИ · F2 ДЕРЖАТЬ · F3 ШТУРМ · F4 ПРИКРОЙ · Q МЕДИК${m.smokeGrenades?' · T ДЫМ':''}`;
    this.mapCanvas.hidden=blocked||m.ride;
    if(!this.mapCanvas.hidden&&performance.now()>=(this.nextMap??0)){this.nextMap=performance.now()+150;this.drawMap(state,p);}
    this.$('.m03-cinematic').hidden=!cutscene||end;
    const ending=this.$('.campaign-ending');ending.classList.toggle('hidden',!end);
    if(end){
      ending.querySelector('small').textContent=m.failed?'МИССИЯ ПРЕРВАНА':'МИССИЯ ЗАВЕРШЕНА';
      ending.querySelector('h2').textContent=m.failed?'Колонна потеряла Мартена':'Штаб удержан';
      ending.querySelector('p').textContent=m.failed??'Карта маршрута противника у Мартена. Следующая цель — переправа.';
      ending.querySelector('.campaign-final-stats').textContent=`СПАСЕНО ${m.flags.brigade_saved}/8 · ВРЕМЯ ${clock(m.stats.elapsedSeconds)}`;
      this.$('.campaign-retry').hidden=!m.failed;
    }
    if(end&&!this.ended){this.clearControls();document.exitPointerLock?.();}this.ended=end;
    this.voice.update(state,this.locale,paused||end);this.score.update(state,paused);
  }
  drawMap(state,p){
    const ctx=this.mapCanvas.getContext('2d'),size=168,scale=1.55,half=size/2;
    const x=value=>half+(value-p.x)*scale,z=value=>half+(value-p.z)*scale;
    ctx.fillStyle='#141b1be8';ctx.fillRect(0,0,size,size);
    for(const h of this.renderer.map.structures){
      ctx.fillStyle=h.enterable?'#6e6351':'#373c38';
      ctx.fillRect(x(h.x-h.w/2),z(h.z-h.d/2),h.w*scale,h.d*scale);
    }
    for(const panel of this.renderer.map.interactives)if(panel.type==='door'){
      const id=panel.id.split('-door-')[0],status=state.campaign.roomStatus[id];
      ctx.fillStyle=status==='clear'?'#acd798':'#d8a263';
      ctx.fillRect(x(panel.part.x)-1.5,z(panel.part.z)-1,3,2);
    }
    const target=state.campaign.target;
    if(target){ctx.fillStyle='#f2cc82';ctx.beginPath();ctx.arc(x(target.x),z(target.z),4,0,Math.PI*2);ctx.fill();}
    ctx.fillStyle='#eb835c';
    for(const enemy of state.players){
      if(enemy.team===p.team||!enemy.alive)continue;
      const dx=x(enemy.x)-half,dz=z(enemy.z)-half;
      const distance=Math.max(Math.abs(dx),Math.abs(dz));
      const ratio=Math.min(1,(half-5)/Math.max(1,distance));
      ctx.beginPath();ctx.arc(half+dx*ratio,half+dz*ratio,3,0,Math.PI*2);ctx.fill();
    }
    ctx.fillStyle='#c3ecdf';ctx.beginPath();ctx.arc(half,half,3.5,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#c3ecdf';ctx.beginPath();ctx.moveTo(half,half);ctx.lineTo(half-Math.sin(p.yaw)*12,half-Math.cos(p.yaw)*12);ctx.stroke();
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
  render(r,state,dt,view){
    const m=state.campaign;if(m?.missionId!=='m03')return;
    this.syncPanels(m);
    const indoors=m.inside&&!m.cutscene;
    r.sunOffset.set(30,126,16);r.sun.intensity=2.1;
    r.hemiLight.intensity=THREE.MathUtils.damp(r.hemiLight.intensity,indoors?1.17:1.56,6,dt);
    r.ambientLight.intensity=THREE.MathUtils.damp(r.ambientLight.intensity,indoors?.22:.29,6,dt);
    if(m.ride){
      const transport=state.vehicles.find(v=>v.id==='sokol-7');
      if(transport&&state.players.some(p=>p.id==='local'&&p.vehicleId===transport.id)){
        const heading=transport.yaw+Math.PI;
        const delta=THREE.MathUtils.clamp(wrapped((view.yaw??heading)-heading),-2.094,2.094);
        r.camera.rotation.set(view.pitch??0,heading+delta,0,'YXZ');
      }
      r.weapon.visible=false;
    }
    if(m.cutscene){
      const t=THREE.MathUtils.clamp(m.cutscene.elapsed/9,0,1);
      r.camera.position.set(173.25-t*.9,1.7,-8.55-t*.4);r.camera.lookAt(174.68,1.38,-11);
      r.weapon.visible=false;
    }
    this.glint.visible=m.sniperFlash;
    r.camera.updateMatrixWorld();
    if(!this.fires){
      const convoy=state.vehicles.filter(v=>v.convoyIndex!==undefined);
      const emitters=[convoy[0],convoy.at(-1)].filter(Boolean).map(v=>({...m03ConvoyPose(this.definition,v.convoyIndex,this.definition.convoy.ambushAt),id:v.id,width:2.2,height:3.4}));
      this.fires=new CampaignFire(r,this.props,emitters);
    }
    this.fires.update({light:'dawn'},state.time,r.camera,new Set(state.vehicles.filter(v=>v.hp<=0).map(v=>v.id)));
    const objective=m.target&&!m.ride&&!m.cutscene&&!m.failed&&!m.complete?m.target:null;
    const screen=objective?r.project(objective.x,r.map.terrain.heightAt(objective.x,objective.z)+2.9,objective.z):null;
    const marker=placeCampaignMarker(screen,r.viewportWidth,r.viewportHeight);this.marker.hidden=!marker;
    if(marker){this.marker.style.transform=`translate(${marker.x}px,${marker.y}px) translate(-50%,-50%)`;
      const p=state.players.find(p=>p.id==='local');this.marker.textContent=`◇ ${Math.round(Math.hypot(p.x-objective.x,p.z-objective.z))} М`;}
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
    this.root.remove();document.body.classList.remove('campaign-active','campaign-m03-active','campaign-m03-ride','campaign-cinematic','campaign-downed');
  }
}
