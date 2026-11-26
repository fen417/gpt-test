import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {getAssetColliders} from '../../shared/asset-colliders.js';
import {NAHAR_GATES,NAHAR_SITES,NAHAR_STORM,NAHAR_WATER} from '../../shared/campaign/nahar.js';
import {NAHAR_TUNNEL} from '../../shared/campaign/nahar-district.js';
import {bulletHeight} from '../../shared/ballistics.js';
import {BLACK_HAWK_GUN,blackHawkGunPose,getVehicleSeatPose,vehiclePartPose} from '../../shared/vehicles.js';
import {EYE_HEIGHT} from '../../shared/world.js';
import {CampaignAudio} from './audio.js';
import {ColumnMusic} from './column-music.js';
import {placeCampaignMarker} from './markers.js';
import {InfantryMinimap} from './minimap.js';
import {NaharWater} from './nahar-water.js';
import './mission4.css';

const orders={F1:'follow',F2:'hold',KeyQ:'assist'};
const clock=seconds=>`${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;
const angle=value=>Math.atan2(Math.sin(value),Math.cos(value));
const mix=THREE.MathUtils.lerp;
const smooth=THREE.MathUtils.smoothstep;
const names={primary:'Двор депо',alternate:'Ремонтный двор'};
const stationPickupsUrl=new URL('../assets/nahar/station-pickups.glb',import.meta.url).href;

export async function loadStationPickups(){
  const {scene}=await new GLTFLoader().loadAsync(stationPickupsUrl);
  return scene;
}

function naharMusic(state,definition){
  const m=state.campaign;
  if(!m.airborne)return definition.music?.ground?{tracks:{ground:.84},offset:m.groundElapsed}:{tracks:{},offset:0};
  if(m.stage==='disembark'||!definition.music?.flight)return {tracks:{},offset:0};
  const level=m.stage==='transfer'?.28:m.stage==='landing'?.48:.84;
  return {tracks:{flight:level},offset:m.time};
}

export class Mission4Presentation{
  constructor(session,{renderer,audio,leave,clearControls,resume,getBindings,keyLabel,stationPickups}){
    Object.assign(this,{session,renderer,combat:audio,clearControls,resume,getBindings,keyLabel,
      locale:session.locale,definition:session.definition});
    const rootUrl=new URL(`${import.meta.env.BASE_URL}campaign/m04/`,location.href);
    this.voice=new CampaignAudio(audio,rootUrl,this.definition);
    this.score=new ColumnMusic(audio,rootUrl,this.definition,naharMusic);
    this.oldMusicOverride=audio.campaignMusicOverride;audio.campaignMusicOverride=true;
    this.root=document.createElement('section');this.root.className='campaign-ui campaign-m04';
    this.root.setAttribute('aria-label','Миссия 04 «Под крышами»');
    this.root.innerHTML=`<header class="campaign-objective"><small>НАХАР · ПОД КРЫШАМИ</small><strong></strong><span></span></header>
      <div class="campaign-subtitle hidden" role="status" aria-live="polite"><b></b><span></span></div>
      <div class="m04-interaction" hidden><span></span><progress max="1" value="0" hidden></progress></div>
      <div class="m04-warning" hidden></div><div class="m04-flight-status" hidden><b></b><span></span><meter min="0" max="100"></meter></div>
      <span class="m04-marker" hidden></span><span class="m04-threat" hidden></span>
      <div class="m04-minigun-reticle" hidden aria-hidden="true"><i></i></div>
      <div class="campaign-injury" hidden><b>ТЯЖЁЛОЕ РАНЕНИЕ</b><strong></strong><span></span></div>
      <div class="m04-cinematic" hidden></div>
      <section class="campaign-ending campaign-card hidden"><small></small><h2></h2><p></p><div class="campaign-final-stats"></div>
        <button class="campaign-retry">С контрольной точки</button><button class="campaign-exit">К экрану кампании</button></section>`;
    document.body.append(this.root);
    this.$=selector=>this.root.querySelector(selector);
    this.$('.campaign-exit').onclick=leave;this.$('.campaign-retry').onclick=()=>this.retry();
    this.marker=this.$('.m04-marker');this.threat=this.$('.m04-threat');
    this.minigunReticle=this.$('.m04-minigun-reticle');this.aimPoint=new THREE.Vector3();
    this.casualtyMarkers=new Map();
    this.minimap=new InfantryMinimap(renderer);
    this.dressing=new THREE.Group();this.dressing.name='nahar-interactives';renderer.worldRoot.add(this.dressing);
    this.water=new NaharWater(renderer,this.dressing);
    this.dressing.add(stationPickups);
    this.stationPickups=['log','recording'].map(id=>{
      const model=stationPickups.getObjectByName(id),site=NAHAR_SITES[id];
      const materials=new Set(),geometries=new Set();
      model.position.set(site.x,site.surfaceY+.003,site.z);model.rotation.y=site.yaw;
      model.traverse(mesh=>{
        if(!mesh.isMesh)return;
        geometries.add(mesh.geometry);
        for(const material of [mesh.material].flat()){
          material.emissive.setHex(0x9c854b);
          material.emissiveIntensity=0;
          materials.add(material);
        }
        mesh.receiveShadow=true;
      });
      return {id,model,materials,geometries};
    });
    this.sky=renderer.webgpu?renderer.atmosphere:renderer.atmosphere.sky.material.uniforms;
    this.cityFog=new THREE.Color('#c6ac91');this.stormFog=new THREE.Color('#ba8c64');
    this.dustBanks=Array.from({length:25},(_,index)=>{
      const material=new THREE.SpriteMaterial({map:renderer.smokeTexture,color:0xc4a17b,transparent:true,depthWrite:false,fog:false,opacity:0});
      const sprite=new THREE.Sprite(material);this.dressing.add(sprite);
      return {sprite,angle:index*Math.PI*2/25,row:index%3,phase:index*1.73};
    });
    this.doorMeshes=Object.fromEntries(Object.entries(NAHAR_GATES).map(([name,b])=>{
      const gate=new THREE.Mesh(new THREE.BoxGeometry(b.w,b.h,b.d),new THREE.MeshStandardMaterial({color:b.color,metalness:.16,roughness:.84}));
      gate.position.set(b.x,b.baseY+b.h/2,b.z);gate.castShadow=true;gate.receiveShadow=true;this.dressing.add(gate);
      if(name==='tunnel'){
        const bracing=new THREE.MeshStandardMaterial({color:0x535b54,metalness:.34,roughness:.79});
        const latch=new THREE.MeshStandardMaterial({color:0xa18855,metalness:.36,roughness:.7});
        const add=(y,z,h,d,material)=>{
          const piece=new THREE.Mesh(new THREE.BoxGeometry(.075,h,d),material);
          piece.position.set(-b.w/2,y-b.h/2,z);piece.receiveShadow=true;gate.add(piece);
        };
        for(const z of [-3.7,-2.46,-1.23,0,1.23,2.46,3.7])add(1.78,z,3.28,.068,bracing);
        for(const y of [.18,1.52,2.94,3.44])add(y,0,.096,9.21,bracing);
        add(1.14,.21,.31,.46,latch);
      }
      return [name,gate];
    }));
    this.tunnelLighting=new THREE.Group();
    this.dressing.add(this.tunnelLighting);
    this.tunnelLighting.visible=false;
    this.tunnelLights=Array.from({length:3},()=>{
      const light=new THREE.PointLight(0xffd5a2,5.5,10,1.75);
      this.tunnelLighting.add(light);return light;
    });
    this.original={sun:renderer.sun.intensity,sunOffset:renderer.sunOffset.clone(),hemi:renderer.hemiLight.intensity,
      ambient:renderer.ambientLight.intensity,fogColor:renderer.scene.fog.color.clone(),fogDensity:renderer.scene.fog.density,
      haze:this.sky.hazeAmount.value,hazeTint:this.sky.hazeTint.value.clone()};
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
    document.body.classList.toggle('campaign-cinematic',cinematic||m.transfer!=null||Boolean(m.disembark));
    document.body.classList.toggle('campaign-downed',p.downed&&!end);
    this.root.classList.toggle('campaign-ui-paused',paused&&!end);
    const objective=this.$('.campaign-objective');objective.hidden=end||cinematic||m.transfer!=null||Boolean(m.disembark);
    objective.querySelector('strong').textContent=this.locale.objectives[m.objective];
    const stageNote=m.airborne?(m.landing?names[m.landing]:p.vehicleSeat===2?'ЛЕВЫЙ БОРТ':'ПРАВЫЙ БОРТ'):
      m.target?`${Math.round(Math.hypot(p.x-m.target.x,p.z-m.target.z))} м`:'';
    objective.querySelector('span').textContent=[m.checkpoint?`КП ${m.checkpoint}/${m.checkpointTotal}`:'',stageNote].filter(Boolean).join(' · ');
    const subtitle=this.$('.campaign-subtitle'),line=this.locale.lines[m.radio?.key];
    subtitle.classList.toggle('hidden',!line||end);
    subtitle.querySelector('b').textContent=line?this.locale.speakers[line.speaker]:'';
    subtitle.querySelector('span').textContent=line?.text??'';
    let prompt=m.prompt?`${use} · ${m.prompt}`:'';
    if(m.stage==='approach')prompt=`${switchSeat} · Сменить правое место`;
    if(m.transferReady)prompt=m.transfer!=null?'Переход к минигану':`${switchSeat} · Занять миниган`;
    if(m.disembarkReady)prompt=m.disembark?'Высадка':`${use} · Выйти из вертолёта`;
    const action=this.$('.m04-interaction');action.hidden=!prompt||end||cinematic||p.downed;
    action.querySelector('span').textContent=prompt;
    const progress=action.querySelector('progress');progress.value=m.transfer??m.disembark?.progress??m.progress??0;
    progress.hidden=progress.value<=0;
    const danger=this.$('.m04-warning');danger.hidden=end||cinematic||m.transfer!=null||!(m.threat||m.transmitting&&m.stage==='relay');
    danger.textContent=m.threat?`ПТ-90 · ${Math.max(1,Math.ceil(m.threat.time))} С ДО ВЫСТРЕЛА`:
      m.power?`ПЕРЕДАЧА СХЕМЫ · ${Math.floor(m.sent*100)}%`:`НЕТ ПИТАНИЯ · ПЕРЕДАНО ${Math.floor(m.sent*100)}%`;
    const flight=this.$('.m04-flight-status'),craft=state.vehicles.find(v=>v.id===p.vehicleId);
    flight.hidden=!m.airborne||!craft||end||m.transfer!=null||Boolean(m.disembark);
    flight.querySelector('b').textContent=`КОРПУС ${m.hull??0}%`;
    flight.querySelector('span').textContent=p.vehicleSeat===2?
      craft?.overheated?'МИНИГАН ПЕРЕГРЕТ':`НАГРЕВ ${Math.round((craft?.heat??0)*100)}%`:
      p.vehicleSeat===4?'ЗАДНЕЕ ПРАВОЕ':'ПЕРЕДНЕЕ ПРАВОЕ';
    const meter=flight.querySelector('meter');meter.value=m.hull??0;
    const injury=this.$('.campaign-injury');injury.hidden=!p.downed||end;
    if(!injury.hidden){
      injury.querySelector('strong').textContent=`${Math.max(0,Math.ceil(p.downedTimer))} с`;
      const helper=state.players.find(a=>a.id===p.reviver);
      const approaching=state.players.find(a=>a.id===m.rescuerId);
      injury.querySelector('span').textContent=helper?`${helper.name} оказывает помощь · ${Math.floor(m.reviveProgress*100)}%`:
        approaching?`${approaching.name} идёт на помощь · ${Math.round(Math.hypot(p.x-approaching.x,p.z-approaching.z))} м`:
          'Дождитесь помощи союзника';
    }
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
    this.minimap.update(state,p,{hidden:m.airborne||paused||end||cinematic});
    this.voice.update(state,this.locale,paused||end,this.renderer);
    this.updateCanalAudio(p,p.alive&&!paused&&!end&&!cinematic&&!m.airborne);
    this.score.update(state,paused||end);
  }
  updateCanalAudio(player,active){
    const context=this.combat.ctx;
    if(!context||!this.voice.bus)return;
    const canal=NAHAR_WATER,dz=canal.z-player.z;
    const distance=Math.hypot(Math.max(0,Math.abs(player.x-canal.x)-canal.w/2),
      Math.max(0,Math.abs(dz)-canal.d/2+2),Math.max(0,player.y+EYE_HEIGHT-canal.y));
    const audible=active&&this.combat.enabled;
    const level=audible ? .19*(1-smooth(distance,4,23))**1.5 : 0;
    if(level>0&&!this.canalAudioLoading){
      this.canalAudioLoading=true;
      void this.loadCanalAudio(context);
    }
    const channel=this.canalAudio;
    if(!channel)return;
    channel.gain.gain.setTargetAtTime(level*this.combat.effectsVolume,context.currentTime,.24);
    const pan=-Math.sin(player.yaw)*THREE.MathUtils.clamp(dz/10,-1,1)*.36;
    channel.pan?.pan.setTargetAtTime(pan,context.currentTime,.15);
  }
  async loadCanalAudio(context){
    const buffer=await this.voice.buffer('sfx/canal-current.ogg')??await this.voice.buffer('sfx/canal-current.m4a');
    if(!buffer||this.voice.closed||context.state==='closed')return;
    const source=context.createBufferSource(),gain=context.createGain();
    const pan=context.createStereoPanner?.();
    source.buffer=buffer;source.loop=true;gain.gain.value=0;
    source.connect(gain);
    if(pan)gain.connect(pan).connect(this.voice.bus);
    else gain.connect(this.voice.bus);
    this.canalAudio={source,gain,pan};
    source.start();
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
  placeThreat(r,target,player){
    if(!target){this.threat.hidden=true;return;}
    const pos=r.project(target.x,target.y,target.z);
    const onTarget=pos.visible&&pos.x>64&&pos.x<r.viewportWidth-64&&pos.y>78&&pos.y<r.viewportHeight-16;
    this.threat.dataset.onTarget=String(onTarget);
    if(!onTarget){this.placeMarker(this.threat,r,target,player,'ПТ-90');return;}
    this.threat.hidden=false;
    this.threat.style.transform=`translate(${pos.x}px,${pos.y}px) translate(-50%,-100%)`;
    this.threat.textContent='ПТ-90';
  }
  updateStorm(r,time,quality){
    const band=NAHAR_STORM,pos=r.camera.position;
    const radius=Math.hypot((pos.x-band.x)/band.innerX,(pos.z-band.z)/band.innerZ);
    const gust=(1+Math.sin(time*.34)+Math.sin(time*.79)*.28)*.5;
    const dense=smooth(radius,.63,1.46);
    r.scene.fog.density=mix(.00172,.00435+.00045*gust,dense);
    r.scene.fog.color.copy(this.cityFog).lerp(this.stormFog,mix(.18,.76,dense));
    this.sky.hazeAmount.value=mix(.4,.81,dense);
    this.sky.hazeTint.value.copy(r.scene.fog.color);
    if(!r.webgpu)this.sky.hazeTint.value.convertLinearToSRGB();
    for(const bank of this.dustBanks){
      const {sprite,row,phase}=bank;
      sprite.visible=quality!=='low'||row!==2;
      if(!sprite.visible)continue;
      const a=bank.angle+.055*Math.sin(time*.08+phase);
      const ring=.12+row*.28;
      const x=band.x+Math.cos(a)*mix(band.innerX,band.outerX,ring)+Math.sin(time*.115+phase)*31;
      const z=band.z+Math.sin(a)*mix(band.innerZ,band.outerZ,ring)+Math.sin(time*.07+phase)*15;
      const ground=r.map.terrain.heightAt(x,z);
      sprite.position.set(x,ground+31+row*23+Math.sin(time*.14+phase)*5,z);
      sprite.scale.set(178+row*33,77+row*21,1);
      sprite.material.rotation=.16*Math.sin(phase);
      sprite.material.opacity=(.16+row*.055)*(.76+.24*Math.sin(time*.18+phase)**2);
    }
    r.sun.intensity=mix(2.1,1.54,dense);r.hemiLight.intensity=mix(1.34,1.47,dense);
    r.ambientLight.intensity=mix(.24,.32,dense);
  }
  render(r,state,dt,view){
    const m=state.campaign;if(m?.missionId!=='m04')return;
    this.syncGates(m.gates);
    const pickupGlow=m.stationPickups.available?.22:0;
    for(const {id,model,materials} of this.stationPickups){
      model.visible=!m.airborne&&!m.stationPickups[id];
      for(const material of materials)material.emissiveIntensity=pickupGlow;
    }
    const p=state.players.find(a=>a.id==='local'),craft=state.vehicles.find(v=>v.id===p?.vehicleId);
    r.sunOffset.set(-140,86,-60);
    const pose=r.blackHawkViewPose??craft;
    if(craft&&m.disembark){
      this.renderDisembark(r,pose,m.disembark,view);
    }else if(craft&&m.airborne&&m.transfer!=null){
      const camera=r.camera;
      if(!this.transferView){
        const yaw=angle(camera.rotation.y-pose.yaw),turn=BLACK_HAWK_GUN.restYaw-yaw;
        this.transferView={yaw,turn:Math.abs(turn-Math.PI)<.12?turn:angle(turn),pitch:camera.rotation.x,fov:camera.fov};
      }
      const start=this.transferView,t=THREE.MathUtils.smootherstep(m.transfer,0,1);
      const from=getVehicleSeatPose(pose,p.vehicleSeat),to=getVehicleSeatPose(pose,BLACK_HAWK_GUN.index);
      const aim=blackHawkGunPose(pose,craft.yaw+BLACK_HAWK_GUN.restYaw,0);
      const yawOffset=angle(aim.yaw-pose.yaw-BLACK_HAWK_GUN.restYaw);
      const roll=view.shake===false?0:pose.bodyRoll??0;
      camera.position.set(mix(from.x,to.x,t),mix(from.y,to.y,t)-Math.sin(Math.PI*t)**2*.14,mix(from.z,to.z,t));
      camera.rotation.set(mix(start.pitch,aim.pitch,t)-Math.sin(Math.PI*t)**2*.085,
        pose.yaw+start.yaw+(start.turn+yawOffset)*t,roll*mix(.22,.35,t),'YXZ');
      camera.fov=mix(start.fov,THREE.MathUtils.clamp(Number(view.fov)||85,65,105),smooth(m.transfer,0,.55));
      camera.updateProjectionMatrix();
      r.scoped=r.collimatorAiming=r.binocularAiming=false;
      r.weapon.visible=false;
    }else{
      this.transferView=null;
      this.exitView=null;
      if(craft&&m.airborne&&p.vehicleSeat>=3&&view.shake!==false)r.camera.rotation.z=(pose.bodyRoll??0)*.22;
    }
    if(m.cutscene?.id==='finale'){
      const e=NAHAR_SITES.exit,t=smooth(m.cutscene.elapsed,0,5.8);
      r.camera.position.set(e.x-6+t*3,1.78,e.z+2.3-t*.8);r.camera.lookAt(e.x+9,1.34,e.z-.4);r.weapon.visible=false;
    }
    const viewPoint=r.camera.position,tunnel=NAHAR_TUNNEL;
    this.tunnelLighting.visible=!m.airborne&&!r.lowQuality&&viewPoint.y<6&&
      viewPoint.x>tunnel.start-7&&viewPoint.x<tunnel.end+2&&Math.abs(viewPoint.z-tunnel.z)<6;
    if(this.tunnelLighting.visible){
      const lights=tunnel.lampX;
      const first=THREE.MathUtils.clamp(Math.round((viewPoint.x-lights[0])/(lights[1]-lights[0]))-1,0,lights.length-3);
      for(const [index,light] of this.tunnelLights.entries())
        light.position.set(lights[first+index],2.5,tunnel.z-3.65);
    }
    this.updateStorm(r,m.time,view.quality);
    this.water.update(r.clock,r.scene.fog.density,r.lowQuality,r.graphicsEffects?.water);
    r.camera.updateMatrixWorld();
    const show=!m.failed&&!m.complete&&!m.cutscene&&p;
    this.placeMinigunReticle(r,show&&p.alive&&!p.downed&&!view.paused&&m.transfer==null&&!m.disembark?r.minigunAim:null);
    this.placeThreat(r,show?m.threat:null,p);
    const t=show&&m.target;
    this.placeMarker(this.marker,r,t?{...t,y:t.y+.8}:null,p,t?`◇ ${Math.round(Math.hypot(t.x-p.x,t.z-p.z))} М`:'');
    this.placeCasualties(r,show&&!m.airborne?p:null,state);
    if(!view.paused&&craft&&m.stage==='landing'&&craft.y<6&&r.clock>=(this.nextDust??0)){
      this.nextDust=r.clock+(view.quality==='low'?.47:.28);
      const a=r.clock*6;
      r.smoke(craft.x+Math.sin(a)*4,.45,craft.z+Math.cos(a)*4.5,2.4,1.75,0xb4a084,{opacity:.3,rise:.34,wind:1.1});
    }
  }
  renderDisembark(r,pose,exit,view){
    const camera=r.camera;
    if(!this.exitView){
      const door=vehiclePartPose(pose,-1.38,2.31,-.47);
      const step=vehiclePartPose(pose,-2.08,1.69,-.27);
      const end=new THREE.Vector3(exit.point.x,exit.point.y+EYE_HEIGHT,exit.point.z);
      const path=new THREE.CatmullRomCurve3([camera.position.clone(),new THREE.Vector3(door.x,door.y,door.z),
        new THREE.Vector3(step.x,step.y,step.z),end]);
      this.exitView={path,yaw:camera.rotation.y,pitch:camera.rotation.x,fov:camera.fov};
    }
    const start=this.exitView,t=smooth(exit.progress,0,1),dip=Math.sin(Math.PI*t)**2;
    start.path.getPoint(t,camera.position);
    camera.rotation.set(mix(start.pitch,0,t)-dip*.16,start.yaw+angle(exit.yaw-start.yaw)*t,-dip*.065,'YXZ');
    camera.fov=mix(start.fov,THREE.MathUtils.clamp(Number(view.fov)||85,65,105),t);
    camera.updateProjectionMatrix();
    r.weapon.visible=false;
  }
  placeCasualties(r,player,state){
    const active=new Set();
    if(player)for(const ally of state.players){
      if(ally.id===player.id||ally.team!==player.team||!ally.alive||!ally.downed||ally.downedTimer<=0||
        Math.hypot(ally.x-player.x,ally.y-player.y,ally.z-player.z)>32)continue;
      active.add(ally.id);
      let marker=this.casualtyMarkers.get(ally.id);
      if(!marker){
        marker=document.createElement('span');marker.className='campaign-marker wounded';
        this.root.append(marker);this.casualtyMarkers.set(ally.id,marker);
      }
      this.placeMarker(marker,r,{x:ally.x,y:ally.y+1,z:ally.z},player,
        `✚ ${ally.name.split(' ').at(-1)} · ${Math.ceil(ally.downedTimer)} С`);
    }
    for(const [id,marker] of this.casualtyMarkers)if(!active.has(id)){
      marker.remove();this.casualtyMarkers.delete(id);
    }
  }
  placeMinigunReticle(r,aim){
    const reticle=this.minigunReticle;
    reticle.hidden=!aim;
    if(!aim)return;
    const distance=70,age=distance/BLACK_HAWK_GUN.projectileSpeed,horizontal=Math.cos(aim.pitch)*distance;
    const point=this.aimPoint.set(aim.muzzle.x-Math.sin(aim.yaw)*horizontal,
      bulletHeight(aim.muzzle.y,Math.sin(aim.pitch)*BLACK_HAWK_GUN.projectileSpeed,age),
      aim.muzzle.z-Math.cos(aim.yaw)*horizontal).project(r.camera);
    reticle.style.left=`${(point.x+1)*50}%`;
    reticle.style.top=`${(1-point.y)*50}%`;
  }
  dispose(){
    if(this.canalAudio){
      const {source,gain,pan}=this.canalAudio;
      source.stop();source.disconnect();gain.disconnect();pan?.disconnect();
    }
    this.voice.dispose();this.score.dispose();this.minimap.dispose();this.combat.campaignMusicOverride=this.oldMusicOverride;
    const r=this.renderer,o=this.original;r.sun.intensity=o.sun;r.sunOffset.copy(o.sunOffset);
    r.hemiLight.intensity=o.hemi;r.ambientLight.intensity=o.ambient;r.campaignCoverColliders=null;
    r.scene.fog.color.copy(o.fogColor);r.scene.fog.density=o.fogDensity;
    this.sky.hazeAmount.value=o.haze;this.sky.hazeTint.value.copy(o.hazeTint);
    for(const {sprite} of this.dustBanks)sprite.material.dispose();
    const gateMaterials=new Set();
    for(const gate of Object.values(this.doorMeshes))gate.traverse(mesh=>{
      mesh.geometry.dispose();gateMaterials.add(mesh.material);
    });
    for(const material of gateMaterials)material.dispose();
    this.water.dispose();
    for(const {geometries,materials} of this.stationPickups){
      for(const geometry of geometries)geometry.dispose();
      for(const material of materials)material.dispose();
    }
    this.dressing.removeFromParent();this.root.remove();
    document.body.classList.remove('campaign-active','campaign-m04-active','campaign-cinematic','campaign-downed');
  }
}
