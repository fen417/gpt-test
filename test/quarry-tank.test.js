import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../shared/simulation.js';
import {findBotPath,walkableSegment} from '../shared/bot-navigation.js';
import * as THREE from 'three';
import {createMapModelBuilder} from '../src/renderer.js';
test('quarry has mirrored objectives, bounded collision count and enterable concrete pillboxes',()=>{
  const sim=new Simulation({mapId:'quarry',bots:0}),map=sim.map;
  assert.ok(map.boxes.length<=360);
  for(const [a,b] of [['A','E'],['B','D']]){const p=map.points.find(p=>p.id===a),q=map.points.find(p=>p.id===b);assert.equal(p.x,-q.x);assert.equal(p.z,-q.z);}
  const bunkers=map.structures.filter(s=>s.kind==='pillbox');assert.equal(bunkers.length,10);
  for(const b of bunkers){const s=b.facing===Math.PI?-1:1,y=sim.groundAt(b.x,b.z),inside={x:b.x,y,z:b.z},outside={x:b.x,y,z:b.z+s*4.5};
    assert.ok(walkableSegment(sim,outside,inside,false),b.id+' door');
    const path=findBotPath(sim,outside,inside);assert.ok(path.length&&Math.hypot(path.at(-1).x-b.x,path.at(-1).z-b.z)<1,b.id+' navigation');
    assert.equal(sim.lineClear({x:b.x,y:y+1,z:b.z-s*5},{x:b.x,y:y+1,z:b.z}),false,b.id+' solid concrete');
    assert.equal(sim.lineClear({x:b.x,y:y+1.47,z:b.z-s*5},{x:b.x,y:y+1.47,z:b.z}),true,b.id+' embrasure');
  }
});
test('rendered bunker walls match the firing openings and do not add decorative ledges',()=>{
  const sim=new Simulation({mapId:'quarry',bots:0}),concrete=new THREE.MeshLambertMaterial(),owner=createMapModelBuilder({concrete,brick:concrete}),ray=new THREE.Raycaster();
  for(const b of sim.map.structures.filter(b=>b.kind==='pillbox')){
    owner.scene=new THREE.Group();owner.buildMapBoxes(sim.map.boxes.filter(p=>p.editorParent==='structure:'+b.id));owner.scene.updateMatrixWorld(true);
    const sign=b.facing===Math.PI?-1:1,y=sim.groundAt(b.x,b.z);
    ray.set(new THREE.Vector3(b.x,y+1.435,b.z),new THREE.Vector3(0,0,-sign));ray.far=4;assert.equal(ray.intersectObject(owner.scene,true).length,0,b.id+' muzzle clearance');
    ray.ray.origin.y=y+1;assert.ok(ray.intersectObject(owner.scene,true).length,b.id+' concrete blocks shots');
    ray.set(new THREE.Vector3(b.x,y+2,b.z),new THREE.Vector3(0,-1,0));ray.far=3;assert.ok(Math.abs(ray.intersectObject(owner.scene,true)[0].point.y-y)<1e-6,b.id+' exact floor height');
    owner.scene.traverse(o=>o.geometry?.dispose());
  }
});
