// Frame-pacing policy for experimental WebGPU frame interpolation.
// Simulation and input continue on every requestAnimationFrame; only the
// expensive 3D render can be skipped for a low-cost synthesized presentation.
export const FRAME_GENERATION_MODES = Object.freeze(['off', 'auto', '1.5', '2']);

export class FrameGenerationPolicy {
  constructor() { this.setMode('off'); }
  setMode(mode) {
    const next=FRAME_GENERATION_MODES.includes(mode)?mode:'off';
    if(this.mode===next)return;
    this.mode=next;this.clearHistory();
    this.cycles=0;this.generated=0;this.real=0;this.rejected=0;
    this.recent={real:0,generated:0,rejected:0,display:0};
    this.windowStart=0;this.rates={real:0,generated:0,display:0};
    this.previousPresent=0;this.slowFrames=0;
  }
  clearHistory(){this.history=0;this.lastReal=0;this.previousReal=0;this.lastMeta=null;this.cycles=0;}
  compatible(meta,previous=this.lastMeta) {
    if(!meta||!previous)return false;
    for(const key of ['playerId','mapId','alive','weaponId','vehicleId','seat','scoped','aim','thirdPerson','fov']){
      if(meta[key]!==previous[key])return false;
    }
    if(!meta.alive||!Number.isFinite(meta.yaw)||!Number.isFinite(meta.pitch))return false;
    if(Number.isFinite(meta.x)&&Number.isFinite(previous.x)){
      const dist=Math.hypot(meta.x-previous.x,(meta.y??0)-(previous.y??0),(meta.z??0)-(previous.z??0));
      if(dist>1.6)return false;
    }
    const yaw=Math.atan2(Math.sin(meta.yaw-previous.yaw),Math.cos(meta.yaw-previous.yaw));
    if(Math.abs(yaw)>.04||Math.abs(meta.pitch-previous.pitch)>.04)return false;
    return true;
  }
  shouldGenerate(now,meta){
    if(this.mode==='off'||!Number.isFinite(now)||this.history<2)return false;
    // The safe-mode gate also applies to explicit presets on overloaded GPUs.
    if(!this.compatible(meta)||now-this.lastReal>50||this.slowFrames>4){
      this.reject(now);return false;
    }
    // Never present a stale reconstructed image following a tab stall,
    // camera cut or unexpectedly slow real frame.
    if(this.mode==='auto'&&(this.slowFrames>2||this.rates.real>=58))return false;
    const stride=this.mode==='2'?2:3; // 1.5x: 2 native + 1 generated
    this.cycles++;
    return this.cycles%stride===0;
  }
  noteReal(now,meta,elapsedMs=0) {
    if(!this.compatible(meta))this.clearHistory();
    this.previousReal=this.lastReal;
    this.history=Math.min(2,this.history+1);
    this.lastReal=now;this.lastMeta={...meta};
    if(elapsedMs>34)this.slowFrames=Math.min(6,this.slowFrames+1);
    else this.slowFrames=Math.max(0,this.slowFrames-1);
    this.real++;this.recent.real++;this.recent.display++;
    this.measure(now);
  }
  noteGenerated(now){
    this.generated++;this.recent.generated++;this.recent.display++;this.measure(now);
  }
  reject(now){this.rejected++;this.recent.rejected++;this.measure(now);}
  measure(now){
    if(!this.windowStart)this.windowStart=now;
    if(now-this.windowStart<1000)return;
    const elapsed=Math.max(1,now-this.windowStart);
    this.rates={real:this.recent.real*1000/elapsed,generated:this.recent.generated*1000/elapsed,display:this.recent.display*1000/elapsed};
    this.recent={real:0,generated:0,rejected:0,display:0};this.windowStart=now;
  }
  summary(){return {mode:this.mode,realFPS:this.rates.real,generatedFPS:this.rates.generated,displayFPS:this.rates.display,
    realFrames:this.real,generatedFrames:this.generated,rejected:this.rejected,historyReady:this.history>=2};}
}
