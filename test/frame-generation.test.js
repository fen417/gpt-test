import test from 'node:test';
import assert from 'node:assert/strict';
import {FrameGenerationPolicy,FRAME_GENERATION_MODES} from '../src/frame-generation-policy.js';

const meta=(override={})=>({
  playerId:'p',mapId:'village',alive:true,weaponId:'m4',
  vehicleId:null,seat:null,scoped:false,aim:false,thirdPerson:false,
  yaw:0,pitch:0,x:0,y:1.7,z:0,...override,
});

test('Frame Generation defaults off and refuses to generate without two real frames',()=>{
  const policy=new FrameGenerationPolicy();
  assert.deepEqual(FRAME_GENERATION_MODES,['off','auto','1.5','2']);
  assert.equal(policy.shouldGenerate(16,meta()),false);
  policy.setMode('1.5');
  assert.equal(policy.shouldGenerate(16,meta()),false);
  policy.noteReal(16,meta(),10);
  assert.equal(policy.shouldGenerate(32,meta()),false);
  policy.noteReal(32,meta(),10);
  assert.equal(policy.summary().historyReady,true);
});

test('1.5x runs only one synthetic presentation per two native frames',()=>{
  const p=new FrameGenerationPolicy();p.setMode('1.5');
  p.noteReal(16,meta(),10);p.noteReal(32,meta(),10);
  assert.equal(p.shouldGenerate(48,meta()),false);p.noteReal(48,meta(),10);
  assert.equal(p.shouldGenerate(64,meta()),false);p.noteReal(64,meta(),10);
  assert.equal(p.shouldGenerate(80,meta()),true);p.noteGenerated(80);
  assert.equal(p.shouldGenerate(96,meta()),false);p.noteReal(96,meta(),10);
  assert.equal(p.shouldGenerate(112,meta()),false);
  assert.equal(p.summary().realFrames,5);
  assert.equal(p.summary().generatedFrames,1);
});

test('2x generates alternate frames while input and simulation remain external',()=>{
  const p=new FrameGenerationPolicy();p.setMode('2');
  p.noteReal(16,meta(),9);p.noteReal(32,meta(),9);
  assert.equal(p.shouldGenerate(48,meta()),false);p.noteReal(48,meta(),9);
  assert.equal(p.shouldGenerate(64,meta()),true);p.noteGenerated(64);
  assert.equal(p.shouldGenerate(80,meta()),false);
});

test('camera cuts, teleports, weapon switches and stale source frames are rejected',()=>{
  const p=new FrameGenerationPolicy();p.setMode('1.5');
  p.noteReal(16,meta(),9);p.noteReal(32,meta(),9);
  assert.equal(p.shouldGenerate(40,meta({yaw:.2})),false);
  assert.equal(p.shouldGenerate(40,meta({x:15})),false);
  assert.equal(p.shouldGenerate(40,meta({weaponId:'sniper'})),false);
  assert.equal(p.shouldGenerate(40,meta({scoped:true})),false);
  assert.equal(p.shouldGenerate(100,meta()),false);
  p.noteReal(100,meta({mapId:'quarry'}),9);
  assert.equal(p.summary().historyReady,false);
});

test('slow frame timing suppresses auto mode but explicit mode remains user controlled',()=>{
  const p=new FrameGenerationPolicy();p.setMode('auto');
  p.noteReal(16,meta(),38);p.noteReal(32,meta(),39);
  p.noteReal(48,meta(),40);
  p.noteReal(64,meta(),39);
  assert.equal(p.shouldGenerate(80,meta()),false);
  p.setMode('2');
  assert.equal(p.summary().historyReady,false);
  p.noteReal(96,meta(),9);p.noteReal(112,meta(),9);
  assert.equal(p.shouldGenerate(128,meta()),false);
  assert.equal(p.shouldGenerate(144,meta()),true);
  p.setMode('off');
  assert.equal(p.shouldGenerate(160,meta()),false);
});
