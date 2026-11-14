// Menu soundtrack, procedural battle ambience and local firearm recordings.
import { BULLET_GRAVITY } from '../shared/ballistics.js';
import { getMap } from '../shared/world.js';
export const MENU_MUSIC_TITLE = 'Quiet Resolve';
const MENU_MUSIC_URL=new URL('./assets/audio/music/quiet-resolve.mp3',import.meta.url);
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, Number(v) || 0));
const midi = n => 440 * 2 ** ((n - 69) / 12);
const BEAT = 60 / 82, EPSILON = .00001, MAX_VOICES = 56, MUSIC_VOICES = 14;
const VOICE_FADE = .012, MAX_FADING_VOICES = 8;
const HARMONY = [
  [38, [50, 53, 57, 64]], [34, [46, 50, 53, 57]],
  [41, [48, 53, 57, 60]], [36, [48, 53, 55, 60]],
  [38, [50, 53, 57, 62]], [31, [43, 50, 53, 57]],
  [34, [46, 50, 53, 60]], [33, [45, 52, 57, 58]],
];
const MELODY = [74,0,69,0,65,0,64,0,62,0,0,69,67,0,65,0,69,0,72,0,74,0,0,77,76,0,72,0,69,0,0,0];
const WEAPONS = {
  ar416: { sample: 'rifle-light', rate: 1, gain: .92, cutoff: 17000 },
  ak12: { sample: 'rifle-heavy', rate: 1, gain: .94, cutoff: 16000 },
  mcx9: { sample: 'smg', rate: 1.12, gain: .82, cutoff: 16500 },
  vk45: { sample: 'smg-suppressed', rate: 1, gain: .80, cutoff: 14000 },
  mg36: { sample: 'lmg', rate: 1.03, gain: 1, cutoff: 16000 },
  pkp: { sample: 'lmg', rate: .92, gain: 1.05, cutoff: 15500 },
  dmr12: { sample: 'marksman', rate: 1.02, gain: .98, cutoff: 17000 },
  sv98: { sample: 'sniper', rate: 1, gain: 1.04, cutoff: 17500 },
  p19: { sample: 'pistol', rate: 1.04, gain: .85, cutoff: 16500 },
  m50: { sample: 'pistol-heavy', rate: .96, gain: 1, cutoff: 16000 },
  turret: { sample: 'lmg', rate: .84, gain: 1.10, cutoff: 14500 },
};
const CLASS_SHOTS = { assault: 'ar416', medic: 'mcx9', support: 'mg36', recon: 'dmr12' };
const SHOT_SAMPLES = {
  'rifle-light': [
    new URL('./assets/audio/gunshots/rifle-light-1.wav', import.meta.url),
    new URL('./assets/audio/gunshots/rifle-light-2.wav', import.meta.url),
  ],
  'rifle-heavy': [
    new URL('./assets/audio/gunshots/rifle-heavy-1.wav', import.meta.url),
    new URL('./assets/audio/gunshots/rifle-heavy-2.wav', import.meta.url),
  ],
  'smg': [
    new URL('./assets/audio/gunshots/smg-1.wav', import.meta.url),
    new URL('./assets/audio/gunshots/smg-2.wav', import.meta.url),
  ],
  'smg-suppressed': [new URL('./assets/audio/gunshots/smg-suppressed-1.wav',import.meta.url)],
  'lmg': [
    new URL('./assets/audio/gunshots/lmg-1.wav',import.meta.url),
    new URL('./assets/audio/gunshots/lmg-2.wav',import.meta.url),
  ],
  'marksman': [
    new URL('./assets/audio/gunshots/marksman-1.wav', import.meta.url),
    new URL('./assets/audio/gunshots/marksman-2.wav', import.meta.url),
  ],
  'sniper': [
    new URL('./assets/audio/gunshots/sniper-1.wav', import.meta.url),
    new URL('./assets/audio/gunshots/sniper-2.wav', import.meta.url),
  ],
  'pistol': [
    new URL('./assets/audio/gunshots/pistol-1.wav', import.meta.url),
    new URL('./assets/audio/gunshots/pistol-2.wav', import.meta.url),
  ],
  'pistol-heavy': [
    new URL('./assets/audio/gunshots/pistol-heavy-1.wav', import.meta.url),
    new URL('./assets/audio/gunshots/pistol-heavy-2.wav', import.meta.url),
  ],
};
const FOLEY_SAMPLES = {
  'sand-L1': new URL('./assets/audio/foley/Fantozzi-SandL1.ogg', import.meta.url),
  'sand-L2': new URL('./assets/audio/foley/Fantozzi-SandL2.ogg', import.meta.url),
  'sand-L3': new URL('./assets/audio/foley/Fantozzi-SandL3.ogg', import.meta.url),
  'sand-R1': new URL('./assets/audio/foley/Fantozzi-SandR1.ogg', import.meta.url),
  'sand-R2': new URL('./assets/audio/foley/Fantozzi-SandR2.ogg', import.meta.url),
  'sand-R3': new URL('./assets/audio/foley/Fantozzi-SandR3.ogg', import.meta.url),
  'stone-L1': new URL('./assets/audio/foley/Fantozzi-StoneL1.ogg', import.meta.url),
  'stone-L2': new URL('./assets/audio/foley/Fantozzi-StoneL2.ogg', import.meta.url),
  'stone-L3': new URL('./assets/audio/foley/Fantozzi-StoneL3.ogg', import.meta.url),
  'stone-R1': new URL('./assets/audio/foley/Fantozzi-StoneR1.ogg', import.meta.url),
  'stone-R2': new URL('./assets/audio/foley/Fantozzi-StoneR2.ogg', import.meta.url),
  'stone-R3': new URL('./assets/audio/foley/Fantozzi-StoneR3.ogg', import.meta.url),
  'engine': new URL('./assets/audio/foley/engine-loop.wav', import.meta.url),
  'rocket-launch-1': new URL('./assets/audio/foley/rocket-launch-1.ogg', import.meta.url),
  'rocket-launch-2': new URL('./assets/audio/foley/rocket-launch-2.ogg', import.meta.url),
  'rocket-flight': new URL('./assets/audio/foley/rocket-flight.ogg', import.meta.url),
  'explosion-heavy': new URL('./assets/audio/foley/explosion-heavy.ogg', import.meta.url),
  'explosion-grenade': new URL('./assets/audio/foley/explosion-grenade.ogg', import.meta.url),
};
const HANDLING = {
  release: [.033, 3400, 510], pull: [.105, 1250, 188], pouch: [.16, 790, 0],
  seat: [.058, 1850, 205], tap: [.044, 2640, 300], bolt: [.075, 3600, 338],
  lock: [.034, 4700, 480], cover: [.13, 1420, 165], feed: [.15, 2530, 0],
  dry: [.022, 5600, 710], aim: [.070, 1750, 0], lower: [.096, 1050, 0],
};
const MAG_RELOAD = [[.27,'release'],[.42,'pull'],[.92,'pouch'],[1.6,'seat'],[1.68,'tap'],[1.75,'bolt'],[1.88,'lock']];
const BELT_RELOAD = [[.34,'cover'],[.61,'pull'],[1.46,'pouch'],[2.18,'feed'],[2.51,'seat'],[2.78,'cover'],[2.89,'bolt'],[3.03,'lock']];
const IMPACTS = {
  metal: [5000, .13, 1040], wood: [1870, .075, 290], concrete: [3100, .086, 0],
  ground: [1060, .072, 0], shield: [3800, .14, 1430],
};

