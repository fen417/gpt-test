import test from 'node:test';
import assert from 'node:assert/strict';
import {createTankRig,tankModelStats} from '../src/tank-model.js';
test('tank articulated and distant models stay within geometry and draw budgets',()=>{
  const rig=createTankRig(),stats=tankModelStats(rig);for(const [i,row] of stats.entries()){assert.ok(row.triangles<=[6000,2200,600][i]);assert.ok(row.draws<=[8,5,2][i]);}
  assert.ok(rig.levels[0].gun.parent===rig.levels[0].turret);assert.equal(rig.material.type,'MeshLambertMaterial');assert.equal(rig.material.transparent,false);
  rig.group.traverse(o=>o.geometry?.dispose());rig.material.dispose();
});
