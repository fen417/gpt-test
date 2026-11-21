import { writeFile } from 'node:fs/promises';
import { QUARRY_MAP } from '../shared/quarry.js';
import { QUARRY_KITS, quarryKitPlan } from '../shared/quarry-sites.js';

const {size,terrain,structures,roads,boxes,points}=QUARRY_MAP;
const heights=[];
for(let z=-size/2;z<=size/2;z+=terrain.cell){
  for(let x=-size/2;x<=size/2;x+=terrain.cell)heights.push(terrain.heightAt(x,z));
}
const kits=Object.fromEntries(Object.entries(QUARRY_KITS).map(([name,kit])=>
  [name,{...kit,...quarryKitPlan(kit)}]));
await writeFile(process.argv[2],JSON.stringify({size,cell:terrain.cell,heights,kits,structures,roads,boxes,points}));
