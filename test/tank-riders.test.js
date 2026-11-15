import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';
import {readFile} from 'node:fs/promises';import {gunzipSync} from 'node:zlib';
import {installSoldierAsset,createAssetRig} from '../src/soldier-assets.js';
import {poseSeatedSoldier} from '../src/soldier.js';import {VEHICLE_TYPES} from '../shared/vehicles.js';
test('tank riders bend their knees and keep hanging boots clear of the hull',async()=>{
  const key='0-assault-ar416',bytes=gunzipSync(await readFile(new URL('../src/assets/soldiers/'+key+'.bin.gz',import.meta.url)));
  installSoldierAsset(key,bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
  for(const index of [2,3,4]){
    const seat=VEHICLE_TYPES.tank.seats[index],rig=createAssetRig({},{team:0,classId:'assault',weaponId:'ar416'},new THREE.MeshLambertMaterial());
    rig.group.position.set(seat.x,seat.height-1.65,seat.z);rig.group.rotation.y=index===2?Math.PI/2:index===3?-Math.PI/2:Math.PI;
    poseSeatedSoldier(rig,{vehicle:{type:'tank'},seat,index,relativeYaw:0,pitch:0,shotSeq:0,dt:1/60});rig.group.updateMatrixWorld(true);
    for(let leg=0;leg<2;leg++){
      const hip=rig.legs[leg].getWorldPosition(new THREE.Vector3()),knee=rig.knees[leg].getWorldPosition(new THREE.Vector3()),foot=rig.ankles[leg].getWorldPosition(new THREE.Vector3());
      assert.ok(Math.abs(knee.y-hip.y)<.15,'thigh rests along the deck');
      assert.ok(knee.y-foot.y>.3&&knee.y-foot.y<.42,'calf hangs down from a bent knee');
      assert.ok(index===4?foot.z>3.5:Math.abs(foot.x)>1.8,'boots clear the rear plate and side skirts');
    }
  }
});
