import test from 'node:test';
import assert from 'node:assert/strict';
import {BotSenseGrid} from '../shared/bot-sense-grid.js';
import {readFileSync} from 'node:fs';
import {staticShadowPrunePlan,withStaticShadowPruned,frameShadowCandidates,uploadChangedPrefix} from '../src/render-work.js';

test('bot broad phase retains order and updates moved players',()=>{
  const players=new Map(Array.from({length:32},(_,id)=>[id,{id,x:(id%8)*80-320,z:Math.floor(id/8)*80-160}]));
  const grid=new BotSenseGrid();grid.begin(players);
  const point={x:0,z:0},range=100;
  const expected=()=>[...players.values()].filter(p=>Math.hypot(p.x-point.x,p.z-point.z)<=range).map(p=>p.id);
  const actual=()=>[...grid.query(point,range,players)].filter(p=>Math.hypot(p.x-point.x,p.z-point.z)<=range).map(p=>p.id);
  assert.deepEqual(actual(),expected());
  const moved=players.get(0);moved.x=1;moved.z=-1;grid.sync(moved);
  assert.deepEqual(actual(),expected());
  moved.x=800;moved.z=900;grid.sync(moved);
  assert.deepEqual(actual(),expected());
  grid.end();assert.deepEqual([...grid.query(point,range,players)],[...players.values()]);
});

test('changed upload skips identical values and preserves pending ranges',()=>{
  const attr={array:new Float32Array([1,2,3,4]),itemSize:1,version:0,ranges:[],addUpdateRange(start,count){this.ranges.push({start,count});},set needsUpdate(v){if(v)this.version++;}};
  uploadChangedPrefix(attr,4);assert.equal(attr.version,1);
  uploadChangedPrefix(attr,4);assert.equal(attr.version,1);
  attr.array[2]=9;uploadChangedPrefix(attr,4);assert.equal(attr.version,2);
  assert.deepEqual(attr.ranges,[{start:0,count:4},{start:2,count:1}]);
  attr.needsUpdate=true;uploadChangedPrefix(attr,4);assert.deepEqual(attr.ranges.at(-1),{start:0,count:4});
});

function node(children=[],castShadow=false,visible=true){
  const n={children,castShadow,visible,isMesh:castShadow,parent:null,traverse(fn){fn(this);for(const c of this.children)c.traverse(fn);}};
  for(const c of children)c.parent=n;return n;
}
test('static shadow pruning preserves flag and other dynamic branches and restores on failure',()=>{
  const wall=node([],true),hidden=node([],true,false),building=node([wall,hidden]);
  const flag=node([],true),objective=node([flag]),ancestor=node([objective],true),root=node([building,ancestor]);
  const plan=staticShadowPrunePlan(root,new Set([wall,hidden,ancestor]),new Set([objective]));
  assert.deepEqual(plan.branches,[building]);assert.deepEqual(plan.casters,[ancestor]);
  assert.throws(()=>withStaticShadowPruned(plan,()=>{
    assert.equal(building.visible,false);assert.equal(ancestor.castShadow,false);
    assert.equal(objective.visible,true);assert.equal(flag.castShadow,true);
    throw Error('render failed');
  }),/render failed/);
  assert.equal(building.visible,true);assert.equal(hidden.visible,false);assert.equal(ancestor.castShadow,true);
});
test('cascade static passes share shadow candidate traversal only within a frame',()=>{
  const a=node([],true),b=node([],true),scene=node([a,b]);let visits=0;
  const traverse=scene.traverse.bind(scene);scene.traverse=fn=>{visits++;traverse(fn);};
  const owner={scene,frameCount:1};
  assert.deepEqual(frameShadowCandidates(owner),[a,b]);
  assert.equal(frameShadowCandidates(owner),frameShadowCandidates(owner));assert.equal(visits,1);
  owner.frameCount++;b.castShadow=false;
  assert.deepEqual(frameShadowCandidates(owner),[a]);assert.equal(visits,2);
});
test('WebGPU relief passes the exact WGSL step parameter name',()=>{
  const source=readFileSync(new URL('../src/webgpu-surface-relief.js',import.meta.url),'utf8');
  assert.match(source,/stepsMax:\s*i32/);
  assert.match(source,/stepsMax:\s*stepCount/);
  assert.doesNotMatch(source,/steps:\s*stepCount/);
});
