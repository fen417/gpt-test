import assert from 'node:assert/strict';
import test from 'node:test';
import { opticZooms, scopeMagnification, usesFullscreenScope } from '../src/scope-optics.js';

test('SV-98M stock scope uses fullscreen aiming at both stock magnifications',()=>{
  assert.deepEqual(opticZooms('sv98'),[2,4]);
  for(const zoom of [2,4])assert.equal(usesFullscreenScope('sv98',undefined,scopeMagnification('sv98',zoom)),true);
});

test('low-power replacement optics keep the visible lens, even on an SV-98M',()=>{
  for(const [optic,zoom] of [['prism-2',2],['variable-12',2],['tactical-3',3]]){
    assert.equal(usesFullscreenScope('sv98',optic,zoom),false);
  }
  assert.equal(usesFullscreenScope('dmr12',undefined,2),false);
  assert.equal(usesFullscreenScope('sv98','horizon-610',6),true);
});
