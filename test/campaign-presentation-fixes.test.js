import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import * as THREE from 'three';
import {installSoldierAsset,createAssetRig} from '../src/soldier-assets.js';
import {animateSoldier} from '../src/soldier.js';
import {ALHADRA} from '../shared/campaign/alhadra.js';
import {createPredictionWorld} from '../shared/simulation.js';
import {CampaignSimulation} from '../shared/campaign/simulation.js';
import {getSquadHud} from '../src/squad-ui.js';
import mission from '../public/campaign/m01/mission.json' with {type:'json'};

test('downed and prone real soldier rigs keep arms below the shoulders and recover after revival',()=>{
  for(const weaponId of ['ar416','p19']){
    const key=`0-assault-${weaponId}`,bytes=gunzipSync(readFileSync(new URL(`../src/assets/soldiers/${key}.bin.gz`,import.meta.url)));
    installSoldierAsset(key,bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
    const player={team:0,classId:'assault',weaponId,x:0,z:0,moveSpeed:0,grounded:true,shotSeq:0},material=new THREE.MeshBasicMaterial(),rig=createAssetRig({},player,material);
    for(const downed of [true,false]){
      rig.wrists.forEach(w=>w.rotation.set(1,2,-1));
      animateSoldier(rig,{dt:1/60,player:{...player,prone:true,downed}});rig.group.updateMatrixWorld(true);
      for(let i=0;i<2;i++){
        const shoulder=rig.arms[i].getWorldPosition(new THREE.Vector3()),elbow=rig.elbows[i].getWorldPosition(new THREE.Vector3()),hand=rig.wrists[i].getWorldPosition(new THREE.Vector3());
        assert(elbow.y<shoulder.y-.05&&hand.y<shoulder.y-.05,'arms rest toward the ground instead of rising behind the back');
        assert(elbow.y>.02&&hand.y>.05,'elbows and hands remain above the floor');
        assert(Math.abs(shoulder.distanceTo(elbow)-.315)<1e-6);assert(Math.abs(elbow.distanceTo(hand)-.275)<1e-6);
        if(downed){assert(hand.z<shoulder.z);assert(rig.wrists[i].quaternion.angleTo(new THREE.Quaternion())<1e-6);}
      }
    }
    animateSoldier(rig,{dt:1/60,player});rig.group.updateMatrixWorld(true);
    assert.equal(rig.campaignProne,false);assert(rig.arms[0].getWorldPosition(new THREE.Vector3()).y>1.3);
    rig.body.skeleton.dispose();for(const g of [rig.detailGeometry,rig.mediumGeometry,rig.distantGeometry])g.dispose();material.dispose();
  }
});

test('campaign houses have traversable doors, real side windows and a complete well shell',()=>{
  const world=createPredictionWorld(ALHADRA.id);
  for(const home of ALHADRA.homes){
    for(const side of [-1,1])for(const dx of [-.6,0,.6])for(const dz of [-.6,0,.6]){
      const x=home.x+dx,z=home.z+side*home.d/2+dz;
      assert(!world.collides(x,z),`${home.id} door ${side} at ${dx}, ${dz}`);
    }
    const base=ALHADRA.terrain.heightAt(home.x,home.z);
    for(const side of [-1,1])for(const end of [-1,1]){
      const x=home.x+side*home.w/2,z=home.z+end*home.d*.24;
      assert(world.lineClear({x:x-.8,y:base+1.7,z},{x:x+.8,y:base+1.7,z}),`${home.id} window opening`);
      assert(!world.lineClear({x:x-.8,y:base+.7,z},{x:x+.8,y:base+.7,z}),`${home.id} solid sill`);
    }
  }
  for(const side of [-1,1]){
    assert(world.collides(137+side*1.25,103));assert(world.collides(137,103+side*1.25));
    assert(ALHADRA.boxes.some(b=>b.kind==='village-wood'&&b.x===137+side*1.65&&b.z===103&&b.h===3.2));
  }
});

test('campaign squad HUD includes all five expedition members and tracks wounds and orders',()=>{
  const sim=new CampaignSimulation(mission);sim.campaign.cutscene=null;
  sim.campaign.down(sim.players.get('kane'));sim.campaign.order='hold';
  const view=getSquadHud(sim.snapshot(),'local');
  assert.equal(view.members.length,5);assert.deepEqual(view.members.map(p=>p.id),['local',...mission.allies]);
  assert(!view.members.some(p=>p.id==='courier'));assert(view.members.find(p=>p.id==='kane').downed);
  assert.equal(view.members.find(p=>p.squadLeader)?.id,'duran');assert.equal(view.order,'УДЕРЖИВАТЬ ПОЗИЦИЮ');assert.match(view.title,/5\/5/);
  const normal=getSquadHud({players:[{id:'local',team:0,squadId:1,squadLeader:true,alive:true},{id:'other',team:0,squadId:2,alive:true}]},'local');
  assert.equal(normal.members.length,1);assert.equal(normal.title,'Альфа · 1/4');assert.equal(normal.campaign,false);
});
