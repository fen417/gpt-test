import {initializeApp} from 'firebase/app';
import {
  createUserWithEmailAndPassword,getAuth,GoogleAuthProvider,linkWithCredential,
  onAuthStateChanged,sendPasswordResetEmail,signInWithEmailAndPassword,signInWithPopup,signOut,
} from 'firebase/auth';
import {getDatabase,onValue,ref,runTransaction} from 'firebase/database';
import {CAMPAIGN_PROFILE_EVENT} from './campaign/progress.js';
import {firebaseWebConfig} from './profile-config.js';
import {DEFAULT_CUSTOMIZATION,PROFILE_MISSIONS,mergeCampaignResult,withCustomization} from './profile-data.js';

const missions=new Set(PROFILE_MISSIONS.map(mission=>mission.id));
const key=uid=>'sector09-profile-campaign:'+uid;
const read=uid=>{
  try{return JSON.parse(localStorage.getItem(key(uid))??'{}');}
  catch{return {};}
};
const persist=(uid,value)=>{
  try{localStorage.setItem(key(uid),JSON.stringify(value));}
  catch{}
};
const provider=()=>new GoogleAuthProvider();

export function createPlayerProfile(){
  const app=initializeApp(firebaseWebConfig,'sector09-profile');
  const auth=getAuth(app),db=getDatabase(app),listeners=new Set();
  const pendingWrites=new Map();
  let user=null,profile=null,loading=true,problem='',pendingGoogle=null,unwatch,queue={};
  const notify=()=>{for(const listener of listeners)listener();};
  const profileRef=(uid,path='')=>ref(db,'profiles/'+uid+(path?'/'+path:''));
  function flush(){
    if(!user||!Object.keys(queue).length)return Promise.resolve();
    const active=user.uid,batch=queue;
    if(pendingWrites.has(active))return pendingWrites.get(active);
    let written=false;
    const operation=runTransaction(profileRef(active,'campaign'),current=>{
      const result={...current};
      for(const [id,data] of Object.entries(batch))result[id]=mergeCampaignResult(result[id],data);
      return result;
    },{applyLocally:false}).then(()=>{
      written=true;
      if(user?.uid!==active)return;
      const remaining={...queue};
      for(const [id,data] of Object.entries(batch))if(remaining[id]===data)delete remaining[id];
      queue=remaining;persist(active,queue);problem='';notify();
    }).catch(()=>{
      if(user?.uid===active){problem='Не удалось синхронизировать сюжетный прогресс.';notify();}
    }).finally(()=>{
      pendingWrites.delete(active);
      if(written&&user?.uid===active)void flush();
    });
    pendingWrites.set(active,operation);
    return operation;
  }
  function addCampaign(summary){
    if(!user)return;
    const next={...queue};
    for(const [id,data] of Object.entries(summary))if(missions.has(id))
      next[id]=mergeCampaignResult(next[id],data);
    queue=next;persist(user.uid,queue);notify();
    void flush();
  }
  addEventListener(CAMPAIGN_PROFILE_EVENT,event=>{
    const {missionId,...entry}=event.detail;
    addCampaign({[missionId]:entry});
  });
  addEventListener('online',()=>void flush());
  onAuthStateChanged(auth,account=>{
    unwatch?.();user=account;profile=null;problem='';loading=Boolean(user);
    queue=user?Object.fromEntries(Object.entries(read(user.uid)??{}).filter(([id])=>missions.has(id))):{};
    notify();
    if(!user)return;
    const uid=user.uid;
    unwatch=onValue(profileRef(uid),snapshot=>{
      if(user?.uid!==uid)return;
      profile=snapshot.val()??{};loading=false;notify();
    },()=>{
      if(user?.uid===uid){loading=false;problem='Сейчас облачный профиль недоступен.';notify();}
    });
    void flush();
  });
  return {
    get state(){
      const campaign={...profile?.campaign};
      for(const [id,data] of Object.entries(queue))campaign[id]=mergeCampaignResult(campaign[id],data);
      return {user,loading,problem,syncing:Object.keys(queue).length>0,pvp:profile?.pvp,campaign,customization:profile?.customization??DEFAULT_CUSTOMIZATION};
    },
    subscribe(listener){listeners.add(listener);return ()=>listeners.delete(listener);},
    async idToken(){await auth.authStateReady();return auth.currentUser?.getIdToken()??null;},
    async emailSignIn(email,password){
      const {user:account}=await signInWithEmailAndPassword(auth,email,password);
      const pending=pendingGoogle;pendingGoogle=null;
      if(pending?.email===account.email?.toLowerCase()){
        await linkWithCredential(account,pending.credential);notify();
      }
    },
    register(email,password){return createUserWithEmailAndPassword(auth,email,password);},
    async resetPassword(email){
      try{await sendPasswordResetEmail(auth,email);}
      catch(error){if(error.code!=='auth/user-not-found')throw error;}
    },
    async googleSignIn(){
      pendingGoogle=null;
      try{await signInWithPopup(auth,provider());}
      catch(error){
        if(error.code==='auth/account-exists-with-different-credential'){
          const credential=GoogleAuthProvider.credentialFromError(error),email=error.customData?.email;
          if(credential&&email)pendingGoogle={credential,email:email.toLowerCase()};
        }
        throw error;
      }
    },
    signOut(){pendingGoogle=null;return signOut(auth);},
    saveCustomization(change){
      if(!user)throw Error('Войдите, чтобы сохранить настройки.');
      return runTransaction(profileRef(user.uid,'customization'),current=>withCustomization(current,change));
    },
    importCampaign:addCampaign,
  };
}
