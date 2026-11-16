import * as THREE from 'three';
import {createCanvas} from '@napi-rs/canvas';
import {writeFile} from 'node:fs/promises';
import {createSurfaceMaterials} from '../src/visuals.js';
import {createMapModelBuilder} from '../src/renderer.js';
import {buildMapScene} from '../src/map-scene.js';
import {getMap} from '../shared/world.js';
globalThis.document={createElement:()=>createCanvas(512,512)};
const surfaces=createSurfaceMaterials({capabilities:{getMaxAnisotropy:()=>2}},{bake:true}),maps=[];
const column=process.argv.includes('--m03');
if(column)await import('../shared/campaign/tel-mazin.js');
for(const mapId of column?['tel-mazin']:['port','quarry','village']){
  const owner=createMapModelBuilder(surfaces);owner.scene=new THREE.Group();owner.map=getMap(mapId);buildMapScene(owner,owner.map);owner.mergeStaticWorld(new Set());
  const row={mapId,meshes:0,materialDraws:0,triangles:0,terrainTriangles:0,maxTerrainReportedError:0};
  owner.scene.traverse(mesh=>{
    if(!mesh.isMesh)return;row.meshes++;row.materialDraws+=Array.isArray(mesh.material)?mesh.geometry.groups.length:1;
    const triangles=(mesh.geometry.index?.count??mesh.geometry.attributes.position.count)/3*(mesh.isInstancedMesh?mesh.count:1);row.triangles+=triangles;
    if(mesh.geometry.userData.terrainError!==undefined){row.terrainTriangles+=triangles;row.maxTerrainReportedError=Math.max(row.maxTerrainReportedError,mesh.geometry.userData.terrainError);}
  });maps.push(row);
}
const report={schema:1,method:'All static meshes, no frustum/occlusion culling, no actors/viewmodel/shadow passes. Composition counts, not FPS.',maps};
console.log(JSON.stringify(report,null,2));const output=process.argv.slice(2).find(arg=>arg!=='--m03');if(output)await writeFile(output,JSON.stringify(report,null,2)+'\n');
