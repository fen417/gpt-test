import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {getAssetColliders} from '../../shared/asset-colliders.js';
import {M05_GATES,M05_SITES as sites,QUARRY_M05} from '../../shared/campaign/quarry-m05.js';
import {CampaignAudio} from './audio.js';
import {ColumnMusic} from './column-music.js';
import {CampaignFire} from './fire.js';
import {cinematicCameraPose} from './camera.js';
import {placeCampaignMarker} from './markers.js';
import {InfantryMinimap} from './minimap.js';
import {buildQuarryMissionScene} from './quarry-m05-scene.js';
import {QuarryAmbience} from './quarry-m05-audio.js';
import './mission5.css';

QUARRY_M05.buildScene=buildQuarryMissionScene;

const modelUrl=new URL('../assets/quarry-m05/industrial.glb',import.meta.url);
const dressingUrl=new URL('../assets/quarry-m05/dressing.glb',import.meta.url);
export async function loadQuarryDressing(){
  const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const [industrial,dressing]=await Promise.all([loader.loadAsync(modelUrl.href),loader.loadAsync(dressingUrl.href)]);
  dressing.scene.name='quarry-set-dressing';
  industrial.scene.add(dressing.scene);
  return industrial.scene;
}
const orders={F1:'follow',F2:'hold',KeyQ:'assist'};
const names={waiting:'ожидает',moving:'движется',saved:'спасён',lost:'потерян'};
const scanLabels={fuel:'Топливный узел',works:'Дробильный цех',gate:'Нижние ворота'};
const sceneTitles={C1:'Окрестности карьера. Несколько часов после Нахара',C2:'Ирвин Вос · «Сокол-7»',C3:'Ян Мартен · Топливный двор'};
const groupTracks={camp:'reunion',overlook:'reunion',works:'underground',cover:'cover',armor:'breakthrough',fuel:'breakthrough',finale:'final'};
const mix=(state)=>{
  const m=state.campaign,name=groupTracks[m.stage];
  const revealed=['orlov.falseOrder','orlov.falseConfirm','dargo.mayak'].includes(m.radio?.key);
  return {tracks:{[name]:revealed?.10:.7},offset:m.cutscene?.id==='C4'?m.cutscene.elapsed:state.time};
};

