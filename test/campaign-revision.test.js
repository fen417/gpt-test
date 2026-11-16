import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import mission from '../public/campaign/m01/mission.json' with {type:'json'};
import locale from '../public/campaign/m01/ru.json' with {type:'json'};
import manifest from '../public/campaign/m01/voice/manifest.json' with {type:'json'};
import {ALHADRA} from '../shared/campaign/alhadra.js';
import {CampaignSimulation} from '../shared/campaign/simulation.js';
import {cinematicCameraPose,cameraHasClearance,cameraSegmentClear} from '../src/campaign/camera.js';
import {getAssetColliders,overlapsCollider,rayCollider} from '../shared/asset-colliders.js';
import {uprightBox} from '../shared/geometry.js';

function create(){const s=new CampaignSimulation(mission,{lines:locale.lines,seed:14});s.campaign.command({type:'skip'});s.campaign.command({type:'loadout'});s.campaign.command({type:'skip'});return s;}
function tick(s,seconds){for(let i=0;i<Math.ceil(seconds*60);i++){s.setInput('local',{});s.step(1/60);}}

test('wadi rock cover has bevelled collision instead of a solid mountain rectangle',()=>{
  const colliders=getAssetColliders(ALHADRA),rock=ALHADRA.boxes.find(b=>b.kind==='rock'&&b.x===-192&&b.z===-126);
  assert(rock);const collider=colliders.find(b=>b.id===rock.id);assert(collider.parts?.[0].convex);assert(collider.parts[0].triangles);
  const corner={x:rock.x+rock.w*.48,y:rock.baseY+rock.h*.65,z:rock.z+rock.d*.48};
  assert.equal(overlapsCollider(uprightBox(corner.x,corner.y,corner.z,.02,.1),collider),false);
  const x=rock.x+2.6,z=rock.z,walker=uprightBox(x,ALHADRA.terrain.heightAt(x,z),z,.32,1.65);
  assert(!colliders.some(b=>overlapsCollider(walker,b)),'the old 7 by 5 metre rectangle no longer blocks the wadi beside the stones');
  assert(Number.isFinite(rayCollider({x:rock.x,y:rock.baseY+rock.h+2,z:rock.z},{x:0,y:-1,z:0},collider,10)),'visible rock still blocks shots through its centre');
});
test('all cinematic splines keep the camera and every swept segment clear of world geometry',()=>{
  for(const [id,scene] of Object.entries(mission.cutscenes)){
    let previous=null;
    for(let frame=0;frame<=240;frame++){
      const pose=cinematicCameraPose(ALHADRA,scene,scene.duration*frame/240,previous);
      assert(cameraHasClearance(ALHADRA,pose.position),`${id} point ${frame}`);
      if(previous)assert(cameraSegmentClear(ALHADRA,previous,pose.position),`${id} sweep ${frame}`);
      previous=pose.position;
    }
  }
});
test('the four expedition soldiers are around the briefing table without moving authoritative actors',()=>{
  const s=new CampaignSimulation(mission,{lines:locale.lines}),snapshot=s.snapshot();
  for(const id of mission.allies){const p=snapshot.players.find(p=>p.id===id);assert(Math.hypot(p.x+80,p.z+30)<6);assert(s.players.get(id).x<-190);}
});
test('the starting truck has terrain support at all six wheel contacts',()=>{
  const truck=ALHADRA.boxes.find(b=>b.kind==='truck'&&b.x<-190);assert(truck);
  const heights=[-1.38,1.38].flatMap(x=>[-2.52,-.84,2.24].map(z=>ALHADRA.terrain.heightAt(truck.x+x,truck.z+z)));
  assert(Math.max(...heights)-Math.min(...heights)<.04);assert(Math.max(...heights.map(y=>Math.abs(y-truck.baseY)))<.04);
});
test('the courier drives all the way out behind the depot with ordinary vehicle physics',()=>{
  const sim=new CampaignSimulation(mission,{lines:locale.lines});
  const evac=sim.vehicles.find(vehicle=>vehicle.id==='campaign-evac-car');
  sim.campaign.startCourierEvac(evac);
  const route=evac.campaignRoute;
  for(let i=0;i<12000&&route.index<route.points.length;i++)sim.moveVehicle(evac,{},1/60);
  assert.equal(route.index,route.points.length);
  assert.ok(evac.x<-142);
});
test('the market canopy and table openings let shots reach only solid parts',()=>{
  const sim=new CampaignSimulation(mission,{lines:locale.lines});
  const {x,z}=ALHADRA.boxes.find(box=>box.id==='alhadra-well-stall-0-counter');
  const across=(x,y)=>sim.lineClear({x,y,z:z-.85},{x,y,z:z+.85});
  assert.equal(across(x,.45),true);
  assert.equal(across(x,.89),false);
  assert.equal(across(x-3.1/2+.13,.45),false);
  assert.equal(sim.lineClear({x,y:2.85,z},{x,y:2.24,z}),true);
});
test('route cover uses several grounded asset types; sandbags belong to strongpoints',()=>{
  const cover=ALHADRA.boxes.filter(b=>b.campaignCover),kinds=new Set(cover.map(b=>b.kind));assert(kinds.size>=4);
  const sand=cover.filter(b=>b.kind==='sandbags');assert(sand.length<=12);assert(sand.every(b=>b.modelRotation));
  assert(ALHADRA.structures.filter(s=>s.kind==='village-house').length===14);
});
test('Kane is not forcibly wounded or teleported just for walking toward the depot',()=>{
  const s=create(),c=s.campaign;s.thinkBot=()=>{};c.runtime.state.stage=3;c.place(c.player,-18,2);const k=s.players.get('kane'),position=[k.x,k.z];tick(s,40);
  assert(k.alive);assert.equal(k.hp,100);assert.equal(k.downed,undefined);assert.deepEqual([k.x,k.z],position);
});
test('distance alone never teleports an unstuck ally, including while the player is down',()=>{
  const s=create(),c=s.campaign,a=s.players.get('lasko');c.place(a,-225,-100);const position=[a.x,a.z];
  for(let i=0;i<900;i++)c.recoverAlly(a,1/60);assert.deepEqual([a.x,a.z],position);
  c.down(c.player);a.stuckTime=20;a.ai={mode:'blocked'};a.input.forward=1;
  for(let i=0;i<900;i++)c.recoverAlly(a,1/60);assert.deepEqual([a.x,a.z],position);
});
test('the medic completes a six-second revive without being mistaken for a stuck soldier',()=>{
  const s=create(),c=s.campaign;c.pending=[];for(const [id,p] of s.players)if(p.team===1)s.players.delete(id);
  c.place(s.players.get('lasko'),c.player.x+1.7,c.player.z);c.down(c.player);const medic=s.players.get('lasko'),position=[medic.x,medic.z];
  tick(s,5.8);assert(c.player.downed);assert(Math.hypot(medic.x-position[0],medic.z-position[1])<.3);
  tick(s,.4);assert.equal(c.player.downed,false);assert(c.player.hp>=40);
});
test('quiet sentries and officers hold posts; patrols walk rather than sprint',()=>{
  const s=create(),c=s.campaign;c.pending=[];for(const [id,p] of s.players)if(p.team===1)s.players.delete(id);
  c.runtime.state.stage=5;c.place(c.player,150,77);c.enqueue('stationGuards');c.flushSpawns();
  const positions=new Map([...s.players.values()].filter(p=>p.team===1).map(p=>[p.id,[p.x,p.z]]));
  tick(s,5);for(const [id,[x,z]] of positions){const p=s.players.get(id);assert.equal(p.input.sprint,false);assert(Math.hypot(p.x-x,p.z-z)<.25);}
});
test('the explosion camera starts two seconds before detonation and preserves checkpoint two',()=>{
  const s=create(),c=s.campaign;s.thinkBot=()=>{};c.runtime.state.stage=3;c.fuseUntil=s.time+4;tick(s,1.9);
  assert.equal(c.cutscene?.id,'midpoint');assert(!c.flags.depotDestroyed);assert(c.fuel.every(f=>!f.destroyed));
  tick(s,2.3);assert(c.flags.depotDestroyed);assert(c.fuel.every(f=>f.destroyed));assert(c.trucks.every(t=>t.destroyed));assert.equal(c.checkpoint,2);
});
async function verifyVoicePack(root,locale,manifest,budget){
  assert.deepEqual(manifest.clips.map(clip=>clip.id).sort(),Object.keys(locale.lines).sort());
  const profiles=Object.values(manifest.profiles);
  assert.equal(new Set(profiles.map(profile=>profile.voiceId)).size,profiles.length);
  let bytes=0;
  for(const clip of manifest.clips){
    const line=locale.lines[clip.id],data=await readFile(new URL(line.audio,root));
    assert.equal(clip.speaker,line.speaker);
    assert.ok(manifest.profiles[line.speaker]?.voiceId);
    assert.equal(data.toString('ascii',0,4),'OggS');
    assert.ok(data.includes(Buffer.from('OpusHead')));
    assert.ok(clip.seconds>0&&line.duration>=clip.seconds);
    assert.equal(clip.bytes,data.length);
    bytes+=data.length;
  }
  assert.ok(bytes<=budget);
  assert.equal(bytes,manifest.totalBytes);
}
test('every mission 1 line has an Opus recording, a voice profile and enough playback time',async()=>{
  assert.equal(Object.keys(manifest.profiles).length,8);
  await verifyVoicePack(new URL('../public/campaign/m01/',import.meta.url),locale,manifest,mission.audioBudgets.voice);
  for(const scene of Object.values(mission.cutscenes)){
    let end=0;
    for(const [at,id] of scene.lines){
      assert.ok(at>=end,id);
      end=at+locale.lines[id].duration;
    }
    assert.ok(scene.duration>=end);
  }
});

test('missions 2–4 have complete voice packs and reuse the cast across missions',async()=>{
  const established={...manifest.profiles};
  const aliases={timo:'ray',rafa:'kim'};
  for(const id of ['m02','m03','m04']){
    const root=new URL(`../public/campaign/${id}/`,import.meta.url);
    const readJson=async path=>JSON.parse(await readFile(new URL(path,root),'utf8'));
    const [locale,voice,definition]=await Promise.all(['ru.json','voice/manifest.json','mission.json'].map(readJson));
    await verifyVoicePack(root,locale,voice,definition.audioBudgets?.voice??1000000);
    for(const [speaker,profile] of Object.entries(voice.profiles)){
      const key=aliases[speaker]??speaker;
      if(established[key])assert.equal(profile.voiceId,established[key].voiceId,`${id} ${speaker}`);
      else established[key]=profile;
    }
  }
});