export class CombatAudio {
  constructor() {
    this.ctx=null; this.seen=new Set(); this.lastShot=-1;
    this._volume=.35; this._musicVolume=.62; this._effectsVolume=.85; this._enabled=true;
    this._mode='menu'; this._voices=new Set(); this._ambientSources=[]; this._buffers=new Map(); this._nodes=[];
    this._scheduler=null; this._nextMusic=0; this._musicStep=0; this._disposed=false;
    this._menuTrack=null;this._menuPlayPending=false;
    this._lastStateTime=-1; this._lastMovementTime=-1; this._lastPosition=null;
    this._stride=0; this._leftFoot=false; this._falling=false; this._aim=false;
    this._heartbeat=0; this._distantAt=0; this._nextGust=0; this._paused=false;
    this._suppressedUntil=0; this._muffleTarget=18000;
    this._pending=[];this._priority=2;this._engineAt=0;this._resumeAt=0;this._targets=new WeakMap();
    this._fadingVoices = new Set();
    this._shotBuffers = new Map();
    this._shotLoadFailures = 0;
    this._foley = new Map();
    this._engineChannels = new Map();this._rocketChannels=new Map();this._rocketTracks=new Map();
    this._remoteSteps = new Map();
    this._stepCounts = new Map();
  }
  get volume(){return this._volume;}
  set volume(v){this._volume=clamp(v);this._mix();}
  get musicVolume(){return this._musicVolume;}
  set musicVolume(v){this.setMusicVolume(v);}
  get effectsVolume(){return this._effectsVolume;}
  set effectsVolume(v){this.setEffectsVolume(v);}
  get enabled(){return this._enabled;}
  set enabled(v){this.setEnabled(v);}
  setMusicVolume(v){this._musicVolume=clamp(v);this._mix();}
  setEffectsVolume(v){this._effectsVolume=clamp(v);this._mix();}
  setEnabled(v){this._enabled=Boolean(v);if(!this._enabled){this._stopRocketAudio();this._pending=[];for(const voice of this._voices)this._releaseVoice(voice,true);}this._mix();}

  async unlock(){
    if(this._disposed)return false;
    try{
      if(!this.ctx){
        const Context=globalThis.AudioContext||globalThis.webkitAudioContext;
        if(!Context)return false;
        this.ctx=new Context({latencyHint:.045});this._buildGraph();
        this._prepareShotBuffers().catch(() => {});
        this._prepareFoley().catch(() => {});
      }
      if(this.ctx.state!=='running')await this.ctx.resume();
      if(!this._scheduler){
        this._nextMusic=this.ctx.currentTime+.08;
        this._scheduler=setInterval(()=>this._schedule(),100);this._schedule();
      }
      this._syncMenuMusic();
      return this.ctx.state==='running';
    }catch{return false;}
  }

