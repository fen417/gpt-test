import test from 'node:test';
import assert from 'node:assert/strict';
import {AdaptiveGraphics} from '../src/adaptive-graphics.js';
import {baseGraphicsQuality, geometryQuality, graphicsEffects, validateCustomGraphics} from '../src/graphics-settings.js';

test('Ultra inherits the high-detail path and legacy presets opt out of additional passes',()=>{
  assert.equal(baseGraphicsQuality('ultra'),'high');
  assert.equal(geometryQuality('ultra'),'high');
  assert.equal(geometryQuality('low','high'),'high');
  for(const preset of ['low','medium','high']){
    const settings=graphicsEffects(preset);
    for(const setting of ['ao','contact','atmosphere','bloom','reflections']){
      assert.equal(settings[setting],'off');
    }
  }
});

test('custom graphics settings restore saved options and sanitize unsupported values',()=>{
  const settings=validateCustomGraphics({ao:'low',bloom:'broken',saturation:'0',contrast:'-1'},'ultra');
  assert.equal(settings.ao,'low');
  assert.equal(settings.bloom,graphicsEffects('ultra').bloom);
  assert.equal(settings.saturation,'0');
  assert.equal(settings.contrast,'100');
  assert.equal(geometryQuality('ultra','auto'),'high');
});

test('adaptive graphics waits before reducing effects and honors clarity limits',()=>{
  const quality=new AdaptiveGraphics();
  const settings=validateCustomGraphics({adaptiveTarget:'60',adaptiveFloor:'minimum',adaptiveClarity:'on'},'ultra');
  quality.configure(settings,'ultra');
  const timer={summary:()=>({p95:21})};
  for(let i=0;i<35;i++)quality.sample(.035,6,timer,true);
  assert.equal(quality.gpuStep,0);
  for(let i=0;i<80;i++)quality.sample(.035,6,timer,true);
  assert.equal(quality.effects.reflections,'medium');
  assert.equal(settings.reflections,'high');
  assert.equal(quality.scale,1);
  for(let i=0;i<2000;i++)quality.sample(.04,6,timer,true);
  assert.equal(quality.scale,1);
});

test('CPU load adapts geometry while preserving GPU effects',()=>{
  const quality=new AdaptiveGraphics();
  const settings=validateCustomGraphics({adaptiveTarget:'60'},'ultra');
  quality.configure(settings,'ultra');
  const timer={summary:()=>({p95:4})};
  for(let i=0;i<120;i++)quality.sample(.035,32,timer,true);
  assert.equal(quality.cpuStep,1);
  assert.equal(quality.effects,settings);
});
