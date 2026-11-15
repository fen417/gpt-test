import * as THREE from 'three';
import {tankMuzzle} from '../../shared/tank.js';
import './mission2.css';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const clock=value=>`${String(Math.floor(value/60)).padStart(2,'0')}:${String(Math.floor(value%60)).padStart(2,'0')}`;

export class Mission2Presentation {
  constructor(session,{renderer,audio,leave,clearControls,resume}){
    this.session=session;this.definition=session.definition;this.locale=session.locale;
    this.renderer=renderer;this.combat=audio;this.leave=leave;this.resume=resume;
    this.clearControls=clearControls;this.isZoom=false;this.closed=false;
    this.audioMissing=false;this.audioLoading=false;this.music=null;
    this.lastDriftWarning=0;this.lastClockSent=0;
    this.root=document.createElement('section');this.root.className='campaign-ui campaign-m02';
    this.root.setAttribute('aria-label','Миссия 2 — Рассвет над Аль-Хадрой');
    this.root.innerHTML=`<header class="m02-objective">
      <small>ОПЕРАЦИЯ «ПЕСОК И СТАЛЬ» / СЕКТОР 02</small>
      <strong class="m02-objective-text"></strong>
      <span class="m02-mission-status"></span>
    </header>
    <aside class="m02-company"><small>РОТА «СОКОЛ» · ТАНКИ В СТРОЮ</small><div class="m02-tanks"></div></aside>
    <div class="m02-reticle"><span class="m02-aimdot">+</span><span class="m02-bore-dot">◇</span><i class="m02-dispersion"></i></div>
    <aside class="m02-weapon-panel"><strong class="m02-weapon"></strong><span class="m02-ammo"></span><span class="m02-hp"></span></aside>
    <aside class="m02-radio"><small>ЧАСТОТА «МАЯК»</small><b class="m02-radio-speaker"></b><span class="m02-radio-text"></span></aside>
    <p class="m02-controls">W/S · ХОД &nbsp; A/D · ПОВОРОТ &nbsp; ПРОБЕЛ · ТОРМОЗ &nbsp; 1/2/3 · СНАРЯДЫ/ПУЛЕМЁТ &nbsp; F1–F4 · ПРИКАЗЫ &nbsp; H · РЕМОНТ</p>
    <div class="m02-briefing">
      <div class="m02-briefing-caption">АЛЬ-ХАДРА · 05:12</div>
      <div class="m02-briefing-subtitle"></div>
      <button type="button" class="m02-skip">ПРОПУСТИТЬ БРИФИНГ · ПРОБЕЛ ↗</button>
    </div>
    <div class="m02-finale" hidden>
      <span class="m02-finale-kicker"></span><h2 class="m02-finale-title"></h2>
      <p class="m02-finale-text"></p><div class="m02-finale-stats"></div>
      <button type="button" class="m02-restart">НАЧАТЬ С КОНТРОЛЬНОЙ ТОЧКИ</button>
      <button type="button" class="m02-return">К ЭКРАНУ КАМПАНИИ ↗</button>
    </div>`;
    document.body.append(this.root);
    this.$=query=>this.root.querySelector(query);
    this.$('.m02-skip').onclick=()=>{clearControls();session.command({type:'skip'});resume();};
    this.$('.m02-restart').onclick=()=>{clearControls();session.command({type:'retry'});resume();};
    this.$('.m02-return').onclick=leave;
    this.original={background:renderer.scene.background?.clone(),fogColor:renderer.scene.fog.color.clone(),
      fogDensity:renderer.scene.fog.density,sunColor:renderer.sun.color.clone(),
      sunIntensity:renderer.sun.intensity,sunOffset:renderer.sunOffset.clone(),
      hemiIntensity:renderer.hemiLight.intensity,ambientIntensity:renderer.ambientLight.intensity};
    this.direction=new THREE.Vector3();
    this.renderHook=(r,state,dt,view)=>this.render(r,state,dt,view);
    this.onKeyUp=event=>{if(event.code==='ShiftLeft'||event.code==='ShiftRight')this.isZoom=false;};
    document.addEventListener('keyup',this.onKeyUp);
  }
  key(event){
    const m=this.session.state?.campaign;if(!m||event.repeat)return false;
    if(m.cutscene&&(event.code==='Space'||event.code==='Enter')){
      this.session.command({type:'skip'});this.resume();return true;
    }
    if(m.failed||m.complete)return false;
    const modes={Digit1:'ap',Digit2:'he',Digit3:'mg'};
    if(modes[event.code]){this.session.command({type:'weapon',mode:modes[event.code]});return true;}
    const orders={F1:'forward',F2:'fire',F3:'hold',F4:'help'};
    if(orders[event.code]){this.session.command({type:'order',order:orders[event.code]});return true;}
    if(event.code==='KeyH'){this.session.command({type:'repair'});return true;}
    if(event.code==='KeyX'){this.session.command({type:'targetLock'});return true;}
    if(event.code==='KeyR'){this.session.command({type:'cruise'});return true;}
    if(event.code==='ShiftLeft'||event.code==='ShiftRight'){this.isZoom=true;return false;}
    return false;
  }
  playMusicAt(seconds){
    const ctx=this.combat.ctx,buffer=this.musicBuffer;
    if(this.closed||this.music||!ctx||ctx.state!=='running'||!buffer)return;
    const loopStart=Math.max(0,Number(this.definition.music.loopStart??148));
    const loopEnd=Math.min(buffer.duration,Number(this.definition.music.loopEnd??188));
    const loop=loopEnd>loopStart+.5&&buffer.duration>=loopEnd;
    // Start at current combat time, even after a long pause or delayed decode.
    const offset=loop&&seconds>=loopEnd?loopStart+(seconds-loopEnd)%(loopEnd-loopStart):
      Math.min(Math.max(0,seconds),Math.max(0,buffer.duration-.02));
    const source=ctx.createBufferSource(),gain=ctx.createGain();
    source.buffer=buffer;source.loop=loop;
    if(loop){source.loopStart=loopStart;source.loopEnd=loopEnd;}
    gain.gain.value=0;source.connect(gain);gain.connect(ctx.destination);
    source.start(0,offset);
    this.music={source,gain,ctx,originTime:ctx.currentTime-seconds};
  }
  stopMusic(){
    if(!this.music)return;
    try{this.music.source.stop();}catch{}
    this.music.source.disconnect();this.music.gain.disconnect();
    this.music=null;
  }
  async loadMusic(m){
    if(this.closed||this.audioMissing||this.audioLoading||this.music)return;
    const ctx=this.combat.ctx;if(!ctx)return;
    if(this.musicBuffer){this.playMusicAt(m.time);return;}
    this.audioLoading=true;
    try{
      const sourceUrl=new URL(`${import.meta.env.BASE_URL}campaign/m02/${this.definition.music.intro}`,location.href);
      const response=await fetch(sourceUrl);
      if(!response.ok)throw Error('Музыкальный файл миссии 2 пока не добавлен');
      this.musicBuffer=await ctx.decodeAudioData(await response.arrayBuffer());
      if(!this.closed&&!this.paused&&this.session.state?.campaign?.missionId==='m02')
        this.playMusicAt(this.session.state.campaign.time);
    }catch(error){
      // Missing optional track is not a mission error. Use existing
      // background music and keep clock triggers on deterministic sim time.
      this.audioMissing=true;
    }finally{this.audioLoading=false;}
  }
  update(state,paused){
    const m=state?.campaign;if(m?.missionId!=='m02')return;
    this.paused=paused;this.root.classList.toggle('campaign-ui-paused',paused);
    document.body.classList.add('campaign-active','campaign-m02-active');
    document.body.classList.toggle('campaign-cinematic',Boolean(m.cutscene));
    const phase=this.locale.objectives[m.phase]??m.phase;
    this.$('.m02-objective-text').textContent=phase;
    this.$('.m02-mission-status').textContent=m.cutscene
      ?'АЛЬ-ХАДРА / 05:12 · БРИФИНГ'
      :`БОЙ ${clock(m.time)} · ПРОТИВНИК: ${m.enemyTanksAlive}/${m.enemyTanksSpawned} · ${m.order.toUpperCase()}`;
    if(performance.now()>=(this.nextCompanyHudUpdate??0)){
      this.nextCompanyHudUpdate=performance.now()+250;
      const tanks=this.$('.m02-tanks');tanks.replaceChildren();
      for(const v of state.vehicles.filter(v=>v.type==='tank'&&v.team===0).slice(0,10)){
      const row=document.createElement('div');row.className='m02-tank-status';
      if(v.hp<=0)row.classList.add('destroyed');
      if(v.id==='sokol-7')row.classList.add('player');
      const name=document.createElement('span');name.textContent=v.id.replace('sokol-','СОКОЛ-');
      const bar=document.createElement('i'),fill=document.createElement('em');
      fill.style.width=`${Math.round(clamp(v.hp/v.maxHp,0,1)*100)}%`;bar.append(fill);
      const hp=document.createElement('b');hp.textContent=v.hp<=0?'ПОТЕРЯН':`${Math.ceil(v.hp/v.maxHp*100)}%`;
        row.append(name,bar,hp);tanks.append(row);
      }
    }
    const v=state.vehicles.find(v=>v.id==='sokol-7');
    this.$('.m02-weapon').textContent=m.weaponMode==='mg'?'СПАРЕННЫЙ ПУЛЕМЁТ':
      m.shell==='he'?'ОФ · ФУГАСНЫЙ':'ББ · БРОНЕБОЙНЫЙ';
    this.$('.m02-ammo').textContent=v
      ?m.weaponMode==='mg'?'∞ · ПЕРЕГРЕВ '+Math.round(v.heat*100)+'%':
        `${v.shellAmmo?.[m.shell]??v.cannonAmmo} СНАРЯДОВ · ПЕРЕЗАРЯДКА ${Math.max(0,v.cannonReadyAt-state.time).toFixed(1)} С`:'';
    this.$('.m02-hp').textContent=v?`Т-72 «СОКОЛ-7» · ${Math.max(0,Math.ceil(v.hp))} / ${v.maxHp} HP`:'';
    const line=this.locale.lines[m.radio?.key];
    this.$('.m02-radio').classList.toggle('active',Boolean(line));
    this.$('.m02-radio-speaker').textContent=line?this.locale.speakers[line.speaker]??'':'';
    this.$('.m02-radio-text').textContent=line?.text??'';
    const briefing=Boolean(m.cutscene);this.$('.m02-briefing').hidden=!briefing;
    this.$('.m02-briefing-subtitle').textContent=briefing?line?.text??'':'';
    const end=Boolean(m.failed||m.complete),finale=this.$('.m02-finale');finale.hidden=!end;
    if(end){
      this.$('.m02-finale-kicker').textContent=m.complete?'ОПЕРАЦИЯ ЗАВЕРШЕНА':'МИССИЯ НЕ ЗАВЕРШЕНА';
      this.$('.m02-finale-title').textContent=m.complete?'Аль-Хадра удержана.':'Танк потерян.';
      this.$('.m02-finale-text').textContent=m.complete?'Трофейный приказ указывает на карьер. Частота «Маяк» остаётся у бригады.':m.failed;
      this.$('.m02-finale-stats').textContent=`ВРЕМЯ ${clock(m.stats.elapsedSeconds)} · ТАНКОВ В СТРОЮ ${m.tanksAlive}/10 · ПОТЕРИ ${m.alliedLosses}`;
      this.$('.m02-restart').hidden=m.complete;
    }
    if(paused||end||m.cutscene)this.stopMusic();
    else this.loadMusic(m);
    if(this.music){
      const slider=document.getElementById('music-volume');
      const setting=clamp(Number(slider?.value??this.combat.musicVolume),0,1);
      this.music.gain.gain.setTargetAtTime(!paused&&!end&&this.combat.enabled
        ?this.combat.volume*setting*.9:0,this.music.ctx.currentTime,.2);
      const played=this.music.ctx.currentTime-this.music.originTime;
      if(!paused&&!end&&Math.abs(played-m.time)>.1
        &&performance.now()-this.lastDriftWarning>10000){
        this.lastDriftWarning=performance.now();
        console.warn('Campaign M02 music/simulation clock drift',Math.round((played-m.time)*1000)+'ms');
      }
    }
  }
  render(r,state,dt,view={}){
    const m=state.campaign;if(m?.missionId!=='m02')return;
    const t=clamp(m.time/this.definition.timing.expectedDurationSeconds,0,1);
    // Dawn grows from the enemy's east to a warmer morning as the mission
    // progresses. Values remain editable in the mission's art direction.
    r.scene.background.setRGB(.62+.15*t,.57+.18*t,.56+.14*t);
    r.scene.fog.color.copy(r.scene.background);r.scene.fog.density=.0019-.0005*t;
    r.sun.color.setRGB(1,.78+.15*t,.56+.28*t);r.sun.intensity=1.6+1.2*t;
    r.hemiLight.intensity=1.55+.55*t;r.ambientLight.intensity=.23+.15*t;
    r.sunOffset.set(105,38+25*t,85);
    const v=state.vehicles.find(v=>v.id==='sokol-7');
    if(v&&!m.cutscene&&this.isZoom){
      const muzzle=tankMuzzle(v);
      r.camera.position.set(muzzle.x,muzzle.y+.12,muzzle.z);
      r.camera.rotation.set(v.aimPitch,v.aimYaw,0,'YXZ');
      const zoom=view.campaignTankZoom??2.5;
      r.camera.fov=THREE.MathUtils.radToDeg(2*Math.atan(
        Math.tan(THREE.MathUtils.degToRad(view.fov??85)*.5)/zoom));
      r.camera.updateProjectionMatrix();
    }
    this.root.classList.toggle('m02-sniper-mode',Boolean(v&&!m.cutscene&&this.isZoom));
    const bore=this.$('.m02-bore-dot'),aimdot=this.$('.m02-aimdot'),dispersion=this.$('.m02-dispersion');
    if(v&&!m.cutscene){
      const mouth=tankMuzzle(v),d=300,point=r.project(mouth.x-Math.sin(v.aimYaw)*d,
        mouth.y+Math.sin(v.aimPitch)*d,mouth.z-Math.cos(v.aimYaw)*d);
      bore.hidden=!point.visible;
      if(point.visible)bore.style.transform=`translate(${point.x}px,${point.y}px) translate(-50%,-50%)`;
      const radius=12+Math.min(90,Math.abs(v.speed)*3.7);
      dispersion.style.width=dispersion.style.height=`${radius*2}px`;
      aimdot.hidden=false;
    }else{bore.hidden=true;aimdot.hidden=true;}
    if(m.cutscene){
      const path=this.definition.briefing.camera,progress=clamp(m.cutscene.elapsed/m.cutscene.duration,0,1),
        scaled=progress*(path.length-1),index=Math.floor(scaled),f=scaled-index;
      const a=path[Math.min(index,path.length-1)],b=path[Math.min(index+1,path.length-1)];
      r.camera.position.set(a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f,a[2]+(b[2]-a[2])*f);
      r.camera.lookAt(-900,1,-555);
      r.camera.updateMatrixWorld();
    }
  }
  dispose(){
    this.closed=true;document.removeEventListener('keyup',this.onKeyUp);
    this.stopMusic();
    this.root.remove();document.body.classList.remove('campaign-active','campaign-m02-active','campaign-cinematic');
    const r=this.renderer,o=this.original;
    if(o.background)r.scene.background.copy(o.background);
    r.scene.fog.color.copy(o.fogColor);r.scene.fog.density=o.fogDensity;
    r.sun.color.copy(o.sunColor);r.sun.intensity=o.sunIntensity;
    r.sunOffset.copy(o.sunOffset);r.hemiLight.intensity=o.hemiIntensity;
    r.ambientLight.intensity=o.ambientIntensity;
  }
}
