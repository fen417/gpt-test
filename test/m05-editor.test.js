
import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyM05Edits,validateM05Edits,applySculpt,terrainWithEdits,modelColliders,applyBoxEdit} from '../shared/campaign/m05-editor.js';
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
