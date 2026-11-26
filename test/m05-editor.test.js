
import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyM05Edits,validateM05Edits,applySculpt,terrainWithEdits,modelColliders,applyBoxEdit,scatterPositions,inspectM05Edits} from '../shared/campaign/m05-editor.js';
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
