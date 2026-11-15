import {campaignMusicWindow} from './music-loop.js';

// Each repetition overlaps the preceding phrase's tail with the lead-in to
// loopStart. The musical period and the mission clock remain unchanged.
export class TankMusic{
  constructor(ctx,buffer,definition,seconds){
    this.ctx=ctx;this.buffer=buffer;this.definition=definition;this.originTime=ctx.currentTime-seconds;
    this.gain=ctx.createGain();this.gain.gain.value=0;this.gain.connect(ctx.destination);this.sources=new Set();
    const window=campaignMusicWindow(definition,buffer.duration,seconds);this.window=window;
    this.schedule(ctx.currentTime,window.offset,false);
  }
  schedule(at,offset,fade){
    const c=this.ctx,{loop,loopStart,loopEnd}=this.window,end=loop?loopEnd:this.buffer.duration;
    const duration=end-offset,source=c.createBufferSource(),gain=c.createGain(),cross=.35;
    source.buffer=this.buffer;source.connect(gain);gain.connect(this.gain);
    gain.gain.setValueAtTime(fade?0:1,at);
    if(fade)gain.gain.linearRampToValueAtTime(1,at+cross);
    if(loop){gain.gain.setValueAtTime(1,at+Math.max(cross,duration-cross));gain.gain.linearRampToValueAtTime(0,at+duration);}
    source.start(at,offset,duration);this.sources.add(source);
    source.onended=()=>{this.sources.delete(source);source.disconnect();gain.disconnect();};
    this.nextAt=loop?at+duration-cross:Infinity;this.nextOffset=Math.max(0,loopStart-cross);
  }
  update(){if(this.nextAt<this.ctx.currentTime+1)this.schedule(Math.max(this.ctx.currentTime,this.nextAt),this.nextOffset,true);}
  stop(){for(const source of this.sources){try{source.stop();}catch{}source.disconnect();}this.sources.clear();this.gain.disconnect();}
}
