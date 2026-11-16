import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../shared/campaign/catalog.json' with {type:'json'};
import mission from '../public/campaign/m02/mission.json' with {type:'json'};
import locale from '../public/campaign/m02/ru.json' with {type:'json'};
import {ALHADRA} from '../shared/campaign/alhadra.js';
import {ALHADRA_DESERT,ALHADRA_OFFSET} from '../shared/campaign/alhadra-desert.js';
import {Mission2Simulation,validMission2Save} from '../shared/campaign/mission2.js';
import {TANK_CANNON,moveTank,tankShellRicochets} from '../shared/tank.js';
import {getAssetColliders,rayCollider} from '../shared/asset-colliders.js';
import {findBotPath} from '../shared/bot-navigation.js';
import {PerspectiveCamera,Vector3} from 'three';
import {mission2BriefingCamera} from '../src/campaign/mission2-briefing-camera.js';

function create(){return new Mission2Simulation(mission,{difficulty:'regular',seed:113,lines:locale.lines});}
function step(sim,n){for(let i=0;i<n;i++)sim.step(1/60);}
test('catalog defines eight sequential missions across three acts',()=>{
  assert.equal(catalog.title,'Песок и сталь');assert.equal(catalog.missions.length,8);
  assert.deepEqual(catalog.acts.map(a=>a.missionIds.length),[2,3,3]);
  assert.deepEqual(catalog.missions.filter(m=>m.implemented).map(m=>m.id),['m01','m02','m03','m04']);
});
test('extended Al-Hadra tank map preserves old village terrain and geometry',()=>{
  assert.equal(ALHADRA_DESERT.width,2000);assert.equal(ALHADRA_DESERT.depth,1200);
  assert.equal(ALHADRA_DESERT.playArea.minZ,-600);
  const coords=[[-80,-30],[20,30],[150,105],[175,145]];
  for(const [x,z] of coords){
    const preserved=ALHADRA.terrain.heightAt(x,z);
    const carried=ALHADRA_DESERT.terrain.heightAt(x-ALHADRA_OFFSET.x,z-ALHADRA_OFFSET.z);
    assert.ok(Math.abs(carried-preserved)<.025,`terrain changed at (${x},${z}): ${carried} vs ${preserved}`);
  }
  const oldVillage=new Map(ALHADRA.boxes.map(box=>[box.id,box]));
  for(const box of ALHADRA_DESERT.boxes){
    const original=oldVillage.get(box.id);
    if(!original)continue;
    const eastMountain=box.kind==='village-rock'&&original.x-ALHADRA_OFFSET.x>95;
    assert.equal(box.x,original.x-ALHADRA_OFFSET.x+(eastMountain?36:0));
    assert.equal(box.z,original.z-ALHADRA_OFFSET.z);
    if(original.editorPose){
      assert.equal(box.editorPose.x,original.editorPose.x-ALHADRA_OFFSET.x);
      assert.equal(box.editorPose.z,original.editorPose.z-ALHADRA_OFFSET.z);
    }
  }
  assert.ok(ALHADRA_DESERT.terrain.heightAt(-450,-200)>0);
});
test('mountain foothills follow the visible surface and the whole tank road is clear',()=>{
  const sim=create(),map=sim.map,v=sim.vehicles.find(v=>v.id==='sokol-7');
  sim.vehicles=[v];
  const cliffs=map.boxes.filter(b=>b.kind==='village-rock');
  assert.ok(cliffs.length>0);
  assert.ok(getAssetColliders(map).every(b=>b.kind!=='village-rock'));
  assert.ok(cliffs.some(b=>sim.groundAt(b.x,b.z)>map.terrain.baseSurface.heightAt(b.x,b.z)+6));
  const [x,z]=[123,-163];
  assert.ok(cliffs.some(b=>Math.abs(x-b.x)<b.w/2&&Math.abs(z-b.z)<b.d/2));
  assert.equal(map.terrain.heightAt(x,z),map.terrain.baseSurface.heightAt(x,z));
  assert.equal(sim.vehicleCollides(v,x,z,0),false);
  const east=cliffs.find(b=>b.x>120),height=map.terrain.mountains.get(east.id).heightAt(east.x,east.z);
  const hit=map.terrain.raycast({x:east.x,y:height+4,z:east.z},{x:0,y:-1,z:0},8);
  assert.ok(Math.abs(hit-4)<.01,'the rock crest stops a ray at the shared mesh height');
  const route=mission.friendlyCompany.route;
  for(let i=1;i<route.length;i++){
    const [ax,az]=route[i-1],[bx,bz]=route[i],dx=bx-ax,dz=bz-az,len=Math.hypot(dx,dz);
    const yaw=Math.atan2(-dx,-dz);
    for(let d=0;d<=len;d+=1){
      const x=ax+dx*d/len,z=az+dz*d/len,y=sim.groundAt(x,z);
      assert.equal(sim.vehicleCollides(v,x,z,yaw),false,`blocked tank road at ${x},${z}`);
      const rise=sim.groundAt(x+dx*2/len,z+dz*2/len)-y;
      assert.ok(Math.atan2(rise,2)<25*Math.PI/180,`steep tank road at ${x},${z}`);
    }
  }
});
test('relocated props keep their collision geometry on the visible map',()=>{
  const sim=create(),boxes=getAssetColliders(sim.map),byId=new Map(sim.map.boxes.map(b=>[b.id,b]));
  for (const box of boxes){
    const authored=byId.get(box.id),pose=authored.editorPose??authored;
    assert.ok(Math.hypot(box.x-pose.x,box.z-pose.z)<Math.hypot(authored.w,authored.d),box.id);
    assert.ok(Number.isFinite(box.h)&&box.h>box.minY,box.id);
  }
  for(const kind of ['village-wall','village-palm','crate','rock','sandbags','car','truck','tent']){
    const b=boxes.find(b=>b.kind===kind);
    const a={x:b.x,y:b.h+2,z:b.z};
    assert.ok(rayCollider(a,{x:0,y:-1,z:0},b,b.h-b.minY+3)<Infinity,kind);
  }
});
test('the tank road does not form a cliff at the reused village edge',()=>{
  for(const x of [-290,-285,-280,-275]){
    const h0=ALHADRA_DESERT.terrain.heightAt(x,-287);
    const h1=ALHADRA_DESERT.terrain.heightAt(x,-285);
    const h2=ALHADRA_DESERT.terrain.heightAt(x,-283);
    assert.ok(Math.abs(h0-h1)<1,
      `tank road jumps at outer map seam: ${x}, -287 to -285 (${h0} / ${h1})`);
    assert.ok(Math.abs(h1-h2)<1,
      `tank road jumps inside original village transition: ${x} (${h1} / ${h2})`);
  }
});
test('ten allied tanks and player commander share one seat and controls',()=>{
  const sim=create(),v=sim.vehicles.find(v=>v.id==='sokol-7'),p=sim.players.get('local');
  assert.equal(sim.vehicles.filter(v=>v.team===0&&v.type==='tank').length,10);
  assert.equal(p.vehicleId,v.id);assert.equal(p.vehicleSeat,0);
  assert.equal(v.controlScheme,'wot');assert.equal(v.shellAmmo.ap,50);assert.equal(v.shellAmmo.he,30);
  assert.equal(sim.map.id,'alhadra-desert');
  assert.equal(sim.campaign.cutscene.id,'briefing');
});
test('the briefing camera keeps the moving column in frame throughout the march',()=>{
  const sim=create(),terrain=sim.map.terrain;
  const camera=new PerspectiveCamera(60,4/3,.045,1000);
  const playerTank=sim.vehicles.find(v=>v.id===mission.player.vehicleId);
  const firstX=playerTank.x;
  for(let elapsed=0;elapsed<mission.briefing.duration;elapsed++,step(sim,60)){
    const {position,target}=mission2BriefingCamera(terrain,sim.vehicles,playerTank,mission.briefing,elapsed);
    camera.position.set(position.x,position.y,position.z);
    camera.lookAt(target.x,target.y,target.z);
    camera.updateMatrixWorld();
    const visible=tank=>{
      const center=new Vector3(tank.x,tank.y+1.5,tank.z);
      const direction=center.clone().sub(camera.position);
      const distance=direction.length();
      const hit=terrain.raycast(position,direction.normalize(),distance);
      center.project(camera);
      return hit>=distance&&Math.abs(center.x)<.9&&Math.abs(center.y)<.85&&Math.abs(center.z)<1;
    };
    assert.ok(visible(playerTank),`player tank leaves the shot at ${elapsed}s`);
    assert.ok(sim.vehicles.filter(visible).length>=8,`column leaves the shot at ${elapsed}s`);
  }
  assert.ok(playerTank.x>firstX+80,'the formation advances while the camera tracks it');
});
test('the moving vanguard crests the ridge and fires at 13 seconds',()=>{
  const sim=create();step(sim,120);assert.equal(sim.vehicles.filter(v=>v.team===1).length,0);
  sim.campaign.command({type:'skip'});
  assert.equal(sim.campaign.elapsed,0);
  const enemies=sim.vehicles.filter(v=>v.team===1);
  const player=sim.vehicles.find(v=>v.id==='sokol-7');
  const visibleTanks=()=>enemies.filter(v=>sim.campaign.visible({
    x:player.x+Math.sin(player.yaw)*9,y:player.y+3.27,z:player.z+Math.cos(player.yaw)*9,
  },{x:v.x,y:v.y+2.4,z:v.z})).length;
  assert.equal(enemies.length,6);
  assert.equal(visibleTanks(),0);
  const initialX=enemies[0].x;
  sim.setInput('local',{forward:1,yaw:player.yaw});
  for(let i=0;i<765;i++){
    step(sim,1);
    assert.ok(player.speed>0&&player.speed*3.6<=25,'player lane and initial speed limit');
  }
  assert.ok(initialX-enemies[0].x>50);
  assert.ok(sim.events.every(e=>e.type!=='cannonShot'));
  assert.equal(sim.snapshot().campaign.enemyTanksAlive,0);
  step(sim,15);
  assert.equal(visibleTanks(),enemies.length);
  assert.ok(enemies.every(t=>t.y>=sim.groundAt(t.x+8,t.z)-.5&&t.y>=sim.groundAt(t.x-8,t.z)-.5),
    'every vanguard tank must be at the crest of its lane');
  assert.ok(Math.abs(sim.campaign.elapsed-13)<.0001);
  assert.equal(sim.campaign.enemySerial,6);
  step(sim,6);
  const openingSalvo=sim.events.filter(e=>e.type==='cannonShot'&&e.vehicleId?.startsWith('east-tank-'));
  assert.equal(openingSalvo.length,3);
  assert.ok(openingSalvo.every(e=>Math.abs(e.time-sim.campaign.combatStartedAt-13)<.001));
  step(sim,150);
  assert.ok(player.speed*3.6>25,'full throttle returns after the first 15 seconds');
});
test('both tank control schemes invert steering only while backing up',()=>{
  const sim={groundAt:()=>0,vehicleCollides:()=>false};
  for(const controlScheme of [undefined,'wot']){
    for(const strafe of [-1,1]){
      for(const forward of [-1,0,1]){
        const v={x:0,y:0,z:0,yaw:0,speed:0,controlScheme};
        moveTank(sim,v,{forward,strafe},1/60);
        assert.equal(Math.sign(v.yaw),forward<0?strafe:-strafe);
        if(controlScheme==='wot'){
          const multiplayer={x:0,y:0,z:0,yaw:0,speed:0};
          moveTank(sim,multiplayer,{forward,strafe},1/60);
          assert.ok(Math.abs(v.yaw)<Math.abs(multiplayer.yaw));
        }
      }
    }
  }
});
test('both AT crews occupy road shoulders in sight of the tank approach',()=>{
  const sim=create(),c=sim.campaign;
  c.spawnVillageAttack();
  for(const [i,[x,z]] of mission.villageApproachGuns.entries()){
    const gun=sim.players.get('m02-atgun-'+i);
    assert.ok(gun?.alive);
    assert.equal(gun.x,x);assert.equal(gun.z,z);
    assert.equal(sim.collides(x,z),false);
    const from=i===0?{x:-107,z:-188}:{x:-30,z:-87};
    assert.ok(c.visible({...from,y:sim.groundAt(from.x,from.z)+2},{x,y:gun.y+1,z}));
  }
});
test('all four infantry in the third wave spawn on the village approach with a path to the square',()=>{
  const sim=create();
  for(let i=0;i<3;i++)sim.campaign.spawnGroundWave();
  const wave=[...sim.players.values()].filter(p=>p.id.startsWith('m02-assault-2-'));
  assert.equal(wave.length,4);
  for(const p of wave){
    assert.equal(p.y,sim.map.terrain.baseSurface.heightAt(p.x,p.z));
    const route=findBotPath(sim,p,{x:17,z:0});
    assert.deepEqual([route.at(-1)?.x,route.at(-1)?.z],[17,0],p.id);
  }
});
test('commander can select AP, HE and MG without modifying multiplayer tank physics',()=>{
  const sim=create(),c=sim.campaign,v=sim.vehicles.find(v=>v.id==='sokol-7');
  c.command({type:'skip'});
  c.command({type:'weapon',mode:'he'});
  assert.equal(v.m02Shell,'he');assert.equal(v.weapon,0);
  // Weapon swap has a short 0.22s safety lock before the first shot.
  step(sim,15);
  sim.setInput('local',{yaw:v.yaw,pitch:0,fire:true});
  step(sim,1);
  assert.equal(v.shellAmmo.he,29);assert.equal(v.shellAmmo.ap,50);
  assert.equal(sim.rockets[0]?.campaignShell,'he');
  assert.equal(sim.rockets[0]?.campaignShellProfile?.damage,450);
  const fired=sim.snapshot().vehicles.find(v=>v.id==='sokol-7');
  assert.equal(fired.cannonReloadDuration,mission.weapons.he.reload);
  c.command({type:'weapon',mode:'ap'});
  assert.equal(v.cannonAmmo,50);
  assert.equal(v.cannonReadyAt,fired.cannonReadyAt);
  assert.equal(v.cannonReloadDuration,fired.cannonReloadDuration);
  c.command({type:'weapon',mode:'mg'});
  assert.equal(v.weapon,1);
  assert.equal(TANK_CANNON.speed,190,'multiplayer tank weapon must remain unchanged');
});
test('mission 2 checkpoint can restore enemy tanks and timing',()=>{
  const sim=create();sim.campaign.command({type:'skip'});
  step(sim,13*60);
  const save=sim.campaign.serialize();
  assert.equal(validMission2Save(save,mission),true);
  const restored=create();
  restored.rockets.push({id:'old-shot'});
  assert.equal(restored.campaign.restore(save),true);
  assert.deepEqual(restored.rockets,save.rockets);
  assert.equal(restored.rngState,save.rngState);
  assert.equal(restored.campaign.enemySerial,6);
  assert.equal(restored.vehicles.filter(v=>v.team===1).length,6);
  assert.ok(restored.snapshot().vehicles.every(v=>v.camo===(v.team===1?'desert':undefined)),
    'the desert paint applies only to hostile tanks, including from old saves');
  assert.ok(Math.abs(restored.campaign.elapsed-13)<.0001);
});
test('old tank checkpoints use the revised opening or finish deploying the second wave',()=>{
  const sim=create();sim.campaign.beginCombat();
  const opening=sim.campaign.serialize(),oldTank=opening.vehicles.find(v=>v.id==='east-tank-1');
  oldTank.x=oldTank.home.x=-594;
  assert.equal(sim.campaign.restore(opening),true);
  assert.equal(sim.vehicles.find(v=>v.id===oldTank.id).x,mission.enemyCompany.contactStart[0]);

  sim.campaign.spawnEnemy(4);
  sim.campaign.phase='battle';sim.campaign.fired.add('enemyRear');
  const oldBattle=sim.campaign.serialize();
  assert.equal(sim.campaign.restore(oldBattle),true);
  assert.equal(sim.campaign.enemySerial,14);
  assert.equal(validMission2Save(sim.campaign.latestSave,mission),true);
});
test('all ten crew members are alive and tanks leave their starting formation',()=>{
  const sim=create(),c=sim.campaign;
  const initial=sim.vehicles.filter(v=>v.team===0).map(v=>({id:v.id,x:v.x,z:v.z}));
  for(const v of sim.vehicles.filter(v=>v.team===0)){
    const crew=sim.players.get(v.seats[0]);
    assert.equal(crew?.alive,true,`dead or missing crew in ${v.id}`);
    assert.equal(crew.vehicleId,v.id);
  }
  c.command({type:'skip'});
  step(sim,65*60);
  const positions=initial.map(p=>{
    const now=sim.vehicles.find(v=>v.id===p.id);
    return {id:p.id,travel:Math.hypot(now.x-p.x,now.z-p.z),x:now.x,z:now.z};
  });
  assert.ok(positions.filter(p=>p.travel>45).length>=6,
    `friendly tank column failed to drive: ${JSON.stringify(positions)}`);
});
test('healthy enemy tanks survive a hit and stay as wrecks after repeated hits',()=>{
  const sim=create();sim.campaign.command({type:'skip'});step(sim,13*60);sim.campaign.spawnEnemy(4);
  const enemies=sim.vehicles.filter(v=>v.team===1);
  assert.equal(enemies.length,10);
  for(const tank of enemies){
    assert.ok(tank.home.x<996&&tank.home.x>-996,`enemy tank started beyond map at ${tank.home.x}`);
  }
  const target=enemies[0],attacker=sim.players.get('local');
  const hit=()=>sim.damageVehicle(target,900,attacker,'blast',{x:target.x+1,y:target.y+.6,z:target.z});
  hit();hit();assert.ok(target.hp>0&&target.hp<target.maxHp);
  for(let i=0;i<10&&target.hp>0;i++)hit();
  assert.equal(target.hp,0);
  assert.ok(target.respawnIn>10000&&target.wreckTime>10000);
});
test('campaign AP shells ricochet beyond 72 degrees but hit head-on',()=>{
  const tank={type:'tank',x:0,y:0,z:0,yaw:0};
  assert.equal(tankShellRicochets(tank,{x:0,y:1,z:-3.5},{x:0,y:0,z:1}),false);
  assert.equal(tankShellRicochets(tank,{x:0,y:1,z:-3.5},{x:1,y:0,z:.1}),true);
  assert.equal(tankShellRicochets(tank,{x:1.8,y:1,z:0},{x:-1,y:0,z:0}),false);
  assert.equal(tankShellRicochets(tank,{x:1.8,y:1,z:0},{x:-.1,y:0,z:1}),true);
});
test('mission 2 requires a surviving platoon and explicit recovery of the order',()=>{
  const sim=create(),c=sim.campaign;
  c.command({type:'skip'});
  step(sim,13*60);
  sim.time=c.combatStartedAt+90;c.update(0);
  assert.equal(c.enemySerial,mission.enemyCompany.firstWave);
  const destroy=tank=>{
    for(let i=0;i<4&&tank.hp>0;i++)sim.damageVehicle(tank,99999,sim.players.get('local'),'blast',
      {x:tank.x,y:tank.y+1,z:tank.z});
  };
  for(const tank of sim.vehicles.filter(v=>v.team===1))destroy(tank);
  c.update(0);
  assert.equal(c.enemySerial,14);
  const rear=sim.vehicles.filter(v=>v.m02Rear);
  assert.equal(rear.length,8);
  assert.equal(validMission2Save(c.serialize(),mission),true);
  for(const tank of rear)destroy(tank);
  const v=sim.vehicles.find(v=>v.id==='sokol-7');
  v.x=17;v.z=-45;v.y=sim.groundAt(v.x,v.z);
  step(sim,1);assert.equal(c.phase,'village');assert.equal(c.complete,false);
  for(let i=0;i<4;i++){
    sim.time=c.villageStartedAt+i*30+.001;
    c.update(0);
    for(const p of sim.players.values())if(p.team===1&&!p.vehicleId)p.alive=false;
  }
  assert.equal(c.phase,'debrief');assert.equal(c.flags.enemyOrder,undefined);
  c.command({type:'interact'});assert.equal(c.flags.enemyOrder,undefined);
  const wreck=sim.vehicles.find(v=>v.id==='east-tank-10');
  v.x=wreck.x;v.z=wreck.z+10;v.y=sim.groundAt(v.x,v.z);v.speed=0;
  c.command({type:'interact'});
  sim.time+=Math.max(6,locale.lines['dargo.final'].duration)+.1;c.update(0);
  assert.equal(c.complete,true);
  assert.equal(c.flags.enemyOrder,true);
  assert.equal(c.checkpoint,5);
  assert.equal(c.latestSave?.mission.checkpoint,5);
  assert.equal(sim.snapshot().campaign.complete,true);
});
test('enemy armour ignores the village infantry and cannot hurt them with its weapons',()=>{
  const sim=create(),c=sim.campaign;
  c.command({type:'skip'});step(sim,13*60);
  const v=sim.vehicles.find(v=>v.team===1&&v.hp>0),crew=sim.players.get(v.seats[0]);
  const defender=sim.players.get('m02-duran');
  Object.assign(v,{x:defender.x,z:defender.z-7,y:sim.groundAt(defender.x,defender.z-7)});
  for(const tank of sim.vehicles)if(tank.team===0)tank.hp=0;
  crew.nextM02Think=0;sim.thinkBot(crew,1/60);
  assert.equal(v.m02TargetId,null);
  assert.equal(crew.input.fire,false);
  const health=defender.hp;
  sim.damage(defender,200,crew,{explosive:true,vehicleId:v.id});
  assert.equal(defender.hp,health);
});
test('the timeline and dialogue are editable external resources',()=>{
  assert.equal(mission.timeline.find(e=>e.id==='enemyVanguard').at,13);
  assert.equal(mission.music.introSeconds,187.5735);
  assert.equal(mission.friendlyCompany.count,10);
  assert.equal(locale.lines['holt.hold'].text,'«Сокол», держать строй!');
});
