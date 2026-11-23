import { Vector3 } from 'three';
import { vehiclePartPose } from '../../shared/vehicles.js';

// Voice recordings and five synchronized music stems are optional external
// mission assets. Missing files keep subtitles and procedural ambience working.

// The defence cue should remain audible at the game's reduced default music
// slider setting. Multiply the *user's* setting, never override or unmute it.
export function campaignMusicMix({volume,defence,outro=false,subtitle,radioReady}){
  const dedicated=(defence||outro)&&radioReady;
  return {
    bus:volume*(outro?.44:defence?1.2:.35)*(subtitle?((defence||outro)?.72:.4):1),
    radio:dedicated?1:0,
    stems:dedicated?.16:1,
  };
}
export function usesCampaignRadio(missionId,speaker,key){
  if(missionId==='m01')return speaker==='orlov'&&!key.startsWith('m01.orlov.brief')||
    ['m01.officer.mid01','m01.officer.call','m01.bruno.sokol'].includes(key);
  if(missionId==='m02')return speaker!=='crew'&&speaker!=='vos';
  if(missionId==='m04')return speaker!=='marten';
  if(['orlov','dargo'].includes(speaker))return true;
  if(missionId==='m03')return ['timo.road','timo.roofs','timo.window',
    'vos.meet','vos.village','vos.trapped','harranti.hold','harranti.truck'].includes(key);
  return false;
}

function dialogueActor(state,speaker){
  const {players,campaign:{missionId}}=state;
  if(missionId==='m01'&&['sentry','officer'].includes(speaker)){
    const local=players.find(p=>p.id==='local');
    if(!local)return null;
    let best=Infinity,actor;
    for(const p of players){
      if(!p.alive||p.team===local.team||p.role!=='sentry'&&p.role!=='officer')continue;
      const distance=(p.x-local.x)**2+(p.z-local.z)**2;
      if(distance<best){best=distance;actor=p;}
    }
    return actor;
  }
  const id=speaker==='marten'?'local':missionId==='m02'?`m02-${speaker}`:speaker;
  return players.find(p=>p.id===id)??players.find(p=>p.id===`stand-in-${id}`);
}

