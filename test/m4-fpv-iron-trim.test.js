import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {removeM4IronSights} from '../src/m4-fpv-iron-trim.js';

test('FPV removes only M4 front/rear iron sight islands, leaving third-person geometry unchanged',async()=>{
  const bytes=await readFile(new URL('../src/assets/infantry/m4a1.glb',import.meta.url));
  const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).register(()=>({
    name:'KHR_texture_basisu',loadTexture:()=>Promise.resolve(new THREE.Texture()),
  }));
  const gltf=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const receiver=gltf.scene.getObjectByName('ChargingHandleGeometryMesh');
  assert(receiver?.isMesh,'expected combined M4 receiver mesh');
  const original=receiver.geometry,sourceTriangles=original.getIndex().count/3;
  const {geometry,frontTriangles,rearTriangles}=removeM4IronSights(original);
  assert(frontTriangles>=150&&frontTriangles<=250,'front post & protective wings are detached');
  assert(rearTriangles>=250&&rearTriangles<=700,'rear peep sight & guards are detached');
  assert.equal(geometry.getIndex().count/3,sourceTriangles-frontTriangles-rearTriangles);
  assert.equal(original.getIndex().count/3,sourceTriangles,'original 3P source not modified');
  assert(geometry.getIndex().count/3>2500,'barrel, upper, stock and rail remain');
  assert.equal(geometry.getAttribute('uv').count,original.getAttribute('uv').count,'preserve textured vertices');
  assert.equal(geometry.getAttribute('normal').count,original.getAttribute('normal').count,'preserve shading');
  const again=removeM4IronSights(geometry);
  assert.equal(again.frontTriangles,0,'trimming once removes all front sight islands');
  assert.equal(again.rearTriangles,0,'trimming once removes all rear sight islands');
});
