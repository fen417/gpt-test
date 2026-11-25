import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {collectGiTriangles,createGiTracer} from '../scripts/gi-geometry.mjs';
import {bakeProbeField,GI_VERSION,giStrength} from '../src/gi-probes.js';

test('real triangles respect doorway, transforms and transparent surfaces',()=>{
  const root=new THREE.Group(),mat=new THREE.MeshStandardMaterial({color:0xaf4325});
  for(const x of [-2,2]){
    const wall=new THREE.Mesh(new THREE.BoxGeometry(2,4,.2),mat);
    wall.position.set(x,2,0);root.add(wall);
  }
  const lintel=new THREE.Mesh(new THREE.BoxGeometry(2,1,.2),mat);lintel.position.set(0,3.5,0);root.add(lintel);
  const glass=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.MeshStandardMaterial({transparent:true}));glass.position.y=1;root.add(glass);
  const tracer=createGiTracer(collectGiTriangles(root));
  const toward={x:0,y:0,z:-1};
  assert.equal(tracer.trace({x:0,y:1,z:2},toward,4).hit,null);
  assert.ok(tracer.trace({x:2,y:1,z:2},toward,4).hit);
  assert.ok(tracer.trace({x:0,y:3.5,z:2},toward,4).hit);
});
test('geometry GI stores sky occlusion and blocks interpolation across a real floor',()=>{
  const root=new THREE.Group(),roof=new THREE.Mesh(new THREE.BoxGeometry(6,.2,6),new THREE.MeshStandardMaterial({color:0xc94c32}));
  roof.position.y=2;root.add(roof);
  const tracer=createGiTracer(collectGiTriangles(root)),map={id:'mesh-fixture',size:12,terrain:{heightAt:()=>0},boxes:[]};
  const f=bakeProbeField(map,{tracer,spacing:1});
  const at=(slot,x,z)=>((z+Math.floor(slot/4)*f.nz)*f.nx*4+x+(slot%4)*f.nx)*4;
  assert.equal(f.version,GI_VERSION);assert.equal(f.sourceType,'visual-triangles');
  assert.ok(f.data[at(0,6,6)+3]<f.data[at(0,0,0)+3]);
  assert.equal(f.data[at(7,6,6)],0);
  assert.equal(f.data[at(7,0,0)],255);
  assert.equal(giStrength({intensity:3.5},'high',{campaign:true,nightVision:true}),0);
});
test('instances and material colors feed the geometry tracer',()=>{
  const m=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:0x00aa00}),2);
  m.setMatrixAt(0,new THREE.Matrix4().makeTranslation(-2,1,0));m.setMatrixAt(1,new THREE.Matrix4().makeTranslation(2,1,0));
  const scene=new THREE.Group();scene.add(m);
  const tracer=createGiTracer(collectGiTriangles(scene));
  assert.equal(tracer.triangleCount,24);
  const hit=tracer.trace({x:2,y:1,z:2},{x:0,y:0,z:-1},4).hit;
  assert.ok(hit&&hit.color[1]>hit.color[0]);
});
