import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../shared/simulation.js';
import {MAPS,EYE_HEIGHT,PLAYER_RADIUS} from '../shared/world.js';
import {rayCollider,overlapsCollider} from '../shared/asset-colliders.js';
import {uprightBox} from '../shared/geometry.js';

function referenceCollides(sim,x,z,y,radius,height){
  const half=sim.map.size/2;
  if(Math.abs(x)>half-2||Math.abs(z)>half-2||x<(sim.map.shoreX??-Infinity)+radius)return true;
  const area=sim.map.playArea;
  if(area&&(x<area.minX+radius||x>area.maxX-radius||z<area.minZ+radius||z>area.maxZ-radius))return true;
  const cell=sim.collisionCell,size=sim.collisionSize;
  const loX=Math.max(0,Math.floor((x-radius+half)/cell)),hiX=Math.min(size-1,Math.floor((x+radius+half)/cell));
  const loZ=Math.max(0,Math.floor((z-radius+half)/cell)),hiZ=Math.min(size-1,Math.floor((z+radius+half)/cell));
  for(let zCell=loZ;zCell<=hiZ;zCell++)for(let xCell=loX;xCell<=hiX;xCell++)
    for(const box of sim.collisionBins[zCell*size+xCell]){
      if(box.obb||box.parts){
        if(overlapsCollider(uprightBox(x,y,z,radius,height),box))return true;
        continue;
      }
      if(box.overhead&&y+height<=box.minY)continue;
      if(y<box.h&&x>box.minX-radius&&x<box.maxX+radius&&z>box.minZ-radius&&z<box.maxZ+radius)return true;
    }
  return false;
}

for(const mapId of Object.keys(MAPS)){
  test(`collision broadphase preserves solid geometry on ${mapId}`,()=>{
    const sim=new Simulation({mapId,bots:0});
    const area=sim.map.playArea??{minX:-sim.map.size/2+4,maxX:sim.map.size/2-4,minZ:-sim.map.size/2+4,maxZ:sim.map.size/2-4};
    // Include roof/floor heights and samples crossing the 16 m bins.
    for(let i=0;i<128;i++){
      const x=area.minX+(area.maxX-area.minX)*((i*37%127)/127);
      const z=area.minZ+(area.maxZ-area.minZ)*((i*73%127)/127);
      const y=sim.groundAt(x,z)+(i%5===0?3.1:i%5===1?-.15:.025);
      const actual=sim.collides(x,z,y,PLAYER_RADIUS,EYE_HEIGHT);
      const expected=referenceCollides(sim,x,z,y,PLAYER_RADIUS,EYE_HEIGHT);
      assert.equal(actual,expected,`${mapId} unexpected collision at ${x}, ${z}, ${y}`);
    }
  });
  test(`grenade swept-bin query matches full-map collision rays on ${mapId}`,()=>{
    const sim=new Simulation({mapId,bots:0});
    const area=sim.map.playArea??{minX:-sim.map.size/2+4,maxX:sim.map.size/2-4,minZ:-sim.map.size/2+4,maxZ:sim.map.size/2-4};
    let totalCandidates=0;
    for(let i=0;i<60;i++){
      const x=area.minX+3+(area.maxX-area.minX-6)*((i*41%61)/61);
      const z=area.minZ+3+(area.maxZ-area.minZ-6)*((i*29%61)/61);
      const y=sim.groundAt(x,z)+.2+(i%5)*.27;
      const dx=Math.sin(i*1.3)*2.2,dz=Math.cos(i*.83)*2.2,dy=.4-(i%3)*.3;
      const length=Math.hypot(dx,dy,dz),direction={x:dx/length,y:dy/length,z:dz/length};
      const from={x,y,z};
      let reference=length,nearest=length;
      for(const box of sim.grenadeColliders)reference=Math.min(reference,rayCollider(from,direction,box,length));
      const candidates=sim.grenadeBoxes(x,z,x+dx,z+dz);
      totalCandidates+=candidates.length;
      for(const box of candidates)nearest=Math.min(nearest,rayCollider(from,direction,box,length));
      assert.ok(Math.abs(reference-nearest)<1e-7,`${mapId} missed grenade collision at ${x},${z}`);
    }
    if(mapId==='village')assert.ok(totalCandidates<sim.grenadeColliders.length*60*.3,
      'village should query nearby building colliders, not the entire map per grenade');
  });
}
