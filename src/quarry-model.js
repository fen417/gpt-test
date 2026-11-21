import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { rotationMatrix } from '../shared/geometry.js';
import { UNIT_SCALE } from '../shared/asset-scale.js';
import { addSectorInstances, pairMaterials } from './visuals.js';

const url = new URL('./assets/quarry/detail.glb', import.meta.url).href;

export async function loadQuarryDetail(map, surface) {
  const {scene} = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url);
  const layer=new THREE.Group();
  layer.name='quarry-detail';
  const standard=new THREE.MeshStandardMaterial({
    vertexColors:true,map:surface.map,normalMap:surface.normalMap??null,
    normalScale:new THREE.Vector2(.25,.25),metalness:.23,roughness:.72,
  });
  const paint=pairMaterials(standard,new THREE.MeshLambertMaterial({vertexColors:true,map:surface.map}));
  const byKit=new Map(), originals=new Set();
  for(const site of map.structures){
    if(!site.quarryKit)continue;
    if(!byKit.has(site.quarryKit))byKit.set(site.quarryKit,[]);
    const basis=site.modelBasis??rotationMatrix(site.modelRotation);
    const transform=new THREE.Matrix4().set(
      basis[0],basis[1],basis[2],0,basis[3],basis[4],basis[5],0,basis[6],basis[7],basis[8],0,0,0,0,1,
    );
    const scale=site.modelScale??UNIT_SCALE;
    const {x,z,y}=site.editorPose??{x:site.x,z:site.z,y:site.baseY};
    transform.scale(new THREE.Vector3(scale.x,scale.y,scale.z)).setPosition(x,y,z);
    transform.multiply(new THREE.Matrix4().makeRotationY(site.quarryFacing??0));
    byKit.get(site.quarryKit).push(transform);
  }
  scene.updateMatrixWorld(true);
  scene.traverse(mesh=>{
    if(!mesh.isMesh)return;
    originals.add(mesh.material);
    const instances=byKit.get(mesh.userData.quarryKit);
    if(!instances?.length){
      mesh.geometry.dispose();
      return;
    }
    const uv=mesh.geometry.attributes.uv;
    for(let i=0;i<uv.count;i++)uv.setY(i,1-uv.getY(i));
    addSectorInstances(layer,mesh.geometry,paint,instances.map(matrix=>matrix.clone().multiply(mesh.matrixWorld)),mesh.userData.quarryCaster===true);
  });
  for(const material of originals)material.dispose();
  layer.children.forEach(mesh=>{mesh.receiveShadow=true;});
  layer.userData.paint=paint;
  return layer;
}

export function disposeQuarryDetail(layer) {
  if(!layer)return;
  layer.removeFromParent();
  const geometries=new Set();
  for(const mesh of layer.children){
    mesh.dispose();
    geometries.add(mesh.geometry);
  }
  geometries.forEach(geometry=>geometry.dispose());
  layer.userData.paint._lowMaterial.dispose();
  layer.userData.paint.dispose();
}
