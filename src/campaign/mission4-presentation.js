import * as THREE from 'three';
import {CampaignAudio} from './audio.js';
import {ColumnMusic} from './column-music.js';
import {placeCampaignMarker} from './markers.js';
import {getAssetColliders} from '../../shared/asset-colliders.js';
import {SAFRA_GUN,SAFRA_MINES,SAFRA_SLABS,SAFRA_WATER} from '../../shared/campaign/safra.js';
import './mission4.css';

const orders={F1:'follow',F2:'hold',F4:'cover',KeyQ:'revive'};
const orderLabels={follow:'ВПЕРЁД',hold:'ДЕРЖАТЬ',cover:'ПРИКРОЙ',revive:'РЕАНИМАЦИЯ'};
const directions={road:'→ Восточная дорога',north:'↑ Северный арык',south:'↓ Южный овраг'};
const clock=value=>{
  const n=Math.ceil(Math.max(0,value??0));
  return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
};
const scenes={
  briefing:{dur:'briefing',title:'ТРОЕ СУТОК СПУСТЯ · САФРА · 17:40',
    camera:[[-334,2.55,39.7],[-333,2.45,39.3],[-331.8,2.4,39.3]],target:[[-330,.92,38],[-330,.92,38],[-328.5,1.4,40]]},
  issue:{dur:'issue',title:'ОПЕРАЦИЯ «ПЕРЕПРАВА»',
    camera:[[-336,1.67,41.8],[-335.5,1.75,40.5],[-334.5,1.65,39.3]],target:[[-332,.95,38],[-331,.9,38],[-330,.9,38]]},
  ridgeScene:{dur:'ridge',title:'ЗАПАДНЫЙ БЕРЕГ САФРЫ',
    camera:[[-245,3.2,-17],[-224,4.4,-20],[-203,6,-19]],target:[[-217,.6,-20],[-164,1.3,5],[-88,1.5,24]]},
  finale:{dur:'finale',title:'ЭЛЬ-КАСР · ПОСЛЕ ЗАКАТА',
    camera:[[31,2.7,9],[26,3.1,9],[21,4.6,12],[40,6.5,13]],target:[[-14,1.5,0],[10,1.4,0],[35,1.6,0],[73,1.75,0]]},
};
function bridgeMusicCue(state){
  const m=state.campaign;
  if(m.stage==='finale')return {tracks:{},offset:0};
  if(m.defenceRemaining!==null)return {tracks:{defence:.65},offset:m.time-m.stageAt};
  if(['ridge','field','assault','prepare'].includes(m.stage))return {tracks:{field:.48},offset:m.combatTime};
  return {tracks:{briefing:m.stage==='ridgeScene'?.62:.38},offset:m.time};
}

