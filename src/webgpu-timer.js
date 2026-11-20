import { PerformanceSamples } from '../shared/performance-samples.js';

// Timestamp resolution is asynchronous and never blocks the render loop.
// These measurements are absent on adapters without timestamp-query.
export class WebGpuTimer {
  constructor(renderer){
    this.renderer=renderer;
    this.enabled=false;
    this.ext=Boolean(renderer.backend?.trackTimestamp);
    this.pending=false;
    this.samples=new PerformanceSamples();
  }
  begin(){return false;}
  end(){}
  poll(){
    if(!this.enabled||!this.ext||this.pending)return;
    this.pending=true;
    this.renderer.backend.resolveTimestampsAsync('render')
      .then(ms=>{if(Number.isFinite(ms)&&ms>0)this.samples.add(ms);})
      .catch(error=>{console.warn('WebGPU timestamp-query unavailable:',error);this.ext=false;})
      .finally(()=>{this.pending=false;});
  }
  summary(){return this.enabled&&this.ext&&this.samples.count?this.samples.summary():null;}
  dispose(){this.enabled=false;}
}
