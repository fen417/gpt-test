import test from 'node:test';
import assert from 'node:assert/strict';
import { WEAPONS, EYE_HEIGHT } from '../shared/world.js';
import { BULLET_GRAVITY, bulletHeight, zeroedBulletPitch } from '../shared/ballistics.js';
import { shotTrajectory, predictPersonalFire } from '../shared/fire-control.js';
import { Simulation } from '../shared/simulation.js';
import { FSR1_SCALES, fsr1RenderScale } from '../src/fsr1.js';

const near=(actual,expected,eps=1e-6)=>assert.ok(Math.abs(actual-expected)<eps,`Expected ${actual} ≈ ${expected}`);

test('FSR 1 presets and adaptive scaling are bounded and preserve the display size',()=>{
  near(FSR1_SCALES.ultra,1/1.3);
  near(FSR1_SCALES.quality,1/1.5);
  near(FSR1_SCALES.balanced,1/1.7);
  near(FSR1_SCALES.performance,.5);
  near(fsr1RenderScale('auto',.45),.6);
  near(fsr1RenderScale('auto',.8),.8);
  near(fsr1RenderScale('auto',1.4),1);
  near(fsr1RenderScale('invalid'),1/1.5);
});

test('all ten primary and sidearm projectiles fall under shared gravity',()=>{
  assert.equal(Object.keys(WEAPONS).length,10);
  assert.equal(BULLET_GRAVITY,20);
  for(const weapon of Object.values(WEAPONS)){
    assert.ok(weapon.projectileSpeed>0&&weapon.range>0,weapon.id);
    const distance=Math.min(60,weapon.range*.75);
    const t=distance/weapon.projectileSpeed;
    const drop=bulletHeight(0,0,t);
    assert.ok(drop<0,`${weapon.id} has no bullet drop`);
    near(drop,-.5*BULLET_GRAVITY*t*t);
  }
});

test('sights are zeroed at the defined range; DMR drops more than SV at 200 m',()=>{
  const drops={};
  for(const weapon of [WEAPONS.dmr12,WEAPONS.sv98]){
    const angle=zeroedBulletPitch(0,weapon.zeroRange,weapon.projectileSpeed);
    const speed=weapon.projectileSpeed;
    const at=distance=>bulletHeight(0,speed*Math.sin(angle),distance/(speed*Math.cos(angle)));
    near(at(weapon.zeroRange),0,.00001);
    drops[weapon.id]=at(200);
    assert.ok(drops[weapon.id]<-1,`${weapon.id} should drop >1m at 200m`);
  }
  assert.ok(drops.dmr12<drops.sv98,'DMR-12 projectile must have more drop than faster SV-98');
  near(drops.dmr12,-1.578,0.01);
  near(drops.sv98,-1.24,0.01);
});

test('client predicted and server-launched projectile vectors agree for every firearm, including ADS DMR',()=>{
  const sim=new Simulation({bots:0});
  for(const weapon of Object.values(WEAPONS)){
    for(const aim of [false,true]){
      const player={
        id:'ballistics-test',team:0,classId:weapon.classId??'assault',weaponId:weapon.id,
        x:0,y:40,z:0,yaw:0.16,pitch:-0.02,
        input:{fire:true,aim},grounded:true,moveSpeed:0,bloom:0,
        shotSeq:2,fireHeld:false,cooldown:0,ammo:weapon.mag,reserve:weapon.reserve,
        equipTime:0,reloading:false,bot:false,
      };
      const client=structuredClone(player),server=structuredClone(player);
      const predicted=predictPersonalFire(client,client.input,1/60,.016);
      assert.ok(predicted,`${weapon.id} predicted no shot`);
      server.ammo--;server.shotSeq++;
      const {yaw,pitch,scoped}=shotTrajectory(server);
      sim.launchBullet(server,weapon,{x:server.x,y:server.y+EYE_HEIGHT,z:server.z},yaw,pitch,null,scoped);
      const bullet=sim.bullets.pop();
      near(predicted.vx,bullet.vx);
      near(predicted.vy,bullet.vy);
      near(predicted.vz,bullet.vz);
      near(predicted.life,bullet.life);
      sim.events.length=0;
    }
  }
});
