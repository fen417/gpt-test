import '../../shared/campaign/alhadra.js';

export const SAVE_KEY='sector09-campaign-m01-v1';
export function readCampaignSave(){try{const save=JSON.parse(localStorage.getItem(SAVE_KEY)??'null');return save?.version===1&&save.missionId==='m01'?save:null;}catch{return null;}}

export class CampaignSession {
  constructor({definition,locale,save,...options},{onState=()=>{},onError=()=>{},onSaveError=()=>{}}={}){
    this.definition=definition;this.locale=locale;this.paused=true;this.closed=false;
    this.ready=new Promise((resolve,reject)=>{this.resolve=resolve;this.reject=reject;});
    this.timer=setTimeout(()=>this.reject(Error('Кампания не ответила при загрузке.')),20000);
    this.worker=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});
    // Main's shared pause/settings interface; no Multiplayer or network codec.
    this.client={clearInput:()=>this.worker.postMessage({type:'input',input:{}}),prediction:{},diagnostics:()=>null};
    this.worker.onmessage=event=>{
      if(this.closed)return;const m=event.data;
      if(m.type==='error'){this.reject(Error(m.message));if(this.started)onError(m.message);return;}
      if(m.type==='save'){
        try{localStorage.setItem(SAVE_KEY,JSON.stringify(m.save));if(m.complete)localStorage.setItem('sector09-campaign-progress-v1',JSON.stringify({m01:true,documents:m.flags.documents??false,courier:m.flags.courierSaved??false,kane:m.flags.kaneSaved??false}));}catch{onSaveError('Не удалось сохранить кампанию: хранилище браузера недоступно. Контрольная точка останется до выхода из миссии.');}
      }
      if(m.type==='state'){
        const epoch=m.state.campaign.epoch;
        this.previous=this.state?.campaign.epoch===epoch&&m.state.time>=this.state.time?this.state:null;
        this.state=m.state;this.receivedAt=performance.now();
        if(!this.started){this.started=true;clearTimeout(this.timer);this.resolve(this.state);}else onState(this.state);
      }
    };
    this.worker.onerror=event=>{this.reject(Error(event.message||'Ошибка Worker кампании.'));if(this.started)onError(event.message);};
    this.worker.postMessage({type:'create',definition,lines:locale.lines,options,save});
  }
  setPaused(value){if(value===this.paused)return;this.paused=value;this.worker.postMessage({type:'paused',value});}
  advance(input){this.worker.postMessage({type:'input',input});}
  command(command){this.worker.postMessage({type:'command',command});}
  snapshot(){return this.state;}
  sample(now){
    if(!this.previous||this.state.campaign.cutscene||this.paused)return this.state;
    const t=Math.max(0,Math.min(1,(now-this.receivedAt)/33.333)),old=new Map(this.previous.players.map(p=>[p.id,p]));
    return {...this.state,players:this.state.players.map(p=>{const a=old.get(p.id);if(!a||a.alive!==p.alive||Math.hypot(a.x-p.x,a.z-p.z)>8)return p;return {...p,x:a.x+(p.x-a.x)*t,y:a.y+(p.y-a.y)*t,z:a.z+(p.z-a.z)*t};})};
  }
  close(){if(this.closed)return;this.closed=true;clearTimeout(this.timer);this.reject(Error('Операция отменена.'));this.worker.terminate();}
}
