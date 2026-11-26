
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder} from 'meshoptimizer';
import {M05_DRESSING} from '../shared/campaign/quarry-m05.js';

await MeshoptDecoder.ready;
const path='public/campaign/m05/dressing-source.glb';
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
const doc=await io.readBinary(await readFile(path));
const nodes=new Map(doc.getRoot().listNodes().filter(n=>n.getName().startsWith('m05-dress-')).map(n=>[n.getName(),n]));
assert.equal(nodes.size,M05_DRESSING.length,'Source prop count mismatch');
for(const prop of M05_DRESSING){
 const node=nodes.get(prop.id);assert.ok(node?.getMesh(),'Missing source mesh: '+prop.id);
 const matrix=node.getWorldMatrix(),c=Math.cos(prop.yaw)*prop.scale,s=Math.sin(prop.yaw)*prop.scale;
 const expected=[c,0,-s,0,0,prop.scale,0,0,s,0,c,0,prop.x,prop.y,prop.z,1];
 for(let i=0;i<16;i++)assert.ok(Math.abs(matrix[i]-expected[i])<.002,prop.id+' matrix mismatch at '+i+': '+matrix[i]+' vs '+expected[i]);
}
console.log('Verified '+nodes.size+' source prop meshes, positions, rotations and scales.');
