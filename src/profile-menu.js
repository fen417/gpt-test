import {BASE_MAPS,CLASSES,WEAPONS} from '../shared/world.js';
import {readCampaignProgress} from './campaign/progress.js';
import {firebaseWebConfig} from './profile-config.js';
import {
  DEFAULT_CUSTOMIZATION,PROFILE_MISSIONS,SOLDIER_FINISHES,WEAPON_FINISHES,
  attachmentSlots,favorite,localCampaignSummary,withCustomization,
} from './profile-data.js';
import './profile-menu.css';

const knownAccount='sector09-profile-session',guestProfile='sector09-guest-customization';
const readLocal=key=>{try{return localStorage.getItem(key);}catch{return null;}};
const writeLocal=(key,value)=>{try{value===null?localStorage.removeItem(key):localStorage.setItem(key,value);}catch{}};

const authErrors={
  'auth/invalid-credential':'Проверьте адрес почты и пароль.',
  'auth/user-not-found':'Проверьте адрес почты и пароль.',
  'auth/wrong-password':'Проверьте адрес почты и пароль.',
  'auth/email-already-in-use':'Для этой почты уже есть аккаунт. Войдите или сбросьте пароль.',
  'auth/weak-password':'Выберите более надёжный пароль.',
  'auth/popup-blocked':'Разрешите всплывающие окна для входа через Google.',
  'auth/popup-closed-by-user':'Окно входа закрыто.',
  'auth/account-exists-with-different-credential':'Войдите с паролем той же почты, чтобы привязать Google.',
  'auth/credential-already-in-use':'Этот Google-аккаунт уже привязан к другому профилю.',
  'auth/unauthorized-domain':'Этот адрес игры не добавлен в список доменов Firebase.',
  'auth/operation-not-allowed':'Этот способ входа ещё не включён в Firebase.',
  'auth/network-request-failed':'Проверьте интернет-соединение и попробуйте снова.',
  'auth/too-many-requests':'Слишком много попыток. Попробуйте чуть позже.',
};

const formatTime=seconds=>Math.floor(seconds/60)+' мин '+String(Math.floor(seconds%60)).padStart(2,'0')+' с';

function readGuest(){
  try{return JSON.parse(readLocal(guestProfile))??DEFAULT_CUSTOMIZATION;}
  catch{return DEFAULT_CUSTOMIZATION;}
}

