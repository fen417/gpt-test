// Original procedural score and sound design. No external recordings or assets.
export const ORIGINAL_SCORE = 'AFTER THE RAIN';
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, Number(v) || 0));
const midi = n => 440 * 2 ** ((n - 69) / 12);
const BEAT = 60 / 82, EPSILON = .00001, MAX_VOICES = 112;
const HARMONY = [
  [38, [50, 53, 57, 64]], [34, [46, 50, 53, 57]],
  [41, [48, 53, 57, 60]], [36, [48, 53, 55, 60]],
  [38, [50, 53, 57, 62]], [31, [43, 50, 53, 57]],
  [34, [46, 50, 53, 60]], [33, [45, 52, 57, 58]],
];
const MELODY = [74,0,69,0,65,0,64,0,62,0,0,69,67,0,65,0,69,0,72,0,74,0,0,77,76,0,72,0,69,0,0,0];
const WEAPONS = {
  assault: {body:146,crack:5000,tail:.19,pitch:1,gain:.9},
  medic: {body:184,crack:6400,tail:.13,pitch:1.16,gain:.73},
  support: {body:112,crack:3900,tail:.26,pitch:.88,gain:1.03},
  recon: {body:94,crack:7300,tail:.43,pitch:.77,gain:1.17},
};

export class CombatAudio {
  constructor() {
    this.ctx=null; this.seen=new Set(); this.lastShot=-1;
    this._volume=.35; this._musicVolume=.62; this._effectsVolume=.85; this._enabled=true;
    this._mode='menu'; this._voices=new Set(); this._ambientSources=[]; this._buffers=new Map(); this._nodes=[];
    this._scheduler=null; this._nextMusic=0; this._musicStep=0; this._disposed=false;
    this._lastStateTime=-1; this._lastMovementTime=-1; this._lastPosition=null;
    this._stride=0; this._leftFoot=false; this._falling=false; this._aim=false;
    this._heartbeat=0; this._distantAt=0; this._paused=false; this._critical=false;
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
  setEnabled(v){this._enabled=Boolean(v);this._mix();}

  async unlock(){
    if(this._disposed)return false;
    try{
      if(!this.ctx){
        const Context=globalThis.AudioContext||globalThis.webkitAudioContext;
        if(!Context)return false;
        this.ctx=new Context({latencyHint:'interactive'});this._buildGraph();
      }
      if(this.ctx.state!=='running')await this.ctx.resume();
      if(!this._scheduler){
        this._nextMusic=this.ctx.currentTime+.08;
        this._scheduler=setInterval(()=>this._schedule(),100);this._schedule();
      }
      return this.ctx.state==='running';
    }catch{return false;}
  }

  _node(n){this._nodes.push(n);return n;}
  _buildGraph(){
    const c=this.ctx;
    this._master=this._node(c.createGain());this._music=this._node(c.createGain());
    this._effects=this._node(c.createGain());this._ambient=this._node(c.createGain());
    this._muffle=this._node(c.createBiquadFilter());this._muffle.type='lowpass';this._muffle.frequency.value=18000;
    const compressor=this._node(c.createDynamicsCompressor());
    compressor.threshold.value=-18;compressor.knee.value=18;compressor.ratio.value=4;compressor.attack.value=.004;compressor.release.value=.22;
    const limiter=this._node(c.createDynamicsCompressor());
    limiter.threshold.value=-3;limiter.knee.value=0;limiter.ratio.value=20;limiter.attack.value=.001;limiter.release.value=.065;
    this._music.connect(this._master);this._effects.connect(this._muffle).connect(this._master);
    this._ambient.connect(this._effects);this._master.connect(compressor).connect(limiter);
    this._analyser=this._node(c.createAnalyser());this._analyser.fftSize=256;this._analyser.smoothingTimeConstant=.1;
    this._meter=new Float32Array(this._analyser.fftSize);limiter.connect(this._analyser).connect(c.destination);
    this._reverbs={};const impulse=this._impulse();
    for(const bus of ['music','effects']){
      const convolver=this._node(c.createConvolver());convolver.buffer=impulse;
      const wet=this._node(c.createGain());wet.gain.value=bus==='music'?.32:.16;
      convolver.connect(wet).connect(bus==='music'?this._music:this._effects);this._reverbs[bus]=convolver;
    }
    this._mix(true);this._startAmbient();
  }
  _target(parameter,value,seconds=.1,immediate=false){
    if(!parameter||!this.ctx)return;
    const now=this.ctx.currentTime;parameter.cancelScheduledValues(now);
    if(immediate)parameter.setValueAtTime(value,now);else parameter.setTargetAtTime(value,now,Math.max(.01,seconds));
  }
  _mix(immediate=false){
    if(!this.ctx||!this._master)return;
    this._target(this._master.gain,this._enabled?this._volume*.82:0,.055,immediate);
    this._target(this._effects.gain,this._effectsVolume*(this._paused?.35:1),.16,immediate);
    this._target(this._music.gain,this._musicVolume*(this._mode==='menu'?1.64:.22),.9,immediate);
    this._target(this._ambient.gain,this._mode==='battle'?.24:.055,1.5,immediate);
  }
  setMode(mode){
    const next=mode==='battle'?'battle':'menu';if(next===this._mode)return;
    this._mode=next;this._lastPosition=null;this._stride=0;this._falling=false;this._mix();
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
    for(const [frequency,pan,gain,rate]of [[310,-.65,.16,.71],[620,.7,.085,.93]]){
      const source=this.ctx.createBufferSource();source.buffer=this._noiseBuffer('pink');source.loop=true;source.playbackRate.value=rate;
      const filter=this.ctx.createBiquadFilter();filter.type='bandpass';filter.frequency.value=frequency;filter.Q.value=.45;
      const volume=this.ctx.createGain();volume.gain.value=gain;source.connect(filter).connect(volume);let output=volume;
      if(this.ctx.createStereoPanner){const p=this.ctx.createStereoPanner();p.pan.value=pan;volume.connect(p);output=p;}
      output.connect(this._ambient);source.start(0,Math.random()*2);this._ambientSources.push({source,nodes:[filter,volume,output]});
    }
  }
  _voice(source,duration,gain,options={}){
    if(!this.ctx||!this._enabled||this.ctx.state==='closed'||this._voices.size>=MAX_VOICES)return null;
    const c=this.ctx,time=Math.max(c.currentTime,options.time??c.currentTime),end=time+Math.max(.015,duration),nodes=[source];let output=source;
    if(options.cutoff){
      const filter=c.createBiquadFilter();filter.type=options.filter||'lowpass';filter.frequency.setValueAtTime(clamp(options.cutoff,20,19000),time);filter.Q.value=options.q??.6;
      if(options.endCutoff)filter.frequency.exponentialRampToValueAtTime(Math.max(20,options.endCutoff),end);
      output.connect(filter);output=filter;nodes.push(filter);
    }
    const envelope=c.createGain(),peak=Math.max(EPSILON,gain),attack=Math.min(duration*.35,options.attack??.002);
    envelope.gain.setValueAtTime(EPSILON,time);envelope.gain.linearRampToValueAtTime(peak,time+attack);
    if(options.sustain)envelope.gain.setValueAtTime(peak*.72,Math.max(time+attack,end-options.sustain));
    envelope.gain.exponentialRampToValueAtTime(EPSILON,end);output.connect(envelope);output=envelope;nodes.push(envelope);
    if(c.createStereoPanner&&options.pan){const p=c.createStereoPanner();p.pan.value=clamp(options.pan,-1,1);output.connect(p);output=p;nodes.push(p);}
    const bus=options.bus==='music'?'music':'effects';output.connect(bus==='music'?this._music:this._effects);
    if(options.send){const send=c.createGain();send.gain.value=options.send;output.connect(send).connect(this._reverbs[bus]);nodes.push(send);}
    const voice={source,nodes};this._voices.add(voice);
    source.onended=()=>{for(const node of nodes){try{node.disconnect();}catch{}}this._voices.delete(voice);};
    source.start(time,...(options.offset===undefined?[]:[options.offset]));source.stop(end+.015);return voice;
  }
  _tone(frequency,duration,gain,options={}){
    if(!this.ctx||!this._enabled||this._voices.size>=MAX_VOICES)return;
    const time=Math.max(this.ctx.currentTime,options.time??this.ctx.currentTime),o=this.ctx.createOscillator();o.type=options.type||'sine';
    o.frequency.setValueAtTime(Math.max(1,frequency),time);if(options.end)o.frequency.exponentialRampToValueAtTime(Math.max(1,options.end),time+duration);if(options.detune)o.detune.value=options.detune;
    return this._voice(o,duration,gain,options);
  }
  _noise(duration,gain,options={}){
    if(!this.ctx||!this._enabled||this._voices.size>=MAX_VOICES)return;
    const s=this.ctx.createBufferSource();s.buffer=this._noiseBuffer(options.color||'white');s.playbackRate.value=options.rate||1;
    return this._voice(s,duration,gain,{...options,offset:Math.random()*Math.max(0,3-duration)});
  }
  tone(frequency,duration,gain=.1,type='sine',end=frequency){this._tone(frequency,duration,gain,{type,end});}
  noise(duration,gain,lowpass=4000){this._noise(duration,gain,{cutoff:lowpass});}

  _schedule(){
    if(!this.ctx||this.ctx.state!=='running'||this._disposed)return;
    const now=this.ctx.currentTime;if(this._nextMusic<now-.3)this._nextMusic=now+.08;let scheduled=0;
    while(this._nextMusic<now+.32&&scheduled++<8){
      if(this._enabled&&this._musicVolume>0)this._musicTick(this._musicStep,this._nextMusic);
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
  shot(distance=0,classId='assault',pan=0,isLocal=distance<1){
    if(!this.ctx||!this._enabled)return;
    const w=WEAPONS[classId]||WEAPONS.assault,gain=w.gain/(1+distance*.042),time=this.ctx.currentTime+Math.min(.18,distance/600),cutoff=Math.max(500,w.crack/(1+distance*.04));
    this._noise(.045,.36*gain,{time,filter:'bandpass',cutoff,q:.5,pan,rate:w.pitch});
    this._noise(w.tail,.23*gain,{time:time+.008,color:'pink',cutoff,endCutoff:330,pan,send:.2+Math.min(.35,distance*.004)});
    this._tone(w.body,.14,.19*gain,{time,type:'triangle',end:38,cutoff:1300,pan,send:.09});
    if(isLocal){
      this._noise(.026,.07,{time:time+.048,filter:'bandpass',cutoff:3400,q:1.8,pan:.3});
      if(classId==='recon')this._noise(.11,.13,{time:time+.16,filter:'bandpass',cutoff:2100,pan:.4,send:.06});
    }else if(distance>22)this._noise(.21,.095*gain,{time:time+.12,color:'pink',cutoff:850,pan:-pan*.4,send:.55});
  }
  _explosion(event,local){
    const p=this._position(event,local),t=this.ctx.currentTime+Math.min(.2,p.distance/500);
    this._tone(85,1.1,.48*p.gain,{time:t,end:23,pan:p.pan,send:.4});
    this._noise(1.65,.55*p.gain,{time:t,color:'pink',cutoff:2100/(1+p.distance*.035),endCutoff:110,pan:p.pan,send:.5});
    this._noise(.14,.22*p.gain,{time:t,cutoff:6300/(1+p.distance*.06),pan:p.pan});
    for(let n=0;n<3;n++)this._noise(.13+n*.08,.07*p.gain,{time:t+.25+n*.17,filter:'bandpass',cutoff:1350+n*700,pan:clamp(p.pan+(n-1)*.3,-1,1),send:.4});
  }
  _reload(event,local){
    const p=this._position(event,local);if(p.distance>24)return;
    const t=this.ctx.currentTime,gain=.13*p.gain;
    for(const [delay,duration,cutoff,strength]of [[0,.065,2700,.6],[.23,.16,950,.8],[.86,.07,2300,.65],[1.32,.09,3100,1],[1.65,.055,4200,.85]])this._noise(duration,gain*strength,{time:t+delay,filter:'bandpass',cutoff,q:1.5,pan:p.distance<1?.26:p.pan,send:.035});
    this._tone(135,.09,.035*p.gain,{time:t+1.3,end:78,type:'triangle',pan:p.pan});
  }
  _step(strength,sprinting,crouching,local){
    const metal=local?.y>.55,pan=(this._leftFoot=!this._leftFoot)?-.17:.17,gain=strength*(crouching?.37:sprinting?1:.72);
    this._noise(.12,.15*gain,{color:'pink',cutoff:metal?2300:1050,pan,rate:.8+Math.random()*.2});
    this._tone(metal?205:96,.075,.07*gain,{end:metal?96:48,type:'triangle',pan,send:metal?.12:.025});
    this._noise(.075,.05*gain,{time:this.ctx.currentTime+.035,filter:'bandpass',cutoff:metal?3700:2100,pan});
    if(sprinting)this._noise(.16,.038,{filter:'bandpass',cutoff:720,pan:-.25});
  }
  events(state,local){
    if(!state)return;
    if(state.time<this._lastStateTime-1){this.seen.clear();this._lastPosition=null;this._lastMovementTime=-1;}
    this._lastStateTime=state.time;
    for(const e of state.events||[]){
      if(this.seen.has(e.id))continue;this.seen.add(e.id);
      if(!this.ctx||!this._enabled||this.ctx.state!=='running')continue;
      const own=local&&e.playerId===local.id;
      if(e.type==='shot'){
        const p=this._position(e,local);
        if(p.distance<130&&(this._voices.size<72||own||p.distance<20))this.shot(p.distance,state.players?.find(player=>player.id===e.playerId)?.classId||'assault',p.pan,own);
        if(own&&e.hit){this._tone(1780,.035,.075,{end:1340});this._noise(.025,.045,{filter:'bandpass',cutoff:2500});}
      }else if(e.type==='explosion')this._explosion(e,local);
      else if(e.type==='reload')this._reload(e,local);
      else if(e.type==='damage'&&own){this._noise(.16,.16,{color:'pink',cutoff:1400});this._tone(76,.2,.13,{end:37});}
      else if(e.type==='kill'&&local&&e.killerId===local.id)[880,1174,1397].forEach((frequency,index)=>this._tone(frequency,.14,.055,{time:this.ctx.currentTime+index*.055,send:.12}));
      else if(e.type==='capture'&&local)(e.team===local.team?[587,740,880]:[440,370]).forEach((frequency,index)=>this._tone(frequency,.42,.09,{time:this.ctx.currentTime+index*.12,send:.3}));
      else if(e.type==='gadget'&&own){this._noise(.25,.07,{filter:'bandpass',cutoff:2300,attack:.04});this._tone(520,.18,.07,{end:1040,send:.18});this._tone(1040,.18,.055,{time:this.ctx.currentTime+.16,send:.18});}
      else if(e.type==='grenade'&&own){this._noise(.045,.09,{filter:'bandpass',cutoff:4200});this._noise(.24,.07,{time:this.ctx.currentTime+.12,cutoff:1100,attack:.07});}
      else if(e.type==='spawn'&&own){this._tone(196,.32,.075,{end:392,send:.2});this._noise(.3,.055,{filter:'bandpass',cutoff:950,attack:.06});}
      else if(e.type==='roundEnd'&&local)(e.winner===local.team?[50,57,62,65]:[50,53,56,62]).forEach((note,index)=>this._tone(midi(note),2.5,.1,{time:this.ctx.currentTime+index*.12,type:'triangle',attack:.2,cutoff:1700,send:.45}));
    }
    if(this.seen.size>1600)this.seen=new Set([...this.seen].slice(-800));
  }
  update(dt,{state,local,moving=0,sprinting=false,crouching=false,aim=false,locked=false,inMenu=false,paused=false}={}){
    if(this._disposed)return;this.setMode(inMenu?'menu':'battle');
    if(paused!==this._paused){this._paused=paused;this._mix();}
    if(!this.ctx||this.ctx.state!=='running'||!this._enabled)return;
    const now=this.ctx.currentTime,canMove=local?.alive&&locked&&!paused&&!inMenu;
    if(aim!==this._aim&&canMove)this._noise(.1,.045,{filter:'bandpass',cutoff:1100,attack:.02,pan:.15});this._aim=aim;
    const critical=Boolean(local?.alive&&local.hp<30&&!inMenu);
    if(critical!==this._critical){this._critical=critical;this._target(this._muffle.frequency,critical?5200:18000,.3);}
    if(critical&&!paused&&now>=this._heartbeat){this._tone(59,.16,.1,{end:38});this._tone(52,.13,.065,{time:now+.19,end:34});this._heartbeat=now+.9;}
    if(!canMove){this._lastPosition=null;this._stride=0;this._falling=false;}
    else if(state?.time!==this._lastMovementTime){
      this._lastMovementTime=state?.time;
      if(this._lastPosition){
        const distance=Math.hypot(local.x-this._lastPosition.x,local.z-this._lastPosition.z),vertical=local.y-this._lastPosition.y;
        if(distance<5)this._stride+=distance;
        if(vertical>.08&&!this._falling&&this._lastPosition.y<.05)this._noise(.18,.08,{filter:'bandpass',cutoff:750,pan:-.12});
        if(vertical<-.035)this._falling=true;
        if(this._falling&&vertical>=-.012){this._step(1.5,false,false,local);this._noise(.2,.075,{cutoff:650});this._falling=false;this._stride=0;}
        const strideLength=sprinting?2.45:crouching?1.55:2.05;
        if(this._stride>=strideLength&&Math.abs(vertical)<.04){this._step(1,sprinting,crouching,local);this._stride%=strideLength;}
      }
      this._lastPosition={x:local.x,y:local.y,z:local.z};
    }
    if(!inMenu&&!paused&&now>this._distantAt){this._distantAt=now+9+Math.random()*10;this._noise(2.5,.035,{color:'pink',cutoff:170,attack:.6,pan:Math.random()*1.5-.75,send:.5});}
    if(local?.alive&&local.ammo<=5&&local.ammo!==this._lastAmmo&&this._lastAmmo>local.ammo)this._tone(1700,.022,.035,{type:'square',cutoff:2900});
    this._lastAmmo=local?.ammo;
  }
  click(){if(!this.ctx||!this._enabled)return;this._tone(860,.035,.065,{end:610});this._noise(.018,.028,{filter:'highpass',cutoff:3800});}
  getStats(){
    let peak=0,rms=0;
    if(this._analyser&&this.ctx?.state==='running'){
      if(this._analyser.getFloatTimeDomainData)this._analyser.getFloatTimeDomainData(this._meter);
      else{const bytes=new Uint8Array(this._meter.length);this._analyser.getByteTimeDomainData(bytes);for(let i=0;i<bytes.length;i++)this._meter[i]=(bytes[i]-128)/128;}
      for(const sample of this._meter){peak=Math.max(peak,Math.abs(sample));rms+=sample*sample;}rms=Math.sqrt(rms/this._meter.length);
    }
    return {state:this.ctx?.state||'locked',mode:this._mode,score:ORIGINAL_SCORE,activeVoices:this._voices.size,
      musicPlaying:Boolean(this._scheduler&&this.ctx?.state==='running'&&this._enabled&&this._volume>0&&this._musicVolume>0),
      master:this._volume,music:this._musicVolume,effects:this._effectsVolume,peak,rms};
  }
  dispose(){
    this._disposed=true;clearInterval(this._scheduler);this._scheduler=null;
    for(const voice of this._voices){voice.source.onended=null;try{voice.source.stop();}catch{}for(const node of voice.nodes){try{node.disconnect();}catch{}}}
    this._voices.clear();
    for(const {source,nodes}of this._ambientSources){try{source.stop();source.disconnect();}catch{}for(const node of nodes){try{node.disconnect();}catch{}}}
    this._ambientSources=[];for(const node of this._nodes){try{node.disconnect();}catch{}}this._nodes=[];this._buffers.clear();
    if(this.ctx&&this.ctx.state!=='closed')this.ctx.close().catch(()=>{});
  }
}
