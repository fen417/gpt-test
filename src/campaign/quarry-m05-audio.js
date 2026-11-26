import {M05_SITES as sites} from '../../shared/campaign/quarry-m05.js';

const sounds=[
  {id:'ventilation',point:sites.tunnel,radius:22,level:.5,active:()=>true},
  {id:'conveyor',point:sites.panel,radius:65,level:.66,active:m=>m.power},
  {id:'gate',point:sites.gate,radius:72,level:.70,active:m=>m.gates.main>0&&m.gates.main<1},
  {id:'warning',point:sites.blast,radius:114,level:.37,active:m=>m.blastAt!=null&&m.time-m.blastAt<24},
  {id:'fire',point:sites.blast,radius:89,level:.67,active:m=>m.blastAt!=null},
  {id:'wind',point:sites.storm,radius:720,level:.73,active:m=>m.cutscene?.id==='C4'&&m.cutscene.elapsed>63},
];

export class QuarryAmbience{
  constructor(audio,url){
    this.audio=audio;
    this.url=url;
    this.pending=new Map();
    this.tracks=new Map();
    this.abort=new AbortController();
  }
  update(m,camera,low,paused){
    const listener=camera.position,yaw=camera.rotation.y;
    const {ctx,enabled,volume,effectsVolume}=this.audio;
    if(!ctx||this.abort.signal.aborted)return;
    const picks=paused||!enabled?[]:sounds.filter(s=>s.active(m)&&listener.distanceToSquared(s.point)<s.radius*s.radius)
      .map(s=>({sound:s,distance:listener.distanceTo(s.point)}))
      .sort((a,b)=>a.distance/a.sound.radius-b.distance/b.sound.radius)
      .slice(0,low?2:4);
    for(const [id,track] of this.tracks)if(!picks.some(({sound})=>sound.id===id))this.stop(id,track);
    for(const {sound,distance} of picks){
      const level=sound.level*volume*effectsVolume*(1-distance/sound.radius)**1.7;
      if(!this.pending.has(sound.id)){
        const item={buffer:null};this.pending.set(sound.id,item);
        fetch(new URL('sfx/'+sound.id+'.ogg',this.url),{signal:this.abort.signal})
          .then(response=>response.ok?response.arrayBuffer():null)
          .then(bytes=>bytes&&ctx.decodeAudioData(bytes)).then(buffer=>{item.buffer=buffer;}).catch(()=>{});
      }
      const buffer=this.pending.get(sound.id).buffer;
      if(!buffer)continue;
      let track=this.tracks.get(sound.id);
      if(!track){
        const source=ctx.createBufferSource(),gain=ctx.createGain(),pan=ctx.createStereoPanner();
        source.buffer=buffer;source.loop=true;gain.gain.value=0;
        source.connect(gain).connect(pan).connect(ctx.destination);source.start(0,m.time%buffer.duration);
        track={source,gain,pan};this.tracks.set(sound.id,track);
      }
      track.gain.gain.setTargetAtTime(level,ctx.currentTime,.15);
      const right=Math.cos(yaw)*(sound.point.x-listener.x)-Math.sin(yaw)*(sound.point.z-listener.z);
      track.pan.pan.setTargetAtTime(Math.max(-1,Math.min(1,right/Math.max(8,distance))),ctx.currentTime,.1);
    }
  }
  stop(id,track){
    this.tracks.delete(id);
    const now=this.audio.ctx.currentTime;
    track.gain.gain.setTargetAtTime(0,now,.06);
    track.source.onended=()=>{track.source.disconnect();track.gain.disconnect();track.pan.disconnect();};
    track.source.stop(now+.26);
  }
  dispose(){
    this.abort.abort();
    for(const [id,track] of this.tracks)this.stop(id,track);
    this.pending.clear();
  }
}
