import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../shared/simulation.js';
import {findBotPath,walkableSegment} from '../shared/bot-navigation.js';
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
