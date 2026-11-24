import { PerformanceSamples } from '../shared/performance-samples.js';
import { GpuPassSamples, gpuPassLabels } from './gpu-pass-timing.js';

const passes=Object.keys(gpuPassLabels).filter(pass=>pass!=='realPresent'&&pass!=='frameGeneration');

// TIME_ELAPSED queries cannot nest. Sample one pass every third frame and
// keep measuring the whole frame on the remaining frames.
export class GpuTimer {
  constructor(gl, profiling=false) {
    this.gl=gl;
    this.profiling=profiling;
    this.enabled=false;
    this.pending=[];
    this.samples=new PerformanceSamples();
    this.passSamples=new GpuPassSamples();
    this.frame=0;
    this.nextPass=0;
    this.ext=typeof gl.createQuery==='function'?gl.getExtension('EXT_disjoint_timer_query_webgl2'):null;
  }

  begin() {
    this.selectedPass=null;
    if(!this.enabled||!this.ext||this.gl.isContextLost())return false;
    const {gl,ext,pending}=this;
    if(gl.getParameter(ext.GPU_DISJOINT_EXT)){
      this.reset();
      return false;
    }
    while(pending.length&&gl.getQueryParameter(pending[0].query,gl.QUERY_RESULT_AVAILABLE)){
      const {query,pass}=pending.shift();
      const ms=gl.getQueryParameter(query,gl.QUERY_RESULT)/1e6;
      if(pass)this.passSamples.add(pass,ms);
      else this.samples.add(ms);
      gl.deleteQuery(query);
    }
    if(this.profiling&&++this.frame%3===0){
      this.selectedPass=passes[this.nextPass++%passes.length];
      return false;
    }
    return this.start(null);
  }

  start(pass) {
    const {gl,ext,pending}=this;
    if(pending.length>=4||gl.getQuery(ext.TIME_ELAPSED_EXT,gl.CURRENT_QUERY))return false;
    const query=gl.createQuery();
    if(!query)return false;
    gl.beginQuery(ext.TIME_ELAPSED_EXT,query);
    pending.push({query,pass});
    return true;
  }

  beginPass(pass) {
    if(this.selectedPass!==pass)return false;
    this.selectedPass=null;
    return this.start(pass);
  }

  end() { this.gl.endQuery(this.ext.TIME_ELAPSED_EXT); }
  endPass() { this.end(); }
  summary() { return this.enabled&&this.ext&&this.samples.count?this.samples.summary():null; }

  reset() {
    for(const {query} of this.pending)this.gl.deleteQuery(query);
    this.pending.length=0;
    this.samples.reset();
    this.passSamples.reset();
  }

  dispose() { this.reset(); }
}