  _node(n){this._nodes.push(n);return n;}
  _buildGraph(){
    const c=this.ctx;
    this._master=this._node(c.createGain());this._music=this._node(c.createGain());
    this._effects=this._node(c.createGain());this._ambient=this._node(c.createGain());
    this._localWeapon=this._node(c.createGain());
    this._weapons=this._node(c.createGain());
    const weaponHighpass=this._node(c.createBiquadFilter());
    weaponHighpass.type='highpass';weaponHighpass.frequency.value=60;weaponHighpass.Q.value=.707;
    this._muffle=this._node(c.createBiquadFilter());this._muffle.type='lowpass';this._muffle.frequency.value=18000;
    const limiter=this._node(c.createDynamicsCompressor());
    limiter.threshold.value=-6;limiter.knee.value=6;limiter.ratio.value=12;limiter.attack.value=.001;limiter.release.value=.12;
    this._music.connect(this._master);this._effects.connect(this._muffle).connect(this._master);
    this._localWeapon.connect(weaponHighpass).connect(this._master);
    const battleCompressor=this._node(c.createDynamicsCompressor());
    battleCompressor.threshold.value=-12;battleCompressor.knee.value=8;battleCompressor.ratio.value=4;battleCompressor.attack.value=.002;battleCompressor.release.value=.16;
    this._weapons.connect(battleCompressor).connect(this._master);
    this._ambient.connect(this._effects);this._master.connect(limiter);
    this._analyser=this._node(c.createAnalyser());this._analyser.fftSize=256;this._analyser.smoothingTimeConstant=.1;
    this._meter=new Float32Array(this._analyser.fftSize);const output=this._node(c.createGain());output.gain.value=.8;limiter.connect(output).connect(this._analyser).connect(c.destination);
    this._reverbs={};const impulse=this._impulse();
    for(const bus of ['music','effects']){
      const convolver=this._node(c.createConvolver());convolver.buffer=impulse;
      const wet=this._node(c.createGain());wet.gain.value=bus==='music'?.32:.16;
      convolver.connect(wet).connect(bus==='music'?this._music:this._effects);this._reverbs[bus]=convolver;
    }
    // Stream the MP3 rather than retaining a full decoded song in memory.
    this._menuTrack=new Audio(MENU_MUSIC_URL.href);this._menuTrack.loop=true;this._menuTrack.preload='auto';
    const trackGain=this._node(c.createGain());trackGain.gain.value=.45;
    this._node(c.createMediaElementSource(this._menuTrack)).connect(trackGain).connect(this._music);
    this._mix(true);this._noiseBuffer('white');this._startAmbient();
  }
  _syncMenuMusic(){
    const track=this._menuTrack;if(!track)return;
    const play=!this._disposed&&this._mode==='menu'&&this._enabled&&this._volume>0&&this._musicVolume>0&&this.ctx?.state==='running';
    if(!play){track.pause();return;}
    if(!track.paused||this._menuPlayPending)return;
    this._menuPlayPending=true;
    track.play().then(()=>true,()=>false).then(played=>{
      this._menuPlayPending=false;
      if(this._disposed||this._mode!=='menu'||!this._enabled||this._volume<=0||this._musicVolume<=0)track.pause();
      else if(played&&track.paused)this._syncMenuMusic();
    });
  }
  _target(parameter,value,seconds=.1,immediate=false){
    if(!parameter||!this.ctx)return;
    if(!immediate&&this._targets.get(parameter)===value)return;
    this._targets.set(parameter,value);
    const now=this.ctx.currentTime;
    // Preserve the instantaneous value before replacing an unfinished ramp.
    // Cancelling its start event can jump back to the previous intrinsic value.
    if(parameter.cancelAndHoldAtTime)parameter.cancelAndHoldAtTime(now);
    else{const held=parameter.value;parameter.cancelScheduledValues(now);parameter.setValueAtTime(held,now);}
    if(immediate)parameter.setValueAtTime(value,now);else parameter.setTargetAtTime(value,now,Math.max(.01,seconds));
  }
  _mix(immediate=false){
    if(!this.ctx||!this._master)return;
    this._target(this._master.gain,this._enabled?this._volume*.82:0,.055,immediate);
    this._target(this._effects.gain,this._effectsVolume*(this._paused?.35:1),.16,immediate);
    this._target(this._localWeapon.gain,this._effectsVolume*(this._paused?.35:1),.16,immediate);
    this._target(this._weapons.gain,this._effectsVolume*.7*(this._paused?.35:1),.16,immediate);
    this._target(this._music.gain,this._musicVolume*(this._mode==='menu'?1.64:.22),.9,immediate);
    this._target(this._ambient.gain,this._mode==='battle'?.24:.055,1.5,immediate);
    this._syncMenuMusic();
  }
  setMode(mode){
    const next=mode==='battle'?'battle':'menu';if(next===this._mode)return;
    this._stopRocketAudio();this._mode=next;this._lastPosition=null;this._stride=0;this._falling=false;this._suppressedUntil=0;
    this._pending=next==='menu'?[]:this._pending.filter(sound=>sound.options.bus==='music');
    for(const voice of this._voices)if(voice.bus!=='music')this._releaseVoice(voice,true);
    if(next==='menu')for(const voice of this._voices)if(voice.bus==='music')this._fadeVoice(voice,.08);
    this.seen.clear();this._lastStateTime=-1;this._mix();
    if(this.ctx&&this._enabled&&next==='battle'){
      this._tone(78,1.15,.13,{end:37,send:.3});this._noise(.9,.08,{cutoff:480,send:.35});
    }
  }
  _noiseBuffer(color='white'){
    if(this._buffers.has(color))return this._buffers.get(color);
    const length=Math.ceil(this.ctx.sampleRate*4),buffer=this.ctx.createBuffer(1,length,this.ctx.sampleRate),data=buffer.getChannelData(0);
    let seed=color==='pink'?67381:17179,brown=0;
    for(let i=0;i<length;i++){
      seed=(Math.imul(seed,1664525)+1013904223)|0;
      const white=(seed>>>0)/2147483648-1;brown=.975*brown+white*.025;data[i]=color==='pink'?brown*3.6:white;
    }
    this._buffers.set(color,buffer);return buffer;
  }
  _impulse(){
    const length=Math.ceil(this.ctx.sampleRate*1.8),buffer=this.ctx.createBuffer(2,length,this.ctx.sampleRate);let seed=90713;
    for(let channel=0;channel<2;channel++){
      const data=buffer.getChannelData(channel);
      for(let i=0;i<length;i++){seed=(Math.imul(seed,1664525)+1013904223)|0;data[i]=((seed>>>0)/2147483648-1)*Math.exp(-i/(length*.19))*.33;}
    }
    return buffer;
  }
  _startAmbient(){
    for(const [frequency,pan,gain,rate]of [[310,-.65,.16,.71],[620,.7,.085,.93],[2200,.15,0,.83]]){
      const source=this.ctx.createBufferSource();source.buffer=this._noiseBuffer(frequency>2000?'white':'pink');source.loop=true;source.playbackRate.value=rate;
      const filter=this.ctx.createBiquadFilter();filter.type='bandpass';filter.frequency.value=frequency;filter.Q.value=.45;
      const volume=this.ctx.createGain();volume.gain.value=gain;source.connect(filter).connect(volume);let output=volume;
      if(this.ctx.createStereoPanner){const p=this.ctx.createStereoPanner();p.pan.value=pan;volume.connect(p);output=p;}
      output.connect(this._ambient);source.start(0,Math.random()*2);this._ambientSources.push({source,filter,volume,nodes:[filter,volume,output]});
    }
  }
  _releaseVoice(voice,stop=false){
    if(!this._voices.delete(voice)&&!this._fadingVoices.delete(voice))return;
    voice.source.onended=null;
    if(stop)try{voice.source.stop();}catch{}
    for(const node of voice.nodes)try{node.disconnect();}catch{}
  }
  _reapVoices(){
    const now=this.ctx.currentTime;
    // onended is delivered on the main thread and can be delayed by a busy frame.
    // Never allow a stale callback to hold the voice budget indefinitely.
    for(const voice of this._voices)if(voice.end<=now)this._releaseVoice(voice,true);
    for(const voice of this._fadingVoices)if(voice.end<=now)this._releaseVoice(voice,true);
  }
  _fadeVoice(voice,fade=VOICE_FADE) {
    const now = this.ctx.currentTime;
    if (voice.time >= now) { this._releaseVoice(voice, true); return true; }
    if (this._fadingVoices.size >= MAX_FADING_VOICES) return false;
    const gain = voice.release;
    if(gain.cancelAndHoldAtTime)gain.cancelAndHoldAtTime(now);else{const value=gain.value;gain.cancelScheduledValues(now);gain.setValueAtTime(value,now);}
    gain.setTargetAtTime(0, now, fade / 5);
    voice.end = Math.min(voice.end, now + fade);
    voice.source.stop(voice.end);
    this._voices.delete(voice);
    this._fadingVoices.add(voice);
    return true;
  }
  _admit(options){
    this._reapVoices();
    const bus=options.bus==='music'?'music':'effects',priority=options.priority??(bus==='music'?0:this._priority);
    let music=0,victim=null;
    for(const voice of this._voices){
      if(voice.bus==='music')music++;
      const replaceTail=options.shot&&voice.shooterId!==undefined&&voice.priority===priority&&voice.time+.08<this.ctx.currentTime;
      if(voice.bus===bus && (voice.priority<priority||replaceTail) &&
        (!victim || voice.priority<victim.priority ||
          (voice.priority===victim.priority && voice.end<victim.end))) victim=voice;
    }
    if(bus==='music'&&music>=MUSIC_VOICES)return false;
    // Reserve headroom for the local weapon, hits and immediate feedback.
    const limit=priority>=3?MAX_VOICES:priority>=2?MAX_VOICES-8:MAX_VOICES-16;
    if(this._voices.size<limit)return true;
    return Boolean(victim) && this._fadeVoice(victim) !== false;
  }
  _defer(kind,frequency,duration,gain,options){
    if(!Number.isFinite(options.time)||options.time<=this.ctx.currentTime+.3)return false;
    const priority=options.priority??(options.bus==='music'?0:this._priority);
    const sound={kind,frequency,duration,gain,options:{...options,priority}};
    if(this._pending.length<64)this._pending.push(sound);
    else{
      const index=this._pending.findIndex(queued=>queued.options.priority<priority);
      if(index>=0)this._pending[index]=sound;
    }
    return true;
  }
  _voice(source,duration,gain,options={}){
    if(!this.ctx||!this._enabled||this.ctx.state!=='running'||!Number.isFinite(duration)||!Number.isFinite(gain)){try{source.disconnect();}catch{}return null;}
    const c=this.ctx,time=Math.max(c.currentTime,options.time??c.currentTime);
    const {end,nodes,envelope}=this._envelope(c,source,time,duration,gain,options);
    // Voice stealing fades a separate gain stage; it must never cancel or
    // reconstruct the attack/decay automation of the recording itself.
    const gate=c.createGain();envelope.connect(gate);nodes.push(gate);
    let output=gate,release=gate.gain;
    if(c.createStereoPanner&&options.pan){const p=c.createStereoPanner();p.pan.value=clamp(options.pan,-1,1);output.connect(p);output=p;nodes.push(p);}
    const bus=options.bus==='music'?'music':'effects';
    output.connect(options.bus==='localWeapon'?this._localWeapon:options.bus==='weapons'?this._weapons:bus==='music'?this._music:this._effects);
    if(options.send){const send=c.createGain();send.gain.value=options.send;output.connect(send).connect(this._reverbs[bus]);nodes.push(send);}
    const voice={source,nodes,time,end:end+.015,bus,release,priority:options.priority??(bus==='music'?0:this._priority)};this._voices.add(voice);
    source.onended=()=>this._releaseVoice(voice);
    try{source.start(time,...(options.offset===undefined?[]:[options.offset]));source.stop(voice.end);}
    catch{this._releaseVoice(voice,true);return null;}
    return voice;
  }
  _envelope(c,source,time,duration,gain,options){
    const end=time+Math.max(.015,duration),nodes=[source];let output=source;
    if(options.cutoff){
      const filter=c.createBiquadFilter();filter.type=options.filter||'lowpass';filter.frequency.setValueAtTime(clamp(options.cutoff,20,19000),time);filter.Q.value=options.q??.6;
      if(options.endCutoff)filter.frequency.exponentialRampToValueAtTime(Math.max(20,options.endCutoff),end);
      output.connect(filter);output=filter;nodes.push(filter);
    }
    const envelope=c.createGain(),peak=Math.max(EPSILON,gain),attack=Math.min(duration*.35,options.attack??.002);
    envelope.gain.setValueAtTime(EPSILON,time);envelope.gain.linearRampToValueAtTime(peak,time+attack);
    if(options.sample){
      envelope.gain.setValueAtTime(peak,Math.max(time+attack,end-(options.tail??.012)));
      envelope.gain.linearRampToValueAtTime(EPSILON,end);
      output.connect(envelope);nodes.push(envelope);return {end,nodes,envelope};
    }
    if(options.decay){
      const shoulder=Math.min(end-.002,time+attack+options.decay);
      envelope.gain.exponentialRampToValueAtTime(Math.max(EPSILON,peak*(options.decayGain??.25)),shoulder);
    }else if(options.sustain)envelope.gain.setValueAtTime(peak*.72,Math.max(time+attack,end-options.sustain));
    envelope.gain.exponentialRampToValueAtTime(EPSILON,end);output.connect(envelope);nodes.push(envelope);
    return {end,nodes,envelope};
  }
  _oscillator(context,frequency,time,duration,options){
    const o=context.createOscillator();o.type=options.type||'sine';
    o.frequency.setValueAtTime(Math.max(1,frequency),time);if(options.end)o.frequency.exponentialRampToValueAtTime(Math.max(1,options.end),time+duration);if(options.detune)o.detune.value=options.detune;
    return o;
  }
  _tone(frequency,duration,gain,options={}){
    if(!this.ctx||!this._enabled||this.ctx.state!=='running'||!Number.isFinite(frequency))return;
    if(this._defer('tone',frequency,duration,gain,options))return;
    if(!this._admit(options))return;
    const time=Math.max(this.ctx.currentTime,options.time??this.ctx.currentTime),o=this._oscillator(this.ctx,frequency,time,duration,options);
    return this._voice(o,duration,gain,options);
  }
  _noise(duration,gain,options={}){
    if(!this.ctx||!this._enabled||this.ctx.state!=='running')return;
    if(this._defer('noise',0,duration,gain,options))return;
    if(!this._admit(options))return;
    const s=this._noiseSource(this.ctx,options);
    return this._voice(s,duration,gain,{...options,offset:Math.random()*Math.max(0,3-duration)});
  }
  _noiseSource(context,options){
    const s=context.createBufferSource();s.buffer=this._noiseBuffer(options.color||'white');s.playbackRate.value=options.rate||1;
    return s;
  }
  tone(frequency,duration,gain=.1,type='sine',end=frequency){this._tone(frequency,duration,gain,{type,end});}
  noise(duration,gain,lowpass=4000){this._noise(duration,gain,{cutoff:lowpass});}

