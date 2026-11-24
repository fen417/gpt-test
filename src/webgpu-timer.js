import { PerformanceSamples } from '../shared/performance-samples.js';
import { GpuPassSamples } from './gpu-pass-timing.js';

// Reuse the timestamp queries that Three already records. The inspector
// supplies render IDs, including nested shadow and SMAA subpasses.
export class WebGpuTimer {
  constructor(renderer, profiling=false) {
    this.renderer=renderer;
    this.enabled=false;
    this.ext=Boolean(renderer.backend?.trackTimestamp);
    this.pending=false;
    this.samples=new PerformanceSamples();
    this.passSamples=new GpuPassSamples();
    this.phases=[];
    this.frames=[];
    this.revision=0;
    if(profiling&&this.ext){
      const inspector=renderer.inspector;
      const previous=inspector.beginRender;
      const begin=(uid,scene,camera,target)=>{
        const phase=this.phases.at(-1);
        if(uid&&phase&&this.frame){
          const pass=scene.overrideMaterial?.isShadowPassMaterial?'shadows':phase;
          this.frame.set(uid,pass);
        }
        previous.call(inspector,uid,scene,camera,target);
      };
      inspector.beginRender=begin;
      this.detach=()=>{if(inspector.beginRender===begin)inspector.beginRender=previous;};
    }
  }

  begin() { return false; }
  end() {}

  beginPass(pass) {
    if(!this.enabled||!this.ext||!this.detach)return false;
    this.frame??=new Map();
    this.phases.push(pass);
    return true;
  }

  endPass() { this.phases.pop(); }

  poll(realFrame=true) {
    if(!this.enabled||!this.ext)return;
    if(this.frame?.size&&this.frames.length<32)this.frames.push({phases:this.frame,realFrame});
    this.frame=null;
    if(this.pending)return;
    const frames=this.frames;
    this.frames=[];
    const revision=this.revision;
    const {backend}=this.renderer;
    this.pending=true;
    backend.resolveTimestampsAsync('render')
      .then(ms=>{
        if(revision!==this.revision)return;
        if(!this.detach&&realFrame&&Number.isFinite(ms)&&ms>0)this.samples.add(ms);
        if(!backend.timestampQueryPool.render)return;
        for(const frame of frames){
          const totals=new Map();
          let frameMs=0;
          for(const [uid,pass] of frame.phases){
            if(!backend.hasTimestamp(uid))continue;
            const time=backend.getTimestamp(uid);
            if(!Number.isFinite(time)||time<0)continue;
            frameMs+=time;
            totals.set(pass,(totals.get(pass)??0)+time);
          }
          for(const [pass,time] of totals)this.passSamples.add(pass,time);
          if(frame.realFrame&&frameMs>0)this.samples.add(frameMs);
        }
      })
      .catch(error=>{console.warn('WebGPU timestamp-query unavailable:',error);this.ext=false;})
      .finally(()=>{
        // r181 keeps resolved IDs for the renderer lifetime. This timer
        // consumes them as a batch, so finished frames can be released.
        backend.timestampQueryPool.render?.timestamps.clear();
        this.pending=false;
      });
  }

  summary() { return this.enabled&&this.ext&&this.samples.count?this.samples.summary():null; }

  reset() {
    this.revision++;
    this.frames.length=0;
    this.samples.reset();
    this.passSamples.reset();
  }

  dispose() { this.enabled=false;this.reset();this.detach?.(); }
}