export class Mission5Presentation{
  constructor(session,{renderer,audio,leave,clearControls,resume,getBindings,keyLabel,quarryDressing}){
    Object.assign(this,{session,renderer,clearControls,resume,getBindings,keyLabel,locale:session.locale,definition:session.definition});
    this.audio=audio;
    this.oldOverride=audio.campaignMusicOverride;audio.campaignMusicOverride=true;
    const url=new URL(`${import.meta.env.BASE_URL}campaign/m05/`,location.href);
    this.voice=new CampaignAudio(audio,url,this.definition);
    this.score=new ColumnMusic(audio,url,this.definition,mix);this.ambience=new QuarryAmbience(audio,url);
    const root=this.root=document.createElement('section');root.className='campaign-ui campaign-m05';
    root.setAttribute('aria-label','Миссия 05 «Карьер»');
    root.innerHTML=`<header class="campaign-objective"><small>КАРЬЕР</small><strong></strong><span></span></header>
      <div class="campaign-subtitle hidden" role="status" aria-live="polite"><b></b><span></span></div>
      <div class="campaign-prompt" hidden></div><div class="m05-heat" hidden><span></span><meter min="0" max="1"></meter></div>
      <div class="m05-trucks" hidden><b>ЗАПРАВЩИКИ</b><span></span><span></span><span></span></div>
      <div class="campaign-injury" hidden><b>ТЯЖЁЛОЕ РАНЕНИЕ</b><strong></strong><span></span></div>
      <div class="m05-choices" hidden><div><kbd>1</kbd> Думал, что не встретимся</div><div><kbd>2</kbd> Сколько осталось машин?</div><div><kbd>3</kbd> Поговорим после задания</div></div>
      <div class="campaign-cutscene" hidden><span></span><button type="button" class="m05-skip">Пропустить · Enter</button></div>
      <div class="m05-fade" hidden></div>
      <section class="campaign-ending campaign-card hidden"><small></small><h2>Карьер</h2><p></p><div class="campaign-final-stats"></div>
        <button type="button" class="campaign-retry">С контрольной точки</button><button type="button" class="campaign-exit">К экрану кампании</button></section>`;
    document.body.append(root);
    this.$=selector=>root.querySelector(selector);
    this.$('.campaign-exit').onclick=leave;this.$('.campaign-retry').onclick=()=>this.retry();
    this.$('.m05-skip').onclick=()=>this.session.command({type:'skip'});
    this.markers=Array.from({length:4},()=>{
      const node=document.createElement('span');node.className='m05-marker';node.hidden=true;root.append(node);return node;
    });
    this.minimap=new InfantryMinimap(renderer);
    this.dressing=quarryDressing;renderer.worldRoot.add(quarryDressing);
    this.detailDressing=quarryDressing.getObjectByName('quarry-set-dressing').children
      .filter(node=>node.name.startsWith('m05_detail_'));
    this.base=quarryDressing.getObjectByName('gun_base');this.top=quarryDressing.getObjectByName('gun_top');
    this.base.position.set(sites.mount.x,sites.mount.y,sites.mount.z);
    this.top.position.set(sites.mount.x,sites.mount.y+1.54,sites.mount.z);
    this.top.rotation.order='YXZ';
    const tanker=quarryDressing.getObjectByName('fuel_truck');
    const door=quarryDressing.getObjectByName('fuel_cab_door');
    this.doors={};
    this.trucks=Object.fromEntries(['A','B','C'].map(id=>{
      const clone=tanker.clone(true);quarryDressing.add(clone);
      if(door){
        const hinge=this.doors[id]=door.clone(true);hinge.position.set(-1.087,.69,-2.0);clone.add(hinge);
      }
      return [id,clone];
    }));
    tanker.removeFromParent();door?.removeFromParent();
    this.repairTool=quarryDressing.getObjectByName('repair_tool');
    this.cups=[quarryDressing.getObjectByName('coffee_cup')].filter(Boolean);
    if(this.cups.length){this.cups.push(this.cups[0].clone(true));quarryDressing.add(this.cups[1]);}
    for(const prop of [this.repairTool,...this.cups])if(prop)prop.visible=false;
    const materials=new Set(),geometries=new Set();
    quarryDressing.traverse(o=>{
      if(!o.isMesh)return;
      o.castShadow=!o.name.startsWith('m05_detail_')&&!o.parent?.name.startsWith('m05_detail_');
      o.receiveShadow=true;geometries.add(o.geometry);
      for(const m of [o.material].flat())materials.add(m);
    });
    this.materials=materials;this.geometries=geometries;
    this.gates=Object.fromEntries(Object.entries(M05_GATES).map(([name,b])=>{
      const ribs=new THREE.Group(),steel=new THREE.MeshStandardMaterial({color:b.color,metalness:.38,roughness:.67}),
        rail=new THREE.MeshStandardMaterial({color:0xa28053,metalness:.35,roughness:.75});
      for(const [w,h,d,x,y,z,mat] of [
        [b.w,b.h,b.d,0,0,0,steel],
        ...Array.from({length:Math.floor(b.w/.55)},(_,i)=>[.08,b.h,.075,(i+.5)*.55-b.w/2,0,b.d/2+.027,steel]),
        [b.w,.14,b.d+.13,0,-b.h/2+.14,0,rail],[b.w,.14,b.d+.13,0,b.h/2-.14,0,rail],
      ]){
        const geo=new THREE.BoxGeometry(w,h,d),o=new THREE.Mesh(geo,mat);
        o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;ribs.add(o);geometries.add(geo);materials.add(mat);
      }
      quarryDressing.add(ribs);return [name,ribs];
    }));
    this.flames=new CampaignFire(renderer,quarryDressing,[
      {id:'blast',x:-113,z:152,width:5.3,height:8.5},
      {id:'spill-1',x:-110,z:153,width:2.9,height:3.6},
      {id:'spill-2',x:-117,z:148,width:2.55,height:4.4},
    ]);
    this.fireIds=new Set(['blast','spill-1','spill-2']);
    this.lamps=Array.from({length:4},(_,i)=>{
      const light=new THREE.PointLight(0xffd4a0,0,16,1.55);
      light.position.set(-64+i*14,18.64,-2);quarryDressing.add(light);return light;
    });
    this.storm=Array.from({length:18},(_,i)=>{
      const mat=new THREE.SpriteMaterial({map:renderer.smokeTexture,color:i%2?0xa98160:0xc49e6c,
        transparent:true,depthWrite:false,opacity:0,fog:false});
      materials.add(mat);
      const sprite=new THREE.Sprite(mat);quarryDressing.add(sprite);return sprite;
    });
    this.map=renderer.map;this.baseColliders=getAssetColliders(this.map);
    this.fog=renderer.scene.fog.color.clone();this.fogDensity=renderer.scene.fog.density;
    this.dustColor=new THREE.Color('#ae805c');this.cameraShots=new WeakMap();
    this.skyColor=renderer.scene.background?.isColor?renderer.scene.background.clone():null;
    this.sandSky=new THREE.Color('#aa8063');
    this.rollerPose=new THREE.Matrix4();
    const slatGeometry=new THREE.BoxGeometry(.105,.035,3.65);
    const slatMaterial=new THREE.MeshStandardMaterial({color:'#403b35',roughness:.89});
    this.slats=new THREE.InstancedMesh(slatGeometry,slatMaterial,29);
    this.slats.boundingSphere=new THREE.Sphere(new THREE.Vector3(-42,15.98,5.3),19);
    this.slats.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    quarryDressing.add(this.slats);materials.add(slatMaterial);geometries.add(slatGeometry);
    this.renderHook=(r,s,dt,v)=>this.render(r,s,dt,v);
  }
  retry(){this.clearControls();this.session.command({type:'retry'});this.resume();}
  key(event){
    const m=this.session.state?.campaign;
    if(!m||event.repeat||m.complete)return false;
    if(m.failed&&event.code==='Enter'){this.retry();return true;}
    if(m.cutscene&&event.code==='Enter'){this.session.command({type:'skip'});return true;}
    if(m.cutscene||m.failed)return false;
    const choice={Digit1:'return',Digit2:'tanks',Digit3:'later'}[event.code];
    if(m.choice&&choice){this.session.command({type:'answer',value:choice});return true;}
    const order=orders[event.code];
    if(order){this.session.command({type:'order',order});return true;}
    return false;
  }
  update(state,paused){
    const m=state?.campaign,p=state?.players.find(a=>a.id==='local');
    if(!m||!p)return;
    const end=Boolean(m.complete||m.failed),scene=m.cutscene,hidden=end||paused||Boolean(scene);
    const set=(selector,text)=>{const el=this.$(selector);if(el.textContent!==text)el.textContent=text;};
    document.body.classList.add('campaign-active');
    document.body.classList.toggle('campaign-cinematic',Boolean(scene)&&!end);
    document.body.classList.toggle('campaign-downed',p.downed&&!end);
    document.body.classList.toggle('m05-mounted',m.mounted&&!hidden);
    this.root.classList.toggle('campaign-ui-paused',paused&&!end);
    this.$('.campaign-objective').hidden=hidden;
    set('.campaign-objective strong',this.locale.objectives[m.objective]??'Выполните задачу');
    set('.campaign-objective > span',m.phase==='survey'?`ОСМОТРЕНО ${m.scans.length}/3`:
      m.activeHero==='vos'?'ИРВИН ВОС · СОКОЛ-7':'ЯН МАРТЕН');
    const prompt=this.$('.campaign-prompt');
    prompt.hidden=hidden||!m.prompt;
    if(m.prompt)prompt.textContent=`${this.keyLabel(this.getBindings().interact)} · ${m.prompt}`;
    this.$('.m05-choices').hidden=hidden||!m.choice;
    this.$('.m05-heat').hidden=hidden||!m.mounted;
    this.$('.m05-heat meter').value=m.heat;
    set('.m05-heat span',m.overheated?'ПЕРЕГРЕВ':'НАГРЕВ');
    this.$('.m05-trucks').hidden=hidden||m.stage!=='fuel';
    ['A','B','C'].forEach((id,i)=>{
      const el=this.$('.m05-trucks').children[i+1],status=m.convoy[id].status;
      el.textContent=`${id} · ${names[status]}`;el.dataset.status=status;
    });
    const injury=this.$('.campaign-injury');
    injury.hidden=hidden||!p.downed;
    set('.campaign-injury strong',`${Math.ceil(p.downedTimer??0)} с`);
    set('.campaign-injury span',m.rescuerId?'Союзник оказывает помощь':'Ожидайте помощи отделения');
    const line=this.locale.lines[m.radio?.key],subtitle=this.$('.campaign-subtitle');
    subtitle.classList.toggle('hidden',!line||end||paused);
    if(line&&!end){set('.campaign-subtitle b',this.locale.speakers[line.speaker]??'');set('.campaign-subtitle span',line.text);}
    this.$('.campaign-cutscene').hidden=!scene||paused||end;
    const showTitle=scene&&(scene.id==='C1'?scene.elapsed<7:scene.elapsed>this.definition.cinematics[scene.id].duration-4);
    set('.campaign-cutscene > span',showTitle?(sceneTitles[scene.id]??''):'');
    this.$('.m05-skip').hidden=!scene?.skippable||scene.elapsed<3;
    const fade=this.$('.m05-fade'),fadeAmount=scene?.id==='C1'?Math.max(0,1-scene.elapsed/3):scene?.id==='C4'?
      THREE.MathUtils.smoothstep(scene.elapsed,84,88):0;
    fade.hidden=paused||end||!fadeAmount;fade.style.opacity=String(fadeAmount);
    const ending=this.$('.campaign-ending');ending.classList.toggle('hidden',!end);
    if(end){
      set('.campaign-ending small',m.failed?'МИССИЯ ПРЕРВАНА':'МИССИЯ ВЫПОЛНЕНА');
      set('.campaign-ending p',m.failed??'Бригада получила топливо. Связь по частоте «Маяк» скомпрометирована.');
      const time=m.stats.elapsedSeconds;
      set('.campaign-final-stats',m.failed?'':`${Math.floor(time/60)}:${String(time%60).padStart(2,'0')} · Устранения ${m.stats.kills} · Потери ${m.stats.losses} · Реанимации ${m.stats.revives}`);
      this.$('.campaign-retry').hidden=!m.failed;
      if(!this.ended){this.clearControls();document.exitPointerLock?.();}
    }
    this.ended=end;
    if(!paused)this.updateHeldProps(state);
    this.minimap.update(state,p,{hidden:hidden||Boolean(p.vehicleId),radius:72});
    this.voice.update(state,this.locale,paused||end,this.renderer);
    this.score.update(state,paused||end);this.ambience.update(m,this.renderer.camera,this.renderer.lowQuality,paused||end);
  }
  updateHeldProps(state){
    const scene=state.campaign.cutscene;
    const place=(prop,id,side,visible)=>{
      if(!prop)return;
      const actor=visible&&state.players.find(p=>p.actorId===id&&p.alive);
      const rig=actor&&this.renderer.soldiers.get(actor.id),hand=rig?.bones?.[side+'Hand'];
      prop.visible=Boolean(hand&&rig.group.visible);
      if(!prop.visible)return;
      hand.getWorldPosition(prop.position);hand.getWorldQuaternion(prop.quaternion);
      prop.translateY(.032);prop.rotateZ(side==='Right'?.35:-.35);
    };
    place(this.repairTool,'mechanic','Right',scene?.id==='C1'&&scene.elapsed<11);
    const coffee=scene?.id==='C4'&&scene.elapsed>=18&&scene.elapsed<34;
    const rafa=state.players.some(p=>p.actorId==='rafa'&&p.alive)?'rafa':'rafa-reserve';
    place(this.cups[0],scene?.elapsed>=27?'marten':rafa,'Right',coffee);
    place(this.cups[1],scene?.elapsed>=28?'vos':rafa,'Left',coffee);
  }
  render(r,state,dt,view){
    const m=state.campaign;if(m?.missionId!=='m05')return;
    const p=state.players.find(a=>a.id==='local'),scene=m.cutscene;
    let open='';
    for(const [id,node] of Object.entries(this.gates)){
      const b=M05_GATES[id],progress=m.gates[id]??0;
      node.position.set(b.x,b.baseY+b.h/2+(b.h+.25)*THREE.MathUtils.smoothstep(progress,0,1),b.z);
      if(progress>=1)open+=id+',';
    }
    if(open!==this.open){this.open=open;r.campaignCoverColliders=this.baseColliders.filter(b=>!Object.entries(M05_GATES).some(([id,gate])=>open.includes(id+',')&&b.id===gate.id));}
    for(const [id,node] of Object.entries(this.trucks)){
      const v=state.vehicles.find(a=>a.id==='fuel-'+id),rig=r.vehicleRigs.get('fuel-'+id);
      if(rig)rig.group.visible=false;
      node.visible=Boolean(v&&(v.hp>0||v.wreckTime>0));
      if(node.visible){
        node.position.set(v.x,v.y,v.z);node.rotation.set(v.bodyPitch??0,v.yaw,v.bodyRoll??0,'YXZ');
        const entry=m.convoy[id],age=entry.readyAt==null?-1:state.time-entry.readyAt;
        if(this.doors[id])this.doors[id].rotation.y=entry.status==='waiting'&&age>=0?.9*Math.min(1,age*3):0;
      }
    }
    if(m.mounted){
      this.top.rotation.set(p.pitch,p.yaw,0,'YXZ');
      r.camera.position.set(p.x+Math.sin(p.yaw)*.29,p.y+1.73,p.z+Math.cos(p.yaw)*.29);
      r.camera.rotation.set(p.pitch,p.yaw,0,'YXZ');r.weapon.visible=false;
      r.scoped=r.collimatorAiming=r.binocularAiming=false;
    }else this.top.rotation.set(-.13,-Math.PI*.75,0,'YXZ');
    if(scene){this.renderScene(r,state,scene);r.weapon.visible=false;r.scoped=r.collimatorAiming=r.binocularAiming=false;}
    const detailRange=r.geometryQuality==='high'?192:r.geometryQuality==='medium'?112:0;
    for(const batch of this.detailDressing){
      const {x,z}=batch.position,camera=r.camera.position;
      batch.visible=detailRange>0&&(x-camera.x)**2+(z-camera.z)**2<detailRange**2;
    }
    for(const [i,light] of this.lamps.entries())light.intensity=m.power&&(!r.lowQuality||i%2===0)?19:2.2;
    const dust=scene?.id==='C4'?THREE.MathUtils.smoothstep(scene.elapsed,65,85):0;
    r.scene.fog.color.copy(this.fog).lerp(this.dustColor,dust*.7);
    r.scene.fog.density=THREE.MathUtils.lerp(this.fogDensity,.0062,dust);
    if(this.skyColor&&r.scene.background?.isColor)r.scene.background.copy(this.skyColor).lerp(this.sandSky,dust*.82);
    this.slats.visible=r.camera.position.distanceToSquared(sites.panel)<76**2;
    if(this.slats.visible){
      for(let i=0;i<this.slats.count;i++){
        const offset=(i*1.25+(m.power?state.time*2.5:0))%36;
        this.slats.setMatrixAt(i,this.rollerPose.makeTranslation(-60+offset,15.966,5.3));
      }
      this.slats.instanceMatrix.needsUpdate=true;
    }
    for(const [i,sprite] of this.storm.entries()){
      sprite.visible=dust>0&&(!r.lowQuality||i%2===0);
      sprite.material.opacity=dust*(i%2?.58:.77);
      sprite.position.set(492-dust*150+i*1.8,45+(i%3)*15,224+i*18);
      sprite.scale.set(118+(i%4)*16,104+(i%4)*14,1);
    }
    this.flames.root.visible=m.blastAt!=null;
    if(this.flames.root.visible)this.flames.update(m,state.time,r.camera,this.fireIds);
    r.camera.updateMatrixWorld();
    const locate=m.survey.length?m.survey.map(a=>({...a,label:scanLabels[a.id]})):
      m.target?[{target:m.target,label:''}]:[];
    for(const [i,node] of this.markers.entries()){
      const item=locate[i];
      if(!item||scene||m.failed||m.complete||view.paused){node.hidden=true;continue;}
      const target=item.target,projected=placeCampaignMarker(r.project(target.x,target.y+2,target.z),innerWidth,innerHeight);
      node.hidden=!projected;
      if(projected){node.textContent=`◇ ${item.label} ${Math.round(Math.hypot(target.x-p.x,target.z-p.z))} м`;
        node.style.transform=`translate3d(${projected.x}px,${projected.y}px,0) translate(-50%,-50%)`;}
    }
  }
  renderScene(r,state,scene){
    const config=this.definition.cinematics[scene.id],index=Math.max(0,config.shots.findIndex(s=>scene.elapsed<s.end));
    const i=scene.elapsed>=config.duration?config.shots.length-1:index,shot=config.shots[i],begin=config.shots[i-1]?.end??0;
    let camera=this.cameraShots.get(shot);
    if(!camera){
      camera={...shot,duration:shot.end-begin,heightAboveGround:true,lookHeightAboveGround:true,
        lookAt:typeof shot.lookAt==='string'?shot.camera.at(-1):shot.lookAt};
      this.cameraShots.set(shot,camera);
    }
    const previous=this.lastShot===shot&&scene.elapsed>this.lastShotElapsed&&scene.elapsed-this.lastShotElapsed<.2
      ?this.lastShotPosition:null;
    const pose=cinematicCameraPose(this.map,camera,scene.elapsed-begin,previous);
    this.lastShot=shot;this.lastShotElapsed=scene.elapsed;this.lastShotPosition=pose.position;
    const target=typeof shot.lookAt==='string'&&(state.players.find(a=>a.actorId===shot.lookAt)||state.vehicles.find(v=>v.id===shot.lookAt));
    if(target)pose.lookAt.set(target.x,target.y+(target.vehicleId?.5:1.45),target.z);
    r.camera.position.copy(pose.position);r.camera.lookAt(pose.lookAt);r.camera.fov=shot.fov;r.camera.updateProjectionMatrix();
  }
  dispose(){
    this.voice.dispose();this.score.dispose();this.ambience.dispose();this.flames.dispose();this.minimap.dispose();
    this.audio.campaignMusicOverride=this.oldOverride;
    this.renderer.campaignCoverColliders=null;
    this.renderer.scene.fog.color.copy(this.fog);this.renderer.scene.fog.density=this.fogDensity;
    document.body.classList.remove('campaign-active','campaign-cinematic','campaign-downed','m05-mounted');
    if(this.skyColor&&this.renderer.scene.background?.isColor)this.renderer.scene.background.copy(this.skyColor);
    this.slats.dispose();this.dressing.removeFromParent();
    this.materials.forEach(m=>m.dispose());this.geometries.forEach(g=>g.dispose());this.root.remove();
  }
}
