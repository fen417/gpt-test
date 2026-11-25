import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {cascadeShadowBias,directionalPenumbraScale} from '../src/directional-penumbra.js';
test('far cascades increase depth and normal bias with world texel footprint',()=>{
  const shadow=new THREE.DirectionalLight().shadow;
  Object.assign(shadow.camera,{left:-10,right:10,top:10,bottom:-10,near:1,far:295});
  shadow.mapSize.setScalar(2048);
  const near=cascadeShadowBias(shadow);
  Object.assign(shadow.camera,{left:-100,right:100,top:100,bottom:-100});
  shadow.mapSize.setScalar(1024);
  const far=cascadeShadowBias(shadow),pcss=cascadeShadowBias(shadow,true);
  assert.ok(far.normalBias>near.normalBias);assert.ok(far.bias<near.bias);
  assert.ok(pcss.bias<=far.bias&&pcss.normalBias>=far.normalBias);
  assert.ok(pcss.normalBias<=.25&&pcss.bias>=-.0018);
  assert.ok(Math.abs(.024/directionalPenumbraScale(shadow)-(200/1024)/294)<1e-10);
});
