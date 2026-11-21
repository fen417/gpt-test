import test from 'node:test';
import assert from 'node:assert/strict';
import { getMap } from '../shared/world.js';
import { ESTATE_WIDTH_SCALE } from '../shared/linden-estate.js';
import { Simulation, createPredictionWorld } from '../shared/simulation.js';

const map=getMap('linden_estate');
const manorX=x=>x*ESTATE_WIDTH_SCALE;
const horizontal=[-2.9,2.3].flatMap(z=>[-8.4,-2.9,5.5,9.4].map(x=>({x:manorX(x),z})));
const vertical=[-5.5,8].flatMap(x=>[-4.85,4.55].map(z=>({x:manorX(x),z})));
const sim=()=>new Simulation({mapId:'linden_estate',gameMode:'tdm',bots:0,random:()=>.5});

test('all ground-floor passages admit a standing player across the full threshold',()=>{
 const world=sim();
 assert.equal(world.playerRadius,.30);
 for(const {x,z} of horizontal){
   for(const delta of [-.50,0,.50]){
     assert.equal(world.collides(x,z+delta,.2),false,
       `horizontal doorway (${x},${z}) offset ${delta} blocked`);
   }
 }
 for(const {x,z} of vertical){
   for(const delta of [-.50,0,.50]){
     assert.equal(world.collides(x+delta,z,.2),false,
       `vertical doorway (${x},${z}) offset ${delta} blocked`);
   }
 }
 for(const [x,z] of [[0,7],[-1,-7],[12,1.85]]){
   assert.equal(world.collides(manorX(x),z,.2),false,`exterior doorway (${x},${z}) blocked`);
 }
});

test('upper-floor interior door openings have appropriate head clearance',()=>{
 const world=sim();
 for(const {x,z} of [...horizontal,...vertical])
   assert.equal(world.collides(x,z,3.3),false,`upstairs doorway (${x},${z}) blocked`);
});

test('the two teams spawn in distant opposite diagonal quadrants, not the courtyard',()=>{
 const [northwest,southeast]=map.spawnPoints;
 assert.ok(northwest.length>=12&&southeast.length>=12);
 const world=sim();
 for(const [team,points] of map.spawnPoints.entries())
  for(const point of points){
   assert.ok(team===0?point.x<=-14&&point.z>=16:point.x>=14&&point.z<=-3,
     `team ${team} spawned in incorrect region: ${JSON.stringify(point)}`);
   assert.equal(world.collides(point.x,point.z,world.groundAt(point.x,point.z)),false,
     'Spawn must have standing-body clearance');
  }
 const closest=Math.min(...northwest.flatMap(a=>southeast.map(b=>Math.hypot(a.x-b.x,a.z-b.z))));
 assert.ok(closest>45,`closest cross-team spawn ${closest.toFixed(2)}m is unsafe`);
 assert.ok(northwest.some(a=>southeast.some(b=>!world.lineClear(
   {x:a.x,y:1.5,z:a.z},{x:b.x,y:1.5,z:b.z}))),
   'building should interrupt direct cross-team sightlines');
});

const walking=(world,p)=>{
 const input={yaw:0,pitch:0,forward:1,strafe:0,sprint:false,aim:false,fire:false,
   crouch:false,jump:false};
 for(let i=0;i<65;i++)world.movePlayer(p,input,1/60);
};

test('main stairs can be climbed without jumping and lead onto the second floor',()=>{
 const world=sim(),p=world.addPlayer('main','Main stairs',0,'assault');
 Object.assign(p,{x:manorX(2),z:2.7,y:.2,vy:0,grounded:true,jumpCooldown:0});
 walking(world,p);
 assert.ok(p.z<-2.95,`main stairs blocked at Z=${p.z.toFixed(2)}`);
 assert.ok(p.y>3.0,`main stairs did not reach upper level, Y=${p.y.toFixed(2)}`);
});

test('east terrace stairs are continuous and reach the upper landing',()=>{
 const world=sim(),p=world.addPlayer('east','East stairs',1,'assault');
 const x=manorX(13.4);
 Object.assign(p,{x,z:.85,y:world.groundAt(x,.85),vy:0,grounded:true,jumpCooldown:0});
 walking(world,p);
 assert.ok(p.z<-4.55,`east stairs blocked at Z=${p.z.toFixed(2)}`);
 assert.ok(p.y>2.9,`east stairs did not reach landing, Y=${p.y.toFixed(2)}`);
});

test('stairs are walkable navigation surfaces, not blocking step solids',()=>{
 const world=sim();
 assert.ok(map.boxes.some(b=>b.kind==='village-stair'));
 assert.ok(world.colliders.every(b=>b.kind!=='village-stair'),
   'individual riser boxes are too tall for the capsule to climb');
 for(const [x,start,end] of [[manorX(2),2.3,-2.9],[manorX(13.4),.54,-4.65]]){
   let previous=world.groundAt(x,start);
   for(let z=start-.1;z>end;z-=.25){
     const y=world.groundAt(x,z);
     assert.ok(y>=previous-.01,`ramp at Z=${z} is not monotonic`);
     previous=y;
   }
 }
});


test('client prediction uses the same capsule radius and collision solids as the server',()=>{
  for(const id of ['linden_estate','fy_pool_day','port']){
    const server=new Simulation({mapId:id,gameMode:id==='port'?'conquest':'tdm',bots:0,random:()=>.5});
    const client=createPredictionWorld(id);
    assert.equal(client.playerRadius,server.playerRadius, `${id}: capsule must match authority`);
    assert.ok(Number.isFinite(client.playerRadius)&&client.playerRadius>0);
    const probes=id==='linden_estate'
      ?[[manorX(-12),0,.2],[manorX(-12.1),.2,.2],[manorX(12),0,.2],[manorX(-10.5),0,.2],[-21,15,0]]
      :id==='fy_pool_day'?[[0,0,0],[-17,0,0],[17,0,0]]
      :[[0,0,0],[10,15,0]];
    for(const [x,z,y] of probes){
      assert.equal(client.collides(x,z,y),server.collides(x,z,y),
        `${id}: collision disagrees at (${x},${z},${y})`);
    }
  }
});

test('holding forward against the manor outer wall never passes through it in client prediction',()=>{
  const prediction=createPredictionWorld('linden_estate');
  const authority=sim();
  assert.equal(prediction.collides(manorX(-12),0,.2),true,'West external wall must be solid');
  const player=authority.addPlayer('wall-test','Wall test',0,'assault');
  Object.assign(player,{x:manorX(-10.9),y:.2,z:0,vy:0,grounded:true,jumpCooldown:0,yaw:Math.PI/2,pitch:0});
  const input={yaw:Math.PI/2,pitch:0,forward:1,strafe:0,sprint:false,aim:false,
    fire:false,crouch:false,jump:false};
  for(let i=0;i<180;i++){
    prediction.movePlayer(player,input,1/60);
    assert.ok(player.x > manorX(-11.60),
      `player went through visible manor wall at frame ${i}: X=${player.x.toFixed(3)}`);
    assert.equal(prediction.collides(player.x,player.z,player.y),false,
      'prediction must never position the player inside a solid');
  }
});
