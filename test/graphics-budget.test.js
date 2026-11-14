import test from 'node:test';
import assert from 'node:assert/strict';
import { AdaptiveResolution } from '../src/adaptive-resolution.js';
import { CachedShadows } from '../src/cached-shadows.js';

test('adaptive resolution has hysteresis, CPU protection and a physical width floor',()=>{
  const gpu=new AdaptiveResolution();for(let i=0;i<40;i++)gpu.update(.03,4,25);
  assert.equal(gpu.scale,.9);
  assert(gpu.ratio(1366,1)*1366>=1024);
  for(let i=0;i<360;i++)gpu.update(1/60,5,6);
  assert.equal(gpu.scale,1,'60 Hz vsync must allow resolution recovery');
  const cpu=new AdaptiveResolution();for(let i=0;i<120;i++)cpu.update(.03,25,4);
  assert.equal(cpu.scale,1,'reducing pixels cannot solve a CPU bottleneck');
});

test('cached shadow installation is idempotent and disposal restores native rendering',()=>{
  const cache=new CachedShadows(),native=()=>{},owner={renderer:{shadowMap:{render:native}}};
  cache.install(owner);const installed=owner.renderer.shadowMap.render;
  cache.install(owner);assert.equal(owner.renderer.shadowMap.render,installed);
  cache.dispose();assert.equal(owner.renderer.shadowMap.render,native);
});
