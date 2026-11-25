import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {decodeChartUV,geometryKey,architectureReceiver,architectureIntensity,proceduralReceiver,meshGeometryKey} from '../src/architecture-lightmap-format.js';
import {graphicsEffects,validateCustomGraphics} from '../src/graphics-settings.js';
test('architecture charts address padded texel centers and neutral sample',()=>{
  const uv=decodeChartUV(new Uint16Array([4,8,8,0,0,0]),16);
  assert.deepEqual(Array.from(uv),[5.5/16,9.5/16,10.5/16,9.5/16,5.5/16,14.5/16,...Array(6).fill(.5/16)]);
});
test('lightmaps are opt-in, independent, and geometry fingerprint detects changed topology',()=>{
  for(const preset of ['legacy','low','medium','high'])assert.equal(graphicsEffects(preset).architectureLight,'off');
  assert.equal(graphicsEffects('ultra').architectureAO,'high');
  assert.equal(validateCustomGraphics({architectureAO:'high',architectureLight:'off'},'low').architectureAO,'high');
  const g=new THREE.BoxGeometry(),old=geometryKey(g);g.attributes.position.setX(0,7);assert.notEqual(geometryKey(g),old);
  const m=new THREE.Mesh(g);m.userData.estateSurface='concrete';assert.equal(architectureReceiver(m),true);
  m.userData.estateSurface='glass';assert.equal(architectureReceiver(m),false);g.dispose();
});

test('campaign illumination scales with authored daylight and turns off in NVG',()=>{
  assert.equal(architectureIntensity('high',{campaign:true,nightVision:true}),0);
  assert.ok(architectureIntensity('high',{campaign:true,sun:.8,hemi:.52})<architectureIntensity('high',{campaign:true,sun:2.8,hemi:2.1}));
  assert.equal(architectureIntensity('high'),.85);
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial({vertexColors:true}));mesh.receiveShadow=true;mesh.userData.architectureStaticBatch=true;
  assert.ok(proceduralReceiver(mesh));mesh.updateMatrixWorld();const key=meshGeometryKey(mesh);mesh.position.x=10;mesh.updateMatrixWorld();assert.notEqual(meshGeometryKey(mesh),key);
  mesh.userData.legacyPalmLeaf=true;assert.equal(proceduralReceiver(mesh),false);
});
