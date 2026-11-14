import test from 'node:test';
import assert from 'node:assert/strict';
import { CombatAudio, MENU_MUSIC_TITLE } from '../src/audio.js';

class Parameter {
  constructor(value=0){this.value=value;this.events=[];}
  _set(value,time){assert.ok(Number.isFinite(value));assert.ok(Number.isFinite(time));this.value=value;this.events.push([value,time]);}
  setValueAtTime(v,t){this._set(v,t);}
  linearRampToValueAtTime(v,t){this._set(v,t);}
  exponentialRampToValueAtTime(v,t){assert.ok(v>0);this._set(v,t);}
  setTargetAtTime(v,t,constant){assert.ok(constant>0);this._set(v,t);}
  cancelScheduledValues(){}
}
class AudioNode {
  constructor(context){this.context=context;this.connections=[];this.gain=new Parameter(1);this.frequency=new Parameter(440);this.detune=new Parameter();this.pan=new Parameter();this.Q=new Parameter(1);this.playbackRate=new Parameter(1);for(const p of ['threshold','knee','ratio','attack','release'])this[p]=new Parameter();}
  connect(node){this.connections.push(node);return node;}
  disconnect(){this.connections=[];this.disconnected=true;}
  start(time=0,offset=0){assert.ok(time>=0);assert.ok(offset>=0);this.started=time;this.context.sources.add(this);}
  stop(time){if(time===undefined){this.finished=true;this.onended?.();}else{assert.ok(time>=this.started);this.stopped=time;}}
  getFloatTimeDomainData(array){array.fill(0);}
}
class FakeContext {
  constructor(){this.sampleRate=8000;this.currentTime=0;this.state='suspended';this.sources=new Set();this.created=[];this.buffers=[];this.destination=new AudioNode(this);}
  _node(){const n=new AudioNode(this);this.created.push(n);return n;}
  createGain(){return this._node();}createOscillator(){return this._node();}
  createBufferSource(){return this._node();}createBiquadFilter(){return this._node();}
  createConvolver(){return this._node();}createDynamicsCompressor(){return this._node();}
  createMediaElementSource(){return this._node();}createStereoPanner(){return this._node();}createAnalyser(){return this._node();}
  createBuffer(channels,length,sampleRate){const arrays=Array.from({length:channels},()=>new Float32Array(length));const b={length,sampleRate,numberOfChannels:channels,duration:length/sampleRate,getChannelData:i=>arrays[i]};this.buffers.push(b);return b;}
  async resume(){this.state='running';}async close(){this.state='closed';}
  advance(time){this.currentTime=time;for(const source of this.sources)if(!source.finished&&source.stopped<=time){source.finished=true;source.onended?.();}}
}
async function withAudio(fn,Context=FakeContext){
  const previous=globalThis.AudioContext,previousAudio=globalThis.Audio;globalThis.AudioContext=Context;globalThis.Audio=class{paused=true;async play(){this.paused=false;}pause(){this.paused=true;}removeAttribute(){}load(){}};
  const audio=new CombatAudio();
  try{await fn(audio);}finally{audio.dispose();if(previousAudio===undefined)delete globalThis.Audio;else globalThis.Audio=previousAudio;if(previous===undefined)delete globalThis.AudioContext;else globalThis.AudioContext=previous;}
}

test('score starts after audio unlock whether menu mode is set before or afterwards',async()=>{
  assert.equal(MENU_MUSIC_TITLE,'Quiet Resolve');
  await withAudio(async audio=>{
    audio.setMode('menu');assert.equal(audio.getStats().state,'locked');
    assert.equal(await audio.unlock(),true);audio.setMode('menu');
    assert.equal(audio.getStats().musicPlaying,true);
    assert.equal(audio._menuTrack.paused,false,'menu recording starts after user gesture');
    const context=audio.ctx;await audio.unlock();assert.equal(audio.ctx,context);
    assert.equal(audio._ambientSources.length,3);
  });
  await withAudio(async audio=>{
    await audio.unlock();audio.setMode('battle');audio.setMode('menu');await Promise.resolve();await Promise.resolve();
    assert.equal(audio.getStats().mode,'menu');assert.equal(audio.getStats().musicPlaying,true);
  });
});

test('master mute, score mute and effects levels adjust independent live buses',async()=>withAudio(async audio=>{
  await audio.unlock();
  audio.volume=.8;audio.setEffectsVolume(.3);audio.setMusicVolume(.6);
  assert.equal(audio._master.gain.value,.8*.82);assert.equal(audio._effects.gain.value,.3);
  assert.equal(audio._music.gain.value,.6*1.64);
  audio.setMode('battle');assert.equal(audio._music.gain.value,.6*.22);
  audio.setMusicVolume(0);assert.equal(audio.getStats().musicPlaying,false);assert.equal(audio._effects.gain.value,.3);
  audio.setMusicVolume(.5);assert.equal(audio.getStats().musicPlaying,true);
  audio.enabled=false;assert.equal(audio._master.gain.value,0);assert.equal(audio.getStats().musicPlaying,false);
  audio.setEnabled(true);assert.equal(audio._master.gain.value,.8*.82);
  audio.volume=9;audio.effectsVolume=-2;assert.equal(audio.volume,1);assert.equal(audio.effectsVolume,0);
}));

