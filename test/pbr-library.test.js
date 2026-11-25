import test from 'node:test';
import assert from 'node:assert/strict';
import {choosePbrSize,DETAIL_SIZE,PBR_SOURCES} from '../src/pbr-library.js';
import {graphicsEffects} from '../src/graphics-settings.js';
test('PBR tiers never exceed requested resolution or hardware limit',()=>{
  assert.equal(choosePbrSize([512,1024,2048,4096],4096,2048),2048);
  assert.equal(choosePbrSize([512,1024,2048],4096),2048);
  assert.equal(choosePbrSize([512,1024],256),0);
  assert.equal(choosePbrSize([512,1024],0),0);
  assert.equal(DETAIL_SIZE[graphicsEffects('ultra').surfaceDetail],4096);
  for(const preset of ['legacy','low','medium','high'])assert.equal(graphicsEffects(preset).surfaceDetail,'off');
  assert.ok(Object.keys(PBR_SOURCES).length>=10);
});
