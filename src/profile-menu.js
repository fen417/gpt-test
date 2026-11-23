import {BASE_MAPS,CLASSES,WEAPONS} from '../shared/world.js';
import {readCampaignProgress} from './campaign/progress.js';
import {firebaseWebConfig} from './profile-config.js';
import {PROFILE_MISSIONS,favorite,localCampaignSummary} from './profile-data.js';
import {WEAPON_SLOTS,XP_PER_WEAPON_KILL,weaponLevelProgress} from '../shared/weapon-modules.js';
import {collimatorTestEnabled,equipCollimator,hasCollimator,loadCollimatorModel} from './collimator.js';
import {createWeaponProgress,weaponDevice} from './weapon-progress.js';
import {CASE_REWARDS} from '../shared/cases.js';
import {setupAttachmentPicker} from './weapon-attachment-ui.js';
import './profile-menu.css';

const knownAccount='sector09-profile-session';
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

export function mountPlayerProfile({onOpen,onCasesOpen,onCaseIdentityChange,getSkins,equipSkin,defaultServerUrl,resetStats,getRenderer,getLowWeaponDetail}){
  const $=id=>document.getElementById(id);
  const dialog=$('profile-panel'),authDialog=$('account-panel'),confirm=$('profile-confirm-reset');
  const form=$('profile-auth'),email=$('profile-email'),password=$('profile-password');
  const tabs=[...dialog.querySelectorAll('[data-profile-tab]')];
  let cloud,connecting,authBusy=false,profileBusy=false,registering=false,guest=false;
  let authMessage='',message='',tab='overview',preview,previewLoading;
  const set=(id,value)=>{$(id).textContent=value;};
  const fill=(select,options)=>select.replaceChildren(...options.map(([value,name])=>new Option(name,value)));
  const weaponOptions=Object.values(WEAPONS).sort((a,b)=>Number(Boolean(a.sidearm))-Number(Boolean(b.sidearm)))
    .map(weapon=>[weapon.id,weapon.name]);
  const soldierClass=$('profile-soldier-class'),soldierTeam=$('profile-soldier-team');
  const skinWeapon=$('profile-skin-weapon'),attachmentWeapon=$('profile-attachment-weapon');
  const skinFinish=$('profile-skin-finish'),skinStatus=$('profile-skin-status');
  let savingSkin=false;
  const progress=createWeaponProgress();
  let attachmentSlot='optic',loadout=progress.loadout(),inspectedWeapon,inspectedSlots;
  const mounts=$('profile-weapon-mounts');
  for(const [slot,label] of Object.entries(WEAPON_SLOTS)){
    const button=document.createElement('button');
    button.type='button';button.tabIndex=-1;button.className='profile-weapon-mount';
    button.dataset.weaponMount=slot;button.textContent='+';button.title=label;button.hidden=true;
    button.addEventListener('click',()=>selectSlot(slot,true));
    mounts.append(button);
  }
  const renderPicker=setupAttachmentPicker($('profile-view-attachments'),{
    chartHost:$('profile-attachment-chart'),
    onSlot:selectSlot,
    onInspect:(weaponId,slots)=>{
      inspectedWeapon=weaponId;inspectedSlots=slots;
      refreshPreview();
    },
    onSelect:id=>void chooseAttachment(attachmentWeapon.value,attachmentSlot,id).catch(()=>set('profile-status','Не удалось загрузить модель обвеса.')),
  });
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
    set('profile-status',message||state?.problem||(state?.weaponSyncFailed&&tab==='attachments'?'Прогресс оружия сохранён в этом браузере. Синхронизация недоступна.':'')||(user&&state.loading?'Загружаем профиль…':
      state?.syncing?'Синхронизируем сюжетные достижения…':''));
    if(tab==='attachments')describeAttachments();
    refreshPreview();
  }

  function currentAttachment(weaponId,slot){
    if(slot==='optic'&&hasCollimator(weaponId))return 'collimator-15';
    return loadout[weaponId]?.[slot]??'stock';
  }
  function refreshLoadout(){
    loadout=progress.loadout();
    if(Object.values(loadout).some(slots=>slots.optic==='collimator-15'))
      void loadCollimatorModel().then(refreshPreview).catch(()=>{});
  }
  function syncWeapons(){cloud?.syncWeapons(weaponDevice,progress.dataForSync());}
  async function chooseAttachment(weaponId,slot,id,verifiedXp){
    if(id==='collimator-15')await loadCollimatorModel();
    if(progress.select(weaponId,slot,id,verifiedXp)){
      if(slot==='optic')equipCollimator(weaponId,false);
      refreshLoadout();syncWeapons();
    }else if(slot==='optic'&&id==='collimator-15'&&collimatorTestEnabled()){
      equipCollimator(weaponId,true);
    }else return false;
    describeAttachments();refreshPreview();
    return true;
  }
  function selectSlot(slot,focus=false){
    attachmentSlot=slot;describeAttachments();
    if(focus)$('profile-view-attachments').querySelector(`[data-attachment-slot="${slot}"]`)?.focus();
  }
  function describeAttachments(){
    const weaponId=attachmentWeapon.value,xp=progress.xpOf(weaponId);
    const {level,earned,required}=weaponLevelProgress(xp);
    set('profile-weapon-level',`Уровень ${level}`);
    set('profile-weapon-next',`${Math.floor(earned/XP_PER_WEAPON_KILL)} / ${required/XP_PER_WEAPON_KILL} до уровня ${level+1}`);
    $('profile-weapon-xp').max=required;
    $('profile-weapon-xp').value=earned;
    const optic=currentAttachment(weaponId,'optic');
    renderPicker({weaponId,slot:attachmentSlot,xp,selected:currentAttachment(weaponId,attachmentSlot),
      attachments:{...loadout[weaponId],optic},canTest:collimatorTestEnabled(),showLocked:true});
    for(const button of mounts.children)button.classList.toggle('selected',button.dataset.weaponMount===attachmentSlot);
  }

  function selection(){
    if(tab==='soldier')return {classId:soldierClass.value,team:Number(soldierTeam.value)};
    if(tab==='overview')return null;
    const weaponId=tab==='weapon'?skinWeapon.value:attachmentWeapon.value;
    const hotspots=tab==='attachments';
    const attachments=hotspots&&inspectedWeapon===weaponId?inspectedSlots:{...loadout[weaponId],optic:currentAttachment(weaponId,'optic')};
    return {weaponId,attachments,hotspots,skinId:getSkins()?.equipped?.[weaponId]};
  }

  function describeSkins(){
    const weaponId=skinWeapon.value,loadout=getSkins();
    const unlocked=CASE_REWARDS.filter(reward=>reward.weaponId===weaponId&&loadout?.owned?.[reward.id]);
    skinFinish.replaceChildren(new Option('Заводская расцветка',''),
      ...unlocked.map(reward=>new Option(reward.name,reward.id)));
    skinFinish.value=loadout?.equipped?.[weaponId]??'';
    skinFinish.disabled=savingSkin||!unlocked.length;
    skinStatus.textContent=unlocked.length?'':'Скины для этого оружия можно получить из кейса.';
  }

  function refreshPreview(){
    if(!dialog.open||tab==='overview'||tab==='cases'||!getRenderer())return;
    if(preview){void preview.update();return;}
    if(!previewLoading)previewLoading=import('./profile-preview.js').then(({mountProfilePreview})=>{
      preview=mountProfilePreview({getRenderer,getSelection:selection,getLowWeaponDetail});return preview.update();
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
    $('profile-preview-frame').hidden=tab==='overview'||tab==='cases';
    $('profile-attachment-chart').hidden=tab!=='attachments';
    dialog.classList.toggle('attachment-workspace',tab==='attachments');
    dialog.scrollTop=0;
    mounts.hidden=tab!=='attachments';
    if(tab==='attachments')describeAttachments();
    if(tab==='weapon')describeSkins();
    if(tab==='cases'&&dialog.open)onCasesOpen();
    if(focus)next.focus();
    refreshPreview();
  }

  function connect(){
    if(cloud||!firebaseWebConfig)return Promise.resolve(cloud??null);
    if(connecting)return connecting;
    authMessage='';
    connecting=import('./profile-firebase.js').then(({createPlayerProfile})=>{
      cloud=createPlayerProfile();
      let accountId=null;
      cloud.subscribe(()=>{
        const {user,loading,weaponProgress,networkWeaponXp}=cloud.state;
        if((user?.uid??null)!==accountId){
          accountId=user?.uid??null;
          onCaseIdentityChange();
        }
        progress.updateAccount(user?.uid??null,weaponProgress,networkWeaponXp);
        refreshLoadout();
        if(user&&!loading)syncWeapons();
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

  function openProfile(target){
    onOpen();message='';dialog.showModal();renderProfile();
    selectTab(tabs.find(button=>button.dataset.profileTab===target));
  }
  $('open-profile').addEventListener('click',()=>openProfile(tab));
  $('open-cases').addEventListener('click',()=>openProfile('cases'));
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
  for(const select of [soldierTeam,soldierClass])select.addEventListener('change',refreshPreview);
  skinWeapon.addEventListener('change',()=>{describeSkins();refreshPreview();});
  skinFinish.addEventListener('change',async()=>{
    savingSkin=true;
    skinFinish.disabled=true;
    try{await equipSkin(skinWeapon.value,skinFinish.value||null);}
    finally{savingSkin=false;describeSkins();refreshPreview();}
  });
  attachmentWeapon.addEventListener('change',()=>{describeAttachments();refreshPreview();});
  addEventListener('online',syncWeapons);
  refreshLoadout();
  describeAttachments();

  if(firebaseWebConfig){
    if(readLocal(knownAccount)==='1')void connect();
    else openAuth();
  }
  return {
    refreshPreview,
    refreshSkins(){if(dialog.open){describeSkins();refreshPreview();}},
    refreshAttachments(){describeAttachments();refreshPreview();},
    creditWeaponKills(round,kills){
      if(!progress.credit(round,kills))return false;
      refreshLoadout();syncWeapons();
      return true;
    },
    weaponXp:progress.xpOf,
    chooseAttachment,
    currentAttachment,
    networkLoadout:progress.loadout,
    get loadout(){return loadout;},
    get caseAccount(){return cloud?.state.user?.uid??null;},
    async tokenForServer(url){
      if(!firebaseWebConfig||!url.startsWith('wss://')||url!==await defaultServerUrl())return null;
      return (await connect())?.idToken()??null;
    },
  };
}