export class Mission4Presentation{
  constructor(session,{renderer,audio,leave,clearControls,resume,getBindings,keyLabel}){
    Object.assign(this,{session,renderer,audio,leave,clearControls,resume,getBindings,keyLabel,definition:session.definition,locale:session.locale});
    const audioRoot=new URL(`${import.meta.env.BASE_URL}campaign/m04/`,location.href);
    this.voice=new CampaignAudio(audio,audioRoot,this.definition);
    this.score=new ColumnMusic(audio,audioRoot,this.definition,bridgeMusicCue);
    this.root=document.createElement('section');
    this.root.className='campaign-ui campaign-m04';
    this.root.setAttribute('aria-label','Миссия 4 — Мост');
    this.root.innerHTML=`
      <header class="campaign-objective m04-objective"><small>САФРА · ОПЕРАЦИЯ «ПЕРЕПРАВА»</small><strong></strong><span></span></header>
      <div class="m04-warning" role="status" hidden></div>
      <div class="m04-flanks" aria-hidden="true"><span data-lane="north">↑ СЕВЕР</span><span data-lane="road">→ ДОРОГА</span><span data-lane="south">↓ ЮГ</span></div>
      <div class="campaign-subtitle hidden" aria-live="polite"><b></b><span></span></div>
      <div class="m04-interaction" hidden><span></span><progress max="1" value="0" hidden></progress></div>
      <div class="m04-injury" hidden><b>ТЯЖЁЛОЕ РАНЕНИЕ</b><span></span></div>
      <div class="m04-armour" hidden></div><div class="m04-feedback" hidden></div>
      <aside class="m04-defence" hidden><small></small><b></b><span></span></aside>
      <aside class="m04-weapon" hidden><b></b><span></span><meter min="0" max="1" value="0" hidden aria-label="Нагрев ствола"></meter><small></small></aside>
      <canvas class="m04-map" width="184" height="140" role="img" aria-label="Схема переправы" hidden></canvas>
      <span class="m04-marker" hidden></span>
      <div class="m04-cinematic" hidden><b></b><button type="button">Пропустить · пробел ↵</button></div>
      <section class="campaign-ending campaign-card hidden"><small></small><h2></h2><p></p>
        <button type="button" class="campaign-retry">С контрольной точки</button><button type="button" class="campaign-exit">В меню</button></section>`;
    document.body.append(this.root);
    this.$=selector=>this.root.querySelector(selector);
    this.$('.campaign-retry').onclick=()=>this.command('retry');
    this.$('.campaign-exit').onclick=leave;
    this.$('.m04-cinematic button').onclick=()=>this.command('skip');
    this.sceneCameras=Object.fromEntries(Object.entries(scenes).map(([name,scene])=>[name,{
      camera:this.curve(scene.camera),target:this.curve(scene.target),
    }]));
    this.position=new THREE.Vector3();this.target=new THREE.Vector3();
    const haze=renderer.atmosphere.sky.material.uniforms;
    this.initial={
      fog:renderer.scene.fog.color.clone(),density:renderer.scene.fog.density,background:renderer.scene.background.clone(),
      sun:renderer.sun.color.clone(),sunPower:renderer.sun.intensity,sunOffset:renderer.sunOffset.clone(),
      hemi:renderer.hemiLight.intensity,ambient:renderer.ambientLight.intensity,
      haze:haze.hazeAmount.value,hazeColor:haze.hazeTint.value.clone(),
    };
    this.skyColor=new THREE.Color();this.sunColor=new THREE.Color();
    this.palette=['#ca9c73','#a35545','#33486d'].map(color=>new THREE.Color(color));
    this.solar=['#ffcb8d','#f88f65','#859cde'].map(color=>new THREE.Color(color));
    this.art=new THREE.Group();this.art.name='safra-presentation';
    renderer.worldRoot.add(this.art);
    this.waterTime={value:0};
    const surface=new THREE.MeshLambertMaterial({color:0x637e7a,transparent:true,opacity:.86,depthWrite:false});
    surface.onBeforeCompile=shader=>{
      shader.uniforms.safraClock=this.waterTime;
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 riverUv;')
        .replace('#include <uv_vertex>','#include <uv_vertex>\nriverUv=uv;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec2 riverUv;uniform float safraClock;')
        .replace('#include <color_fragment>',`#include <color_fragment>
          float ripple=sin(riverUv.y*1590.0+sin(riverUv.x*33.0)*2.1-safraClock*1.55);
          float swell=sin(riverUv.x*83.0-riverUv.y*251.0+safraClock*.91);
          diffuseColor.rgb *= .93 + ripple*.075 + swell*.049;`);
    };
    this.water=new THREE.Mesh(new THREE.PlaneGeometry(SAFRA_WATER.w,SAFRA_WATER.d),
      surface);
    this.water.position.set(0,SAFRA_WATER.y,0);this.water.rotation.x=-Math.PI/2;
    this.art.add(this.water);
    const concrete=new THREE.MeshLambertMaterial({color:0xa59578});
    this.slabs=renderer.map.boxes.filter(box=>SAFRA_SLABS.includes(box.id)).map(box=>({
      box,mesh:this.box(this.art,[box.w,box.h,box.d],[box.x,box.baseY+box.h*.5,box.z],concrete),
    }));
    this.gun=new THREE.Group();this.gun.position.set(SAFRA_GUN.x+.3,4.58,SAFRA_GUN.z);this.art.add(this.gun);
    const metal=new THREE.MeshLambertMaterial({color:0x36372f});
    this.box(this.gun,[.27,.20,.76],[0,0,-.03],metal);
    this.box(this.gun,[.062,.062,.76],[0,.02,-.74],metal);
    this.box(this.gun,[.67,.34,.065],[0,-.08,-.26],metal);
    this.box(this.art,[.23,1.35,.23],[SAFRA_GUN.x+.3,3.73,SAFRA_GUN.z],metal);
    this.box(this.art,[.55,.60,.50],[SAFRA_GUN.x-.36,3.31,SAFRA_GUN.z+.47],metal);
    const mapMaterial=new THREE.MeshLambertMaterial({color:0xc9b28a});
    const tabletop=renderer.map.terrain.heightAt(-330,38)+1;
    this.box(this.art,[1.99,.03,1.48],[-330,tabletop,38],mapMaterial);
    const blue=new THREE.MeshLambertMaterial({color:0x4f7990}),red=new THREE.MeshLambertMaterial({color:0x9b4f3b});
    this.box(this.art,[.21,.025,1.47],[-329.9,tabletop+.021,38],blue);
    this.box(this.art,[.48,.03,.10],[-329.91,tabletop+.039,38.16],metal);
    for(const [x,z] of [[-330.49,37.68],[-330.48,38.10],[-330.21,38.3],[-330.15,37.77]])
      this.box(this.art,[.12,.04,.08],[x,tabletop+.036,z],red);
    const gearY=renderer.map.terrain.heightAt(-332.9,38.7);
    this.box(this.art,[.51,.51,1.25],[-332.9,gearY+.25,38.7],metal);
    this.box(this.art,[.51,.39,.84],[-332.88,gearY+.205,37.49],metal);
    const launcher=new THREE.Mesh(new THREE.CylinderGeometry(.082,.095,1.47,10),new THREE.MeshLambertMaterial({color:0x6d7656}));
    launcher.rotation.x=Math.PI/2;launcher.rotation.z=.17;
    launcher.position.set(-332.9,gearY+.59,38.53);this.art.add(launcher);
    const crates=new THREE.MeshLambertMaterial({color:0x94794e});
    this.supplyProps=new Map();
    const cone=new THREE.MeshLambertMaterial({color:0x6d6d52});
    this.helmet=new THREE.Mesh(new THREE.SphereGeometry(.14,10,6,0,Math.PI*2,0,Math.PI/2),cone);
    this.helmet.position.set(38.5,.69,3.05);this.art.add(this.helmet);this.helmet.visible=false;
    this.makeCrate=s=>{
      const at=renderer.map.terrain.heightAt(s.x,s.z);
      return this.box(this.art,[.95,.39,.59],[s.x,at+.20,s.z],crates);
    };
    this.mortarMarkers=Array.from({length:4},()=>{
      const mesh=new THREE.Mesh(new THREE.RingGeometry(2.7,2.95,32),new THREE.MeshBasicMaterial({
        color:0xfc8a54,transparent:true,opacity:.75,side:THREE.DoubleSide,depthWrite:false,
      }));
      mesh.rotation.x=-Math.PI/2;this.art.add(mesh);return mesh;
    });
    this.renderHook=(r,state,dt,view)=>this.render(r,state,dt,view);
  }
  box(parent,dims,at,mat){
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(...dims),mat);
    mesh.position.set(...at);parent.add(mesh);return mesh;
  }
  curve(points){
    return new THREE.CatmullRomCurve3(points.map(([x,y,z])=>new THREE.Vector3(x,y+this.renderer.map.terrain.heightAt(x,z),z)));
  }
  command(type){
    this.clearControls();this.session.command({type});
    if(type==='retry'||this.session.state?.campaign.cutscene?.id!=='finale')this.resume();
  }
  key(event){
    const m=this.session.state?.campaign;
    if(!m||event.repeat)return false;
    if(m.cutscene&&(event.code==='Space'||event.code==='Enter')){
      this.command('skip');return true;
    }
    if(m.complete||m.failed)return false;
    if(m.mounted&&event.code==='KeyT'){this.session.command({type:'barrel'});return true;}
    if(orders[event.code]){this.session.command({type:'order',order:orders[event.code]});return true;}
    return false;
  }
  drawMap(m,p){
    const canvas=this.$('.m04-map'),ctx=canvas.getContext('2d');
    ctx.clearRect(0,0,canvas.width,canvas.height);
    const center=92,scale=.25,translate=o=>[center+(o.x+8)*scale,69+o.z*scale];
    ctx.fillStyle='#7d8c7152';ctx.fillRect(83,0,15,140);
    ctx.fillStyle='#d5bf956e';ctx.fillRect(0,67,184,4);
    ctx.fillStyle='#b45b4d72';
    for(const mine of SAFRA_MINES){const [x,z]=translate(mine);ctx.fillRect(x-mine.w*.125,z-mine.d*.125,mine.w*.25,mine.d*.25);}
    const dot=(entity,color,r)=>{const [x,z]=translate(entity);ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,z,r,0,Math.PI*2);ctx.fill();};
    for(const supply of m.supplies)dot(supply,'#9ac0a6',1.4);
    for(const t of m.tanks)dot(t,t.warning?'#ffb76d':'#e2745d',2.6);
    for(const sapper of m.sappers)if(sapper.alive&&['assault','prepare','defence'].includes(m.stage))dot(sapper,sapper.downed?'#df8839':'#83c8be',1.8);
    dot(m.target,'#e9c892',3);dot(p,'#fff7dc',2.7);
  }
  update(state,paused){
    const m=state?.campaign,p=state?.players.find(p=>p.id==='local');
    if(m?.missionId!=='m04'||!p)return;
    const end=Boolean(m.failed||m.complete),cut=Boolean(m.cutscene&&!end),blocked=end||cut;
    document.body.classList.add('campaign-active','campaign-m04-active');
    document.body.classList.toggle('campaign-cinematic',cut);
    document.body.classList.toggle('m04-mounted',m.mounted&&!blocked);
    this.root.classList.toggle('campaign-ui-paused',paused&&!end);
    const objective=this.$('.m04-objective');objective.hidden=blocked;
    objective.querySelector('strong').textContent=this.locale.objectives[m.objective];
    objective.querySelector('span').textContent=m.stage==='field'?`${m.fieldKilled}/4 ТАНКА · КП ${m.checkpoint}/4`:
      `КП ${m.checkpoint}/4 · ОТРЯД: ${orderLabels[m.order]}`;
    const line=this.locale.lines[m.radio?.key];
    const subtitle=this.$('.campaign-subtitle');subtitle.classList.toggle('hidden',!line||end);
    subtitle.querySelector('b').textContent=this.locale.speakers[line?.speaker]??'';
    subtitle.querySelector('span').textContent=line?.text??'';
    const prompt=this.$('.m04-interaction');prompt.hidden=blocked||!m.prompt;
    prompt.querySelector('span').textContent=(m.prompt??'').replace(/^E(?= ·)/,this.keyLabel(this.getBindings().interact));
    prompt.querySelector('progress').hidden=!m.progress;
    prompt.querySelector('progress').value=m.progress;
    const warning=this.$('.m04-warning');warning.hidden=blocked||!m.warning&&!m.mortars.length&&!m.nearMine;
    warning.textContent=m.nearMine?'МИННОЕ ПОЛЕ · ОБОЙДИТЕ КОЛЬЯ':m.mortars.length?'МИНОМЁТ · УЙДИТЕ ИЗ ОТМЕЧЕННОЙ ЗОНЫ':
      m.warning?`ВОЛНА ${m.warning.wave} ЧЕРЕЗ ${Math.ceil(m.warning.until-m.time)} С · ${m.warning.directions.map(key=>directions[key]).join('  ')}`:'';
    for(const arrow of this.root.querySelectorAll('.m04-flanks [data-lane]'))arrow.hidden=blocked||!m.warning?.directions.includes(arrow.dataset.lane);
    const injured=this.$('.m04-injury');injured.hidden=blocked||!p.downed;injured.querySelector('span').textContent=clock(p.downedTimer);
    const armour=this.$('.m04-armour');armour.hidden=blocked||!m.armor;
    armour.textContent=m.armor?`${m.armor.name} · ${m.armor.damage} УРОНА`:'';
    const feedback=this.$('.m04-feedback');feedback.hidden=blocked||!m.feedback;feedback.textContent=m.feedback??'';
    const defence=this.$('.m04-defence');
    defence.hidden=blocked||m.defenceRemaining===null&&m.prepareRemaining===null;
    defence.querySelector('small').textContent=m.stage==='prepare'?'ПОДГОТОВКА':'РАЗМИНИРОВАНИЕ';
    defence.querySelector('b').textContent=clock(m.defenceRemaining??m.prepareRemaining);
    defence.querySelector('span').textContent=`САПЁРЫ ${m.flags.sappers_alive}/3 · ВОЛНА ${m.wave}/5`;
    const weapon=this.$('.m04-weapon'),g=m.mg;
    weapon.hidden=blocked;
    weapon.querySelector('b').textContent=m.mounted?'СТАНКОВЫЙ ПУЛЕМЁТ':`ПТ-90 · ${p.rockets}/${this.definition.launcher.capacity}`;
    weapon.querySelector('span').textContent=m.mounted?
      `${g.rounds} · ЛЕНТ ${g.belts} · СТВОЛОВ ${g.barrels}`:`АПТЕЧКИ ${p.medkits} · ШПРИЦЫ ${p.syringes}`;
    const meter=weapon.querySelector('meter');meter.hidden=!m.mounted;meter.value=g.heat;
    weapon.querySelector('small').textContent=m.mounted?
      g.action?`${g.action==='reload'?'СМЕНА ЛЕНТЫ':'ЗАМЕНА СТВОЛА'} · ${clock(g.readyAt-m.time)}`:
        g.jammed?'ПЕРЕГРЕВ · T СМЕНИТЬ СТВОЛ':`${this.keyLabel(this.getBindings().reload)} ЛЕНТА · T СТВОЛ`:
      `${this.keyLabel(this.getBindings().secondaryGadget)} ПТ-90 · H ЛЕЧЕНИЕ`;
    const map=this.$('.m04-map');map.hidden=blocked;
    if(!blocked&&performance.now()>=(this.nextMapAt??0)){
      this.nextMapAt=performance.now()+100;this.drawMap(m,p);
    }
    const cinema=this.$('.m04-cinematic');cinema.hidden=!cut;
    cinema.querySelector('b').textContent=cut?scenes[m.cutscene.id].title:'';
    cinema.style.setProperty('--end-fade',m.cutscene?.id==='finale'?THREE.MathUtils.clamp((m.cutscene.elapsed-this.definition.scenes.finale+4)/4,0,1):0);
    const finale=this.$('.campaign-ending');finale.classList.toggle('hidden',!end);
    if(end){
      finale.querySelector('small').textContent=m.complete?'ОПЕРАЦИЯ ЗАВЕРШЕНА':'ОПЕРАЦИЯ ПРЕРВАНА';
      finale.querySelector('h2').textContent=m.complete?'Мост наш.':m.failed;
      finale.querySelector('p').textContent=m.complete?`Танков уничтожено ${m.flags.m4_tanks_killed}/8 · сапёры ${m.flags.sappers_alive}/3 · радиокод ${m.flags.m4_radio_code?'получен':'утрачен'}`:
        `Продолжить с ${m.checkpoint?`КП ${m.checkpoint}`:'начала операции'}.`;
      this.$('.campaign-retry').hidden=m.complete;
    }
    this.score.update(state,paused);
    this.audio.campaignMusicOverride=m.cutscene?.id==='finale'||this.score.voices.size>0;
    if(end&&!this.ended){this.clearControls();document.exitPointerLock?.();}
    this.ended=end;
    this.voice.update(state,this.locale,paused||end);
  }
  render(r,state,dt,view){
    const m=state.campaign;
    if(m?.missionId!=='m04')return;
    const sunset=m.cutscene?.id==='finale'?1.85+.15*THREE.MathUtils.clamp(m.cutscene.elapsed/40,0,1):
      2*THREE.MathUtils.clamp(m.combatTime/1500,0,.94);
    const index=Math.min(1,Math.floor(sunset)),f=sunset-index;
    this.skyColor.copy(this.palette[index]).lerp(this.palette[index+1],f);
    this.sunColor.copy(this.solar[index]).lerp(this.solar[index+1],f);
    r.scene.background.copy(this.skyColor);r.scene.fog.color.copy(this.skyColor);
    r.scene.fog.density=.00225+sunset*.00035;
    const haze=r.atmosphere.sky.material.uniforms;
    haze.hazeAmount.value=.78;haze.hazeTint.value.copy(this.skyColor).convertLinearToSRGB();
    r.sun.color.copy(this.sunColor);r.sun.intensity=Math.max(.44,2.5-sunset*1.02);
    r.sunOffset.set(-112,Math.max(3,47-sunset*24),-17);
    r.hemiLight.intensity=Math.max(.85,1.6-sunset*.29);r.ambientLight.intensity=.23;
    this.water.material.color.setRGB(.13-sunset*.035,.22-sunset*.058,.22-sunset*.036);
    this.waterTime.value=r.clock;
    this.gun.rotation.set(m.mg.pitch,m.mg.yaw,0,'YXZ');
    if(this.slabsFallen!==m.slabsFallen){
      this.slabsFallen=m.slabsFallen;
      for(const {box,mesh} of this.slabs){
        mesh.rotation.x=m.slabsFallen?1.5:0;
        mesh.position.y=box.baseY+(m.slabsFallen?.24:box.h*.5);
      }
      r.campaignCoverColliders=getAssetColliders(r.map).filter(box=>!m.slabsFallen||!SAFRA_SLABS.includes(box.id));
    }
    for(const s of m.supplies)if(!this.supplyProps.has(s.id))this.supplyProps.set(s.id,this.makeCrate(s));
    const visible=new Set(m.supplies.map(s=>s.id));
    for(const [id,prop] of this.supplyProps)prop.visible=visible.has(id);
    for(const [i,mesh] of this.mortarMarkers.entries()){
      const m4=m.mortars[i];mesh.visible=Boolean(m4);
      if(m4){mesh.position.set(m4.x,m4.y,m4.z);mesh.material.opacity=.48+.33*Math.sin(r.clock*12)**2;}
    }
    this.helmet.visible=m.memorial&&m.cutscene?.id==='finale'&&m.cutscene.elapsed>=6.5;
    if(this.helmet.visible){
      const placement=THREE.MathUtils.smootherstep(m.cutscene.elapsed,6.5,7.6);
      this.helmet.position.set(38.5,1.35-.66*placement,2.62+.43*placement);
    }
    if(m.cutscene){
      const scene=this.sceneCameras[m.cutscene.id],duration=this.definition.scenes[scenes[m.cutscene.id].dur];
      const t=THREE.MathUtils.clamp(m.cutscene.elapsed/duration,0,1);
      scene.camera.getPointAt(t,this.position);scene.target.getPointAt(t,this.target);
      r.camera.position.copy(this.position);r.camera.lookAt(this.target);
      r.camera.fov=m.cutscene.id==='briefing'?49:61;r.camera.updateProjectionMatrix();
      r.weapon.visible=false;r.scoped=false;r.updateSunShadow(this.target.x,this.target.z);
    }else if(m.mounted){
      r.camera.position.set(SAFRA_GUN.x+.3,4.82,SAFRA_GUN.z);
      r.camera.rotation.set(m.mg.pitch,m.mg.yaw,0,'YXZ');
      r.camera.fov=70;r.camera.updateProjectionMatrix();
      r.weapon.visible=false;r.scoped=false;r.updateSunShadow(SAFRA_GUN.x,SAFRA_GUN.z);
    }
    if(!view.paused&&r.effects.length<65&&r.clock>=(this.nextSmoke??0)){
      this.nextSmoke=r.clock+.4;
      for(const s of m.smoke)r.smoke(s.x+(Math.sin(r.clock+s.x)*s.radius*.5),s.y,s.z,s.radius*.63,3.2,
        s.radius>3?0xbeb4a5:0x554943,{rise:s.radius>3?.9:2.2,opacity:.68,wind:.3});
    }
    const marker=this.$('.m04-marker');
    r.camera.updateMatrixWorld();
    const point=m.target,projection=!m.cutscene&&!m.mounted&&!m.failed&&!m.complete&&
      r.project(point.x,r.map.terrain.heightAt(point.x,point.z)+2,point.z);
    const spot=projection&&placeCampaignMarker(projection,r.viewportWidth,r.viewportHeight);
    marker.hidden=!spot;
    if(spot){
      marker.style.transform=`translate(${spot.x}px,${spot.y}px) translate(-50%,-50%)`;
      marker.textContent=`◇ ${Math.round(Math.hypot(r.camera.position.x-point.x,r.camera.position.z-point.z))} М`;
    }
  }
  dispose(){
    this.voice.dispose();this.score.dispose();this.root.remove();
    this.audio.campaignMusicOverride=false;
    this.art.removeFromParent();
    const materials=new Set();
    this.art.traverse(o=>{o.geometry?.dispose();if(o.material)materials.add(o.material);});
    for(const m of materials)m.dispose();
    const r=this.renderer,i=this.initial,h=r.atmosphere.sky.material.uniforms;
    r.scene.background.copy(i.background);r.scene.fog.color.copy(i.fog);r.scene.fog.density=i.density;
    r.sun.color.copy(i.sun);r.sun.intensity=i.sunPower;r.sunOffset.copy(i.sunOffset);
    r.hemiLight.intensity=i.hemi;r.ambientLight.intensity=i.ambient;
    r.campaignCoverColliders=null;
    h.hazeAmount.value=i.haze;h.hazeTint.value.copy(i.hazeColor);
    document.body.classList.remove('campaign-active','campaign-m04-active','campaign-cinematic','m04-mounted');
  }
}
