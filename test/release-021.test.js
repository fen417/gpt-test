import test from 'node:test';
import assert from 'node:assert/strict';
import { GAME_VERSION, PATCH_NOTES } from '../shared/releases.js';
import { WEAPONS, CLASSES, getWeapon } from '../shared/world.js';
import { weaponSpread } from '../shared/fire-control.js';

test('0.21 is the visible current release and documents FSR and SMG balance',()=>{
  assert.equal(GAME_VERSION,'0.21');
  assert.equal(PATCH_NOTES[0].version,GAME_VERSION);
  const notes=[...PATCH_NOTES[0].added,...PATCH_NOTES[0].changed].join(' ');
  for(const keyword of ['FSR','EASU','RCAS','MCX-9','ВК-45'])assert.ok(notes.includes(keyword),keyword);
});

test('0.21 increases the spread of both SMGs without modifying other weapons',()=>{
  const expected={mcx9:{previous:.016,next:.022},vk45:{previous:.014,next:.020}};
  for(const [id,{previous,next}] of Object.entries(expected)){
    const weapon=WEAPONS[id];
    assert.ok(weapon.spread/previous>=1.35,`${id} should gain at least 35% dispersion`);
    assert.equal(weapon.spread,next);
    const player={classId:'medic',weaponId:id,input:{aim:false},grounded:true,moveSpeed:0,bloom:0};
    assert.equal(getWeapon(player.classId,player.weaponId),weapon);
    assert.ok(weaponSpread(player)>previous*.66,`${id} hip spread`);
    player.input.aim=true;
    assert.ok(weaponSpread(player)>previous*.24,`${id} ADS spread`);
  }
  assert.equal(CLASSES.medic.spread,WEAPONS.mcx9.spread,'medic fallback should match the default SMG');
});
