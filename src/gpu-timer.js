import { PerformanceSamples } from '../shared/performance-samples.js';

// Non-blocking GPU queries: never wait for the driver or call gl.finish().
export class GpuTimer {
  constructor(gl){this.gl=gl;this.enabled=false;this.pending=[];this.samples=new PerformanceSamples();this.ext=typeof gl.createQuery==='function'?gl.getExtension('EXT_disjoint_timer_query_webgl2'):null;}
  begin(){
    if(!this.enabled||!this.ext||this.gl.isContextLost())return false;
    const gl=this.gl,ext=this.ext;
    if(gl.getParameter(ext.GPU_DISJOINT_EXT)){
      for(const query of this.pending)gl.deleteQuery(query);
      this.pending=[];this.samples.reset();return false;
    }
    while(this.pending.length&&gl.getQueryParameter(this.pending[0],gl.QUERY_RESULT_AVAILABLE)){
      const query=this.pending.shift();this.samples.add(gl.getQueryParameter(query,gl.QUERY_RESULT)/1e6);gl.deleteQuery(query);
    }
    if(this.pending.length>=4||gl.getQuery(ext.TIME_ELAPSED_EXT,gl.CURRENT_QUERY))return false;
    const query=gl.createQuery();if(!query)return false;
    gl.beginQuery(ext.TIME_ELAPSED_EXT,query);this.pending.push(query);return true;
  }
  end(){this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);}
  summary(){return this.enabled&&this.ext&&this.samples.count?this.samples.summary():null;}
  dispose(){for(const query of this.pending)this.gl.deleteQuery(query);this.pending=[];}
}
