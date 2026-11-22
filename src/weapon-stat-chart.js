import {resolveWeaponModules} from '../shared/weapon-modules.js';
import {WEAPONS} from '../shared/world.js';
import {opticZooms} from './scope-optics.js';

const decimal=new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2});
const signedPercent=new Intl.NumberFormat('ru-RU',{style:'percent',signDisplay:'exceptZero',maximumFractionDigits:1});
const numeric=value=>decimal.format(value);
const seconds=value=>numeric(value)+' с';
const rows=[
  ['Ёмкость',w=>w.mag,numeric,true],
  ['Перезарядка',w=>w.reload,seconds,false],
  ['Разброс от бедра',w=>w.spread*.66*(w.hipSpreadScale??1)*180/Math.PI,v=>numeric(v)+'°',false],
  ['Разброс в прицеле',w=>w.spread*.24*(w.adsSpreadScale??1)*180/Math.PI,v=>numeric(v)+'°',false],
  ['Отдача',w=>w.recoil*180/Math.PI,v=>numeric(v)+'°',false],
  ['Вход в прицел',w=>w.aimTime??1,v=>numeric(v*100)+'%',false],
  ['Кратность',w=>w.zooms.at(-1),(_,w)=>w.zooms.map(numeric).join('–')+'×',true],
];

function element(tag,className,value){
  const node=document.createElement(tag);
  if(className)node.className=className;
  if(value)node.textContent=value;
  return node;
}

export function createWeaponStatChart(list){
  const panel=element('section','weapon-stat-chart');
  const title=element('h3','', 'Характеристики');
  const caption=element('p','weapon-stat-caption');
  const legend=element('p','weapon-stat-key','Черта на шкале — штатная комплектация');
  const metrics=element('dl','weapon-stat-rows');
  panel.append(title,caption,legend,metrics);
  list.after(panel);
  return (weaponId,slots,candidate)=>{
    const base=WEAPONS[weaponId];
    panel.hidden=!base;
    if(!base)return;
    caption.textContent=candidate?candidate+' в сборке':'Текущая сборка';
    const stock={...base,zooms:opticZooms(weaponId)??[1]};
    const current={...resolveWeaponModules(base,slots),zooms:opticZooms(weaponId,slots?.optic)??[1]};
    metrics.replaceChildren(...rows.map(([label,measure,format,higherIsBetter])=>{
      const baseline=measure(stock),value=measure(current),delta=value/baseline-1;
      const changed=Math.abs(delta)>.0001;
      const improvement=delta*(higherIsBetter?1:-1);
      const meter=element('span','weapon-stat-meter');
      meter.setAttribute('aria-hidden','true');
      const marker=element('span','weapon-stat-fill');
      if(changed){
        const limit=Math.sign(improvement)*Math.min(Math.abs(improvement)*90,48);
        marker.style.left=(50+Math.min(0,limit))+'%';
        marker.style.width=Math.abs(limit)+'%';
      }
      const row=element('div','weapon-stat-row');
      row.dataset.effect=changed?(improvement>0?'gain':'loss'):'base';
      const readings=element('dd','weapon-stat-reading');
      const shown=format(value,current),original=format(baseline,stock);
      readings.append(element('span','weapon-stat-value',shown!==original?`${original} → ${shown}`:shown),
        element('span','weapon-stat-delta',changed?signedPercent.format(delta):'—'));
      meter.append(marker);
      row.append(element('dt','',label),meter,readings);
      return row;
    }));
  };
}
