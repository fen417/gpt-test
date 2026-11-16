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
    this.voiceBus=c.createGain();this.voiceBus.connect(this.bus);
    this.musicBus=c.createGain();this.musicBus.connect(this.bus);
    // Filtered wind is intentionally quiet, with no downloaded music stand-in.
    const buffer=c.createBuffer(1,c.sampleRate*3,c.sampleRate),data=buffer.getChannelData(0);let seed=8191;
    for(let n=0;n<data.length;n++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;data[n]=(seed/4294967296-.5)*.04;}
    this.wind=c.createBufferSource();this.wind.buffer=buffer;this.wind.loop=true;
    const filter=c.createBiquadFilter();filter.type='lowpass';filter.frequency.value=700;this.wind.connect(filter);filter.connect(this.musicBus);this.wind.start();
  }
  stopVoice(){this.generation++;for(const s of this.sources){try{s.stop();}catch{}s.disconnect();}this.sources=[];}
  async voice(line,remaining){
    this.stopVoice();const generation=this.generation;
    const buffer=await this.buffer(line.audio);if(!buffer||generation!==this.generation||this.closed||this.paused)return;
    const offset=Math.max(0,(line.duration??4)-remaining);if(offset>=buffer.duration)return;
    const c=this.combat.ctx,source=c.createBufferSource(),filter=c.createBiquadFilter();source.buffer=buffer;
    filter.type=['orlov','officer'].includes(line.speaker)?'bandpass':'lowpass';filter.frequency.value=filter.type==='bandpass'?1700:15000;filter.Q.value=.55;
    source.connect(filter);filter.connect(this.voiceBus);this.sources.push(source);
    source.start(0,offset);
    source.onended=()=>{source.disconnect();filter.disconnect();this.sources=this.sources.filter(s=>s!==source);};
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
    if(mission.missionId==='m02'||mission.missionId==='m03'){
      this.paused=paused;this.bus.gain.setTargetAtTime(!paused&&this.combat.enabled?this.combat.volume*.9:0,c.currentTime,.04);
      this.voiceBus.gain.setTargetAtTime(this.combat.effectsVolume,c.currentTime,.05);
      this.musicBus.gain.setTargetAtTime(this.combat.musicVolume*.15,c.currentTime,.2);
      if(!this.prefetched){this.prefetched=true;for(const line of Object.values(locale.lines))if(line.audio)this.buffer(line.audio);}
      if(this.epoch!==mission.epoch){this.epoch=mission.epoch;this.stopVoice();this.key=null;}
      if(paused){if(this.sources.length)this.stopVoice();this.key=null;return;}
      const key=mission.radio?.serial??null;
      if(key!==this.key){this.key=key;const line=locale.lines[mission.radio?.key];if(line?.audio)this.voice(line,mission.radioRemaining??line.duration);else this.stopVoice();}
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
    if(key!==this.key){this.key=key;if(mission.subtitle){const line=locale.lines[mission.subtitle.key];if(line)this.voice(line,mission.subtitleRemaining??line.duration);}else this.stopVoice();}
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
