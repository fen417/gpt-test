import * as THREE from 'three';
import {tankDropAngle,TANK_CANNON,tankMuzzle} from '../shared/tank.js';
import {getAssetColliders,rayCollider} from '../shared/asset-colliders.js';
import './tank-hud.css';
export class TankHud{
  constructor(root){
    this.root=root;this.element=document.createElement('div');this.element.className='tank-hud';this.element.hidden=true;
    this.element.innerHTML=`<div class="tank-optic"><i class="tank-inner"></i><svg class="tank-reticle" viewBox="0 0 600 400"><path d="M150 200H275M325 200H450M300 65V175M300 225V345"/><g class="tank-range-marks"></g></svg><span class="tank-range">— М</span><span class="tank-optic-label">ОПТИЧЕСКИЙ КАНАЛ · ОФ</span><i class="tank-bore"></i></div><aside class="tank-condition"><header>БРОНЯ <strong class="tank-hp"></strong></header><svg viewBox="0 0 130 140"><rect class="tank-track-left" x="18" y="22" width="20" height="98" rx="6"/><rect class="tank-hull" x="42" y="13" width="46" height="112" rx="9"/><rect class="tank-track-right" x="92" y="22" width="20" height="98" rx="6"/><g class="tank-turret"><rect x="52" y="44" width="26" height="48" rx="7"/><path d="M65 44V4"/></g></svg><span class="tank-alert"></span><div class="tank-crew"></div></aside><aside class="tank-weapon"><small>СИСТЕМА ВООРУЖЕНИЯ</small><h3 class="tank-weapon-name"></h3><div class="tank-ammo-row"><strong class="tank-ammo"></strong><span class="tank-ready"></span><svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="16"/><circle class="tank-reload" cx="20" cy="20" r="16"/></svg></div><div class="tank-heat"><i></i></div><footer>1 ОРУДИЕ · 2 ПУЛЕМЁТ<br><span class="tank-keys"></span></footer></aside>`;
    root.append(this.element);this.refs=Object.fromEntries(['range','hp','alert','crew','weapon-name','ammo','ready','reload','bore','keys','optic-label','turret','track-left','track-right','hull'].map(name=>[name,this.element.querySelector('.tank-'+name)]));
    this.origin=new THREE.Vector3();this.direction=new THREE.Vector3();this.point=new THREE.Vector3();this.muzzle={x:0,y:0,z:0};this.last=new Map();
    const g=this.element.querySelector('.tank-range-marks');for(const range of [100,200,300,400,500]){const line=document.createElementNS('http://www.w3.org/2000/svg','g');line.innerHTML=`<path d="M288 0H312"/><text x="321" y="4">${range}</text>`;g.append(line);}
  }
  text(name,value){if(this.last.get(name)!==value){this.refs[name].textContent=value;this.last.set(name,value);}}
  update(state,player,renderer,now,{zoom=false,thirdPerson=true,cameraKey='V',seatKey='F'}={}){
    const v=player?.alive&&state?.vehicles.find(v=>v.id===player.vehicleId),active=v?.type==='tank';this.element.hidden=!active;this.root.classList.toggle('tank-active',active);this.root.classList.toggle('tank-gunner',active&&player.vehicleSeat===1);if(!active)return;
    const gunner=player.vehicleSeat===1;this.element.classList.toggle('is-gunner',gunner);this.element.classList.toggle('is-zoom',gunner&&zoom);this.element.classList.toggle('is-mg',v.weapon===1);
    this.text('keys',`${cameraKey} КАМЕРА · ${seatKey} МЕСТО`);
    if(gunner){
      const muzzle=tankMuzzle(v,this.muzzle),distance=this.range??200;this.point.set(muzzle.x-Math.sin(v.aimYaw)*Math.cos(v.aimPitch)*distance,muzzle.y+Math.sin(v.aimPitch)*distance,muzzle.z-Math.cos(v.aimYaw)*Math.cos(v.aimPitch)*distance).project(renderer.camera);
      this.refs.bore.style.transform=`translate(${this.point.x*renderer.viewportWidth/2}px,${-this.point.y*renderer.viewportHeight/2}px)`;
    }
    if(now<(this.next??0))return;this.next=now+100;
    renderer.camera.getWorldPosition(this.origin);renderer.camera.getWorldDirection(this.direction);
    let range=renderer.map.terrain?.raycast(this.origin,this.direction,800)??800;for(const box of getAssetColliders(renderer.map))range=Math.min(range,rayCollider(this.origin,this.direction,box,range));this.range=Number.isFinite(range)?range:800;
    this.text('range',this.range>=800?'ДАЛЕЕ 800 М':`${Math.round(this.range)} М`);
    const focal=renderer.viewportHeight/(2*Math.tan(renderer.camera.fov*Math.PI/360));
    for(const [i,node] of [...this.element.querySelector('.tank-range-marks').children].entries())node.setAttribute('transform',`translate(0 ${200+Math.tan(tankDropAngle((i+1)*100,v.weapon))*focal})`);
    this.text('hp',`${Math.ceil(v.hp/v.maxHp*100)}%`);this.text('weapon-name',v.weapon===1?'СПАРЕННЫЙ ПУЛЕМЁТ':'125 ММ · ОФ');
    this.text('optic-label',v.weapon===1?'ПУЛЕМЁТНЫЙ КАНАЛ':'ОПТИЧЕСКИЙ КАНАЛ · ОФ');this.text('ammo',v.weapon===1?'∞':String(v.cannonAmmo));
    const remaining=Math.max(0,v.cannonReadyAt-state.time),ready=state.time>=v.weaponReadyAt&&(v.weapon===1?!v.overheated:remaining===0&&v.cannonAmmo>0);
    this.text('ready',ready?'ГОТОВ':state.time<v.weaponReadyAt?'СМЕНА':v.weapon===1?'ОХЛАЖДЕНИЕ':v.cannonAmmo?remaining.toFixed(1)+' С':'НЕТ СНАРЯДОВ');
    this.refs.reload.style.strokeDashoffset=String(101*Math.min(1,remaining/TANK_CANNON.reload));this.element.querySelector('.tank-heat i').style.transform=`scaleX(${v.heat})`;
    this.text('alert',state.players.some(p=>p.gadgetAction==='repair'&&p.gadgetTargetId===v.id)?'ИНЖЕНЕР · ИДЁТ РЕМОНТ':v.burning?'ПОЖАР · НУЖЕН РЕМОНТ':Math.max(v.leftTrack,v.rightTrack)>=80?'ГУСЕНИЦА РАЗРУШЕНА':Math.max(v.leftTrack,v.rightTrack)>=40?'ПОВРЕЖДЕНА ГУСЕНИЦА':'');
    for(const [key,value] of [['track-left',v.leftTrack],['track-right',v.rightTrack],['hull',100-v.hp/v.maxHp*100]])this.refs[key].style.fill=value>=80?'#e07456':value>=40?'#d4b06a':'#b7cf99';
    this.refs.turret.setAttribute('transform',`rotate(${-(v.aimYaw-v.yaw)*180/Math.PI} 65 68)`);
    const crew=v.seats.map((id,i)=>`${i+1} · ${id?state.players.find(p=>p.id===id)?.name??'Боец':'Свободно'}`).join('\n');this.text('crew',crew);
  }
}
