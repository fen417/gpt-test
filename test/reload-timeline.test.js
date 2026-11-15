import test from 'node:test';
import assert from 'node:assert/strict';
import {ReloadTimeline} from '../src/reload-timeline.js';
import {Prediction} from '../src/network.js';
import {Simulation,sanitizeInput} from '../shared/simulation.js';
import {INPUT_STEP} from '../shared/snapshot-codec.js';

test('reload visuals continue monotonically across jittery snapshot progress',()=>{
  const clock=new ReloadTimeline(),duration=2;
  let last=clock.update({reloading:true,progress:0,duration,weaponKey:'player/ar416',dt:1/60});
  for(let frame=0;frame<100;frame++){
    // The server reports 20 Hz, with occasional delayed/out-of-order phases.
    const target=(frame%3===0)?Math.max(0,(frame-9)/120):last;
    const phase=clock.update({reloading:true,progress:target,duration,weaponKey:'player/ar416',dt:1/60});
    assert.ok(phase>=last,'reload animation must never move backwards');
    assert.ok(phase-last<.02,'reload animation must not jump forward');
    last=phase;
  }
  assert.ok(last>.55&&last<1);
  assert.equal(clock.update({reloading:false,progress:0,duration,weaponKey:'player/ar416',dt:1/60}),1);
  assert.equal(clock.update({reloading:true,progress:.1,duration,weaponKey:'player/p19',dt:1/60}),.1);
});

test('predicted reload phase is derived from locally replayed input frames',()=>{
  const sim=new Simulation({bots:0,mapId:'quarry'}),player=sim.addPlayer('p','Tester',0);
  player.ammo=7;player.reserve=80;
  const snapshot=sim.snapshot(),prediction=new Prediction('quarry');
  prediction.reconcile(snapshot.players.find(p=>p.id===player.id),0,snapshot.vehicles,snapshot.time);
  prediction.add({sequence:1,dt:INPUT_STEP,input:sanitizeInput({reload:true})});
  const start=prediction.sample(1/60);
  assert.equal(start.reloading,true);assert.ok(start.reloadProgress<=.01);
  prediction.add({sequence:2,dt:INPUT_STEP,input:sanitizeInput({reload:false})});
  const next=prediction.sample(1/60);
  assert.ok(next.reloadProgress>start.reloadProgress,'reload progress must advance with prediction');
});
