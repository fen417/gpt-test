import {campaignMusicWindow} from './music-loop.js';

export function columnMusicCue(state,definition){
  const m=state.campaign,config=definition.music;
  const hit=definition.convoy.ambushAt,elapsed=m.rideTime;
  if(m.cutscene?.id==='finale')return {tracks:{finale:1},offset:m.cutscene.elapsed};
  if(elapsed<config.approachEnd){
    const level=1-Math.max(0,elapsed-config.approachAt)/(config.approachEnd-config.approachAt);
    return {tracks:{convoy:level*.65},offset:elapsed};
  }
  if(elapsed<hit+config.ambushSilence)return {tracks:{},offset:0};
  const offset=elapsed-hit-config.ambushSilence;
  if(!m.ride&&m.inside&&m.alert<3)return {tracks:{interior:.74},offset};
  return {tracks:{combat:.88,drums:m.alert===3?.72:0},offset};
}

export class ColumnMusic{
  constructor(combat,root,definition,cue=columnMusicCue){
    this.combat=combat;this.root=root;this.definition=definition;this.cue=cue;
    this.cache=new Map();this.voices=new Map();this.abort=new AbortController();
  }
  preload(ctx){
    if(this.cache.size)return;
    for(const [name,path] of Object.entries(this.definition.music).filter(([,path])=>typeof path==='string')){
      const entry={buffer:null};this.cache.set(name,entry);
      if(!path)continue;
      fetch(new URL(path,this.root),{signal:this.abort.signal})
        .then(response=>response.ok?response.arrayBuffer():null)
        .then(bytes=>bytes&&ctx.decodeAudioData(bytes))
        .then(buffer=>{if(!this.abort.signal.aborted)entry.buffer=buffer;}).catch(()=>{});
    }
  }
  start(name,buffer,at,offset){
    const ctx=this.combat.ctx,source=ctx.createBufferSource(),gain=ctx.createGain();
    const loop=name!=='ambush';
    source.buffer=buffer;source.loop=loop;gain.gain.value=loop?0:1;
    const loopWindow=name==='flight'?this.definition.music.flightLoop:
      name==='combat'||name==='drums'?this.definition.music.combatLoop:null;
    const window=loopWindow&&campaignMusicWindow(loopWindow,buffer.duration,offset);
    if(window?.loop){source.loopStart=window.loopStart;source.loopEnd=window.loopEnd;}
    source.connect(gain);gain.connect(this.bus);source.start(at,window?.loop?window.offset:loop?offset%buffer.duration:0);
    const voice={source,gain,zeroAt:at-offset};this.voices.set(name,voice);
    source.onended=()=>{
      if(this.voices.get(name)===voice)this.voices.delete(name);
      source.disconnect();gain.disconnect();
    };
    return voice;
  }
  stop(name,voice,fade=0){
    this.voices.delete(name);
    const now=this.combat.ctx.currentTime;
    if(fade)voice.gain.gain.setTargetAtTime(0,now,fade/4);
    try{voice.source.stop(now+fade);}catch{}
    if(!fade){voice.source.disconnect();voice.gain.disconnect();}
  }
  update(state,paused){
    const ctx=this.combat.ctx,m=state.campaign;
    if(!ctx||this.abort.signal.aborted)return;
    this.preload(ctx);
    if(!this.bus){this.bus=ctx.createGain();this.bus.gain.value=0;this.bus.connect(ctx.destination);}
    const newRun=m.epoch!==this.epoch;
    if(newRun)this.ambushPlayed=false;
    const reset=paused||m.failed||m.complete||ctx.state!=='running'||newRun;
    this.epoch=m.epoch;
    if(reset)for(const [name,voice] of this.voices)this.stop(name,voice);
    if(paused||m.failed||m.complete||ctx.state!=='running')return;
    const {tracks:cues,offset}=this.cue(state,this.definition),now=ctx.currentTime;
    const tracks=cues.interior&&!this.cache.get('interior')?.buffer?{combat:.4}:cues;
    const dialogue=m.radio?.key,dialogueMix=dialogue==='orlov.loss' ? .72 : dialogue ? .4 : 1;
    const level=this.combat.enabled?this.combat.volume*this.combat.musicVolume*dialogueMix:0;
    this.bus.gain.setTargetAtTime(level,now,.065);
    if(!this.ambushPlayed&&m.ride){
      const hit=state.events?.find(event=>event.type==='explosion'&&event.ambushLeadHit);
      const stinger=this.cache.get('ambush')?.buffer;
      if(stinger&&hit&&state.time-hit.time<.12){
        this.ambushPlayed=true;this.start('ambush',stinger,now,0);
      }
    }
    const silent=Object.keys(tracks).length===0;
    for(const [name,voice] of this.voices)if(name!=='ambush'&&!Object.hasOwn(tracks,name))this.stop(name,voice,silent?.045:.35);
    for(const [name,gain] of Object.entries(tracks)){
      const buffer=this.cache.get(name)?.buffer;if(!buffer?.duration)continue;
      let voice=this.voices.get(name);
      if(voice&&Math.abs(now-voice.zeroAt-offset)>.35){this.stop(name,voice,.1);voice=null;}
      if(!voice)voice=this.start(name,buffer,now,Math.max(0,offset));
      voice.gain.gain.setTargetAtTime(gain,now,.09);
    }
  }
  dispose(){
    this.abort.abort();
    for(const [name,voice] of this.voices)this.stop(name,voice);
    this.bus?.disconnect();this.cache.clear();
  }
}