export class CampaignAudio {
  constructor(combat,root,definition){
    this.combat=combat;this.root=root;this.definition=definition;this.cache=new Map();this.missing=new Set();this.sources=[];this.stems=[];this.stemLoading=false;this.generation=0;this.key=null;this.epoch=-1;
    this.voicePosition=new Vector3();
    this.reactionVoice={sources:[],generation:0,key:null,voicePosition:new Vector3()};
  }
  async buffer(path){
    if(this.missing.has(path))return null;
    if(!this.cache.has(path))this.cache.set(path,(async()=>{
      try{
        const url=new URL(path,this.root);
        if(this.definition.contentRevision&&path.startsWith('voice/'))url.searchParams.set('v',this.definition.contentRevision);
        const r=await fetch(url);
        if(!r.ok){this.missing.add(path);return null;}
        return await this.combat.ctx.decodeAudioData(await r.arrayBuffer());
      }catch{this.missing.add(path);return null;}
    })());
    return this.cache.get(path);
  }
  ensureGraph(){
    const c=this.combat.ctx;if(!c||this.bus)return;
    this.bus=c.createGain();this.bus.connect(c.destination);
    this.voiceBus=c.createGain();
    this.voiceMeter=c.createAnalyser();this.voiceMeter.fftSize=256;
    this.voiceSamples=new Float32Array(this.voiceMeter.fftSize);
    this.voiceBus.connect(this.voiceMeter);this.voiceMeter.connect(this.bus);
    for(const channel of [this,this.reactionVoice]){
      const panner=channel.worldVoice=c.createPanner();
      panner.panningModel='HRTF';
      panner.distanceModel='inverse';
      panner.refDistance=3;
      panner.rolloffFactor=.62;
      panner.maxDistance=80;
      channel.worldVoiceGain=c.createGain();
      channel.worldVoiceGain.gain.value=.54;
      panner.connect(channel.worldVoiceGain).connect(this.voiceBus);
    }
    this.radioInput=c.createBiquadFilter();this.radioInput.type='highpass';this.radioInput.frequency.value=480;
    const radioHigh=c.createBiquadFilter();radioHigh.type='lowpass';radioHigh.frequency.value=2950;
    const presence=c.createBiquadFilter();presence.type='peaking';presence.frequency.value=1580;presence.Q.value=1.25;presence.gain.value=6;
    const clipping=c.createWaveShaper();
    clipping.curve=Float32Array.from({length:513},(_,i)=>Math.tanh((i/256-1)*3.2)*.48);
    clipping.oversample='2x';
    const radioCompression=c.createDynamicsCompressor();
    radioCompression.threshold.value=-21;radioCompression.ratio.value=4;radioCompression.knee.value=8;
    this.radioInput.connect(presence);presence.connect(clipping);clipping.connect(radioHigh);
    radioHigh.connect(radioCompression);radioCompression.connect(this.voiceBus);
    this.radioSwitches=Promise.all(['open','close'].map(name=>this.buffer(`../../audio/radio-ptt-${name}.wav`)));
    this.musicBus=c.createGain();this.musicBus.connect(this.bus);
    // Filtered wind is intentionally quiet, with no downloaded music stand-in.
    const buffer=c.createBuffer(1,c.sampleRate*3,c.sampleRate),data=buffer.getChannelData(0);let seed=8191;
    for(let n=0;n<data.length;n++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;data[n]=(seed/4294967296-.5)*.04;}
    this.wind=c.createBufferSource();this.wind.buffer=buffer;this.wind.loop=true;
    const filter=c.createBiquadFilter();filter.type='lowpass';filter.frequency.value=700;this.wind.connect(filter);filter.connect(this.musicBus);this.wind.start();
  }
  stopVoice(channel=this){
    channel.generation++;channel.radioEnd=0;
    const playing=channel.sources;channel.sources=[];
    for(const s of playing){s.onended=null;try{s.stop();}catch{}s.disconnect();}
  }
  finishVoice(channel){
    const remaining=(channel.radioEnd??0)-this.combat.ctx.currentTime;
    if(remaining>0&&remaining<=.35)channel.generation++;
    else this.stopVoice(channel);
  }
  playVoiceBuffer(channel,buffer,output,at,offset=0){
    const source=this.combat.ctx.createBufferSource();source.buffer=buffer;
    source.connect(output);channel.sources.push(source);source.start(at,offset);
    source.onended=()=>{source.disconnect();channel.sources=channel.sources.filter(s=>s!==source);};
  }
  async voice(channel,line,remaining,{radio,spatial,transmit}){
    this.finishVoice(channel);const generation=channel.generation;
    const [buffer,[opening,closing]]=await Promise.all([this.buffer(line.audio),radio||transmit?this.radioSwitches:[]]);
    if(!buffer||generation!==channel.generation||this.closed||this.paused)return;
    const late=(line.duration??4)-remaining;
    const offset=late>.22?late:0;
    if(offset>=buffer.duration)return;
    const now=Math.max(this.combat.ctx.currentTime,channel.radioEnd??0),start=now+(opening&&offset===0?opening.duration:0);
    if(opening&&offset===0)this.playVoiceBuffer(channel,opening,this.voiceBus,now);
    this.playVoiceBuffer(channel,buffer,radio?this.radioInput:spatial?channel.worldVoice:this.voiceBus,start,offset);
    if(radio&&closing){
      const close=start+buffer.duration-offset;
      this.playVoiceBuffer(channel,closing,this.voiceBus,close);
      channel.radioEnd=close+closing.duration;
    }
  }
  positionVoice(channel,state,renderer,speaker,briefingPosition){
    const mission=state.campaign;
    channel.speakingActorId??=dialogueActor(state,speaker)?.id;
    const actor=state.players.find(p=>p.id===channel.speakingActorId);
    const {voicePosition}=channel;
    const rig=renderer?.soldiers.get(actor?.id);
    if(actor&&rig?.group.parent&&rig.group.visible)rig.head.getWorldPosition(voicePosition);
    else if(actor)voicePosition.set(actor.x,actor.y+(actor.downed||actor.prone?.43:actor.crouch?1.02:1.56),actor.z);
    else if(briefingPosition&&mission.cutscene?.id==='briefing'&&speaker==='orlov')voicePosition.copy(briefingPosition);
    else{
      const tankId=mission.missionId==='m02'&&['crew','vos'].includes(speaker)?'sokol-7':
        mission.missionId==='m04'&&speaker==='vos'?'sokol-crossing-1':null;
      const tank=tankId&&state.vehicles.find(v=>v.id===tankId);
      if(!tank)return false;
      vehiclePartPose(tank,-.35,1.95,.2,voicePosition);
    }
    if(actor?.id==='local'&&renderer?.camera.position.distanceToSquared(voicePosition)<1)return false;
    const panner=channel.worldVoice,now=this.combat.ctx.currentTime;
    const distance=renderer?.camera.position.distanceTo(voicePosition)??0;
    const gain=.54+.46*Math.min(1,Math.max(0,(distance-2)/12));
    if(channel.voicePositionReady)channel.worldVoiceGain.gain.setTargetAtTime(gain,now,.06);
    else channel.worldVoiceGain.gain.setValueAtTime(gain,now);
    if(panner.positionX){
      const values=[voicePosition.x,voicePosition.y,voicePosition.z];
      for(let i=0;i<3;i++){
        const param=panner['position'+'XYZ'[i]];
        if(channel.voicePositionReady)param.setTargetAtTime(values[i],now,.025);
        else param.setValueAtTime(values[i],now);
      }
    }else panner.setPosition(voicePosition.x,voicePosition.y,voicePosition.z);
    channel.voicePositionReady=true;
    return true;
  }
  updateDialogue(state,locale,cue,remaining,renderer,briefingPosition,channel=this){
    const key=cue?.serial??null,changed=key!==channel.key,line=locale.lines[cue?.key];
    const missionId=state.campaign.missionId;
    if(changed){
      channel.speakingActorId=cue?.speakerId;
      channel.voicePositionReady=false;
      channel.dialogueRadio=Boolean(line&&usesCampaignRadio(missionId,line.speaker,cue.key));
    }
    const radio=channel.dialogueRadio;
    const transmit=missionId==='m04'&&line?.speaker==='marten';
    const spatial=line&&!radio&&!transmit&&this.positionVoice(channel,state,renderer,line.speaker,briefingPosition);
    if(changed){
      channel.key=key;
      if(line?.audio)this.voice(channel,line,remaining??line.duration,{radio,spatial,transmit});
      else this.finishVoice(channel);
    }
  }
  mouthOpening(){
    if(!this.voiceMeter||!this.sources.length)return 0;
    this.voiceMeter.getFloatTimeDomainData(this.voiceSamples);
    let energy=0;for(const sample of this.voiceSamples)energy+=sample*sample;
    return Math.min(1,Math.sqrt(energy/this.voiceSamples.length)*10);
  }
  async music(){
    if(this.stemLoading)return;this.stemLoading=true;
    const generation=this.musicGeneration=(this.musicGeneration??0)+1;
    const buffers=await Promise.all(this.definition.music.stems.map(p=>this.buffer(p)));
    if(this.closed||generation!==this.musicGeneration)return;
    const c=this.combat.ctx,start=c.currentTime+.1;
    for(const buffer of buffers){
      if(!buffer){this.stems.push(null);continue;}
      const source=c.createBufferSource(),gain=c.createGain();source.buffer=buffer;source.loop=true;source.loopEnd=Math.min(buffer.duration,this.definition.music.loopSeconds);gain.gain.value=0;source.connect(gain);gain.connect(this.musicBus);source.start(start);this.stems.push({source,gain});
    }
  }
  async startRadioDefence(){
    if(this.radioDefenceLoading||!this.definition.music?.radioDefence)return;
    this.radioDefenceLoading=true;
    const buffer=await this.buffer(this.definition.music.radioDefence);
    if(this.closed||!buffer)return;
    const c=this.combat.ctx,source=c.createBufferSource(),gain=c.createGain();
    source.buffer=buffer;source.loop=true;gain.gain.value=0;
    source.connect(gain);gain.connect(this.musicBus);source.start();
    this.radioDefence={source,gain};
  }
  signal(kind){
    const c=this.combat.ctx;if(!c||!this.voiceBus||this.paused)return;
    const osc=c.createOscillator(),gain=c.createGain(),now=c.currentTime;osc.type='sine';osc.frequency.setValueAtTime(kind===3?640:kind===2?440:280,now);osc.frequency.linearRampToValueAtTime(kind===3?980:340,now+.5);
    gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(.045,now+.03);gain.gain.linearRampToValueAtTime(0,now+.65);osc.connect(gain);gain.connect(this.voiceBus);osc.start();osc.stop(now+.7);osc.onended=()=>{osc.disconnect();gain.disconnect();};
  }
  update(state,locale,paused,renderer,briefingPosition){
    this.ensureGraph();if(!this.bus)return;
    const c=this.combat.ctx,mission=state.campaign;
    if(['m02','m03','m04'].includes(mission.missionId)){
      this.paused=paused;this.bus.gain.setTargetAtTime(!paused&&this.combat.enabled?this.combat.volume*.9:0,c.currentTime,.04);
      this.voiceBus.gain.setTargetAtTime(this.combat.effectsVolume,c.currentTime,.05);
      this.musicBus.gain.setTargetAtTime(this.combat.musicVolume*.15,c.currentTime,.2);
      if(!this.prefetched){this.prefetched=true;for(const line of Object.values(locale.lines))if(line.audio)this.buffer(line.audio);}
      if(this.epoch!==mission.epoch){this.epoch=mission.epoch;this.stopVoice();this.key=null;}
      if(paused){if(this.sources.length)this.stopVoice();this.key=null;return;}
      this.updateDialogue(state,locale,mission.radio,mission.radioRemaining,renderer,briefingPosition);
      return;
    }
    const outro=mission.cutscene?.id==='finale'||mission.complete;
    if(!this.prefetched){
      this.prefetched=true;
      for(const key of ['m01.lasko.reviving','m01.lasko.playerUp']){
        const path=locale.lines[key]?.audio;
        if(path)this.buffer(path);
      }
    }
    this.paused=paused;this.bus.gain.setTargetAtTime((!paused||outro)&&this.combat.enabled?this.combat.volume*.82:0,c.currentTime,.04);
    this.voiceBus.gain.setTargetAtTime(this.combat.effectsVolume,c.currentTime,.05);
    const defence=mission.stage===6&&!mission.cutscene&&!mission.complete&&!mission.failed;
    const musicMix=campaignMusicMix({volume:this.combat.musicVolume,defence,outro,subtitle:!paused&&Boolean(mission.subtitle||mission.reaction),radioReady:Boolean(this.radioDefence)});
    this.musicBus.gain.setTargetAtTime(musicMix.bus,c.currentTime,.2);
    if(!this.stemLoading)this.music();
    if((defence||outro)&&!this.radioDefenceLoading)this.startRadioDefence();
    // Keep the same loop and mix through the cutscene and debrief.
    this.radioDefence?.gain.gain.setTargetAtTime(musicMix.radio,c.currentTime,(defence||outro)?.45:1.3);
    const weights=mission.stage===6||outro?[.65,.65,1,.9,.85]:mission.stage===5?[.4,.15,.45,.15,0]:[.5,.35,mission.alert>0?.6:0,mission.alert===3?.7:0,0];
    this.stems.forEach((s,i)=>s?.gain.gain.setTargetAtTime(weights[i]*musicMix.stems,c.currentTime,.7));
    const reaction=this.reactionVoice;
    if(this.epoch!==mission.epoch){
      this.epoch=mission.epoch;this.stopVoice();this.key=null;this.stopVoice(reaction);reaction.key=null;this.lastAlert=mission.alert;
    }
    if(paused){
      if(this.key!==null)this.stopVoice();
      if(reaction.key!==null)this.stopVoice(reaction);
      this.key=reaction.key=null;return;
    }
    if(this.lastAlert!==mission.alert){if(mission.alert>this.lastAlert)this.signal(mission.alert);this.lastAlert=mission.alert;}
    const player=state.players.find(p=>p.id==='local');
    if(player?.downed&&!mission.cutscene&&!mission.complete&&c.currentTime>=(this.heartbeatAt??0)){
      this.heartbeatAt=c.currentTime+1;
      for(const offset of [0,.18]){const osc=c.createOscillator(),gain=c.createGain(),at=c.currentTime+offset;osc.frequency.value=58;gain.gain.setValueAtTime(.045,at);gain.gain.exponentialRampToValueAtTime(.001,at+.12);osc.connect(gain);gain.connect(this.voiceBus);osc.start(at);osc.stop(at+.14);osc.onended=()=>{osc.disconnect();gain.disconnect();};}
    }
    this.updateDialogue(state,locale,mission.subtitle,mission.subtitleRemaining,renderer,briefingPosition);
    this.updateDialogue(state,locale,mission.reaction,mission.reaction?.remaining,renderer,null,reaction);
  }
  dispose(){this.closed=true;this.stopVoice();this.stopVoice(this.reactionVoice);this.musicGeneration=(this.musicGeneration??0)+1;try{this.wind?.stop();}catch{}for(const s of this.stems){try{s?.source.stop();}catch{}}
    try{this.radioDefence?.source.stop();}catch{}
    this.radioDefence?.source.disconnect();this.radioDefence?.gain.disconnect();
    for(const channel of [this,this.reactionVoice]){channel.worldVoice?.disconnect();channel.worldVoiceGain?.disconnect();}
    this.bus?.disconnect();this.cache.clear();}
}
