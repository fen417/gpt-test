
import {Group,InstancedMesh,Matrix4,Object3D} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {createEditorLights,updateEditorLights} from './m05-editor-lights.js';
import {applyEditorMaterials} from './m05-editor-materials.js';
import data from '../../shared/campaign/m05-editor-data.json';
const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
export async function loadEditorModels(models=data.models,lights=[]){
  const root=new Group();root.name='world-editor-models';
  const cached=new Map();
  const buckets=new Map();
  await Promise.all(models.map(async m=>{
    if(!cached.has(m.asset))cached.set(m.asset,loader.loadAsync(import.meta.env.BASE_URL+'world-editor-assets/'+m.asset));
    const original=(await cached.get(m.asset)).scene;
    // Only immutable decorative instances can be batched. Animated, alpha
    // blended and individually overridden models keep their normal hierarchy.
    let batchable=m.scatter&&!m.colliders.length&&!Object.keys(m.materials??{}).length;
    original.traverse(o=>{if(o.isSkinnedMesh||o.isInstancedMesh||o.morphTargetInfluences||o.isMesh&&[o.material].flat().some(mat=>mat.transparent))batchable=false;});
    if(batchable){
      const key=[m.asset,m.detail,m.shadow,Math.floor(m.position[0]/48),Math.floor(m.position[2]/48)].join('/');
      if(!buckets.has(key))buckets.set(key,{original,models:[]});
      buckets.get(key).models.push(m);return;
    }
    const node=new Group();
    node.name=m.id;node.position.fromArray(m.position);node.rotation.fromArray([...m.rotation,'XYZ']);node.scale.fromArray(m.scale);
    node.add(original.clone(true));applyEditorMaterials(node,m.materials);node.userData.worldEditor=m.id;node.userData.editorDetail=m.detail;
    node.traverse(o=>{if(o.isMesh){o.castShadow=m.shadow;o.receiveShadow=true;}});
    root.add(node);
  }));
  for(const {original,models:instances} of buckets.values()){
    const batch=new Group(),first=instances[0],dummy=new Object3D(),matrix=new Matrix4();
    batch.name='world-editor-batch';batch.userData.worldEditor='batch';batch.userData.editorDetail=first.detail;
    batch.position.set(Math.floor(first.position[0]/48)*48,0,Math.floor(first.position[2]/48)*48);
    original.updateMatrixWorld(true);
    original.traverse(mesh=>{
      if(!mesh.isMesh)return;
      const inst=new InstancedMesh(mesh.geometry,mesh.material,instances.length);
      for(const [i,m] of instances.entries()){
        dummy.position.fromArray(m.position).sub(batch.position);dummy.rotation.set(...m.rotation,'XYZ');dummy.scale.fromArray(m.scale);dummy.updateMatrix();
        matrix.multiplyMatrices(dummy.matrix,mesh.matrixWorld);inst.setMatrixAt(i,matrix);
      }
      inst.instanceMatrix.needsUpdate=true;inst.computeBoundingBox();inst.computeBoundingSphere();
      inst.castShadow=first.shadow;inst.receiveShadow=true;batch.add(inst);
    });root.add(batch);
  }
  if(lights.length)root.add(createEditorLights(lights));
  return root;
}
export function updateEditorModelVisibility(root,quality){
  for(const n of root.children){
    if(n.name==='world-editor-lights'){updateEditorLights(n,quality);continue;}
    const d=n.userData.editorDetail;n.visible=d==='low'||d==='medium'&&quality!=='low'||d==='high'&&quality==='high';
  }
}
