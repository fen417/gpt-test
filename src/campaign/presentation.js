import * as THREE from 'three';
import {CampaignAudio} from './audio.js';
import {prepareViewModel} from '../viewmodel.js';

const presets={night:{fog:'#101b30',sun:'#a8c9ef',hemi:'#a2b9d7',ground:'#45434a',sunPower:.8,hemiPower:.52,ambient:.16,environment:.09},alarm:{fog:'#202538',sun:'#a4bfdf',hemi:'#b0bed5',ground:'#67564a',sunPower:1,hemiPower:.72,ambient:.22,environment:.12},dawn:{fog:'#a58e7c',sun:'#ffd19d',hemi:'#b8c5dd',ground:'#8e7560',sunPower:2,hemiPower:1.3,ambient:.3,environment:.45}};
export class CampaignPresentation {
  constructor(session,{renderer,audio,leave,clearControls,resume}){
    this.session=session;this.renderer=renderer;this.leave=leave;this.clearControls=clearControls;this.locale=session.locale;this.definition=session.definition;
    this.audio=new CampaignAudio(audio,new URL(`${import.meta.env.BASE_URL}campaign/m01/`,location.href),this.definition);
    this.root=document.createElement('section');this.root.className='campaign-ui';this.root.setAttribute('aria-label','Сюжетная миссия');
    this.root.innerHTML='<div class="campaign-objective"><small>ОПЕРАЦИЯ «ВЫСАДКА У ВАДИ»</small><strong></strong><span></span><p class="campaign-optional"></p></div><div class="campaign-detection"><span></span><meter min="0" max="1" value="0"></meter><b>▲</b></div><div class="campaign-subtitle" role="status" aria-live="polite"><b></b><span></span></div><div class="campaign-prompt"></div><div class="campaign-progress"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44"/><circle class="campaign-progress-fill" cx="50" cy="50" r="44"/></svg><span></span></div><div class="campaign-injury"><b>ТЯЖЁЛОЕ РАНЕНИЕ</b><strong></strong><span></span></div><div class="campaign-supplies"></div><div class="campaign-world-markers"></div><div class="campaign-cutscene"><span></span><button>Пробел / Enter · пропустить</button></div><div class="campaign-choice campaign-card hidden"><small>СНАРЯЖЕНИЕ / РЯДОВОЙ ЯН МАРТЕН</small><h2>До рассвета — одна ночь.</h2><p>Выберите набор. Оба маршрута позволяют выполнить задачу.</p><div><button data-loadout="silent"><b>Тихий</b><span>AR-416 с ПБС · нож · 2 гранаты</span></button><button data-loadout="loud"><b>Штурмовой</b><span>АК-12М · нож · 5 гранат</span></button></div><p>В обоих наборах: пистолет, ПТ-90, аптечки и шприцы.</p></div><div class="campaign-ending campaign-card hidden"><small></small><h2></h2><p></p><button class="campaign-retry">С последнего контрольного пункта</button><button class="campaign-exit">В главное меню</button></div>';
    document.body.append(this.root);this.$=selector=>this.root.querySelector(selector);
    this.$('.campaign-cutscene button').onclick=()=>this.session.command({type:'skip'});
    for(const b of this.root.querySelectorAll('[data-loadout]'))b.onclick=()=>{this.clearControls();this.session.command({type:'loadout',loadout:b.dataset.loadout});resume();};
    this.$('.campaign-retry').onclick=()=>{this.clearControls();this.session.command({type:'retry'});};
    this.$('.campaign-exit').onclick=leave;
    this.original={environment:renderer.scene.environment,environmentIntensity:renderer.scene.environmentIntensity,sun:renderer.sun.intensity,hemi:renderer.hemiLight.intensity,ambient:renderer.ambientLight.intensity,sunColor:renderer.sun.color.clone(),hemiColor:renderer.hemiLight.color.clone(),groundColor:renderer.hemiLight.groundColor.clone(),sunOffset:renderer.sunOffset.clone(),skyVisible:renderer.atmosphere.sky.visible};
    this.props=new THREE.Group();this.props.name='campaign-only-props';renderer.scene.add(this.props);
    this.materials=[];this.geometries=[];this.textures=[];this.fuelMeshes=new Map();this.barrelMeshes=new Map();this.truckMeshes=new Map();this.charges=new Map();this.buildProps();
    this.renderHook=(r,state,dt)=>this.render(r,state,dt);
  }
  mesh(geometry,material,x,y,z){this.geometries.push(geometry);const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);this.props.add(m);return m;}
  material(color,extra={}){const m=new THREE.MeshBasicMaterial({color,...extra});this.materials.push(m);return m;}
  buildProps(){
    const r=this.renderer,ground=(x,z)=>r.map.terrain?.heightAt(x,z)??0,warm=this.material('#ffd696'),red=this.material('#f29348'),dark=this.material('#36352d');
    // Emissive impostors cost no PointLights or shadow maps.
    this.beacon=this.mesh(new THREE.SphereGeometry(.11,6,4),warm,-82,ground(-80,-30)+2.35,-31.5);
    this.mesh(new THREE.CylinderGeometry(.035,.035,2.3,6),dark,-82,ground(-80,-30)+1.15,-31.5);
    this.mesh(new THREE.ConeGeometry(.24,.14,8),dark,-82,ground(-80,-30)+2.53,-31.5);
    for(const [x,z,y] of [[150,96.72,2.4],[146,96.72,2.4],[154,113.28,2.4]])this.mesh(new THREE.PlaneGeometry(1.1,.9),warm,x,y,z).rotation.y=z>105?Math.PI:0;
    for(const fuel of this.session.state.campaign.fuel){const flame=this.mesh(new THREE.ConeGeometry(.5,1.7,5),red,fuel.x,fuel.y+.8,fuel.z);this.fuelMeshes.set(fuel.id,flame);const barrel=this.mesh(new THREE.CylinderGeometry(.55,.55,1.35,8),this.material('#806247'),fuel.x,ground(fuel.x,fuel.z)+.675,fuel.z);this.barrelMeshes.set(fuel.id,barrel);}
    const truck=(x,z)=>{
      const group=new THREE.Group();this.props.add(group);group.position.set(x,ground(x,z),z);
      const bodyMat=this.material('#536454'),wheelMat=this.material('#24282a');
      for(const [w,h,d,dx,y,dz,mat] of [[2.7,.6,6,0,1,0,bodyMat],[2.7,1.5,2,0,1.9,-2.2,bodyMat],[2.7,1.5,3.6,0,1.8,.8,bodyMat],[2.3,.7,.025,0,2.1,-3.22,this.material('#27384c')]]){const m=this.mesh(new THREE.BoxGeometry(w,h,d),mat,x+dx,group.position.y+y,z+dz);group.attach(m);}
      for(const dx of [-1.45,1.45])for(const dz of [-2,1.9]){const m=this.mesh(new THREE.CylinderGeometry(.6,.6,.28,8),wheelMat,x+dx,group.position.y+.65,z+dz);m.rotation.z=Math.PI/2;group.attach(m);}
      group.traverse(o=>{if(o.isMesh)o.material.userData.original=o.material.color.getHex();});return group;
    };
    for(const t of this.session.state.campaign.trucks)this.truckMeshes.set(t.id,truck(t.x,t.z));
    this.convoy=[truck(-217,-157),truck(-225,-166)];
    this.knife=new THREE.Group();r.camera.add(this.knife);
    for(const [w,h,d,y,z,color] of [[.05,.035,.16,-.2,-.42,'#413c33'],[.035,.018,.27,-.2,-.63,'#bbc2bd'],[.13,.025,.03,-.2,-.51,'#6c756c']]){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),this.material(color));this.geometries.push(m.geometry);m.position.set(.15,y,z);this.knife.add(m);}
    prepareViewModel(this.knife);this.knife.visible=false;
    for(const site of this.session.state.campaign.chargeSites){const m=this.mesh(new THREE.BoxGeometry(.38,.16,.28),dark,site.x,ground(site.x,site.z)+.15,site.z);this.charges.set(site.id,m);}
    // A map table and lamp for the briefing, on the actual ridge plateau.
    this.table=this.mesh(new THREE.BoxGeometry(4,.15,3),this.material('#a78e60'),-80,ground(-80,-30)+1.1,-30);
    this.tableLegs=[];for(const x of [-81.7,-78.3])for(const z of [-31.2,-28.8])this.tableLegs.push(this.mesh(new THREE.BoxGeometry(.12,1.05,.12),dark,x,ground(-80,-30)+.53,z));
    const canvas=document.createElement('canvas');canvas.width=768;canvas.height=512;const ctx=canvas.getContext('2d');
    ctx.fillStyle='#c7ba91';ctx.fillRect(0,0,768,512);ctx.strokeStyle='#6e755234';ctx.lineWidth=1;
    for(let i=0;i<11;i++){ctx.beginPath();ctx.ellipse(285,220,55+i*15,30+i*11,-.55,0,Math.PI*2);ctx.stroke();}
    for(let n=32;n<768;n+=48){ctx.beginPath();ctx.moveTo(n,0);ctx.lineTo(n,512);ctx.stroke();}
    for(let n=32;n<512;n+=48){ctx.beginPath();ctx.moveTo(0,n);ctx.lineTo(768,n);ctx.stroke();}
    ctx.fillStyle='#3c493b';ctx.font='bold 20px Arial';ctx.fillText('АЛЬ-ХАДРА / НОЧНОЙ РЕЙД',32,34);ctx.font='12px Arial';ctx.fillText('ЭКСПЕДИЦИОННАЯ БРИГАДА · ВЗВОД ДЮРАНА · 02:00',32,56);
    const marks=[[65,90,'РУСЛО'],[270,220,'ГРЯДА'],[420,298,'СКЛАД'],[645,420,'РАДИОСТАНЦИЯ']];ctx.strokeStyle='#914d35';ctx.lineWidth=4;ctx.setLineDash([10,6]);ctx.beginPath();for(const [i,[x,y]] of marks.entries())i?ctx.lineTo(x,y):ctx.moveTo(x,y);ctx.stroke();ctx.setLineDash([]);
    marks.forEach(([x,y,name],i)=>{ctx.fillStyle='#99573a';ctx.beginPath();ctx.arc(x,y,10,0,Math.PI*2);ctx.fill();ctx.fillStyle='#eee3bb';ctx.font='bold 13px Arial';ctx.fillText(String(i+1),x-4,y+4);ctx.fillStyle='#384638';ctx.font='bold 16px Arial';ctx.fillText(name,Math.min(575,x+16),y-15);});
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.center.set(.5,.5);texture.rotation=Math.PI;this.textures.push(texture);
    this.mapSheet=this.mesh(new THREE.PlaneGeometry(3.7,2.7),this.material('#ffffff',{map:texture}),-80,ground(-80,-30)+1.19,-30);this.mapSheet.rotation.x=-Math.PI/2;
    this.mapRoute=new THREE.Group();this.props.add(this.mapRoute);
    const points=[[-1.5,-1],[-.7,-.3],[.2,.3],[1.3,.9]];
    for(let i=0;i<points.length;i++){
      const [x,z]=points[i];const marker=this.mesh(new THREE.ConeGeometry(.08,.22,4),red,-80+x,ground(-80,-30)+1.3,-30+z);this.mapRoute.attach(marker);
      if(i){const [ax,az]=points[i-1],line=new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(x-ax,z-az),.015,.025),red);this.geometries.push(line.geometry);line.position.set(-80+(ax+x)/2,ground(-80,-30)+1.22,-30+(az+z)/2);line.rotation.y=-Math.atan2(z-az,x-ax);this.mapRoute.add(line);}
    }
    this.mapRoute.rotation.y=Math.PI;this.mapRoute.position.set(-160,0,-60);
    // Dust and distant silhouettes for the final reveal; no combat vehicles.
    this.horizon=new THREE.Group();this.props.add(this.horizon);
    for(let i=0;i<5;i++){
      const m=this.mesh(new THREE.BoxGeometry(3,1.6,6),dark,225-i*5,2,153+i*2);this.horizon.attach(m);
      const turret=this.mesh(new THREE.BoxGeometry(1.7,.8,2.1),dark,225-i*5,3,153+i*2);this.horizon.attach(turret);
    }
  }
  key(event){
    const m=this.session.state?.campaign;if(!m)return false;
    if(m.cutscene&&['Space','Enter'].includes(event.code)&&!event.repeat){this.clearControls();this.session.command({type:'skip'});return true;}
    if(m.failed&&event.code==='Enter'&&!event.repeat){this.clearControls();this.session.command({type:'retry'});return true;}
    return Boolean((m.cutscene||m.awaitingLoadout||m.failed||m.complete)&&event.code!=='Escape');
  }
  update(state,paused,yaw){
    if(!state?.campaign)return;
    const m=state.campaign,p=state.players.find(p=>p.id==='local');if(!p)return;
    this.root.classList.toggle('campaign-ui-paused',paused);document.body.classList.add('campaign-active');
    this.root.classList.toggle('campaign-cinematic',Boolean(m.cutscene));document.body.classList.toggle('campaign-cinematic',Boolean(m.cutscene));
    document.body.classList.toggle('campaign-downed',p.downed);
    this.$('.campaign-objective strong').textContent=this.locale.objectives[m.objective]??'Взвод Дюрана';
    const target=m.target,d=target?Math.round(Math.hypot(target.x-p.x,target.z-p.z)):0;
    const objectiveHeading=target?((Math.atan2(target.x-p.x,target.z-p.z)*180/Math.PI+360)%360):0,objectiveDirection=['С','СВ','В','ЮВ','Ю','ЮЗ','З','СЗ'][Math.round(objectiveHeading/45)%8];
    this.$('.campaign-objective > span').textContent=`${m.stage===6?'ПЕРЕДАЧА · '+Math.ceil(m.radioRemaining)+' с · ':''}КП ${m.checkpoint}/4 · ${m.order==='hold'?'ВЗВОД ДЕРЖИТ ПОЗИЦИЮ':'ВЗВОД СЛЕДУЕТ'}${d?' · '+objectiveDirection+' '+d+' м':''}`;
    this.$('.campaign-optional').textContent=m.stage>=4?`${m.flags.documents?'✓':'◇'} Документы офицера · ${m.flags.courierSaved?'✓':m.flags.courierRevived?'→':'◇'} Связной${m.flags.courierRevived&&!m.flags.courierSaved?' → восточная дорога':''}`:'';
    const levels=['ТИШИНА','ПОДОЗРЕНИЕ','ПОИСК','ТРЕВОГА'];this.$('.campaign-detection > span').textContent=levels[m.alert];this.$('.campaign-detection meter').value=m.detection;
    const direction=m.detectingEnemy?Math.atan2(p.x-m.detectingEnemy.x,p.z-m.detectingEnemy.z)-yaw:0;this.$('.campaign-detection b').style.transform=`rotate(${direction}rad)`;this.$('.campaign-detection').classList.toggle('danger',m.alert===3);
    const line=this.locale.lines[m.subtitle?.key];this.$('.campaign-subtitle').classList.toggle('hidden',!line);
    this.$('.campaign-subtitle b').textContent=line?this.locale.speakers[line.speaker]:'';this.$('.campaign-subtitle > span').textContent=line?.text??'';
    this.$('.campaign-prompt').textContent=m.prompt??(p.downed?'X удерживать · шприц / санитар идёт на помощь':'Z · лечь   V · нож   E · взаимодействие   H · аптечка   Q · приказ');
    const progress=Math.max(m.progress,m.reviveProgress);this.$('.campaign-progress').classList.toggle('hidden',progress<=0);this.$('.campaign-progress-fill').style.strokeDashoffset=String(276.46*(1-Math.min(1,progress)));this.$('.campaign-progress > span').textContent=`${Math.round(progress*100)}%`;
    this.$('.campaign-injury').classList.toggle('hidden',!p.downed);this.$('.campaign-injury strong').textContent=`${Math.max(0,Math.ceil(p.downedTimer))} с`;this.$('.campaign-injury > span').textContent=p.syringes?`X удерживать 4 с · шприцы: ${p.syringes}`:'Шприцов нет · дождись помощи союзника';
    this.$('.campaign-supplies').textContent=`АПТЕЧКИ ${p.medkits} · ШПРИЦЫ ${p.syringes}${m.fuze>0?' · ЗАРЯДЫ '+Math.ceil(m.fuze)+' с':''}`;
    this.$('.campaign-cutscene').classList.toggle('hidden',!m.cutscene);this.$('.campaign-cutscene > span').textContent=m.cutscene?.id==='briefing'?'02:00 / БРИФИНГ':m.cutscene?.id==='finale'?'05:40 / РАССВЕТ':'АЛЬ-ХАДРА / ЭКСПЕДИЦИОННАЯ БРИГАДА';
    this.$('.campaign-choice').classList.toggle('hidden',!m.awaitingLoadout);
    const ending=this.$('.campaign-ending');ending.classList.toggle('hidden',!m.failed&&!m.complete);
    if(m.failed||m.complete){ending.querySelector('small').textContent=m.failed?'ПОПЫТКА НЕ ЗАВЕРШЕНА':'МИССИЯ 1 ЗАВЕРШЕНА';ending.querySelector('h2').textContent=m.failed?'Возвращаемся к контрольной точке.':'Радиостанция наша.';ending.querySelector('p').textContent=m.failed??`Колонна снабжения в пути. ${m.flags.documents?'Документы сохранены для следующей миссии. ':''}${m.flags.courierSaved?'Связной эвакуирован. ':''}Продолжение следует.`;this.$('.campaign-retry').classList.toggle('hidden',!m.failed);}
    const blocking=Boolean(m.awaitingLoadout||m.failed||m.complete);
    if(blocking&&!this.blocking){this.clearControls();document.exitPointerLock?.();}this.blocking=blocking;
    this.audio.update(state,this.locale,paused||m.awaitingLoadout||m.complete);
  }
  render(r,state,dt){
    const m=state.campaign;if(!m)return;
    if(this.renderEpoch!==m.epoch){this.renderEpoch=m.epoch;this.lastKnife=-1;this.knifeUntil=0;}
    const preset=presets[m.light]??presets.night;
    r.atmosphere.sky.visible=false;r.scene.background.set(preset.fog);r.scene.fog.color.set(preset.fog);r.scene.fog.density=m.light==='dawn'?.006:.009;
    r.sun.intensity=preset.sunPower;r.sun.color.set(preset.sun);r.hemiLight.intensity=preset.hemiPower;r.hemiLight.color.set(preset.hemi);r.hemiLight.groundColor.set(preset.ground);r.ambientLight.intensity=preset.ambient;r.scene.environmentIntensity=preset.environment;
    if(!this.lightApplied||this.lightApplied!==m.light){r.sunOffset.set(-90,75,65);r.sun.shadow.needsUpdate=true;this.lightApplied=m.light;}
    this.beacon.visible=Math.sin(state.time*5.1)+Math.sin(state.time*11.9)>-.2;
    const briefing=m.cutscene?.id==='briefing';this.table.visible=this.mapSheet.visible=this.mapRoute.visible=briefing;for(const leg of this.tableLegs)leg.visible=briefing;
    this.horizon.visible=m.cutscene?.id==='finale';
    for(const site of m.chargeSites)this.charges.get(site.id).visible=site.planted;
    for(const fuel of m.fuel){const f=this.fuelMeshes.get(fuel.id);f.visible=fuel.destroyed||m.stage===3;f.scale.y=fuel.destroyed?1.7+Math.sin(state.time*7+fuel.x)*.35:.16;const barrel=this.barrelMeshes.get(fuel.id);barrel.material.color.set(fuel.destroyed?'#302b27':'#806247');barrel.rotation.z=fuel.destroyed?1.3:0;}
    for(const t of m.trucks){const truck=this.truckMeshes.get(t.id);truck.rotation.z=t.destroyed?.09:0;truck.traverse(o=>{if(o.isMesh)o.material.color.set(t.destroyed?'#342e29':o.material.userData.original??=o.material.color.getHex());});}
    this.convoy.forEach((v,i)=>{v.visible=m.cutscene?.id==='landing';if(v.visible)v.position.x=-217-i*8-(m.cutscene.elapsed??0)*2.6;});
    const p=state.players.find(p=>p.id==='local');
    if(p?.suppressed&&p.weaponSlot===1&&!p.heldGadget&&r.weaponRig.suppressor){r.weaponRig.suppressor.visible=true;r.weaponRig.suppressor.position.z=r.weaponRig.muzzle.position.z-.1;r.weaponRig.muzzle.visible=false;r.weaponRig.muzzleFlash.visible=false;r.weaponRig.flashLight.intensity=0;}
    const knifeEvent=state.events.filter(e=>e.type==='campaignKnife').at(-1);if(knifeEvent&&knifeEvent.id>this.lastKnife){this.lastKnife=knifeEvent.id;this.knifeUntil=knifeEvent.time+.35;}
    const knifePhase=Math.max(0,((this.knifeUntil??0)-state.time)/.35);this.knife.visible=knifePhase>0&&!m.cutscene;this.knife.rotation.x=-Math.sin(knifePhase*Math.PI)*.75;this.knife.position.z=-Math.sin(knifePhase*Math.PI)*.15;
    if(this.knife.visible){r.weapon.scale.setScalar(.001);}else r.weapon.scale.setScalar(1);
    if(m.cutscene){
      const def=this.definition.cutscenes[m.cutscene.id],points=def.camera.map(p=>new THREE.Vector3(...p)),curve=new THREE.CatmullRomCurve3(points),t=Math.min(1,m.cutscene.elapsed/def.duration);
      const pos=curve.getPoint(t);r.camera.position.copy(pos);r.camera.lookAt(...def.lookAt);r.camera.fov=briefing?48:62;r.camera.updateProjectionMatrix();r.weapon.visible=false;r.scoped=false;
    }
    const world=this.$('.campaign-world-markers');world.replaceChildren();
    if(m.cutscene||m.complete||m.failed)return;
    const add=(point,label,cls='')=>{const screen=r.project(point.x,(point.y??r.map.terrain.heightAt(point.x,point.z))+2,point.z);if(!screen.visible)return;const node=document.createElement('div');node.className='campaign-marker '+cls;node.style.transform=`translate(${screen.x}px,${screen.y}px)`;node.textContent=label;world.append(node);};
    if(m.target)add(m.target,`◇ ${Math.round(Math.hypot(m.target.x-p.x,m.target.z-p.z))} м`);
    for(const a of m.downed)add(a,`✚ ${a.name}${a.timer<1000?' · '+Math.ceil(a.timer)+' с':''}`,'wounded');
    if(m.stage===3)for(const site of m.chargeSites)if(!site.planted)add(site,'◇ ЗАРЯД');
    if(m.flags.courierRevived&&!m.flags.courierSaved)add({x:200,z:140},'◇ ЭВАКУАЦИЯ');
  }
  dispose(){
    this.audio.dispose();this.root.remove();this.props.removeFromParent();this.knife.removeFromParent();this.renderer.weapon.scale.setScalar(1);for(const g of this.geometries)g.dispose();for(const m of this.materials)m.dispose();for(const t of this.textures)t.dispose();
    const r=this.renderer,o=this.original;r.scene.environment=o.environment;r.scene.environmentIntensity=o.environmentIntensity;r.sun.intensity=o.sun;r.hemiLight.intensity=o.hemi;r.ambientLight.intensity=o.ambient;r.sun.color.copy(o.sunColor);r.hemiLight.color.copy(o.hemiColor);r.hemiLight.groundColor.copy(o.groundColor);r.sunOffset.copy(o.sunOffset);r.atmosphere.sky.visible=o.skyVisible;
    document.body.classList.remove('campaign-active','campaign-downed','campaign-cinematic');
  }
}
