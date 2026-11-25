import test from 'node:test';
import assert from 'node:assert/strict';
import {viewLightTargets,enclosedCabin} from '../src/context-lighting.js';

test('open air retains original light levels',()=>{
  assert.deepEqual(viewLightTargets(1,1,null),{direct:1,ambient:1,environment:1});
});
test('covered weapon keeps readable indirect light and attenuates direct sunlight',()=>{
  const covered=viewLightTargets(0,0,null);
  assert.ok(covered.direct<.3&&covered.ambient>.65&&covered.environment>.65);
  const cabin=viewLightTargets(1,1,'black-hawk');
  assert.ok(cabin.direct<.5&&cabin.ambient>covered.ambient);
  assert.ok(viewLightTargets(0,0,null,false).direct>covered.direct);
});
test('only enclosed vehicle seats get cabin shading',()=>{
  assert.equal(enclosedCabin('black-hawk',3),true);
  assert.equal(enclosedCabin('humvee',1),false);
  assert.equal(enclosedCabin('humvee',2),true);
  assert.equal(enclosedCabin('atv',1),false);
  assert.equal(enclosedCabin('tank',2),false);
  assert.equal(enclosedCabin('humvee',null),false);
});
