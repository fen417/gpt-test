import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../shared/simulation.js';
import {MAPS} from '../shared/world.js';

// The optimization must work on every shipped map and keep physics at 45 Hz.
// AI is deliberately updated less often, but the world is still stepped every tick.
for(const mapId of Object.keys(MAPS)){
  test(`staggered bot decisions stay bounded on ${mapId} without skipping physics`,()=>{
    const sim=new Simulation({bots:8,mapId,random:()=>.5});
    const bots=[...sim.players.values()].filter(p=>p.bot);
    let calls=0;
    const original=sim.thinkBot.bind(sim);
    sim.thinkBot=(p,dt)=>{
      const last=p.botThinkLastAt;
      original(p,dt);
      if(p.botThinkLastAt!==last)calls++;
    };
    const dt=1/45,ticks=90;
    for(let tick=0;tick<ticks;tick++)sim.step(dt);
    assert.ok(Math.abs(sim.time-ticks*dt)<1e-6,'physics time advances for every tick');
    assert.ok(calls>0 && calls<ticks*bots.length*.7,`AI decisions were not throttled: ${calls}`);
    for(const bot of bots){
      assert.ok([bot.x,bot.y,bot.z,bot.yaw].every(Number.isFinite),`invalid ${mapId} bot pose`);
      assert.ok(Array.isArray(bot.botPath),`missing ${mapId} navigation`);
    }
  });
}
