// Voice recordings and five synchronized music stems are optional external
// mission assets. Missing files keep subtitles and procedural ambience working.

// The defence cue should remain audible at the game's reduced default music
// slider setting. Multiply the *user's* setting, never override or unmute it.
export function campaignMusicMix({volume,defence,subtitle,radioReady}){
  const dedicated=defence&&radioReady;
  return {
    bus:volume*(defence?1.2:.35)*(subtitle?(defence?.72:.4):1),
    radio:dedicated?1:0,
    stems:dedicated?.16:1,
  };
}
export function usesCampaignRadio(missionId,speaker,key){
  if(missionId==='m02')return true;
  if(['orlov','officer','dargo'].includes(speaker))return true;
  if(missionId==='m03')return ['timo','rafa'].includes(speaker)||speaker==='vos'&&key!=='vos.final'||
    ['marten.night','marten.choiceHome','marten.choiceRoad'].includes(key);
  return missionId==='m04'&&['vos.move','taver.work','taver.loss'].includes(key);
}
export class CampaignAudio {
  constructor(combat,root,definition){
    this.combat=combat;this.root=root;this.definition=definition;this.cache=new Map();this.missing=new Set();this.sources=[];this.stems=[];this.stemLoading=false;this.generation=0;this.key=null;this.epoch=-1;
  }
  async buffer(path){
    if(this.missing.has(path))return null;
    if(!this.cache.has(path))this.cache.set(path,(async()=>{try{const r=await fetch(new URL(path,this.root));if(!r.ok){this.missing.add(path);return null;}return await this.combat.ctx.decodeAudioData(await r.arrayBuffer());}catch{this.missing.add(path);return null;}})());
    return this.cache.get(path);
  }
  ensureGraph(){
    const c=this.combat.ctx;if(!c||this.bus)return;
    this.bus=c.createGain();this.bus.connect(c.destination);
    this.voiceBus=c.createGain();
    this.voiceMeter=c.createAnalyser();this.voiceMeter.fftSize=256;
    this.voiceSamples=new Float32Array(this.voiceMeter.fftSize);
    this.voiceBus.connect(this.voiceMeter);this.voiceMeter.connect(this.bus);
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
  stopVoice(){
    this.generation++;this.radioEnd=0;
    const playing=this.sources;this.sources=[];
    for(const s of playing){s.onended=null;try{s.stop();}catch{}s.disconnect();}
  }
  finishVoice(){
    const remaining=(this.radioEnd??0)-this.combat.ctx.currentTime;
    if(remaining>0&&remaining<=.35)this.generation++;
    else this.stopVoice();
  }
  playVoiceBuffer(buffer,output,at,offset=0){
    const source=this.combat.ctx.createBufferSource();source.buffer=buffer;
    source.connect(output);this.sources.push(source);source.start(at,offset);
    source.onended=()=>{source.disconnect();this.sources=this.sources.filter(s=>s!==source);};
  }
  async voice(line,remaining,missionId,key){
    this.finishVoice();const generation=this.generation;
    const radio=usesCampaignRadio(missionId,line.speaker,key);
    const [buffer,[opening,closing]]=await Promise.all([this.buffer(line.audio),radio?this.radioSwitches:[]]);
    if(!buffer||generation!==this.generation||this.closed||this.paused)return;
    const late=(line.duration??4)-remaining;
    const offset=late>.22?late:0;
    if(offset>=buffer.duration)return;
    const now=Math.max(this.combat.ctx.currentTime,this.radioEnd??0),start=now+(opening&&offset===0?opening.duration:0);
    if(opening&&offset===0)this.playVoiceBuffer(opening,this.voiceBus,now);
    this.playVoiceBuffer(buffer,radio?this.radioInput:this.voiceBus,start,offset);
    if(closing){
      const close=start+buffer.duration-offset;
      this.playVoiceBuffer(closing,this.voiceBus,close);
      this.radioEnd=close+closing.duration;
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
  update(state,locale,paused){
    this.ensureGraph();if(!this.bus)return;
    const c=this.combat.ctx,mission=state.campaign;
    if(['m02','m03','m04'].includes(mission.missionId)){
      this.paused=paused;this.bus.gain.setTargetAtTime(!paused&&this.combat.enabled?this.combat.volume*.9:0,c.currentTime,.04);
      this.voiceBus.gain.setTargetAtTime(this.combat.effectsVolume,c.currentTime,.05);
      this.musicBus.gain.setTargetAtTime(this.combat.musicVolume*.15,c.currentTime,.2);
      if(!this.prefetched){this.prefetched=true;for(const line of Object.values(locale.lines))if(line.audio)this.buffer(line.audio);}
      if(this.epoch!==mission.epoch){this.epoch=mission.epoch;this.stopVoice();this.key=null;}
      if(paused){if(this.sources.length)this.stopVoice();this.key=null;return;}
      const key=mission.radio?.serial??null;
      if(key!==this.key){this.key=key;const lineKey=mission.radio?.key,line=locale.lines[lineKey];
        if(line?.audio)this.voice(line,mission.radioRemaining??line.duration,mission.missionId,lineKey);else this.finishVoice();}
      return;
    }
    this.paused=paused;this.bus.gain.setTargetAtTime(!paused&&this.combat.enabled?this.combat.volume*.82:0,c.currentTime,.04);
    this.voiceBus.gain.setTargetAtTime(this.combat.effectsVolume,c.currentTime,.05);
    const defence=mission.stage===6&&!mission.cutscene&&!mission.complete&&!mission.failed;
    const musicMix=campaignMusicMix({volume:this.combat.musicVolume,defence,subtitle:Boolean(mission.subtitle?.key),radioReady:Boolean(this.radioDefence)});
    this.musicBus.gain.setTargetAtTime(musicMix.bus,c.currentTime,.2);
    if(!this.stemLoading)this.music();
    if(this.epoch!==mission.epoch){this.epoch=mission.epoch;this.stopVoice();this.key=null;this.lastAlert=mission.alert;}
    if(paused){if(this.sources.length)this.stopVoice();this.key=null;return;}
    if(this.lastAlert!==mission.alert){if(mission.alert>this.lastAlert)this.signal(mission.alert);this.lastAlert=mission.alert;}
    const player=state.players.find(p=>p.id==='local');
    if(player?.downed&&c.currentTime>=(this.heartbeatAt??0)){
      this.heartbeatAt=c.currentTime+1;
      for(const offset of [0,.18]){const osc=c.createOscillator(),gain=c.createGain(),at=c.currentTime+offset;osc.frequency.value=58;gain.gain.setValueAtTime(.045,at);gain.gain.exponentialRampToValueAtTime(.001,at+.12);osc.connect(gain);gain.connect(this.voiceBus);osc.start(at);osc.stop(at+.14);osc.onended=()=>{osc.disconnect();gain.disconnect();};}
    }
    const key=mission.subtitle?.serial??null;
    if(key!==this.key){this.key=key;if(mission.subtitle){const line=locale.lines[mission.subtitle.key];
      if(line)this.voice(line,mission.subtitleRemaining??line.duration,mission.missionId,mission.subtitle.key);}else this.finishVoice();}
    if(defence&&!this.radioDefenceLoading)this.startRadioDefence();
    // Keep backing stems playing until the optional defence OGG has decoded;
    // failed/missing downloads no longer silence the battle music.
    this.radioDefence?.gain.gain.setTargetAtTime(musicMix.radio,c.currentTime,defence?.45:1.3);
    const weights=mission.stage===6||mission.cutscene?.id==='finale'?[.65,.65,1,.9,.85]:mission.stage===5?[.4,.15,.45,.15,0]:[.5,.35,mission.alert>0?.6:0,mission.alert===3?.7:0,0];
    this.stems.forEach((s,i)=>s?.gain.gain.setTargetAtTime(weights[i]*musicMix.stems,c.currentTime,.7));
  }
  dispose(){this.closed=true;this.stopVoice();this.musicGeneration=(this.musicGeneration??0)+1;try{this.wind?.stop();}catch{}for(const s of this.stems){try{s?.source.stop();}catch{}}
    try{this.radioDefence?.source.stop();}catch{}
    this.radioDefence?.source.disconnect();this.radioDefence?.gain.disconnect();
    this.bus?.disconnect();this.cache.clear();}
}
