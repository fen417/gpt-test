export function closeMenuPanels(){
  for(const dialog of document.querySelectorAll('dialog.menu-dialog'))if(dialog.open)dialog.close();
}

export function mountMenuPanels(click){
  const get=id=>document.getElementById(id);
  const open=id=>{const dialog=get(id);if(!dialog.open){click();dialog.showModal();}};
  get('open-solo').addEventListener('click',()=>open('single-player-panel'));
  get('join-toggle').addEventListener('click',()=>open('multiplayer-panel'));
  get('host').addEventListener('click',()=>open('create-room-panel'));
  for(const button of document.querySelectorAll('[data-close-dialog]'))button.addEventListener('click',()=>get(button.dataset.closeDialog).close());
  for(const dialog of document.querySelectorAll('dialog.menu-dialog'))dialog.addEventListener('click',event=>{
    if(event.target!==dialog)return;
    const rect=dialog.getBoundingClientRect();
    if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();
  });
  const name=get('callsign'),networkName=get('network-callsign');networkName.value=name.value;
  name.addEventListener('input',()=>{networkName.value=name.value;});
  networkName.addEventListener('input',()=>{name.value=networkName.value;});
  const roomNames=['Операция «Рубеж»','Огневой контакт','Сектор прорыва','Высота 09','Линия фронта','Точка удара','Штурмовой сектор','Операция «Бастион»'];
  let suggestedName;
  const suggestName=()=>{const choices=roomNames.filter(value=>value!==suggestedName);suggestedName=choices[Math.floor(Math.random()*choices.length)];get('room-name').value=suggestedName;};
  suggestName();
  get('room-name-random').addEventListener('click',()=>{click();suggestName();});
  get('host').addEventListener('click',()=>{if(get('room-name').value===suggestedName)suggestName();});
  const tabs=[...document.querySelectorAll('[data-settings-tab]')];
  function selectTab(tab,focus=false){
    for(const item of tabs){const selected=item===tab;item.setAttribute('aria-selected',String(selected));item.tabIndex=selected?0:-1;get('settings-'+item.dataset.settingsTab).classList.toggle('hidden',!selected);}
    if(focus)tab.focus();
  }
  for(const [index,tab] of tabs.entries()){
    tab.addEventListener('click',()=>{click();selectTab(tab);});
    tab.addEventListener('keydown',event=>{
      let next;
      if(event.key==='ArrowDown'||event.key==='ArrowRight')next=(index+1)%tabs.length;
      if(event.key==='ArrowUp'||event.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;
      if(event.key==='Home')next=0;if(event.key==='End')next=tabs.length-1;
      if(next!==undefined){event.preventDefault();selectTab(tabs[next],true);}
    });
  }
  for(const output of document.querySelectorAll('[data-range-value]')){
    const input=get(output.dataset.rangeValue);
    const update=()=>{const value=Number(input.value);output.value=input.id==='fov'?value+'°':input.id==='sensitivity'?value.toFixed(2):Math.round(value*100)+'%';input.style.setProperty('--range-fill',(value-Number(input.min))/(Number(input.max)-Number(input.min))*100+'%');};
    input.addEventListener('input',update);update();
  }
  get('settings-close').addEventListener('click',()=>get('resume').click());
  // Keep keyboard focus in the custom pause/settings overlay as with dialogs.
  let previousFocus;
  new MutationObserver(()=>{
    if(!get('pause').classList.contains('hidden')){previousFocus=document.activeElement;tabs.find(tab=>tab.getAttribute('aria-selected')==='true').focus();}
    else if(previousFocus?.isConnected&&!previousFocus.closest('.hidden'))previousFocus.focus();
  }).observe(get('pause'),{attributes:true,attributeFilter:['class']});
  get('pause').addEventListener('keydown',event=>{
    if(event.key!=='Tab')return;
    const items=[...get('pause').querySelectorAll('button:not(:disabled),input,select,[tabindex="0"]')].filter(el=>el.getClientRects().length&&el.tabIndex>=0);
    const first=items[0],last=items.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
  });
}
