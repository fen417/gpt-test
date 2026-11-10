import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {prepareViewModel,distanceToCover,drawWorldAndViewModel,VIEWMODEL_LAYER} from '../src/viewmodel.js';

test('opaque gun parts retain depth testing and depth writing within their own render layer',()=>{
  const gun=new THREE.Group(),receiver=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial({depthTest:false,depthWrite:false}));
  const glass=new THREE.Mesh(new THREE.PlaneGeometry(),new THREE.MeshStandardMaterial({transparent:true,opacity:.3,depthTest:false,depthWrite:false}));
  gun.add(receiver,glass);prepareViewModel(gun);
  assert.equal(receiver.material.depthTest,true);assert.equal(receiver.material.depthWrite,true);assert.equal(receiver.material.opacity,1);
  assert.equal(glass.material.depthTest,true);assert.equal(glass.material.opacity,.3);assert.equal(glass.material.depthWrite,false);
  assert.equal(receiver.layers.mask,1<<VIEWMODEL_LAYER);assert.equal(glass.layers.mask,1<<VIEWMODEL_LAYER);
});

test('view-model pass clears only depth after the world, then restores renderer and camera state',()=>{
  const operations=[],camera=new THREE.PerspectiveCamera(),scene=new THREE.Scene();camera.layers.enable(3);const original=camera.layers.mask;
  const renderer={autoClear:true,info:{autoReset:true,reset(){operations.push('reset');}},render(s,c){operations.push({layer:c.layers.mask,autoClear:this.autoClear});},clearDepth(){operations.push('depth');}};
  drawWorldAndViewModel(renderer,scene,camera,{visible:true});
  assert.deepEqual(operations,['reset',{layer:1,autoClear:true},'depth',{layer:2,autoClear:false}]);
  assert.equal(camera.layers.mask,original);assert.equal(renderer.autoClear,true);assert.equal(renderer.info.autoReset,true);
});

test('close cover detection retracts the gun for forward walls but ignores walls behind and low cover',()=>{
  const eye={x:0,y:1.65,z:0},direction={x:0,y:0,z:-1};
  assert.equal(distanceToCover(eye,direction,[{x:0,z:-.9,w:2,d:.2,h:3}]),.8);
  assert.equal(distanceToCover(eye,direction,[{x:0,z:.9,w:2,d:.2,h:3}]),1.6);
  assert.equal(distanceToCover(eye,direction,[{x:0,z:-.9,w:2,d:.2,h:1}]),1.6);
});
