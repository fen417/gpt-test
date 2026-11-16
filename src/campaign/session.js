import '../../shared/campaign/alhadra.js';
import {recordCampaignCheckpoint,markCampaignComplete} from './progress.js';
import {campaignOutcome} from './outcome.js';

const SNAPSHOT_DELAY=.067;
const lerp=(a,b,t)=>a+(b-a)*t;
const lerpAngle=(a,b,t)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*t;

export const SAVE_KEY='sector09-campaign-m01-v1';
const saveKey=id=>`sector09-campaign-${id}-v1`;
export function readCampaignSave(missionId='m01'){
  try{const save=JSON.parse(localStorage.getItem(saveKey(missionId))??'null');
    return save?.version===(missionId==='m02'?2:1)&&save.missionId===missionId?save:null;
  }catch{return null;}
}

export class CampaignSession {
  constructor({definition,locale,save,...options},{onState=()=>{},onError=()=>{},onSaveError=()=>{}}={}){
    this.definition=definition;this.locale=locale;this.missionId=definition.id??'m01';
    this.completionNoted=false;this.paused=true;this.closed=false;
    this.frames=[];
    this.ready=new Promise((resolve,reject)=>{this.resolve=resolve;this.reject=reject;});
    this.timer=setTimeout(()=>this.reject(Error('Кампания не ответила при загрузке.')),20000);
    this.worker=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});
    // Main's shared pause/settings interface; no Multiplayer or network codec.
    this.client={clearInput:()=>this.worker.postMessage({type:'input',input:{}}),prediction:{},diagnostics:()=>null};
    this.worker.onmessage=event=>{
      if(this.closed)return;const m=event.data;
      if(m.type==='error'){this.reject(Error(m.message));if(this.started)onError(m.message);return;}
      if(m.type==='save'){
        try{
          localStorage.setItem(saveKey(this.missionId),JSON.stringify(m.save));
          if(!m.complete)recordCampaignCheckpoint(this.missionId,m.save);
        }catch{
          onSaveError('Не удалось сохранить кампанию: хранилище браузера недоступно. Контрольная точка останется до выхода из миссии.');
        }
      }
      if(m.type==='state'){
        const next=m.state,previous=this.state;
        if(!previous||next.campaign.epoch!==previous.campaign.epoch||next.time<previous.time||
          Boolean(next.campaign.cutscene)!==Boolean(previous.campaign.cutscene))this.resetPlayback();
        this.state=next;
        if(this.frames.at(-1)?.time!==next.time){
          this.frames.push(next);
          if(this.frames.length>8)this.frames.shift();
          this.receivedAt=performance.now();
        }else this.frames[this.frames.length-1]=next;
        if(m.state.campaign?.complete&&!this.completionNoted){
          this.completionNoted=true;
          const stats=m.state.campaign.stats??{};
          const flags=this.missionId==='m01'?
            {...Object.fromEntries(['kane','lasko','bruno','duran'].map(id=>[`${id}_alive`,Boolean(m.state.players.find(p=>p.id===id)?.alive)])),
              marten_wounded:Boolean(m.state.campaign.flags?.marten_wounded)}:
            this.missionId==='m02'?{...Object.fromEntries(m.state.players.filter(p=>['m02-kane','m02-lasko','m02-bruno','m02-duran'].includes(p.id))
              .map(p=>[`${p.id.slice(4)}_alive`,p.alive])),
              tanks_alive:m.state.campaign.tanksAlive??0,enemy_order:Boolean(m.state.campaign.flags?.enemyOrder)}:
              m.state.campaign.flags;
          markCampaignComplete(this.missionId,{elapsedSeconds:stats.elapsedSeconds??m.state.time,
            losses:stats.losses??m.state.campaign.alliedLosses??0,stealth:stats.stealth??null,outcome:campaignOutcome(m.state)},flags);
          if(['m03','m04'].includes(this.missionId))try{localStorage.removeItem(saveKey(this.missionId));}catch{}
        }
        if(!this.started){this.started=true;clearTimeout(this.timer);this.resolve(this.state);}else onState(this.state);
      }
    };
    this.worker.onerror=event=>{this.reject(Error(event.message||'Ошибка Worker кампании.'));if(this.started)onError(event.message);};
    this.worker.postMessage({type:'create',definition,lines:locale.lines,options,save});
  }
  resetPlayback(){this.frames.length=0;this.renderTime=null;this.lastSampleAt=null;}
  setPaused(value){if(value===this.paused)return;this.paused=value;this.resetPlayback();this.worker.postMessage({type:'paused',value});}
  advance(input){this.worker.postMessage({type:'input',input});}
  command(command){this.worker.postMessage({type:'command',command});}
  snapshot(){return this.state;}
  sample(now){
    if(this.frames.length<2||this.state.campaign.cutscene||this.paused)return this.state;
    const oldest=this.frames[0].time,latest=this.frames.at(-1).time;
    const desired=Math.min(latest,latest+(now-this.receivedAt)/1000-SNAPSHOT_DELAY);
    const dt=Math.max(0,Math.min(.1,(now-(this.lastSampleAt??now))/1000));
    this.lastSampleAt=now;
    if(this.renderTime===null)this.renderTime=Math.max(oldest,desired);
    // Use elapsed display time, nudging towards the buffer target without
    // resetting the interpolation whenever a state message arrives.
    const correction=Math.max(-.12,Math.min(.12,(desired-this.renderTime-dt)*4));
    this.renderTime=Math.max(oldest,Math.min(latest,this.renderTime+dt*(1+correction)));
    const upper=this.frames.findIndex((frame,i)=>i>0&&frame.time>=this.renderTime);
    const a=this.frames[upper-1],b=this.frames[upper];
    const t=(this.renderTime-a.time)/(b.time-a.time);
    const oldPlayers=new Map(a.players.map(p=>[p.id,p])),newPlayers=new Map(b.players.map(p=>[p.id,p]));
    const oldVehicles=new Map(a.vehicles.map(v=>[v.id,v])),newVehicles=new Map(b.vehicles.map(v=>[v.id,v]));
    return {...this.state,
      players:this.state.players.map(p=>{
        const a=oldPlayers.get(p.id),b=newPlayers.get(p.id);
        if(!a||!b||a.alive!==p.alive||b.alive!==p.alive||Math.hypot(a.x-b.x,a.z-b.z)>8)return p;
        return {...p,x:lerp(a.x,b.x,t),y:lerp(a.y,b.y,t),z:lerp(a.z,b.z,t)};
      }),
      vehicles:this.state.vehicles.map(v=>{
        const a=oldVehicles.get(v.id),b=newVehicles.get(v.id);
        if(!a||!b||a.hp<=0||b.hp<=0||v.hp<=0||Math.hypot(a.x-b.x,a.z-b.z)>25)return v;
        return {...v,x:lerp(a.x,b.x,t),y:lerp(a.y,b.y,t),z:lerp(a.z,b.z,t),
          yaw:lerpAngle(a.yaw,b.yaw,t),aimYaw:lerpAngle(a.aimYaw,b.aimYaw,t),aimPitch:lerp(a.aimPitch??0,b.aimPitch??0,t),
          speed:lerp(a.speed,b.speed,t),steer:lerp(a.steer??0,b.steer??0,t),
          bodyPitch:lerp(a.bodyPitch??0,b.bodyPitch??0,t),bodyRoll:lerp(a.bodyRoll??0,b.bodyRoll??0,t)};
      })
    };
  }
  close(){if(this.closed)return;this.closed=true;clearTimeout(this.timer);this.reject(Error('Операция отменена.'));this.worker.terminate();}
}
