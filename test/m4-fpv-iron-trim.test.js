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
  // The tall iron tower is made of separate islands that were previously
  // missed by a maxY>.20-only heuristic. Require all those islands to go.
  console.log('M4 front/rear triangles removed:',frontTriangles,rearTriangles);
  assert(frontTriangles>=150,'all detachable iron-sight components, including the tall post, are removed');
  const p=geometry.getAttribute('position'),inds=geometry.getIndex();
  let residualAboveRail=0;
  for(let i=0;i<inds.count;i+=3){
    const verts=[inds.getX(i),inds.getX(i+1),inds.getX(i+2)];
    if(verts.every(v=>p.getZ(v)>-.61&&p.getZ(v)<-.45)&&
      verts.some(v=>p.getY(v)>.20&&Math.abs(p.getX(v))<.032))
      residualAboveRail++;
  }
  assert.equal(residualAboveRail,0,'no sight tip above the handguard in front tower zone');
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
