import './objectives-journal.css';

const M04_STAGES=['approach','right','transfer','orbit','landing','disembark','depot','station','freight','canal','relay','workshops','serviceStreet','tunnel'];

// Derive the journal from the current authoritative snapshot, never from
// remembered UI history: checkpoint restoration also restores the task list.
export function missionObjectives(definition,m){
  if(!m)return {done:[],current:null};
  const id=definition.id??m.missionId;
  if(id==='m01'){
    const all=(definition.objectives??[]);
    const done=all.filter(o=>m.objectives?.[o.id]?.done).map(o=>o.text??o.id);
    if(m.flags?.documents)done.push('documents');
    if(m.flags?.courierSaved)done.push('courier');
    return {done,current:m.complete||m.objectives?.[m.objective]?.done?null:m.objective??null};
  }
  if(id==='m02'){
    const done=[],completed=new Set(m.completedObjectives??[]);
    if(m.phase!=='march')done.push('march');
    if(completed.has('armor'))done.push('battle');
    if(completed.has('platoon'))done.push('village');
    if(completed.has('intel'))done.push('debrief');
    return {done,current:m.complete||m.phase==='finale'?null:m.objective??m.phase};
  }
  const order=id==='m03'?['ride',...(definition.stages??[]).map(s=>s.id)]:id==='m04'?M04_STAGES:id==='m05'?definition.objectives:null;
  if(!order)return {done:[],current:m.complete?null:m.objective??null};
  const current=m.objective??m.stage,at=order.indexOf(current);
  if(current==='finale'||m.complete)return {done:[...order],current:null};
  return {done:at>=0?order.slice(0,at):[],current:at>=0?current:null};
}

export function mountObjectivesJournal(root,definition,locale,keyLabel){
  const objective=root.querySelector('.campaign-objective,.m02-objective');
  if(!objective)return null;
  const dock=document.createElement('div');dock.className='campaign-objectives-dock';
  const panel=document.createElement('aside');
  panel.className='campaign-objectives-journal';panel.hidden=true;
  panel.setAttribute('aria-label','Журнал задач миссии');
  const hint=document.createElement('div');
  hint.className='campaign-objectives-hint';hint.hidden=true;
  const key=document.createElement('kbd');hint.append(key,document.createTextNode(' Задачи'));
  const header=document.createElement('header');
  const kicker=document.createElement('small');kicker.textContent='ЖУРНАЛ ЗАДАЧ';
  header.append(kicker);
  const list=document.createElement('ol');list.className='campaign-objectives-list';
  const footer=document.createElement('footer');
  panel.append(header,list,footer);dock.append(hint,panel);objective.append(dock);
  let held=false,lastSignature='';
  const label=id=>locale.objectives?.[id]??id;
  const hide=()=>{panel.hidden=true;root.classList.remove('campaign-journal-open');};
  return {
    setHeld(value){held=value;if(!value)hide();},
    update(m,paused){
      if(paused||!m||objective.hidden||m.cutscene||m.transfer!=null||m.disembark||m.awaitingLoadout||m.failed||m.complete){
        held=false;hint.hidden=true;hide();return;
      }
      const objectives=missionObjectives(definition,m);
      const binding=keyLabel();
      if(key.textContent!==binding)key.textContent=binding;
      // Keep the hint within the ordinary HUD; it is not shown in cutscenes.
      hint.hidden=!objectives.current&&!objectives.done.length;
      if(!held||hint.hidden){hide();return;}
      const signature=JSON.stringify([objectives,binding]);
      const changed=signature!==lastSignature;
      if(changed){
        lastSignature=signature;list.replaceChildren();
        const add=(text,done)=>{
          const item=document.createElement('li');item.className=done?'is-complete':'is-current';
          const icon=document.createElement('span');icon.className='campaign-objective-state';icon.setAttribute('aria-hidden','true');icon.textContent=done?'✓':'◇';
          const copy=document.createElement('div');
          if(!done){const active=document.createElement('small');active.textContent='ТЕКУЩАЯ ЗАДАЧА';copy.append(active);}
          const line=document.createElement('span');line.className='campaign-objective-label';line.textContent=text;copy.append(line);
          item.append(icon,copy);list.append(item);
        };
        objectives.done.forEach(id=>add(label(id),true));
        if(objectives.current)add(label(objectives.current),false);
        else if(!objectives.done.length)add('Ожидайте приказа',false);
        footer.textContent='Отпустите '+binding+', чтобы закрыть';

      }
      const opening=panel.hidden;
      root.classList.add('campaign-journal-open');panel.hidden=false;
      if(opening||changed)list.scrollTop=list.scrollHeight;
    }
  };
}
