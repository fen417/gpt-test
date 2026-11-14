import test from 'node:test';
import assert from 'node:assert/strict';
import { PerformanceSamples } from '../shared/performance-samples.js';
import { GpuTimer } from '../src/gpu-timer.js';

test('performance samples wrap, reset and report tail stalls',()=>{
  const samples=new PerformanceSamples(3);for(const v of [1,2,40,100])samples.add(v);
  assert.deepEqual(samples.summary(),{count:3,avg:47.33,p95:100,p99:100,max:100,over33:2,over50:1,over100:0});
  samples.reset();assert.equal(samples.summary().count,0);assert.equal(samples.summary().max,0);
});

test('GPU timing never reads unavailable results and discards disjoint queries',()=>{
  let available=false,disjoint=false,reads=0,deletes=0;
  const gl={QUERY_RESULT_AVAILABLE:1,QUERY_RESULT:2,CURRENT_QUERY:3,
    getExtension:()=>({GPU_DISJOINT_EXT:4,TIME_ELAPSED_EXT:5}),isContextLost:()=>false,
    createQuery:()=>({}),getParameter:()=>disjoint,getQuery:()=>null,
    beginQuery(){},endQuery(){},deleteQuery(){deletes++;},
    getQueryParameter(q,p){if(p===1)return available;assert(available);reads++;return 2500000;}};
  const timer=new GpuTimer(gl);assert.equal(timer.begin(),false);timer.enabled=true;
  assert(timer.begin());timer.end();assert.equal(reads,0);
  assert(timer.begin());timer.end();available=true;
  assert(timer.begin());timer.end();assert.equal(timer.summary().avg,2.5);
  assert.equal(reads,2);disjoint=true;assert.equal(timer.begin(),false);assert.equal(timer.summary(),null);
  assert.equal(deletes,3);
});

test('unsupported GPU timer reports unavailable instead of zero milliseconds',()=>{
  const timer=new GpuTimer({getExtension:()=>null});timer.enabled=true;
  assert.equal(timer.begin(),false);assert.equal(timer.summary(),null);timer.dispose();
});
