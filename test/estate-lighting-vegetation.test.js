import test from 'node:test';
import assert from 'node:assert/strict';
import {gardenTriangleKind} from '../src/estate-garden.js';
import {estateInterior,lampContribution} from '../src/estate-lighting.js';
import {architectureAOAmount,architectureIntensity} from '../src/architecture-lightmap-format.js';
test('mixed garden keeps floor and unrelated foliage',()=>{
 const plants=[{type:'tree',x:10,z:5},{type:'hedge',x:0,z:0,w:1.5,d:6,h:1.2}];
 assert.equal(gardenTriangleKind(10,0,5,plants),'ground');
 assert.equal(gardenTriangleKind(10,4,5,plants),'replace');
 assert.equal(gardenTriangleKind(0,1.2,1,plants),'replace');
 assert.equal(gardenTriangleKind(3,4,8,plants),'leaves');
});
test('fixture attenuation and bounded estate lighting',()=>{
 assert.equal(estateInterior(0,2,0),true);assert.equal(estateInterior(16,2,0),false);
 assert.ok(lampContribution(1,1)>lampContribution(3,1));assert.equal(lampContribution(6,1),0);
 assert.ok(architectureAOAmount('high',{estate:true,gi:true,screenAO:true})<.4);
 assert.equal(architectureIntensity('high'),.85);
 assert.equal(architectureIntensity('high',{estate:true,nightVision:true}),0);
 assert.ok(architectureIntensity('high',{estate:true})>1);
});
