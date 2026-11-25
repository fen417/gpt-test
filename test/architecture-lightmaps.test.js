import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {decodeChartUV,geometryKey,architectureReceiver} from '../src/architecture-lightmap-format.js';
import {graphicsEffects,validateCustomGraphics} from '../src/graphics-settings.js';
test('architecture charts address padded texel centers and neutral sample',()=>{
  const uv=decodeChartUV(new Uint16Array([4,8,8,0,0,0]),16);
  assert.deepEqual(Array.from(uv),[5.5/16,9.5/16,10.5/16,9.5/16,5.5/16,14.5/16,...Array(6).fill(.5/16)]);
});
test('lightmaps are opt-in, independent, and geometry fingerprint detects changed topology',()=>{
  for(const preset of ['legacy','low','medium','high'])assert.equal(graphicsEffects(preset).architectureLight,'off');
  assert.equal(graphicsEffects('ultra').architectureAO,'high');
  assert.equal(validateCustomGraphics({architectureAO:'high',architectureLight:'off'},'low').architectureAO,'high');
  const g=new THREE.BoxGeometry(),old=geometryKey(g);g.attributes.position.setX(0,7);assert.notEqual(geometryKey(g),old);
  const m=new THREE.Mesh(g);m.userData.estateSurface='concrete';assert.equal(architectureReceiver(m),true);
  m.userData.estateSurface='glass';assert.equal(architectureReceiver(m),false);g.dispose();
});
