import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {MeshStandardNodeMaterial} from 'three/webgpu';
import {vec4} from 'three/tsl';
import {buildWeatherPixels,weatherParameters,makeWeatherMask,surfaceRepeat} from '../src/map-weathering.js';
import {setWebGlWeathering} from '../src/webgl-map-weathering.js';
import {setWebGpuWeathering,suspendWebGpuWeathering} from '../src/webgpu-map-weathering.js';
import {graphicsEffects,validateCustomGraphics} from '../src/graphics-settings.js';
test('map profiles are opt-in and preserve relief UV scale',()=>{
  for(const p of ['legacy','low','medium','high'])assert.equal(graphicsEffects(p).mapWeathering,'off');
  assert.equal(graphicsEffects('ultra').mapWeathering,'high');
  assert.equal(validateCustomGraphics({mapWeathering:'low'},'ultra').mapWeathering,'low');
  assert.equal(weatherParameters('quarry','rock','off'),null);
  assert.ok(weatherParameters('quarry','concrete','high')[1]>weatherParameters('fy_pool_day','concrete','high')[1]);
  assert.equal(weatherParameters('quarry','sand','high')[2],0);
  assert.equal(weatherParameters('quarry','concrete','low')[2],0);
  assert.equal(surfaceRepeat('rock'),1);assert.equal(surfaceRepeat('concrete'),1);
});
test('deterministic mask with sparse cracks',()=>{
  const a=buildWeatherPixels(64),b=buildWeatherPixels(64);
  assert.deepEqual(a,b);assert.equal(a.length,64*64*4);
  const cracks=a.filter((x,i)=>i%4===2&&x>0).length;
  assert.ok(cracks>0&&cracks<64*64*.4);assert.ok(new Set(a.filter((x,i)=>i%4===0)).size>50);
});
test('WebGL patches compose and restore original shader hook',()=>{
  const m=new THREE.MeshStandardMaterial(),mask=makeWeatherMask(),original=s=>{s.fragmentShader+='\n// original';};
  m.onBeforeCompile=original;setWebGlWeathering(m,mask,weatherParameters('port','metal','high'));
  const s={uniforms:{},vertexShader:'#include <project_vertex>',fragmentShader:'#include <color_fragment>'};
  m.onBeforeCompile(s);assert.ok(s.vertexShader.includes('s09WeatherPosition'));
  assert.ok(s.fragmentShader.includes('s09WeatherFactor'));assert.ok(s.fragmentShader.includes('// original'));
  assert.ok(m.customProgramCacheKey().includes('weathering'));setWebGlWeathering(m,null);
  assert.equal(m.onBeforeCompile,original);mask.dispose();m.dispose();
});
test('WebGPU wrapper preserves original color node while relief changes',()=>{
  const m=new MeshStandardNodeMaterial(),mask=makeWeatherMask(),base=vec4(1);
  m.colorNode=base;const original=m.customProgramCacheKey;
  setWebGpuWeathering(m,mask,weatherParameters('port','metal','high'));const first=m.colorNode;assert.notEqual(first,base);
  suspendWebGpuWeathering(m);assert.equal(m.colorNode,base);
  setWebGpuWeathering(m,mask,weatherParameters('village','metal','high'));assert.equal(m.colorNode,first);
  suspendWebGpuWeathering(m);m.colorNode=vec4(.5);const replacement=m.colorNode;
  setWebGpuWeathering(m,mask,weatherParameters('village','metal','low'));assert.notEqual(m.colorNode,first);
  setWebGpuWeathering(m,null);assert.equal(m.colorNode,replacement);assert.equal(m.customProgramCacheKey,original);
  mask.dispose();m.dispose();
});
