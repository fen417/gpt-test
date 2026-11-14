import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Simulation } from '../shared/simulation.js';

test('typed A* retains reference routes from both spawns on every map',async()=>{
  const reference=JSON.parse(await readFile(new URL('../docs/perf/navigation-reference.json',import.meta.url),'utf8'));
  for(const mapId of ['port','quarry','village']){
    const sim=new Simulation({bots:0,mapId,random:()=>.5});
    for(const item of reference.filter(item=>item.mapId===mapId))assert.deepEqual(sim.pathfind(item.start,item.target),item.path,`${mapId}: ${JSON.stringify(item.target)}`);
  }
});
