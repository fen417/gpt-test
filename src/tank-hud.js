import {TANK_CANNON,tankMachineGunMuzzle,tankMuzzle} from '../shared/tank.js';
import {campaignTankSight} from '../shared/campaign/tank-controls.js';
import {tankReloadMarkup} from './tank-reticle.js';
import './campaign/mission2.css';
import './tank-hud.css';

export class TankHud {
  constructor(root) {
    this.root=root;
    this.element=document.createElement('div');
    this.element.className='tank-hud';
    this.element.hidden=true;
    this.element.innerHTML=`
      <div class="m02-reticle">
        <span class="m02-aimdot">+</span><span class="m02-bore-dot">◇</span>
        <span class="m02-range" hidden></span>${tankReloadMarkup}
      </div>
      <aside class="m02-weapon-panel">
        <strong class="m02-weapon"></strong><span class="m02-ammo"></span><span class="m02-hp"></span>
      </aside>`;
    root.append(this.element);
    const find=selector=>this.element.querySelector(selector);
    this.reticle=find('.m02-reticle');
    this.bore=find('.m02-bore-dot');
    this.reload=find('.m02-reload');
    this.reloadStatus=find('.m02-reload-status');
    this.rangeLabel=find('.m02-range');
    this.weapon=find('.m02-weapon');
    this.ammo=find('.m02-ammo');
    this.hp=find('.m02-hp');
    this.muzzle={};
    this.seconds=new Intl.NumberFormat('ru',{minimumFractionDigits:1,maximumFractionDigits:1});
  }

  update(state,player,renderer,now,{zoom=false}={}) {
    const tank=player?.alive&&state?.vehicles.find(vehicle=>vehicle.id===player.vehicleId&&vehicle.type==='tank');
    const crew=Boolean(tank&&player.vehicleSeat<2);
    this.root.classList.toggle('tank-active',crew);
    this.root.classList.toggle('tank-gunner',crew);
    this.element.hidden=!tank;
    if(!tank)return;

    const machineGun=player.vehicleSeat===1;
    this.reticle.hidden=!crew;
    this.element.classList.toggle('m02-sniper-mode',crew&&zoom);
    this.hp.textContent=`БРОНЯ ${Math.ceil(tank.hp)} / ${tank.maxHp} · ${Math.round(Math.abs(tank.speed)*3.6)} КМ/Ч`;
    this.weapon.hidden=this.ammo.hidden=!crew;
    if(!crew)return;

    this.weapon.textContent=machineGun?'ПУЛЕМЁТ':'125 ММ · ОФ';
    this.ammo.textContent=machineGun
      ?tank.overheated?'ПУЛЕМЁТ ОСТЫВАЕТ':`НАГРЕВ ${Math.round(tank.heat*100)}%`
      :`${tank.cannonAmmo} СНАРЯДОВ`;

    const {camera}=renderer;
    const yaw=machineGun?tank.gunAimYaw??tank.yaw:tank.aimYaw;
    const pitch=machineGun?tank.gunAimPitch??0:tank.aimPitch;
    const mouth=machineGun?tankMachineGunMuzzle(tank,this.muzzle):tankMuzzle(tank,this.muzzle);
    const d=300,forward=d*Math.cos(pitch);
    const bore=renderer.project(mouth.x-Math.sin(yaw)*forward,mouth.y+Math.sin(pitch)*d,mouth.z-Math.cos(yaw)*forward);
    this.bore.hidden=!bore.visible;
    if(bore.visible)this.bore.style.transform=`translate(${bore.x}px,${bore.y}px) translate(-50%,-50%)`;

    this.rangeLabel.hidden=!zoom;
    if(zoom&&(now>=(this.nextRangeAt??0)||this.rangeVehicle!==tank.id||this.rangeSeat!==player.vehicleSeat)){
      const {range}=campaignTankSight(renderer.map,state.vehicles,camera.position,camera.rotation.y,camera.rotation.x,tank.id);
      this.rangeLabel.textContent=`${Math.round(range)} М`;
      this.nextRangeAt=now+100;
      this.rangeVehicle=tank.id;
      this.rangeSeat=player.vehicleSeat;
    }

    this.reload.hidden=machineGun;
    if(machineGun)return;
    const remaining=Math.max(0,tank.cannonReadyAt-state.time);
    const ready=tank.cannonAmmo>0&&remaining===0;
    this.reload.classList.toggle('ready',ready);
    this.reload.style.setProperty('--reload-progress',tank.cannonAmmo>0?Math.max(0,1-remaining/TANK_CANNON.reload):0);
    this.reloadStatus.textContent=ready?'ГОТОВ':tank.cannonAmmo===0?'НЕТ СНАРЯДОВ':`${this.seconds.format(Math.max(.1,remaining))} с`;
  }
}