test('one short reverb is disconnected on low and fallback decoding is attempted',async()=>withAudio(async audio=>{
  await audio.unlock();
  assert.equal(audio._convolver.buffer.duration,.7);
  for(const bus of Object.values(audio._reverbs))assert.equal(bus.connections[0],audio._convolver);
  audio.update(.02,{quality:'low'});assert.equal(audio._convolver.connections.length,0);
  audio.update(.02,{quality:'medium'});assert.equal(audio._convolver.connections[0],audio._reverbWet);
  const previous=globalThis.fetch,requests=[];
  globalThis.fetch=async url=>{if(typeof url==='string')requests.push(url);return {ok:true,arrayBuffer:async()=>new ArrayBuffer(8)};};
  let calls=0;const buffer={duration:1},context={decodeAudioData:async()=>{if(!calls++)throw Error('unsupported codec');return buffer;}};
  try{assert.equal(await audio._loadRecording({url:'primary',fallback:'fallback'},context),buffer);assert.deepEqual(requests,['primary','fallback']);}
  finally{globalThis.fetch=previous;}
}));

test('complete 32-bar arrangement schedules finite envelopes and releases voices without accumulating buffers',async()=>withAudio(async audio=>{
  await audio.unlock();audio.setMode('battle');clearInterval(audio._scheduler);audio._scheduler=null;
  let maximum=0;
  for(let eighth=0;eighth<256;eighth++){
    const time=1+eighth*(60/82)/2;audio.ctx.advance(time);audio._musicTick(eighth,time+.02);
    maximum=Math.max(maximum,audio._voices.size);
  }
  assert.ok(maximum<40,`music kept ${maximum} simultaneous voices`);
  assert.ok(audio.ctx.created.some(node=>node.type==='triangle'));
  assert.ok(audio.ctx.created.some(node=>node.type==='highpass'));
  assert.equal(audio.ctx.buffers.length,3,'one impulse and two cached noise buffers');
  audio.ctx.advance(110);assert.equal(audio._voices.size,0);
  assert.equal(audio._ambientSources.length,3);
}));

test('busy combat caps voices, deduplicates repeated snapshots and cleans all resources',async()=>withAudio(async audio=>{
  await audio.unlock();audio.setMode('battle');
  const local={id:'local',x:0,y:0,z:0,yaw:0,hp:100,alive:true,ammo:30,classId:'assault'};
  const state={time:1,players:[local],events:[{id:1,type:'shot',playerId:'local',x:0,z:0,hit:true}]};
  audio.events(state,local);const count=audio._voices.size;audio.events(state,local);assert.equal(audio._voices.size,count);
  for(let n=0;n<1000;n++)audio.shot(0,'support');
  assert.ok(audio._voices.size<=112);assert.equal(audio.ctx.buffers.length,3);
  audio.dispose();assert.equal(audio._voices.size,0);assert.equal(audio._scheduler,null);assert.equal(audio._ambientSources.length,0);assert.equal(audio.ctx.state,'closed');
  assert.equal(await audio.unlock(),false);
}));

test('soundscape works without StereoPanner and tracks real movement rather than held movement keys',async()=>{
  class MonoContext extends FakeContext{constructor(){super();this.createStereoPanner=undefined;}}
  await withAudio(async audio=>{
    await audio.unlock();audio.setMode('battle');
    let steps=0;audio._step=()=>steps++;
    const local={id:'local',x:0,y:0,z:0,yaw:0,hp:100,alive:true,ammo:30};
    for(let n=0;n<10;n++)audio.update(.05,{state:{time:n*.05},local,moving:1,locked:true});
    assert.equal(steps,0,'pushing into a wall must not play footsteps');
    local.x=2.2;audio.update(.05,{state:{time:1},local,moving:1,locked:true});assert.equal(steps,1);
    audio.shot(12,'recon',-.5);audio._explosion({x:3,z:4},local);audio.click();
  },MonoContext);
});

test('automatic fire keeps preceding recordings alive and does not queue distance delay',async()=>withAudio(async audio=>{
  await audio.unlock();audio.setMode('battle');
  audio._shotBuffers.set('rifle-light',[audio.ctx.createBuffer(1,8000,8000)]);
  audio.shot(100,'ar416',0,false,0,'bot');
  const first=[...audio._voices].find(v=>v.shooterId==='bot');
  assert(first.time<=audio.ctx.currentTime+.01,'presentation already supplies the network delay');
  audio.ctx.advance(.1);audio.shot(100,'ar416',0,false,0,'bot');
  assert(audio._voices.has(first),'next round must not truncate the preceding recording');
  assert.equal([...audio._voices].filter(v=>v.shooterId==='bot').length,2);
}));

test('authority and presentation clocks do not reset sound deduplication',async()=>withAudio(async audio=>{
  await audio.unlock();audio.setMode('battle');
  const local={id:'local',x:0,y:0,z:0,yaw:0,hp:100,alive:true};
  const event={id:9,type:'shot',playerId:local.id,time:1,x:0,z:0,weaponId:'ar416'};
  audio.events({time:1,events:[event]},local);
  const count=audio._voices.size;
  audio.events({time:4,events:[]},local,{immediate:true});
  audio.events({time:1.1,events:[event]},local);
  assert.equal(audio._voices.size,count,'a slow presentation clock must not replay a retained event');
}));
