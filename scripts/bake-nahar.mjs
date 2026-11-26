import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {NAHAR} from '../shared/campaign/nahar.js';
import {villageLayoutKey} from '../src/village-layout-key.js';
import {packMap} from './pack-map.mjs';

const [blender='blender',...options]=process.argv.slice(2);
const stage=resolve('.perf-local/nahar');
const assets=resolve('src/assets/nahar');
await Promise.all([mkdir(stage,{recursive:true}),mkdir(assets,{recursive:true})]);
const spacing=NAHAR.terrain.cell,limit=NAHAR.size/2;
const heights=[];
for(let z=-limit;z<=limit;z+=spacing){
  const row=[];
  for(let x=-limit;x<=limit;x+=spacing)row.push(NAHAR.terrain.heightAt(x,z));
  heights.push(row);
}
const plan=resolve(stage,'plan.json');
await writeFile(plan,JSON.stringify({spacing,limit,heights,roads:NAHAR.roads,
  parts:NAHAR.boxes.filter(b=>!b.missionDynamic&&!b.collisionOnly)}));
const result=spawnSync(blender,['--background','--factory-startup','--python-exit-code','1','--python',
  resolve('art-source/nahar/build_nahar.py'),'--',plan,stage,stage,...options],{stdio:'inherit',windowsHide:true});
if(result.error)throw result.error;
if(result.status!==0)process.exit(result.status??1);
await packMap(stage,assets);
await writeFile(resolve(assets,'manifest.json'),JSON.stringify({layout:villageLayoutKey(NAHAR),span:NAHAR.size})+'\n');
