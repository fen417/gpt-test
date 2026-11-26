
import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyM05Edits,validateM05Edits,applySculpt,terrainWithEdits,modelColliders,applyBoxEdit,scatterPositions,inspectM05Edits,sampleRoad,gradeRoad} from '../shared/campaign/m05-editor.js';
import {rayAffineBox} from '../shared/geometry.js';
test('empty editor schema and invalid duplicate ids',()=>{
 const d=emptyM05Edits();assert.deepEqual(validateM05Edits(d),[]);
 const m={id:'a',name:'x',asset:'a'.repeat(64)+'.glb',position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],colliders:[],shadow:true,detail:'low'};
 d.models=[m,m];assert.ok(validateM05Edits(d).length);
});
test('terrain edit updates height and raycast together',()=>{
 const grid={min:0,cell:4,count:2},base=new Float32Array(9);
 const edits=applySculpt(grid,base,{}, {x:4,z:4,radius:4,strength:2,mode:'raise'});
 const t=terrainWithEdits(grid,base,edits);assert.equal(t.heightAt(4,4),2);
 assert.equal(t.raycast({x:4,y:10,z:4},{x:0,y:-1,z:0},20),8);
 assert.equal(base[4],0);
});
test('model colliders rotate and scale with instance',()=>{
 const [b]=modelColliders({id:'test',position:[10,2,20],rotation:[0,Math.PI/2,0],scale:[2,1,1],colliders:[{center:[1,0,0],size:[2,2,2]}]});
 assert.ok(Math.abs(b.obb.center.z-18)<1e-8);assert.equal(b.obb.half[0],2);
 assert.equal(rayAffineBox({x:10,y:10,z:18},{x:0,y:-1,z:0},b.obb,20),7);
});
test('protected mission boxes cannot be removed',()=>{
 const b={id:'m05-worker-door',missionDynamic:true};
 assert.equal(applyBoxEdit(b,{removed:true}),b);
 assert.equal(applyBoxEdit({id:'barrier-2'},{removed:true}),null);
});

test('scatter deterministic and respects spacing/slope',()=>{
 const opts={x:0,z:0,radius:20,count:15,seed:42,minScale:.6,maxScale:1.4,minSpacing:2,maxSlope:.6,heightAt:()=>0};
 const a=scatterPositions(opts);assert.equal(a.length,15);assert.deepEqual(a,scatterPositions(opts));
 for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++)assert.ok(Math.hypot(a[i].position[0]-a[j].position[0],a[i].position[2]-a[j].position[2])>=2);
 assert.equal(scatterPositions({...opts,heightAt:x=>x*10}).length,0);
});
test('local collider rotation composes with nonuniform instance scale',()=>{
 const [b]=modelColliders({id:'x',position:[0,0,0],rotation:[0,0,0],scale:[2,1,1],colliders:[{center:[0,0,0],size:[2,2,4],rotation:[0,Math.PI/2,0]}]});
 assert.ok(Math.abs(b.w-8)<1e-7);assert.ok(Math.abs(b.d-2)<1e-7);
});
test('map diagnostics detect buried edited sites',()=>{
 const d=emptyM05Edits();d.sites.a=[4,-1,4];
 const issues=inspectM05Edits({boxes:[],sites:{a:{}},routes:{},fuelRoutes:{}},{min:0,cell:4,count:2},new Float32Array(9),d);
 assert.ok(issues.some(i=>i.key==='site:a'&&i.message.includes('под землёй')));
});
test('material overrides validated; hidden solid rejected',()=>{
 const d=emptyM05Edits(),m={id:'a',name:'x',asset:'a'.repeat(64)+'.glb',position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],colliders:[],shadow:true,detail:'low',materials:{'0:0':{roughness:.4,color:'#ffaa33'}}};
 d.models=[m];assert.deepEqual(validateM05Edits(d),[]);
 m.materials['0:0'].roughness=2;assert.ok(validateM05Edits(d).length);m.materials['0:0'].roughness=.4;
 m.detail='high';m.colliders.push({center:[0,0,0],size:[1,1,1]});assert.ok(validateM05Edits(d).length);
});

test('spline reaches endpoints and grading preserves source',()=>{
 const road={points:[[4,4],[12,4],[20,12]],width:4};
 const p=sampleRoad(road.points);assert.deepEqual(p[0],[4,4]);assert.deepEqual(p.at(-1),[20,12]);assert.ok(p.length>3);
 const grid={min:0,cell:4,count:8},h=new Float32Array(81);h[1*9+3]=10;
 const result=gradeRoad(grid,h,{},road);assert.ok(Object.keys(result).length>0);assert.equal(h[12],10);
});

import {createEditorSandbox,EDITOR_GRID,FLAT_HEIGHTS} from '../shared/editor-maps.js';
test('new sandbox has two opposite team spawns and real collision data',()=>{
 const d=emptyM05Edits();d.sites.spawnA=[-20,0,10];const map=createEditorSandbox('editor-0123456789abcdef',{name:'Test map',size:256},d);
 assert.equal(map.tdmLoadout,'class');assert.equal(map.size,256);assert.deepEqual(map.spawns[0],{x:-20,y:0,z:10});assert.equal(map.terrain.heightAt(0,0),0);assert.equal(FLAT_HEIGHTS.length,(EDITOR_GRID.count+1)**2);
});

test('sandbox gameplay points become real simulation spawns and objectives',()=>{
 const d=emptyM05Edits();d.gameplay={mode:'conquest',items:[{id:'ep-0000000000000001',kind:'capture',x:0,z:0,yaw:0,name:'Center'},{id:'ep-0000000000000002',kind:'spawn',team:0,x:-10,z:15,yaw:1},{id:'ep-0000000000000003',kind:'vehicle',team:1,x:20,z:20,yaw:2,type:'humvee'}]};
 const map=createEditorSandbox('editor-0123456789abcdef',{name:'Test',size:256},d);
 assert.equal(map.tdmLoadout,undefined);assert.equal(map.points[0].id,'A');assert.equal(map.spawnPoints[0].length,2);assert.equal(map.vehicleSpawns[0].type,'humvee');
});
