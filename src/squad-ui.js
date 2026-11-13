import {SQUAD_NAMES,SQUAD_SIZE,sameSquad,SQUAD_COLOR} from '../shared/squads.js';
import {CLASSES} from '../shared/world.js';
const icons={assault:'⌖',medic:'✚',support:'⚒',recon:'◎'};
const el=(tag,cls,value)=>{const node=document.createElement(tag);node.className=cls;if(value!==undefined)node.textContent=value;return node;};
const get=id=>document.getElementById(id);

export function mountSquadUI({getState,getLocalId,getKey,getOrderKeys,onOpen,onChange}){
  let hudSignature='',panelSignature='',pending=false;
  const beaconMarkers=new Map();
  function memberRow(p,ownId){
    const row=el('div',`squad-member${p.alive?'':' dead'}${p.id===ownId?' self':''}`);
    const icon=el('span','squad-class',icons[p.classId]??'·');icon.title=CLASSES[p.classId]?.name??p.classId;icon.setAttribute('aria-label',icon.title);
    const detail=el('div','squad-member-detail'),name=el('span','squad-member-name',`${p.squadLeader?'★ ':''}${p.name}${p.id===ownId?' · ТЫ':''}`);
    const health=el('span','squad-member-health'),fill=el('i','');fill.style.width=(p.alive?Math.max(0,Math.min(100,p.hp)):0)+'%';health.append(fill);
    name.title=p.name;
    const meta=el('span','squad-member-meta');meta.append(el('small','squad-member-classname',icon.title),health);
    detail.append(name,meta);row.append(icon,detail,el('small','squad-member-status',p.alive?'ЖИВ':'МЁРТВ'));
    return row;
  }
  function update(state=getState(),localId=getLocalId()){
    const local=state?.players.find(p=>p.id===localId);if(!local)return;
    const team=state.players.filter(p=>p.team===local.team),own=team.filter(p=>sameSquad(local,p)).sort((a,b)=>Number(b.squadLeader)-Number(a.squadLeader));
    const sig=JSON.stringify(own.map(p=>[p.id,p.name,p.classId,p.hp,p.alive,p.squadLeader]))+local.squadId+getKey();
    if(sig!==hudSignature){
      hudSignature=sig;get('squad-hud-name').textContent=`${SQUAD_NAMES[local.squadId-1]??'ОТРЯД'} · ${own.length}/${SQUAD_SIZE}`;
      get('squad-hud-key').textContent=`${getKey()} · ОТРЯДЫ`;
      get('squad-hud-members').replaceChildren(...own.map(p=>memberRow(p,localId)));
    }
    if(!get('squad-panel').open)return;
    const panelSig=JSON.stringify(team.map(p=>[p.id,p.name,p.classId,p.hp,p.alive,p.squadId,p.squadLeader]))+pending+JSON.stringify(getOrderKeys());
    if(panelSignature===panelSig)return;panelSignature=panelSig;
    const keys=getOrderKeys();
    get('squad-current').textContent=local.squadLeader?`Ты — лидер. ${keys.attack}: штурм · ${keys.defend}: оборона · ${keys.follow}: за мной.`:'Команды ботам отдаёт лидер отряда.';
    const cards=SQUAD_NAMES.map((name,index)=>{
      const id=index+1,members=team.filter(p=>p.squadId===id).sort((a,b)=>Number(b.squadLeader)-Number(a.squadLeader)),current=local.squadId===id;
      const card=el('article','squad-card'+(current?' current':'')),header=el('header','');header.append(el('h3','',name),el('span','',`${members.length}/${SQUAD_SIZE}`));card.append(header);
      card.append(...members.map(p=>memberRow(p,localId)));
      for(let n=members.length;n<SQUAD_SIZE;n++)card.append(el('div','squad-empty-slot','Свободное место'));
      const button=el('button','panel-secondary',current?'Твой отряд':members.length>=SQUAD_SIZE?'Отряд заполнен':'Вступить ↗');
      button.dataset.squadId=String(id);
      button.disabled=current||members.length>=SQUAD_SIZE||pending;
      button.addEventListener('click',async()=>{
        if(pending)return;pending=true;update();get('squad-status').textContent='Меняем отряд…';
        try{await onChange(id);get('squad-status').textContent='Отряд изменён.';}
        catch(error){get('squad-status').textContent=error.message;}
        finally{pending=false;panelSignature='';update();}
      });card.append(button);return card;
    });
    const focused=document.activeElement?.dataset.squadId;
    get('squad-list').replaceChildren(...cards);
    if(focused)get('squad-list').querySelector(`[data-squad-id="${focused}"]`)?.focus();
  }
  function open(){if(!getState()||!getLocalId())return;onOpen();panelSignature='';get('squad-status').textContent='';get('squad-panel').showModal();update();}
  for(const button of document.querySelectorAll('[data-open-squads]'))button.addEventListener('click',open);
  function markers(renderer,state,localId){
    const local=state?.players.find(p=>p.id===localId);if(!local)return;
    const active=new Set();
    for(const beacon of state.deployables??[]){
      if(beacon.kind!=='beacon'||beacon.team!==local.team||beacon.hp<=0||beacon.expires<=state.time)continue;
      active.add(beacon.id);let node=beaconMarkers.get(beacon.id);
      if(!node){node=el('div','world-marker beacon-world-marker');node.append(el('b','','⌁'),el('span',''));get('squad-beacon-markers').append(node);beaconMarkers.set(beacon.id,node);}
      const own=sameSquad(local,beacon),position=renderer.project(beacon.x,beacon.y+1.8,beacon.z);
      node.style.display=position.visible?'flex':'none';node.style.color=own?SQUAD_COLOR:'#79c5d2';
      if(!position.visible)continue;
      node.style.transform=`translate3d(${Math.round(position.x)}px,${Math.round(position.y)}px,0) translate(-50%,-50%)`;
      node.lastChild.textContent=`${own?'МАЯК ОТРЯДА':'СОЮЗНЫЙ МАЯК'} · ${Math.round(Math.hypot(beacon.x-local.x,beacon.z-local.z))} м`;
    }
    for(const [id,node] of beaconMarkers)if(!active.has(id)){node.remove();beaconMarkers.delete(id);}
  }
  return {open,update,markers};
}
