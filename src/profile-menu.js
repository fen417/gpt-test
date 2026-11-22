import {BASE_MAPS,CLASSES} from '../shared/world.js';
import {readCampaignProgress} from './campaign/progress.js';
import {firebaseWebConfig} from './profile-config.js';
import {PROFILE_MISSIONS,favorite,localCampaignSummary} from './profile-data.js';
import './profile-menu.css';

const knownAccount='sector09-profile-session';
const hasSession=()=>{
  try{return localStorage.getItem(knownAccount)==='1';}
  catch{return false;}
};
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
const formatTime=seconds=>{
  const minutes=Math.floor(seconds/60),rest=Math.floor(seconds%60);
  return minutes+' мин '+String(rest).padStart(2,'0')+' с';
};

export function mountPlayerProfile({onOpen,defaultServerUrl}){
  const $=id=>document.getElementById(id);
  const dialog=$('profile-panel'),form=$('profile-auth'),email=$('profile-email'),password=$('profile-password');
  const status=$('profile-status');
  let cloud,connecting,loading=false,busy=false,registering=false,message='';
  const set=(id,value)=>{$(id).textContent=value;};
  function render(){
    const state=cloud?.state;
    const user=state?.user;
    const local=localCampaignSummary(readCampaignProgress());
    $('profile-signed-in').hidden=!user;
    form.hidden=!state||state.loading||Boolean(user);
    $('profile-import').hidden=!user||!Object.keys(local).length;
    $('profile-link-google').hidden=!user||user.providerData.some(item=>item.providerId==='google.com');
    status.textContent=message||state?.problem||(loading?'Подключаем профиль…':
      !firebaseWebConfig?'Облачный профиль пока не подключён.':
      state?.loading?'Загружаем профиль…':!user?'Войдите, чтобы сохранять статистику сетевых боёв.':
      state.syncing?'Синхронизируем сюжетные достижения…':'');
    const stats=state?.pvp;
    const available=user&&!state.loading&&!state.problem||Boolean(stats);
    const kills=stats?.kills??0,deaths=stats?.deaths??0;
    set('profile-kills',available?kills:'—');
    set('profile-deaths',available?deaths:'—');
    set('profile-kd',!available||!deaths&&!kills?'—':deaths?(kills/deaths).toLocaleString('ru',{maximumFractionDigits:2}):'∞');
    set('profile-class',CLASSES[favorite(stats?.classes,CLASSES)]?.name??'—');
    set('profile-map',BASE_MAPS[favorite(stats?.maps,BASE_MAPS)]?.name??'—');
    set('profile-name',$('callsign').value.trim()||'Rookie');
    set('profile-account-email',user?.email??'');
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
    const customization=state?.customization;
    const count=value=>Object.keys(value??{}).length;
    set('profile-soldier-skin',customization?.soldierSkin&&customization.soldierSkin!=='standard'?customization.soldierSkin:'Стандартный');
    set('profile-weapon-skins',count(customization?.weaponSkins)?'Выбрано · '+count(customization.weaponSkins):'Стандартные');
    set('profile-attachments',count(customization?.attachments)?'Настроено оружие · '+count(customization.attachments):'Штатная комплектация');
  }
  function connect(){
    if(cloud)return Promise.resolve(cloud);
    if(!firebaseWebConfig)return Promise.resolve(null);
    if(connecting)return connecting;
    loading=true;render();
    connecting=import('./profile-firebase.js').then(({createPlayerProfile})=>{
      cloud=createPlayerProfile();
      cloud.subscribe(()=>{
        try{cloud.state.user?localStorage.setItem(knownAccount,'1'):localStorage.removeItem(knownAccount);}
        catch{}
        if(dialog.open)render();
      });
      return cloud;
    }).catch(()=>{message='Профиль не загрузился. Откройте его ещё раз.';return null;})
      .finally(()=>{loading=false;connecting=null;render();});
    return connecting;
  }
  async function action(work,success=''){
    if(busy||!cloud)return;
    busy=true;message='';
    const controls=[...dialog.querySelectorAll('button:not([data-close-dialog]),input')];
    controls.forEach(element=>{element.disabled=true;});
    status.textContent='Подождите…';
    try{await work();message=success;}
    catch(error){
      message=authErrors[error?.code]??'Не удалось выполнить действие. Попробуйте ещё раз.';
    }finally{
      busy=false;controls.forEach(element=>{element.disabled=false;});render();
    }
  }
  function clearForm(){
    password.value='';registering=false;
    password.autocomplete='current-password';
    set('profile-submit','Войти');set('profile-register','Создать аккаунт');
  }
  $('open-profile').addEventListener('click',()=>{
    onOpen();message='';render();if(!dialog.open)dialog.showModal();void connect();
  });
  dialog.addEventListener('close',clearForm);
  $('profile-register').addEventListener('click',()=>{
    registering=!registering;message='';
    password.autocomplete=registering?'new-password':'current-password';
    set('profile-submit',registering?'Зарегистрироваться':'Войти');
    set('profile-register',registering?'У меня есть аккаунт':'Создать аккаунт');
    email.focus();render();
  });
  form.addEventListener('submit',event=>{
    event.preventDefault();
    const address=email.value.trim(),secret=password.value,create=registering;
    action(async()=>{
      await (create?cloud.register(address,secret):cloud.emailSignIn(address,secret));
      clearForm();
    });
  });
  $('profile-google').addEventListener('click',()=>action(async()=>{await cloud.googleSignIn();clearForm();}));
  $('profile-link-google').addEventListener('click',()=>action(()=>cloud.linkGoogle(),'Google привязан.'));
  $('profile-reset').addEventListener('click',()=>{
    if(!email.reportValidity())return;
    action(()=>cloud.resetPassword(email.value.trim()),'Если этот адрес зарегистрирован, на него придёт ссылка для сброса пароля.');
  });
  $('profile-sign-out').addEventListener('click',()=>action(()=>cloud.signOut()));
  $('profile-import').addEventListener('click',()=>{
    message='';
    cloud?.importCampaign(localCampaignSummary(readCampaignProgress()));
  });
  if(firebaseWebConfig&&hasSession())void connect();
  return {
    async tokenForServer(url){
      if(!firebaseWebConfig||!url.startsWith('wss://')||(!cloud&&!hasSession())||url!==await defaultServerUrl())return null;
      return (await connect())?.idToken()??null;
    },
  };
}