  _schedule(){
    if(!this.ctx||this.ctx.state!=='running'||this._disposed)return;
    const now=this.ctx.currentTime;this._reapVoices();
    const pending=this._pending;this._pending=[];
    for(const sound of pending){
      if(sound.options.time>now+.3){this._pending.push(sound);continue;}
      if(sound.options.time<now-.15)continue;
      if(sound.kind==='tone')this._tone(sound.frequency,sound.duration,sound.gain,sound.options);
      else this._noise(sound.duration,sound.gain,sound.options);
    }
    if(this._nextMusic<now-.3)this._nextMusic=now+.08;let scheduled=0;
    while(this._nextMusic<now+.32&&scheduled++<8){
      if(this._mode==='battle'&&this._enabled&&this._musicVolume>0)this._musicTick(this._musicStep,this._nextMusic);
      this._musicStep=(this._musicStep+1)%256;this._nextMusic+=BEAT/2;
    }
  }
  _musicTick(step,time){
    const bar=Math.floor(step/8),eighth=step%8,[bass,notes]=HARMONY[Math.floor(bar/4)],section=Math.floor(bar/8),o={time,bus:'music',send:.4};
    if(eighth===0&&bar%2===0){
      notes.forEach((note,index)=>this._tone(midi(note),BEAT*8+.8,.041,{...o,type:'triangle',cutoff:760+section*90,attack:1.05,sustain:1.3,pan:(index-1.5)*.37,detune:index%2?5:-5}));
      this._tone(midi(bass),BEAT*7.7,.052,{...o,attack:.55,sustain:1,cutoff:190});
    }
    if(eighth%2===0||(section>=2&&eighth===7))this._tone(midi(bass+(eighth===6?12:0)),BEAT*.48,.105,{...o,type:'triangle',cutoff:310,endCutoff:95,send:.06,attack:.012});
    const note=MELODY[((bar%8)*4+Math.floor(eighth/2))%MELODY.length];
    if(eighth%2===0&&note&&(bar%4>=1||section>0)){
      const transpose=[1,6].includes(Math.floor(bar/4))?-2:0;
      this._tone(midi(note+transpose),1.45,.075,{...o,attack:.004,cutoff:2500,pan:Math.sin(bar*.8)*.42,send:.65});
      this._tone(midi(note+transpose+12),.32,.011,{...o,type:'triangle',cutoff:2900,pan:-.25,send:.42});
    }
    if(section>=1&&(eighth===0||eighth===4)){this._tone(98,.27,.15,{...o,end:36,send:.16});this._noise(.035,.065,{...o,cutoff:1100,send:.06});}
    if(section>=1&&(eighth===2||eighth===6)){this._noise(.18,.073,{...o,filter:'bandpass',cutoff:1600,q:.7,pan:-.12,send:.5});this._tone(170,.09,.025,{...o,end:110,type:'triangle',send:.2});}
    if(section>=2&&(eighth%2||section===3))this._noise(.042,eighth%2?.023:.013,{...o,filter:'highpass',cutoff:6500,pan:.3,send:.12});
    if(bar===31&&eighth===7)this._noise(.42,.055,{...o,color:'pink',filter:'bandpass',cutoff:1900,attack:.25,send:.65});
  }
  _position(event,local){
    if(!local||event.playerId===local.id)return {distance:0,pan:0,gain:1};
    const dx=(event.x??local.x)-local.x,dz=(event.z??local.z)-local.z,distance=Math.hypot(dx,dz),yaw=local.yaw||0;
    return {distance,pan:clamp((dx*Math.cos(yaw)-dz*Math.sin(yaw))/Math.max(4,distance),-.95,.95),gain:1/(1+distance*.042)};
  }
  async _prepareShotBuffers(){
    const context = this.ctx;
    await Promise.all(Object.entries(SHOT_SAMPLES).map(async ([name, urls]) => {
      const results = await Promise.allSettled(urls.map(async url => {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Firearm recording unavailable');
        const data = await response.arrayBuffer();
        if (this._disposed) return null;
        return context.decodeAudioData(data);
      }));
      if (this._disposed) return;
      const buffers = [];
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          const buffer=result.value;
          let peak=0;
          for(let channel=0;channel<buffer.numberOfChannels;channel++){
            const data=buffer.getChannelData(channel);
            let mean=0;for(const value of data)mean+=value;mean/=data.length;
            for(let i=0;i<data.length;i++){data[i]-=mean;peak=Math.max(peak,Math.abs(data[i]));}
          }
          // Recordings are mastered offline with headroom; do not normalize them back up.
          const level=Math.min(1,.78/Math.max(.01,peak));
          for(let channel=0;channel<buffer.numberOfChannels;channel++){
            const data=buffer.getChannelData(channel),fade=Math.ceil(buffer.sampleRate*.003);
            for(let i=0;i<data.length;i++)data[i]*=level*Math.min(1,(data.length-1-i)/fade);
          }
          buffers.push(buffer);
        }
        else if (result.status === 'rejected') this._shotLoadFailures++;
      }
      this._shotBuffers.set(name, buffers);
    }));
  }
  shot(distance=0,classId='assault',pan=0,isLocal=distance<1,age=0,shooterId=classId){
    const priority=this._priority;
    this._priority=isLocal?3:distance<30?2:1;
    try{
      if(!this.ctx||!this._enabled||this.ctx.state!=='running')return;
      const id=Object.hasOwn(WEAPONS,classId)?classId:CLASS_SHOTS[classId]??'ar416',weapon=WEAPONS[id];
      const variation=weapon.rate*(.985+Math.random()*.03);
      const gain=(isLocal?.94:.64)*weapon.gain/(1+distance*.04);
      // Events already follow the presentation clock. Adding travel time here
      // queues distant shots behind subsequent rounds from the same weapon.
      const time=this.ctx.currentTime+.004;
      const variants=this._shotBuffers.get(weapon.sample);
      const buffer=variants?.[Math.floor(Math.random()*variants.length)];
      const cutoff=isLocal||distance<12?0:Math.max(1500,weapon.cutoff/(1+(distance-12)*.012));
      if(buffer){
        // Seek into late recordings instead of replaying several old attacks
        // together or discarding every shot but the newest in a network batch.
        const elapsed=Math.max(0,age-.035),offset=elapsed*variation;
        const duration=Math.min(buffer.duration/variation,isLocal?1.2:distance>65?.3:.48)-elapsed;
        if(duration<=.015)return;
        if(!this._admit({shot:true}))return;
        const source=this.ctx.createBufferSource();
        source.buffer=buffer;source.playbackRate.value=variation;
        const voice=this._voice(source,duration,gain,{
          time,offset,pan,attack:offset>0?.006:.001,sample:true,send:0,bus:isLocal?'localWeapon':'weapons',
          cutoff,q:.707,tail:isLocal?.075:.04,
        });
        if(voice)voice.shooterId=shooterId;
      }else{
        this._noise(.055,gain*.7,{time,pan,bus:isLocal?'localWeapon':'weapons',filter:'highpass',cutoff:900,attack:.0003,decay:.004,decayGain:.12});
      }
    }finally{this._priority=priority;}
  }
  _mechanic(kind,time,pan,gain){
    const [duration,cutoff,resonance]=HANDLING[kind];
    const cloth=kind==='pouch'||kind==='aim'||kind==='lower';
    this._noise(duration,gain,{time,filter:'bandpass',cutoff,q:cloth?.7:1.45,pan,
      color:cloth?'pink':'white',attack:cloth?.012:.001,decay:duration*.2,decayGain:.28,send:.04});
    if(resonance&&this._voices.size<48){
      this._tone(resonance,.038,gain*.56,{time:time+.002,type:'triangle',end:resonance*.52,
        cutoff:resonance*4,pan,attack:.001});
    }
  }
  _nearMiss(event,local){
    const now=this.ctx.currentTime;
    if(!local?.alive||event.team===local.team||now<this._suppressedUntil-.29||this._voices.size>=48)return;
    const {x,y,z,tx,ty,tz}=event;
    if(![x,y,z,tx,ty,tz].every(Number.isFinite))return;
    const dx=tx-x,dy=ty-y,dz=tz-z,lengthSquared=dx*dx+dy*dy+dz*dz;
    if(lengthSquared<16)return;
    const eye=(local.y||0)+(local.crouch?1.12:1.58);
    const along=((local.x-x)*dx+(eye-y)*dy+(local.z-z)*dz)/lengthSquared;
    if(along<=.025||along>1)return;
    const arc=.5*BULLET_GRAVITY*(event.flight||0)**2*along*(1-along);
    const px=x+along*dx,py=y+along*dy+arc,pz=z+along*dz;
    const distance=Math.hypot(px-local.x,py-eye,pz-local.z);
    if(distance>1.95)return;
    const pan=this._position({x:px,z:pz},local).pan;
    const gain=.155*(1-distance/2.35);
    this._noise(.05,gain,{filter:'bandpass',cutoff:5200,endCutoff:1850,q:1.6,pan,
      attack:.0007,decay:.009,decayGain:.29,send:.12});
    this._tone(1420,.078,gain*.43,{end:340,pan,type:'sine'});
    this._suppressedUntil=now+.49;
  }
  _impact(event,local){
    const material=IMPACTS[event.impact];
    if(!material||!local||this._voices.size>=32||!Number.isFinite(event.tx)||!Number.isFinite(event.tz))return;
    const p=this._position({x:event.tx,z:event.tz},local);
    if(p.distance>25)return;
    const [cutoff,duration,ring]=material;
    const time=this.ctx.currentTime+Math.min(.085,p.distance/343);
    this._noise(duration,.085*p.gain,{time,filter:'bandpass',cutoff,q:1.3,pan:p.pan,
      attack:.001,decay:.009,decayGain:.22,send:.13});
    if(ring)this._tone(ring,duration*.85,.04*p.gain,{time:time+.002,end:ring*.76,pan:p.pan,send:.16});
  }
  async _prepareFoley(){
    const context=this.ctx;
    await Promise.allSettled(Object.entries(FOLEY_SAMPLES).map(async ([name,url])=>{
      const response=await fetch(url);if(!response.ok)return;
      const buffer=await context.decodeAudioData(await response.arrayBuffer());
      if(this._disposed)return;
      if(name!=='engine'&&name!=='rocket-flight'){
        let peak=0;
        for(let channel=0;channel<buffer.numberOfChannels;channel++)for(const value of buffer.getChannelData(channel))peak=Math.max(peak,Math.abs(value));
        const gain=Math.min(1,.78/Math.max(.01,peak));
        for(let channel=0;channel<buffer.numberOfChannels;channel++){
          const data=buffer.getChannelData(channel),fade=Math.max(1,Math.floor(buffer.sampleRate*.004));
          for(let i=0;i<data.length;i++)data[i]*=gain*Math.min(1,i/fade,(data.length-1-i)/fade);
        }
      }
      if(name==='engine'||name==='rocket-flight'){
        // Overlap the end with the start once during loading. A raw loop cut
        // produces a click on every revolution, especially as pitch changes.
        const fade=Math.min(Math.floor(buffer.length/4),Math.floor(buffer.sampleRate*.035));
        if(fade>1){
          const loop=context.createBuffer(buffer.numberOfChannels,buffer.length-fade,buffer.sampleRate);
          for(let channel=0;channel<buffer.numberOfChannels;channel++){
            const input=buffer.getChannelData(channel),output=loop.getChannelData(channel);
            output.set(input.subarray(fade));
            for(let i=0;i<fade;i++){
              const t=i/(fade-1),index=output.length-fade+i;
              output[index]=input[input.length-fade+i]*(1-t)+input[i]*t;
            }
          }
          this._foley.set(name,loop);return;
        }
      }
      this._foley.set(name,buffer);
    }));
  }
  _sample(name,gain,options={}){
    const buffer=this._foley.get(name);
    if(!buffer||!this._admit(options))return false;
    const source=this.ctx.createBufferSource();source.buffer=buffer;source.playbackRate.value=options.rate??1;
    this._voice(source,Math.min(options.duration??10,buffer.duration/source.playbackRate.value),gain,{sample:true,attack:.0003,tail:.035,...options});
    return true;
  }
  _explosion(event,local){
    const p=this._position(event,local),time=this.ctx.currentTime+Math.min(.35,p.distance/343);
    if(p.distance>220)return;
    const heavy=event.kind==='rocket'||Boolean(event.vehicleId);
    const played=this._sample(heavy?'explosion-heavy':'explosion-grenade',(heavy?.8:.68)*p.gain,{
      time,pan:p.pan,rate:heavy?.94:1.04,cutoff:p.distance<15?0:Math.max(1200,14000/(1+p.distance*.022)),send:.06,
    });
    if(!played)this._noise(.8,.35*p.gain,{time,color:'pink',cutoff:6500,pan:p.pan,attack:.0005,decay:.04,decayGain:.15});
    if(p.distance<24)this._noise(.32,.035*p.gain,{time:time+.1,filter:'highpass',cutoff:2600,pan:p.pan});
  }
  _reload(event,local,player){
    if(!player)return;
    const own=player.id===local?.id;
    const p=this._position({...event,x:event.x??player.x,z:event.z??player.z},local);
    if(!own&&(p.distance>12||this._voices.size>55))return;
    const elapsed=Number.isFinite(event.time)?Math.max(0,this._lastStateTime-event.time):0;
    const start=this.ctx.currentTime-elapsed;
    const gain=(own?.16:.068)*p.gain;
    const pistol=event.weaponId==='p19'||event.weaponId==='m50';
    const belt=!pistol&&(event.classId||player.classId)==='support';
    const expected=belt?3.1:2;
    const scale=Number.isFinite(event.duration)?clamp(event.duration/expected,.6,1.35):1;
    for(const [mark,kind] of belt?BELT_RELOAD:MAG_RELOAD){
      const offset=mark*scale;
      if(!own&&kind!=='seat'&&kind!=='lock')continue;
      if(own&&!belt&&event.empty===false&&(kind==='bolt'||kind==='lock'))continue;
      if(offset<elapsed-.06)continue;
      this._mechanic(kind,Math.max(this.ctx.currentTime,start+offset),own?.24:p.pan,gain*(kind==='seat'?1.14:.8));
    }
  }
  _step(strength,sprinting,crouching,subject,spatial=null){
    const map=getMap(this._mapId),ground=map.terrain?.heightAt(subject.x,subject.z)??0;
    const indoors=map.structures.some(building=>Math.abs(subject.x-building.x)<building.w/2&&Math.abs(subject.z-building.z)<building.d/2);
    const soft=!indoors&&subject.y<ground+.35&&(map.theme==='desert-village'||map.id==='quarry');
    const count=this._stepCounts.get(subject.id)??0;this._stepCounts.set(subject.id,count+1);
    const side=count%2?'R':'L',take=Math.floor(count/2)%3+1;
    const gain=.42*strength*(crouching?.09:sprinting?.31:.24)*(spatial?.gain??1);
    const priority=this._priority;this._priority=spatial?1:3;
    try{
      this._sample((soft?'sand':'stone')+'-'+side+take,gain,{pan:spatial?.pan??(side==='R'?.10:-.10),
        rate:(sprinting?1.07:crouching?.93:1)*(.97+Math.random()*.06),cutoff:spatial?8000:0});
    }finally{this._priority=priority;}
  }
  _updateOtherSteps(state,local,silent){
    if(silent||!local?.alive){this._remoteSteps.clear();return;}
    const nearby=(state.players??[]).filter(p=>p.id!==local.id&&p.alive&&!p.vehicleId&&p.grounded&&Math.hypot(p.x-local.x,p.z-local.z)<18)
      .sort((a,b)=>Math.hypot(a.x-local.x,a.z-local.z)-Math.hypot(b.x-local.x,b.z-local.z)).slice(0,6);
    const active=new Set();
    for(const player of nearby){
      active.add(player.id);const previous=this._remoteSteps.get(player.id);
      const travelled=previous?Math.hypot(player.x-previous.x,player.z-previous.z):0;
      const total=(previous?.stride??0)+(travelled<4?travelled:0),stride=player.sprint?2.45:player.crouch?1.55:2.05;
      if(total>=stride)this._step(.7,player.sprint,player.crouch,player,this._position(player,local));
      this._remoteSteps.set(player.id,{x:player.x,z:player.z,stride:total%stride});
    }
    for(const id of this._remoteSteps.keys())if(!active.has(id)){this._remoteSteps.delete(id);this._stepCounts.delete(id);}
  }
  events(state,local,{immediate=false}={}){
    if(!state)return;
    // Immediate local events use authority time; rendered events use the
    // interpolation clock. Comparing those clocks can falsely reset deduplication.
    if(!immediate){
      if(state.time<this._lastStateTime-1){this.seen.clear();this._lastPosition=null;this._lastMovementTime=-1;this._pending=[];for(const voice of this._voices)if(voice.bus!=='music')this._releaseVoice(voice,true);}
      this._lastStateTime=state.time;
    }
    for(const e of state.events||[]){
      if(this.seen.has(e.id))continue;this.seen.add(e.id);
      if(e.confirmedCosmetic)continue;
      if(!this.ctx||!this._enabled||this.ctx.state!=='running')continue;
      const own=local&&e.playerId===local.id;
      this._priority=own?3:1;
      if(e.type==='shot'){
        if(Number.isFinite(e.time)&&state.time-e.time>.22)continue;
        const p=this._position(e,local);
        if(p.distance<145){
          const classId=e.classId||state.players?.find(player=>player.id===e.playerId)?.classId;
          const age=Number.isFinite(e.time)?Math.max(0,state.time-e.time):0;
          const profile=e.mounted?'turret':Object.hasOwn(WEAPONS,e.weaponId)?e.weaponId:classId;
          this.shot(p.distance,profile,p.pan,Boolean(own),age,e.playerId);
        }
      }else if(e.type==='bulletImpact'){
        if(state.time-e.time>.25)continue;
        if(!own)this._nearMiss(e,local);
        this._impact(e,local);
        if(own&&(e.hit||e.vehicleHit||e.equipmentHit)){
          this._tone(e.headshot?2110:1780,.04,.082,{end:e.headshot?1740:1300});
          this._noise(.024,.045,{filter:'bandpass',cutoff:e.headshot?3400:2500});
        }
      }else if((e.type==='vehicleEnter'||e.type==='vehicleExit')&&own){
        const time=this.ctx.currentTime;
        const vehicle=state.vehicles?.find(v=>v.id===e.vehicleId);
        const closed=vehicle?.type==='humvee'&&e.seat!==1;
        this._mechanic('seat',time,.28,.16);
        this._noise(closed?.16:.07,closed?.13:.075,{time,color:'pink',cutoff:closed?440:940,send:.08});
        if(e.type==='vehicleEnter'&&e.seat===0)this._tone(closed?28:43,.32,.10,{time:time+.05,type:'triangle',end:closed?49:67});
      }else if(e.type==='dryFire'&&own){
        this._mechanic('dry',this.ctx.currentTime,.21,.16);
      }else if(e.type==='horn'){
        const p=this._position(e,local);
        this._tone(330,.45,.15*p.gain,{type:'sawtooth',pan:p.pan,attack:.025,end:325});
        this._tone(415,.45,.10*p.gain,{type:'triangle',pan:p.pan,attack:.025});
      }else if(e.type==='glassBreak'){
        const p=this._position(e,local);this._noise(.19,.18*p.gain,{filter:'highpass',cutoff:2400,pan:p.pan});
      }else if(e.type==='equip'&&own){
        this._mechanic('lower',this.ctx.currentTime,.15,.13);
        this._mechanic('lock',this.ctx.currentTime+.23,.20,.09);
      }else if(e.type==='explosion')this._explosion(e,local);
      else if(e.type==='rocketLaunch'){
        const p=this._position(e,local);
        if(p.distance<180&&state.time-e.time<.3)this._sample('rocket-launch-'+(e.id%2+1),(own?.85:.55)*p.gain,{
          pan:p.pan,rate:.98+Math.random()*.04,cutoff:own?0:10000/(1+p.distance*.018),bus:own?'localWeapon':'weapons',send:.04});
      }else if(e.type==='revive'&&(own||e.medicId===local?.id)){
        this._tone(1120,.06,.06,{end:1760});this._noise(.022,.06,{filter:'highpass',cutoff:4000});
      }
      else if(e.type==='reload')this._reload(e,local,own?local:state.players?.find(player=>player.id===e.playerId));
      else if(e.type==='damage'&&own){this._noise(.16,.16,{color:'pink',cutoff:1400});this._tone(76,.2,.13,{end:37});}
      else if(e.type==='kill'&&local&&e.killerId===local.id)[880,1174,1397].forEach((frequency,index)=>this._tone(frequency,.14,.055,{time:this.ctx.currentTime+index*.055,send:.12}));
      else if(e.type==='capture'&&local)(e.team===local.team?[587,740,880]:[440,370]).forEach((frequency,index)=>this._tone(frequency,.42,.09,{time:this.ctx.currentTime+index*.12,send:.3}));
      else if(e.type==='gadget'&&own){
        if(e.kind==='defibrillator')this._tone(650,.42,.05,{end:1600,type:'triangle',attack:.04});
        else this._mechanic('seat',this.ctx.currentTime,.15,.09);
      }
      else if(e.type==='grenade'&&own){this._noise(.045,.09,{filter:'bandpass',cutoff:4200});this._noise(.24,.07,{time:this.ctx.currentTime+.12,cutoff:1100,attack:.07});}
      else if(e.type==='spawn'&&own){this._tone(196,.32,.075,{end:392,send:.2});this._noise(.3,.055,{filter:'bandpass',cutoff:950,attack:.06});}
      else if(e.type==='roundEnd'&&local)(e.winner===local.team?[50,57,62,65]:[50,53,56,62]).forEach((note,index)=>this._tone(midi(note),2.5,.1,{time:this.ctx.currentTime+index*.12,type:'triangle',attack:.2,cutoff:1700,send:.45}));
    }
    this._priority=2;
    // Exceed the server's 4096-event retention window so a retained event cannot
    // be evicted and replayed on the next animation frame during a busy battle.
    while(this.seen.size>8192)this.seen.delete(this.seen.keys().next().value);
  }
  update(dt,{state,local,moving=0,sprinting=false,crouching=false,aim=false,locked=false,inMenu=false,paused=false}={}){
    if(this._disposed)return;this.setMode(inMenu?'menu':'battle');
    if(paused!==this._paused){this._paused=paused;this._mix();}
    if(this.ctx&&this.ctx.state!=='running'&&this.ctx.state!=='closed'&&!this._resuming&&performance.now()>this._resumeAt){
      this._resumeAt=performance.now()+2000;this._resuming=true;
      this.ctx.resume().catch(()=>{}).finally(()=>{this._resuming=false;});
    }
    if(!this.ctx||this.ctx.state!=='running'||!this._enabled)return;
    const now=this.ctx.currentTime,canMove=local?.alive&&locked&&!paused&&!inMenu;
    this._mapId=state?.mapId;
    if(aim!==this._aim&&canMove){
      this._mechanic(aim?'aim':'lower',now,.18,.072);
      if(aim)this._mechanic('tap',now+.039,.21,.035);
    }
    this._aim=aim;
    const critical=Boolean(local?.alive&&local.hp<30&&!inMenu);
    const suppressed=local?.alive&&!paused&&!inMenu&&now<this._suppressedUntil;
    const muffle=critical?5200:suppressed?7900:18000;
    if(muffle!==this._muffleTarget){
      this._muffleTarget=muffle;
      this._target(this._muffle.frequency,muffle,suppressed?.06:.26);
    }
    if(critical&&!paused&&now>=this._heartbeat){this._tone(59,.16,.1,{end:38});this._tone(52,.13,.065,{time:now+.19,end:34});this._heartbeat=now+.9;}
    this._updateEngine(state,local,inMenu||paused);
    this._updateRocketAudio(state,local,inMenu||paused);
    const sliding=Boolean(canMove&&local.sliding&&!local.vehicleId);
    if(sliding&&now>=(this._slideSoundAt??0)){
      this._noise(this._sliding?.24:.32,this._sliding?.035:.085,{priority:1,color:'pink',filter:'bandpass',cutoff:1350,attack:.025,pan:-.12});
      this._slideSoundAt=now+.18;
    }
    this._sliding=sliding;
    if(!canMove||local.vehicleId){this._lastPosition=null;this._stride=0;this._falling=false;}
    else if(state?.time!==this._lastMovementTime){
      this._lastMovementTime=state?.time;
      if(this._lastPosition){
        const distance=Math.hypot(local.x-this._lastPosition.x,local.z-this._lastPosition.z),vertical=local.y-this._lastPosition.y;
        if(distance<5&&!sliding)this._stride+=distance;
        if(sliding)this._stride=0;
        const onGround=local.grounded??Math.abs(vertical)<.04;
        if(!onGround&&this._lastPosition.grounded&&vertical>.035)this._noise(.18,.08,{filter:'bandpass',cutoff:750,pan:-.12});
        if(!onGround&&vertical<-.035)this._falling=true;
        if(this._falling&&onGround){this._step(1.5,false,false,local);this._noise(.2,.075,{cutoff:650});this._falling=false;this._stride=0;}
        const strideLength=sprinting?2.45:crouching?1.55:2.05;
        if(this._stride>=strideLength&&onGround&&!sliding){this._step(1,sprinting,crouching,local);this._stride%=strideLength;}
      }
      this._lastPosition={x:local.x,y:local.y,z:local.z,grounded:local.grounded??true};
    }
    this._updateOtherSteps(state,local,inMenu||paused);
    if(!inMenu&&!paused&&local?.gadgetAction==='repair'&&now>=(this._repairSoundAt??0)){
      this._repairSoundAt=now+.15;this._noise(.18,.055,{filter:'highpass',cutoff:4200,attack:.015});
    }
    const beacon=(state?.deployables??[]).find(item=>item.kind==='beacon'&&local&&Math.hypot(item.x-local.x,item.z-local.z)<9);
    if(beacon&&!inMenu&&!paused&&now>=(this._beaconSoundAt??0)){
      this._beaconSoundAt=now+1.2;const p=this._position(beacon,local);this._tone(940,.045,.025*p.gain,{pan:p.pan,attack:.004});
    }
    this._updateAmbience(state,local,inMenu||paused);
    if(local?.alive&&local.ammo<=5&&local.ammo!==this._lastAmmo&&this._lastAmmo>local.ammo)this._tone(1700,.022,.035,{type:'square',cutoff:2900});
    this._lastAmmo=local?.ammo;
  }
  _updateAmbience(state,local,silent){
    const now=this.ctx.currentTime,mapId=silent?'':state?.mapId;
    const quarry=mapId==='quarry',village=mapId==='village';
    const map=village?getMap(mapId):null;
    const sheltered=village&&local&&map.structures.some(building=>
      building.roof&&building.kind.startsWith('village-house')&&
      Math.abs(local.x-building.x)<building.w/2&&Math.abs(local.z-building.z)<building.d/2&&
      local.y<(building.baseY??0)+building.h);
    const shelter=sheltered?.32:1;
    if(now>=this._nextGust||mapId!==this._ambientMap){
      this._ambientMap=mapId;
      this._nextGust=now+.4;
      const gust=village?.53+.24*Math.sin(now*.31)+.17*Math.sin(now*.087+.7):
        quarry?.55+.27*Math.sin(now*.59)+.18*Math.sin(now*.22):.55;
      const [air,ridge,sand]=this._ambientSources;
      this._target(air.filter.frequency,village?165+gust*220:quarry?205+gust*180:310,.8);
      this._target(air.volume.gain,village?(.19+gust*.15)*shelter:quarry?.2+gust*.25:.16,.9);
      this._target(ridge.filter.frequency,village?650+gust*1100:quarry?710+gust*540:620,1.2);
      this._target(ridge.volume.gain,village?(.06+gust*.08)*shelter:quarry?.14+gust*.22:.085,1);
      this._target(sand.filter.frequency,1500+gust*1600,1.1);
      this._target(sand.volume.gain,village?(.007+gust*.013)*shelter:0,1);
    }
    if(silent||now<=this._distantAt)return;
    this._distantAt=now+(village?6:9)+Math.random()*(village?7:10);
    if(village){
      let nearest=null,distance=32;
      for(const building of map.structures){
        if(!['village-stall','village-well'].includes(building.kind))continue;
        const offset=local?Math.hypot(building.x-local.x,building.z-local.z):Infinity;
        if(offset<distance){nearest=building;distance=offset;}
      }
      const pan=nearest?this._position(nearest,local).pan:Math.sin(now*.19)*.65;
      const level=(.013+.012/(1+distance/12))*shelter;
      this._noise(1.8,level,{priority:0,color:'pink',filter:'bandpass',cutoff:1800,attack:.55,pan,send:.1});
      if(nearest){
        this._tone(157,.46,level*.65,{priority:0,time:now+.18,type:'triangle',end:112,cutoff:750,attack:.08,pan,send:.14});
        this._tone(790,.12,level*.45,{priority:0,time:now+.79,end:590,attack:.008,pan,send:.18});
        this._tone(1030,.09,level*.25,{priority:0,time:now+.9,end:860,attack:.006,pan,send:.18});
      }
      return;
    }
    const crusher=quarry&&state.points?.find(p=>p.id==='D');
    if(crusher){
      const position=this._position(crusher,local);
      const level=.022+.045/(1+position.distance/95);
      this._noise(3.1,level,{priority:0,color:'pink',cutoff:230,attack:.7,pan:position.pan,send:.37});
      for(let i=0;i<3;i++)this._tone(162-i*16,.36,level*.65,{priority:0,time:now+.35+i*.62,type:'triangle',end:84,cutoff:520,pan:position.pan,send:.44});
    }else{
      this._noise(2.5,.035,{priority:0,color:'pink',cutoff:170,attack:.6,pan:Math.random()*1.5-.75,send:.5});
    }
  }
  _stopRocketAudio(){
    for(const channel of this._rocketChannels.values()){
      const now=this.ctx.currentTime;channel.gain.gain.cancelScheduledValues(now);channel.gain.gain.setTargetAtTime(0,now,.015);channel.source.stop(now+.08);
    }this._rocketChannels.clear();this._rocketTracks.clear();this._rocketStateTime=null;
  }
  _updateRocketAudio(state,local,silent){
    const buffer=this._foley.get('rocket-flight'),now=this.ctx.currentTime;
    if(silent||!local||!buffer){this._stopRocketAudio();return;}
    if(state.time<(this._rocketStateTime??0)-1)this._stopRocketAudio();
    if(this._rocketStateTime!==state?.time){this._rocketStateTime=state?.time;this._rocketArrival=now;}
    const age=Math.min(.15,now-this._rocketArrival),time=state.time+age;
    // Keep tracking between snapshots and outside network interest range.
    // A launch starts the motor; its explosion (or maximum lifetime) ends it.
    for(const e of state.events??[])if(e.type==='rocketLaunch'&&!this._rocketTracks.has(e.rocketId)&&time<e.time+4)
      this._rocketTracks.set(e.rocketId,{...e,id:e.rocketId,at:e.time,expires:e.time+4});
    for(const r of state.rockets??[])this._rocketTracks.set(r.id,{...r,at:state.time,expires:r.lifeAt??state.time+r.life});
    for(const e of state.events??[])if(e.type==='explosion'&&e.rocketId)this._rocketTracks.delete(e.rocketId);
    const listener=this.ctx.listener,yaw=local.yaw??0,pitch=local.pitch??0,eye=(local.y??0)+(local.crouch?1.05:1.58);
    const forward=[-Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch)];
    const up=[Math.sin(yaw)*Math.sin(pitch),Math.cos(pitch),Math.cos(yaw)*Math.sin(pitch)];
    if(listener.positionX){
      for(const [axis,value] of [['X',local.x],['Y',eye],['Z',local.z]])this._target(listener['position'+axis],value,.015);
      for(let i=0;i<3;i++){const axis='XYZ'[i];this._target(listener['forward'+axis],forward[i],.015);this._target(listener['up'+axis],up[i],.015);}
    }else{listener.setPosition(local.x,eye,local.z);listener.setOrientation(...forward,...up);}
    for(const [id,r] of this._rocketTracks){
      if(time>=r.expires){this._rocketTracks.delete(id);continue;}
      let channel=this._rocketChannels.get(id);
      if(!channel){const c=this.ctx,source=c.createBufferSource(),gain=c.createGain(),filter=c.createBiquadFilter(),pan=c.createPanner();
        source.buffer=buffer;source.loop=true;gain.gain.value=0;filter.type='lowpass';filter.Q.value=.707;
        pan.panningModel='equalpower';pan.distanceModel='inverse';pan.refDistance=4;pan.rolloffFactor=1;pan.maxDistance=400;
        source.connect(filter).connect(gain).connect(pan).connect(this._effects);source.start();
        source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();pan.disconnect();};
        channel={source,gain,filter,pan};this._rocketChannels.set(id,channel);
      }
      const elapsed=Math.max(0,time-r.at),x=r.x+r.vx*elapsed,y=r.y+r.vy*elapsed-1.4*elapsed**2,z=r.z+r.vz*elapsed;
      const distance=Math.hypot(x-local.x,y-eye,z-local.z);
      this._target(channel.gain.gain,.65,.02);this._target(channel.filter.frequency,11000/(1+distance*.012),.03);
      if(channel.pan.positionX){for(const [axis,value] of [['X',x],['Y',y],['Z',z]])this._target(channel.pan['position'+axis],value,.015);}
      else channel.pan.setPosition(x,y,z);
      const radial=((x-local.x)*r.vx+(y-eye)*r.vy+(z-local.z)*r.vz)/Math.max(1,distance);
      this._target(channel.source.playbackRate,clamp(343/(343+radial),.8,1.25),.04);
    }
    for(const [id,channel] of this._rocketChannels)if(!this._rocketTracks.has(id)){
      channel.gain.gain.cancelScheduledValues(now);channel.gain.gain.setTargetAtTime(0,now,.015);channel.source.stop(now+.08);this._rocketChannels.delete(id);
    }
  }
  _updateEngine(state,local,silent){
    const now=this.ctx.currentTime;
    if(now<this._engineAt&&!silent)return;
    this._engineAt=now+.05;
    const buffer=this._foley.get('engine');
    const candidates=buffer&&local?.alive&&!silent?(state?.vehicles??[]).filter(v=>v.hp>0&&v.seats[0]&&Math.hypot(v.x-local.x,v.z-local.z)<65)
      .sort((a,b)=>(a.id===local.vehicleId?-1:1)-(b.id===local.vehicleId?-1:1)||Math.hypot(a.x-local.x,a.z-local.z)-Math.hypot(b.x-local.x,b.z-local.z)).slice(0,3):[];
    const active=new Set();
    for(const vehicle of candidates){
      active.add(vehicle.id);let channel=this._engineChannels.get(vehicle.id);
      if(!channel){
        const c=this.ctx,source=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain(),pan=c.createStereoPanner?c.createStereoPanner():null;
        source.buffer=buffer;source.loop=true;filter.type='lowpass';filter.Q.value=.707;gain.gain.value=0;
        source.connect(filter).connect(gain);if(pan)gain.connect(pan).connect(this._effects);else gain.connect(this._effects);
        source.start(0,(now*.83)%buffer.duration);
        channel={source,filter,gain,pan,speed:0,gear:1};this._engineChannels.set(vehicle.id,channel);
      }
      channel.stopAt=null;
      const own=vehicle.id===local.vehicleId,spatial=this._position(vehicle,local),speed=Math.abs(vehicle.speed);
      const gear=Math.min(4,1+Math.floor(speed/4.5)),load=(speed-(gear-1)*4.5)/4.5;
      const acceleration=Math.max(0,speed-channel.speed);
      const rate=(vehicle.type==='atv'?1.06:.68)+load*(vehicle.type==='atv'?.74:.48)+Math.min(.15,acceleration*.3);
      this._target(channel.source.playbackRate,rate,.12);
      this._target(channel.filter.frequency,(own?9500:6500)/(1+spatial.distance*.022),.1);
      this._target(channel.gain.gain,(own?.30:.18)/(1+spatial.distance*.07)*(1+Math.min(1,speed/14)*.55),.12);
      if(channel.pan)this._target(channel.pan.pan,own?0:spatial.pan,.1);
      if(own&&gear!==channel.gear&&speed>4)this._mechanic('seat',now,.15,.018);
      channel.speed=speed;channel.gear=gear;
    }
    for(const [id,channel] of this._engineChannels)if(!active.has(id)){
      this._target(channel.gain.gain,0,.1);channel.stopAt??=now+.5;
      if(now>=channel.stopAt){channel.source.stop();channel.source.disconnect();channel.filter.disconnect();channel.gain.disconnect();channel.pan?.disconnect();this._engineChannels.delete(id);}
    }
  }
  click(){if(!this.ctx||!this._enabled)return;this._tone(860,.035,.065,{end:610});this._noise(.018,.028,{filter:'highpass',cutoff:3800});}
  getStats(){
    let peak=0,rms=0;
    if(this._analyser&&this.ctx?.state==='running'){
      if(this._analyser.getFloatTimeDomainData)this._analyser.getFloatTimeDomainData(this._meter);
      else{const bytes=new Uint8Array(this._meter.length);this._analyser.getByteTimeDomainData(bytes);for(let i=0;i<bytes.length;i++)this._meter[i]=(bytes[i]-128)/128;}
      for(const sample of this._meter){peak=Math.max(peak,Math.abs(sample));rms+=sample*sample;}rms=Math.sqrt(rms/this._meter.length);
    }
    return {state:this.ctx?.state||'locked',mode:this._mode,score:this._mode==='menu'?MENU_MUSIC_TITLE:'AFTER THE RAIN',activeVoices:this._voices.size,queuedSounds:this._pending.length,voiceLimit:MAX_VOICES,
      musicPlaying:Boolean(this.ctx?.state==='running'&&this._enabled&&this._volume>0&&this._musicVolume>0&&(this._mode==='menu'?this._menuTrack&&!this._menuTrack.paused:this._scheduler)),
      master:this._volume,music:this._musicVolume,effects:this._effectsVolume,peak,rms,
      shotSamples:[...this._shotBuffers.values()].reduce((count, variants)=>count+variants.length,0),shotLoadFailures:this._shotLoadFailures};
  }
  dispose(){
    this._disposed=true;clearInterval(this._scheduler);this._scheduler=null;
    if(this._menuTrack){this._menuTrack.pause();this._menuTrack.removeAttribute('src');this._menuTrack.load();this._menuTrack=null;}
    this._pending=[];
    for(const voice of [...this._voices,...this._fadingVoices])this._releaseVoice(voice,true);
    this._stopRocketAudio();
    this._shotBuffers.clear();this._foley.clear();
    for(const channel of this._engineChannels.values()){channel.source.stop();channel.source.disconnect();channel.filter.disconnect();channel.gain.disconnect();channel.pan?.disconnect();}
    this._engineChannels.clear();this._remoteSteps.clear();this._stepCounts.clear();
    for(const {source,nodes}of this._ambientSources){try{source.stop();source.disconnect();}catch{}for(const node of nodes){try{node.disconnect();}catch{}}}
    this._ambientSources=[];for(const node of this._nodes){try{node.disconnect();}catch{}}this._nodes=[];this._buffers.clear();
    if(this.ctx&&this.ctx.state!=='closed')this.ctx.close().catch(()=>{});
  }
}
