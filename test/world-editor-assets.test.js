
import test from 'node:test';
import assert from 'node:assert/strict';
import {Document,NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder} from 'meshoptimizer';
import {Group,Mesh,BoxGeometry,MeshStandardMaterial} from 'three';
import {optimizeEditorAsset} from '../scripts/world-editor-optimize.mjs';
import {assetStats} from '../tools/world-editor/asset-stats.js';
import {wrapDressingBatches,expandDressing} from '../src/campaign/m05-dressing-edits.js';

test('Meshopt roundtrip preserves node names, bounds and material parameters',async()=>{
 const doc=new Document(),buffer=doc.createBuffer(),position=doc.createAccessor().setType('VEC3').setArray(new Float32Array([-1,0,0,1,0,0,0,2,0])).setBuffer(buffer),indices=doc.createAccessor().setType('SCALAR').setArray(new Uint16Array([0,1,2])).setBuffer(buffer);
 const material=doc.createMaterial('Paint').setRoughnessFactor(.42);
 const mesh=doc.createMesh().addPrimitive(doc.createPrimitive().setAttribute('POSITION',position).setIndices(indices).setMaterial(material));
 doc.createScene().addChild(doc.createNode('Original').setMesh(mesh));
 const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
 await MeshoptDecoder.ready;
 const result=await io.readBinary(await optimizeEditorAsset(await io.writeBinary(doc)));
 const n=result.getRoot().listNodes()[0],p=n.getMesh().listPrimitives()[0];
 assert.equal(n.getName(),'Original');assert.equal(p.getIndices().getCount(),3);
 assert.equal(p.getMaterial().getName(),'Paint');assert.ok(Math.abs(p.getMaterial().getRoughnessFactor()-.42)<1e-6);
 assert.deepEqual(p.getAttribute('POSITION').getMin([]),[-1,0,0]);assert.deepEqual(p.getAttribute('POSITION').getMax([]),[1,2,0]);
});
test('asset stats count shared buffers once and instances separately',()=>{
 const root=new Group(),g=new BoxGeometry(2,3,4),m=new MeshStandardMaterial();
 root.add(new Mesh(g,m),new Mesh(g,m));
 const s=assetStats(root);assert.equal(s.meshes,2);assert.equal(s.triangles,24);assert.equal(s.materials,1);assert.deepEqual(s.size,[2,3,4]);
});
test('individual runtime dressing rebuild keeps untouched baked batches',()=>{
 const scene=new Group(),source=new Group(),mat=new MeshStandardMaterial(),geo=new BoxGeometry(2,2,2);
 for(const [name,x] of [['m05_set_0_0',0],['m05_set_1_0',48]]){const mesh=new Mesh(geo,mat);mesh.name=name;mesh.position.x=x;scene.add(mesh);}
 const props=[{id:'m05-dress-yard-0',x:1,y:0,z:0,yaw:0,scale:1,detail:false},{id:'m05-dress-yard-1',x:5,y:0,z:0,yaw:0,scale:1,detail:false},{id:'m05-dress-yard-2',x:48,y:0,z:0,yaw:0,scale:1,detail:false}];
 for(const p of props){const n=new Mesh(geo,mat);n.name=p.id;source.add(n);}
 wrapDressingBatches(scene);
 const edited=expandDressing(scene,source,props,{'m05-dress-yard-0':{position:[2,0,0],rotation:[0,0,0],scale:1,removed:false}},false);
 assert.equal(edited.size,1);assert.equal(scene.getObjectByName('m05_set_0_0-mesh').visible,false);assert.equal(scene.getObjectByName('m05_set_1_0-mesh').visible,true);
 assert.equal(edited.get('m05_set_0_0').children.length,1);
});
