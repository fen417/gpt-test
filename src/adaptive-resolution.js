export class AdaptiveResolution {
  constructor(){this.scale=1;this.elapsed=0;this.fast=0;this.frames=[];}
  update(dt,cpuMs=0,gpuMs=null){
    if(dt<=0||dt>.1)return false;
    this.frames.push(dt*1000);this.elapsed+=dt;if(this.elapsed<1)return false;
    const sorted=this.frames.sort((a,b)=>a-b),p95=sorted[Math.ceil(sorted.length*.95)-1];
    this.frames=[];this.elapsed=0;
    const gpuBound=gpuMs==null?cpuMs<12:gpuMs>Math.max(cpuMs,14);
    if(p95>20&&gpuBound){this.fast=0;const next=Math.max(.6,Math.round((this.scale-.1)*10)/10);const changed=next!==this.scale;this.scale=next;return changed;}
    // Active work, rather than vsync interval, determines recovery headroom.
    if(p95<18&&cpuMs<14&&(gpuMs==null||gpuMs<14))this.fast++;else this.fast=0;
    if(this.fast>=5){this.fast=0;const next=Math.min(1,Math.round((this.scale+.1)*10)/10);const changed=next!==this.scale;this.scale=next;return changed;}
    return false;
  }
  ratio(width,dpr=1){return Math.max(Math.min(dpr,1024/Math.max(1,width)),dpr*this.scale);}
}
