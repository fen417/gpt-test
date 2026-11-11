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
  assault: { crack: 5400, transient: .024, body: 151, bodyEnd: 63, report: .10, tail: .36, gain: .94, metal: 3450, echo: .25 },
  medic:   { crack: 7700, transient: .016, body: 214, bodyEnd: 89, report: .066, tail: .23, gain: .79, metal: 4400, echo: .16 },
  support: { crack: 4200, transient: .033, body: 116, bodyEnd: 45, report: .14, tail: .47, gain: 1.06, metal: 2400, echo: .32 },
  turret:  { crack: 4800, transient: .036, body: 93, bodyEnd: 38, report: .15, tail: .53, gain: 1.16, metal: 2600, echo: .38 },
  recon:   { crack: 6700, transient: .039, body: 98, bodyEnd: 34, report: .19, tail: .72, gain: 1.14, metal: 2950, echo: .5 },
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
    this._lastStateTime=-1; this._lastMovementTime=-1; this._lastPosition=null;
    this._stride=0; this._leftFoot=false; this._falling=false; this._aim=false;
    this._heartbeat=0; this._distantAt=0; this._nextGust=0; this._paused=false;
    this._suppressedUntil=0; this._muffleTarget=18000;
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
    this._mix(true);this._noiseBuffer('white');this._startAmbient();
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
    this._mode=next;this._lastPosition=null;this._stride=0;this._falling=false;this._suppressedUntil=0;this._mix();
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
      output.connect(this._ambient);source.start(0,Math.random()*2);this._ambientSources.push({source,filter,volume,nodes:[filter,volume,output]});
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
    if(options.decay){
      const shoulder=Math.min(end-.002,time+attack+options.decay);
      envelope.gain.exponentialRampToValueAtTime(Math.max(EPSILON,peak*(options.decayGain??.25)),shoulder);
    }else if(options.sustain)envelope.gain.setValueAtTime(peak*.72,Math.max(time+attack,end-options.sustain));
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
    if(!isLocal&&this._voices.size>=(distance<20?86:64))return;
    const weapon=WEAPONS[classId]||WEAPONS.assault;
    const variation=.94+Math.random()*.12;
    const gain=weapon.gain*variation/(1+distance*.044);
    const time=this.ctx.currentTime+Math.min(.23,distance/343);
    const cutoff=Math.max(380,weapon.crack/(1+distance*.046));
    const nearby=isLocal||distance<30;
    // Pressure, the leading crack, and the reflection decay on different envelopes.
    this._noise(weapon.report,.56*gain,{time,cutoff,q:.45,pan,rate:variation,
      endCutoff:Math.max(180,cutoff*.29),attack:.0008,decay:.009,decayGain:.19,send:.16});
    this._tone(weapon.body*variation,weapon.report+.025,.34*gain,{time,type:'triangle',end:weapon.bodyEnd,
      cutoff:Math.min(1040,cutoff*.8),pan,attack:.001,decay:.025,decayGain:.32,send:.09});
    if(nearby){
      this._noise(weapon.transient,.31*gain,{time,filter:'bandpass',cutoff,q:.77,pan,rate:variation,
        attack:.0005,decay:.004,decayGain:.14});
    }
    if(isLocal||this._voices.size<68){
      this._noise(weapon.tail,.27*gain,{time:time+.017+Math.min(.07,distance*.001),color:'pink',
        cutoff:Math.min(cutoff*.72,2200),endCutoff:170,pan:pan*.64,attack:.014,
        decay:.065,decayGain:.36,send:weapon.echo+Math.min(.34,distance*.005)});
    }
    if(isLocal&&this._voices.size<98){
      const cycle=classId==='recon'?.091:classId==='support'?.051:.029;
      this._noise(.035,.082,{time:time+cycle,filter:'bandpass',cutoff:weapon.metal,q:1.65,pan:.26,attack:.001});
      if(classId==='recon')this._mechanic('lock',time+.137,.31,.06);
    }
  }
  _mechanic(kind,time,pan,gain){
    const [duration,cutoff,resonance]=HANDLING[kind];
    const cloth=kind==='pouch'||kind==='aim'||kind==='lower';
    this._noise(duration,gain,{time,filter:'bandpass',cutoff,q:cloth?.7:1.45,pan,
      color:cloth?'pink':'white',attack:cloth?.012:.001,decay:duration*.2,decayGain:.28,send:.04});
    if(resonance&&this._voices.size<100){
      this._tone(resonance,.038,gain*.56,{time:time+.002,type:'triangle',end:resonance*.52,
        cutoff:resonance*4,pan,attack:.001});
    }
  }
  _nearMiss(event,local){
    const now=this.ctx.currentTime;
    if(!local?.alive||event.team===local.team||now<this._suppressedUntil-.29||this._voices.size>=94)return;
    const {x,y,z,tx,ty,tz}=event;
    if(![x,y,z,tx,ty,tz].every(Number.isFinite))return;
    const dx=tx-x,dy=ty-y,dz=tz-z,lengthSquared=dx*dx+dy*dy+dz*dz;
    if(lengthSquared<16)return;
    const eye=(local.y||0)+(local.crouch?1.12:1.58);
    const along=((local.x-x)*dx+(eye-y)*dy+(local.z-z)*dz)/lengthSquared;
    if(along<=.025||along>1)return;
    const px=x+along*dx,py=y+along*dy,pz=z+along*dz;
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
    if(!material||!local||this._voices.size>=78||!Number.isFinite(event.tx)||!Number.isFinite(event.tz))return;
    const p=this._position({x:event.tx,z:event.tz},local);
    if(p.distance>25)return;
    const [cutoff,duration,ring]=material;
    const time=this.ctx.currentTime+Math.min(.085,p.distance/343);
    this._noise(duration,.085*p.gain,{time,filter:'bandpass',cutoff,q:1.3,pan:p.pan,
      attack:.001,decay:.009,decayGain:.22,send:.13});
    if(ring)this._tone(ring,duration*.85,.04*p.gain,{time:time+.002,end:ring*.76,pan:p.pan,send:.16});
  }
  _explosion(event,local){
    const p=this._position(event,local),t=this.ctx.currentTime+Math.min(.2,p.distance/500);
    this._tone(85,1.1,.48*p.gain,{time:t,end:23,pan:p.pan,send:.4});
    this._noise(1.65,.55*p.gain,{time:t,color:'pink',cutoff:2100/(1+p.distance*.035),endCutoff:110,pan:p.pan,send:.5});
    this._noise(.14,.22*p.gain,{time:t,cutoff:6300/(1+p.distance*.06),pan:p.pan});
    for(let n=0;n<3;n++)this._noise(.13+n*.08,.07*p.gain,{time:t+.25+n*.17,filter:'bandpass',cutoff:1350+n*700,pan:clamp(p.pan+(n-1)*.3,-1,1),send:.4});
  }
  _reload(event,local,player){
    if(!player)return;
    const own=player.id===local?.id;
    const p=this._position({...event,x:event.x??player.x,z:event.z??player.z},local);
    if(!own&&(p.distance>12||this._voices.size>55))return;
    const elapsed=Number.isFinite(event.time)?Math.max(0,this._lastStateTime-event.time):0;
    const start=this.ctx.currentTime-elapsed;
    const gain=(own?.16:.068)*p.gain;
    const belt=(event.classId||player.classId)==='support';
    const expected=belt?3.1:2;
    const scale=Number.isFinite(event.duration)?clamp(event.duration/expected,.7,1.35):1;
    for(const [mark,kind] of belt?BELT_RELOAD:MAG_RELOAD){
      const offset=mark*scale;
      if(!own&&kind!=='seat'&&kind!=='lock')continue;
      if(own&&!belt&&event.empty===false&&(kind==='bolt'||kind==='lock'))continue;
      if(offset<elapsed-.06)continue;
      this._mechanic(kind,Math.max(this.ctx.currentTime,start+offset),own?.24:p.pan,gain*(kind==='seat'?1.14:.8));
    }
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
        if(!own&&Number.isFinite(e.time)&&state.time-e.time>.22)continue;
        const p=this._position(e,local);
        if(p.distance<145){
          const classId=e.classId||state.players?.find(player=>player.id===e.playerId)?.classId;
          this.shot(p.distance,e.mounted?'turret':classId,p.pan,own);
        }
        if(!own)this._nearMiss(e,local);
        this._impact(e,local);
        if(own&&(e.hit||e.vehicleHit)){
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
      }else if(e.type==='explosion')this._explosion(e,local);
      else if(e.type==='reload')this._reload(e,local,own?local:state.players?.find(player=>player.id===e.playerId));
      else if(e.type==='damage'&&own){this._noise(.16,.16,{color:'pink',cutoff:1400});this._tone(76,.2,.13,{end:37});}
      else if(e.type==='kill'&&local&&e.killerId===local.id)[880,1174,1397].forEach((frequency,index)=>this._tone(frequency,.14,.055,{time:this.ctx.currentTime+index*.055,send:.12}));
      else if(e.type==='capture'&&local)(e.team===local.team?[587,740,880]:[440,370]).forEach((frequency,index)=>this._tone(frequency,.42,.09,{time:this.ctx.currentTime+index*.12,send:.3}));
      else if(e.type==='gadget'&&own){this._noise(.25,.07,{filter:'bandpass',cutoff:2300,attack:.04});this._tone(520,.18,.07,{end:1040,send:.18});this._tone(1040,.18,.055,{time:this.ctx.currentTime+.16,send:.18});}
      else if(e.type==='grenade'&&own){this._noise(.045,.09,{filter:'bandpass',cutoff:4200});this._noise(.24,.07,{time:this.ctx.currentTime+.12,cutoff:1100,attack:.07});}
      else if(e.type==='spawn'&&own){this._tone(196,.32,.075,{end:392,send:.2});this._noise(.3,.055,{filter:'bandpass',cutoff:950,attack:.06});}
      else if(e.type==='roundEnd'&&local)(e.winner===local.team?[50,57,62,65]:[50,53,56,62]).forEach((note,index)=>this._tone(midi(note),2.5,.1,{time:this.ctx.currentTime+index*.12,type:'triangle',attack:.2,cutoff:1700,send:.45}));
    }
    while(this.seen.size>900)this.seen.delete(this.seen.keys().next().value);
  }
  update(dt,{state,local,moving=0,sprinting=false,crouching=false,aim=false,locked=false,inMenu=false,paused=false}={}){
    if(this._disposed)return;this.setMode(inMenu?'menu':'battle');
    if(paused!==this._paused){this._paused=paused;this._mix();}
    if(!this.ctx||this.ctx.state!=='running'||!this._enabled)return;
    const now=this.ctx.currentTime,canMove=local?.alive&&locked&&!paused&&!inMenu;
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
    if(!canMove||local.vehicleId){this._lastPosition=null;this._stride=0;this._falling=false;}
    else if(state?.time!==this._lastMovementTime){
      this._lastMovementTime=state?.time;
      if(this._lastPosition){
        const distance=Math.hypot(local.x-this._lastPosition.x,local.z-this._lastPosition.z),vertical=local.y-this._lastPosition.y;
        if(distance<5)this._stride+=distance;
        const onGround=local.grounded??Math.abs(vertical)<.04;
        if(!onGround&&this._lastPosition.grounded&&vertical>.035)this._noise(.18,.08,{filter:'bandpass',cutoff:750,pan:-.12});
        if(!onGround&&vertical<-.035)this._falling=true;
        if(this._falling&&onGround){this._step(1.5,false,false,local);this._noise(.2,.075,{cutoff:650});this._falling=false;this._stride=0;}
        const strideLength=sprinting?2.45:crouching?1.55:2.05;
        if(this._stride>=strideLength&&onGround){this._step(1,sprinting,crouching,local);this._stride%=strideLength;}
      }
      this._lastPosition={x:local.x,y:local.y,z:local.z,grounded:local.grounded??true};
    }
    this._updateAmbience(state,local,inMenu||paused);
    if(local?.alive&&local.ammo<=5&&local.ammo!==this._lastAmmo&&this._lastAmmo>local.ammo)this._tone(1700,.022,.035,{type:'square',cutoff:2900});
    this._lastAmmo=local?.ammo;
  }
  _updateAmbience(state,local,silent){
    const now=this.ctx.currentTime,quarry=state?.mapId==='quarry'&&!silent;
    if(now>=this._nextGust||quarry!==this._quarryAmbience){
      this._quarryAmbience=quarry;
      this._nextGust=now+.4;
      const gust=quarry?.55+.27*Math.sin(now*.59)+.18*Math.sin(now*.22):.55;
      const [air,ridge]=this._ambientSources;
      this._target(air.filter.frequency,quarry?205+gust*180:310,.8);
      this._target(air.volume.gain,quarry?.2+gust*.25:.16,.9);
      this._target(ridge.filter.frequency,quarry?710+gust*540:620,1.2);
      this._target(ridge.volume.gain,quarry?.14+gust*.22:.085,1);
    }
    if(silent||now<=this._distantAt)return;
    this._distantAt=now+9+Math.random()*10;
    const crusher=quarry&&state.points?.find(p=>p.id==='D');
    if(crusher){
      const position=this._position(crusher,local);
      const level=.022+.045/(1+position.distance/95);
      this._noise(3.1,level,{color:'pink',cutoff:230,attack:.7,pan:position.pan,send:.37});
      for(let i=0;i<3;i++)this._tone(162-i*16,.36,level*.65,{time:now+.35+i*.62,type:'triangle',end:84,cutoff:520,pan:position.pan,send:.44});
    }else{
      this._noise(2.5,.035,{color:'pink',cutoff:170,attack:.6,pan:Math.random()*1.5-.75,send:.5});
    }
  }
  _updateEngine(state,local,silent){
    let source=null,distance=45;
    if(local?.alive&&!silent)for(const vehicle of state?.vehicles??[]){
      if(vehicle.hp<=0||!vehicle.seats[0])continue;
      const offset=vehicle.id===local.vehicleId?0:Math.hypot(vehicle.x-local.x,vehicle.z-local.z);
      if(offset<distance){source=vehicle;distance=offset;}
    }
    if(!source){
      if(this._engine)this._target(this._engine.output.gain,0,.12);
      return;
    }
    if(!this._engine){
      const c=this.ctx;
      const output=this._node(c.createGain());output.gain.value=0;
      const pan=c.createStereoPanner?this._node(c.createStereoPanner()):null;
      if(pan)output.connect(pan).connect(this._effects);else output.connect(this._effects);
      const filter=this._node(c.createBiquadFilter());filter.type='lowpass';filter.Q.value=.8;filter.connect(output);
      const sources=[this._node(c.createOscillator()),this._node(c.createOscillator())];
      sources[0].type='sawtooth';sources[1].type='triangle';
      for(const oscillator of sources){oscillator.connect(filter);oscillator.start();}
      const rolling=this._node(c.createBufferSource());
      rolling.buffer=this._noiseBuffer('pink');rolling.loop=true;
      const road=this._node(c.createBiquadFilter());road.type='bandpass';road.frequency.value=860;road.Q.value=.6;
      const tires=this._node(c.createGain());tires.gain.value=0;
      rolling.connect(road).connect(tires).connect(output);rolling.start();
      this._engine={output,pan,filter,tires,sources:[...sources,rolling]};
    }
    const engine=this._engine;
    const speed=Math.abs(source.speed);
    const rpm=(source.type==='atv'?48:32)+speed*(source.type==='atv'?3.8:2.7);
    this._target(engine.sources[0].frequency,rpm,.1);
    this._target(engine.sources[1].frequency,rpm*1.49,.1);
    this._target(engine.filter.frequency,105+speed*13,.12);
    this._target(engine.tires.gain,Math.min(.48,speed*.024),.14);
    if(engine.pan)this._target(engine.pan.pan,source.id===local.vehicleId?0:this._position(source,local).pan,.12);
    this._target(engine.output.gain,(.10+speed*.003)/(1+distance*.24),.1);
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
    if(this._engine){for(const source of this._engine.sources)try{source.stop();}catch{}this._engine=null;}
    for(const {source,nodes}of this._ambientSources){try{source.stop();source.disconnect();}catch{}for(const node of nodes){try{node.disconnect();}catch{}}}
    this._ambientSources=[];for(const node of this._nodes){try{node.disconnect();}catch{}}this._nodes=[];this._buffers.clear();
    if(this.ctx&&this.ctx.state!=='closed')this.ctx.close().catch(()=>{});
  }
}