export function mountPlayerProfile({onOpen,defaultServerUrl,resetStats,getRenderer}){
  const $=id=>document.getElementById(id);
  const dialog=$('profile-panel'),authDialog=$('account-panel'),confirm=$('profile-confirm-reset');
  const form=$('profile-auth'),email=$('profile-email'),password=$('profile-password');
  const tabs=[...dialog.querySelectorAll('[data-profile-tab]')];
  let cloud,connecting,authBusy=false,profileBusy=false,registering=false,guest=false;
  let authMessage='',message='',tab='overview',localCustomization=readGuest(),preview,previewLoading;
  const set=(id,value)=>{$(id).textContent=value;};
  const fill=(select,options)=>select.replaceChildren(...options.map(([value,name])=>new Option(name,value)));
  const customization=()=>cloud?.state.user?cloud.state.customization:localCustomization;
  const weaponOptions=Object.values(WEAPONS).sort((a,b)=>Number(Boolean(a.sidearm))-Number(Boolean(b.sidearm)))
    .map(weapon=>[weapon.id,weapon.name]);
  const soldierClass=$('profile-soldier-class'),soldierTeam=$('profile-soldier-team');
  const skinWeapon=$('profile-skin-weapon'),attachmentWeapon=$('profile-attachment-weapon');
  const attachmentOptions=$('profile-attachment-options');
  fill(soldierClass,Object.entries(CLASSES).map(([id,info])=>[id,info.name]));
  for(const select of [skinWeapon,attachmentWeapon]){fill(select,weaponOptions);select.value='ar416';}

  function renderAuth(){
    const state=cloud?.state;
    $('open-account').hidden=!firebaseWebConfig||Boolean(state?.user);
    form.hidden=!state||Boolean(state.user)||state.loading;
    for(const control of form.elements)control.disabled=authBusy;
    set('account-title',registering?'Создать аккаунт':'Вход в игру');
    set('profile-submit',registering?'Зарегистрироваться':'Войти');
    set('profile-register',registering?'У меня есть аккаунт':'Создать аккаунт');
    set('account-status',authBusy?'Подождите…':authMessage||(form.hidden?'Подключаемся…':''));
  }

  function openAuth(){
    if(!firebaseWebConfig||cloud?.state.user)return;
    renderAuth();
    if(!authDialog.open)authDialog.showModal();
    void connect();
  }

  function renderProfile(){
    const state=cloud?.state,user=state?.user,pvp=state?.pvp;
    const local=localCampaignSummary(readCampaignProgress());
    set('profile-identity',[$('callsign').value.trim()||'Rookie',user?.email??'Гость'].join(' · '));
    $('profile-account-actions').hidden=!user;
    $('profile-import').hidden=!user||!Object.keys(local).length;
    for(const control of dialog.querySelectorAll('#profile-account-actions button,#profile-import'))control.disabled=profileBusy;

    const available=Boolean(pvp)||Boolean(user&&!state.loading&&!state.problem);
    const kills=pvp?.kills??0,deaths=pvp?.deaths??0;
    set('profile-kills',available?kills:'—');
    set('profile-deaths',available?deaths:'—');
    set('profile-kd',!available?'—':deaths?(kills/deaths).toLocaleString('ru',{maximumFractionDigits:2}):kills?'∞':'—');
    set('profile-class',CLASSES[favorite(pvp?.classes,CLASSES)]?.name??'—');
    set('profile-map',BASE_MAPS[favorite(pvp?.maps,BASE_MAPS)]?.name??'—');
    const results=user?state.campaign:local;
    $('profile-campaign').replaceChildren(...PROFILE_MISSIONS.map(mission=>{
      const progress=results?.[mission.id];
      const item=document.createElement('li'),title=document.createElement('span'),record=document.createElement('small');
      title.textContent=mission.title;
      item.toggleAttribute('data-complete',Boolean(progress?.completed));
      record.textContent=progress?.completed?'Пройдена'+(progress.bestSeconds?' · '+formatTime(progress.bestSeconds):''):
        progress?.checkpoint?'Контрольная точка '+progress.checkpoint:'—';
      item.append(title,record);return item;
    }));
    set('profile-status',message||state?.problem||(user&&state.loading?'Загружаем профиль…':
      state?.syncing?'Синхронизируем сюжетные достижения…':''));
    renderCustomization();
  }

  function renderCustomization(){
    const value=customization();
    setPressed('profile-soldier-finishes',value.soldierSkin??'standard');
    setPressed('profile-weapon-finishes',value.weaponSkins?.[skinWeapon.value]??'standard');
    const loadout=value.attachments?.[attachmentWeapon.value]??{};
    for(const select of attachmentOptions.querySelectorAll('select')){
      select.value=loadout[select.dataset.slot]??'standard';
      if(!select.value)select.value='standard';
    }
    $('profile-clear-attachments').disabled=!Object.keys(loadout).length;
    $('profile-customization-note').hidden=tab==='overview';
    set('profile-customization-note',tab==='attachments'?
      'В 3D показана штатная комплектация. Сохранённый обвес можно будет применять после обновления экипировки.':
      'Расцветка сохраняется для профиля и 3D-просмотра.');
    refreshPreview();
  }

  function setPressed(id,value){
    const buttons=[...$(id).querySelectorAll('button')];
    if(!buttons.some(button=>button.value===value))value='standard';
    for(const button of buttons)button.setAttribute('aria-pressed',String(button.value===value));
  }

  function selection(){
    const value=customization();
    if(tab==='soldier')return {
      classId:soldierClass.value,team:Number(soldierTeam.value),
      color:SOLDIER_FINISHES[value.soldierSkin]?.color??null,
    };
    if(tab==='overview')return null;
    const weaponId=tab==='weapon'?skinWeapon.value:attachmentWeapon.value;
    return {weaponId,color:WEAPON_FINISHES[value.weaponSkins?.[weaponId]]?.color??null};
  }

  function refreshPreview(){
    if(!dialog.open||tab==='overview'||!getRenderer())return;
    if(preview){void preview.update();return;}
    if(!previewLoading)previewLoading=import('./profile-preview.js').then(({mountProfilePreview})=>{
      preview=mountProfilePreview({getRenderer,getSelection:selection});return preview.update();
    }).catch(()=>set('profile-preview-hint','3D-просмотр недоступен.')).finally(()=>{previewLoading=null;});
  }

  function selectTab(next,focus=false){
    tab=next.dataset.profileTab;
    for(const button of tabs){
      const selected=button===next;
      button.setAttribute('aria-selected',String(selected));
      button.tabIndex=selected?0:-1;
      $(button.getAttribute('aria-controls')).hidden=!selected;
    }
    $('profile-preview-frame').hidden=tab==='overview';
    if(focus)next.focus();
    renderCustomization();
  }

  async function saveCustomization(change){
    message='';
    if(!cloud?.state.user){
      localCustomization=withCustomization(localCustomization,change);
      writeLocal(guestProfile,JSON.stringify(localCustomization));
      renderCustomization();
      return;
    }
    try{await cloud.saveCustomization(change);}
    catch{message='Не удалось сохранить снаряжение.';renderProfile();}
  }

  function mountFinishes(id,finishes,change){
    $(id).replaceChildren(...Object.entries(finishes).map(([value,finish])=>{
      const button=document.createElement('button'),swatch=document.createElement('span');
      button.type='button';button.value=value;button.setAttribute('aria-pressed','false');
      swatch.className='profile-swatch';swatch.setAttribute('aria-hidden','true');
      if(finish.color)swatch.style.setProperty('--finish-color',finish.color);
      button.append(swatch,finish.name);
      button.addEventListener('click',()=>void saveCustomization({...change(),value}));
      return button;
    }));
  }

  function rebuildAttachments(){
    const weaponId=attachmentWeapon.value;
    attachmentOptions.replaceChildren(...attachmentSlots(weaponId,WEAPONS[weaponId].sidearm).map(slot=>{
      const label=document.createElement('label'),select=document.createElement('select');
      select.dataset.slot=slot.id;
      fill(select,slot.choices);
      select.addEventListener('change',()=>void saveCustomization({section:'attachments',weaponId,slot:slot.id,value:select.value}));
      label.append(slot.name,select);
      return label;
    }));
  }

  function connect(){
    if(cloud||!firebaseWebConfig)return Promise.resolve(cloud??null);
    if(connecting)return connecting;
    authMessage='';
    connecting=import('./profile-firebase.js').then(({createPlayerProfile})=>{
      cloud=createPlayerProfile();
      cloud.subscribe(()=>{
        const {user,loading}=cloud.state;
        writeLocal(knownAccount,user?'1':null);
        if(user&&authDialog.open&&!authBusy)authDialog.close();
        if(!user&&!loading&&!guest&&!$('menu').classList.contains('hidden'))openAuth();
        renderAuth();
        if(dialog.open)renderProfile();
      });
      return cloud;
    }).catch(()=>{
      authMessage='Не удалось открыть вход. Попробуйте открыть его ещё раз.';
      return null;
    }).finally(()=>{connecting=null;renderAuth();});
    return connecting;
  }

  async function authenticate(work,success=''){
    if(authBusy||!cloud)return;
    authBusy=true;authMessage='';renderAuth();
    try{
      await work();
      authMessage=success;
    }catch(error){
      authMessage=authErrors[error?.code]??'Не удалось выполнить действие. Попробуйте ещё раз.';
    }finally{
      authBusy=false;renderAuth();
      if(cloud.state.user)authDialog.close();
    }
  }

  async function profileAction(work,success='',showServerError=false){
    if(profileBusy||!cloud?.state.user)return;
    profileBusy=true;message='Подождите…';renderProfile();
    try{await work();message=success;}
    catch(error){message=authErrors[error?.code]??(showServerError?error.message:'Не удалось выполнить действие.');}
    finally{profileBusy=false;renderProfile();}
  }

  form.addEventListener('submit',event=>{
    event.preventDefault();
    const address=email.value.trim(),secret=password.value;
    void authenticate(()=>registering?cloud.register(address,secret):cloud.emailSignIn(address,secret));
  });
  $('profile-register').addEventListener('click',()=>{
    registering=!registering;authMessage='';password.autocomplete=registering?'new-password':'current-password';
    renderAuth();email.focus();
  });
  $('profile-google').addEventListener('click',()=>void authenticate(()=>cloud.googleSignIn()));
  $('profile-reset').addEventListener('click',()=>{
    if(email.reportValidity())void authenticate(()=>cloud.resetPassword(email.value.trim()),'Если адрес зарегистрирован, на него придёт ссылка для сброса пароля.');
  });
  function continueAsGuest(){guest=true;authDialog.close();}
  $('account-guest').addEventListener('click',continueAsGuest);
  authDialog.addEventListener('cancel',event=>{event.preventDefault();continueAsGuest();});
  authDialog.addEventListener('close',()=>{
    if(!cloud?.state.user)guest=true;
    password.value='';registering=false;password.autocomplete='current-password';authMessage='';renderAuth();
  });
  $('open-account').addEventListener('click',()=>{onOpen();openAuth();});

  $('open-profile').addEventListener('click',()=>{
    onOpen();message='';dialog.showModal();renderProfile();
  });
  $('profile-sign-out').addEventListener('click',()=>void profileAction(async()=>{
    guest=true;await cloud.signOut();dialog.close();email.value='';guest=false;openAuth();
  }));
  $('profile-import').addEventListener('click',()=>{
    message='';cloud?.importCampaign(localCampaignSummary(readCampaignProgress()));
  });
  $('profile-reset-stats').addEventListener('click',()=>confirm.showModal());
  $('profile-reset-confirmed').addEventListener('click',()=>{
    confirm.close();
    void profileAction(async()=>resetStats(await cloud.idToken()),'Сетевая статистика сброшена.',true);
  });

  for(const [index,button] of tabs.entries()){
    button.addEventListener('click',()=>selectTab(button));
    button.addEventListener('keydown',event=>{
      const offsets={ArrowLeft:-1,ArrowRight:1};
      const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:
        Object.hasOwn(offsets,event.key)?(index+offsets[event.key]+tabs.length)%tabs.length:null;
      if(next===null)return;
      event.preventDefault();selectTab(tabs[next],true);
    });
  }
  mountFinishes('profile-soldier-finishes',SOLDIER_FINISHES,()=>({section:'soldierSkin'}));
  mountFinishes('profile-weapon-finishes',WEAPON_FINISHES,()=>({section:'weaponSkins',weaponId:skinWeapon.value}));
  for(const select of [soldierTeam,soldierClass,skinWeapon])select.addEventListener('change',renderCustomization);
  attachmentWeapon.addEventListener('change',()=>{rebuildAttachments();renderCustomization();});
  $('profile-clear-attachments').addEventListener('click',()=>void saveCustomization({section:'attachments',weaponId:attachmentWeapon.value}));
  rebuildAttachments();

  if(firebaseWebConfig){
    if(readLocal(knownAccount)==='1')void connect();
    else openAuth();
  }
  return {
    refreshPreview,
    async tokenForServer(url){
      if(!firebaseWebConfig||!url.startsWith('wss://')||url!==await defaultServerUrl())return null;
      return (await connect())?.idToken()??null;
    },
  };
}
