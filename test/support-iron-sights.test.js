import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createWeaponRig} from '../src/weapons.js';
import {loadFPSHands} from '../src/fps-hands.js';
import {readFile} from 'node:fs/promises';
import {GAME_VERSION,PATCH_NOTES} from '../shared/releases.js';

test('MG-36 and PKP retain a wide, unobstructed rear sight aperture in ADS',async()=>{
  // No browser DOM in Node: provide texture placeholders for model geometry.
  const originalLoad=THREE.TextureLoader.prototype.load,originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>new Response(await readFile(new URL('../src/assets/fps-hands.bin.gz',import.meta.url)));
  THREE.TextureLoader.prototype.load=()=>new THREE.Texture();
  let rig;
  try{
    await loadFPSHands();
    rig=createWeaponRig({lowQuality:true});
    for(const weaponId of ['mg36','pkp']){
      rig.update({classId:'support',weaponId,aim:1,team:0,reloadPhase:1});
      assert.equal(rig.sightType,'iron');
      const rear=rig.weapon.getObjectByName('support-rear-sight');
      const front=rig.weapon.getObjectByName('support-front-sight');
      assert.ok(rear&&front,`${weaponId}: both iron sights exist`);
      assert.ok(rear.visible&&front.visible,`${weaponId}: iron sights visible`);
      assert.equal(rear.position.z,-.105,'rear aperture is no longer close against the camera');
      const ring=rear.children.find(child=>child.geometry?.type==='LatheGeometry');
      assert.ok(ring,`${weaponId}: rear aperture has a real opening`);
      assert.ok(Math.abs(ring.position.y-.164)<.0001,'rear sight line unchanged');

      // Viewmodel when aiming: the player's camera is at 0,0,0; only the
      // rear aperture must have an empty centre. Front post remains visible.
      rig.weapon.position.set(0,-.167,-.30);
      rig.weapon.updateMatrixWorld(true);
      const ray=new THREE.Raycaster(new THREE.Vector3(0,0,0),
        new THREE.Vector3(0,0,-1),.045,2);
      const hits=ray.intersectObject(rear,true);
      assert.equal(hits.length,0,`${weaponId}: rear guard must not block the crosshair`);
      const bounds=new THREE.Box3().setFromObject(rear);
      assert.ok(bounds.max.x-bounds.min.x<.09,`${weaponId}: sight guards must stay narrow`);
      assert.ok(front.position.z<-.5,`${weaponId}: front bead stays forward of rear aperture`);
    }
  }finally{
    rig?.dispose();
    THREE.TextureLoader.prototype.load=originalLoad;
    globalThis.fetch=originalFetch;
  }
});

test('0.18 patch notes include improved MG sights and gunfire, but no story campaign',()=>{
  assert.equal(GAME_VERSION,'0.18');
  const release=PATCH_NOTES.find(note=>note.version==='0.18');
  assert.ok(release);
  const text=[...release.added,...release.changed,...release.fixed].join(' ');
  assert.match(text,/MG-36/);
  assert.match(text,/ПКП/);
  assert.match(text,/звуки выстрелов/);
  assert.match(text,/прицелы/);
  assert.doesNotMatch(text,/сюжет|кампани|мисси|радист|эвакуаци|вражеск.*колонн/i);
});
