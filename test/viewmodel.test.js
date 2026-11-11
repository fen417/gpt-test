import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {prepareViewModel,distanceToCover,drawWorldAndViewModel,VIEWMODEL_LAYER} from '../src/viewmodel.js';
import {pairMaterials,clonePairedMaterial} from '../src/visuals.js';
import {createSoldierRig,cloneSoldierRig,animateSoldier,soldierHit,soldierThrow,beginDeath,animateDeath} from '../src/soldier.js';

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

test('soldier rig bakes into a single skinned mesh and animates locomotion, strafe twist, throw, flinch and death',()=>{
  const fakeCanvas={width:8,height:8,getContext:()=>({fillStyle:'',fillRect(){},drawImage(){}})};
  const prevDoc=globalThis.document;
  globalThis.document={createElement:()=>fakeCanvas};
  try{
    const owner={};
    for(const classId of ['assault','medic','support','recon'])for(const team of [0,1]){
      const template=createSoldierRig(owner,{id:'t',team,classId,x:0,y:0,z:0,shotSeq:0});
      const rig=cloneSoldierRig(template,{id:'p',team,classId,x:0,y:0,z:0,shotSeq:0});
      let skinnedCount=0;
      rig.group.traverse(n=>{if(n.isSkinnedMesh)skinnedCount++;});
      assert.equal(skinnedCount,1,'each soldier should use a single SkinnedMesh for 1 draw call');
      assert.equal(rig.body.material,owner.soldierAtlas,'all classes and teams share one atlas material');
      animateSoldier(rig,{dt:.05,player:{x:0,y:0,z:0,yaw:0,pitch:0,shotSeq:0}});
      rig.group.position.set(.25,0,-.1);
      animateSoldier(rig,{dt:.05,player:{x:.25,y:0,z:-.1,yaw:0,pitch:.2,sprint:true,shotSeq:1}});
      assert(Math.abs(rig.pose.rotation.y)>0,'strafing rotates pelvis toward movement direction');
      soldierHit(rig,0,5);assert.equal(rig.flinch,1);
      soldierThrow(rig);animateSoldier(rig,{dt:.2,player:{x:1,y:0,z:0,yaw:0,pitch:0,shotSeq:1}});
      assert(rig.throwAge>0);
      beginDeath(rig,0);animateDeath(rig,{age:.5});
      assert(Math.abs(rig.group.rotation.x)>.2,'death animation topples the soldier');
    }
  }finally{
    if(prevDoc===undefined)delete globalThis.document;else globalThis.document=prevDoc;
  }
});

test('paired high and low quality materials clone cleanly without circular userData serialization errors',()=>{
  const high=new THREE.MeshStandardMaterial({color:0x8899aa,roughness:.9,metalness:.1});
  const low=new THREE.MeshLambertMaterial({color:0x8899aa});
  high.userData.tileSize=4;
  low.userData.tileSize=4;
  const paired=pairMaterials(high,low);
  const cloned=clonePairedMaterial(paired,'#556677',0xffaa55,.25);
  assert.ok(cloned.isMeshStandardMaterial);
  assert.ok(cloned._lowMaterial?.isMeshLambertMaterial);
  assert.equal(cloned._lowMaterial._highMaterial,cloned);
  assert.equal(cloned.userData.tileSize,4);
});
