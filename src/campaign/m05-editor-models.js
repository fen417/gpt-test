
import {Group} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import data from '../../shared/campaign/m05-editor-data.json';
const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
export async function loadEditorModels(models=data.models){
  const root=new Group();root.name='world-editor-models';
  const cached=new Map();
  await Promise.all(models.map(async m=>{
    if(!cached.has(m.asset))cached.set(m.asset,loader.loadAsync(import.meta.env.BASE_URL+'world-editor-assets/'+m.asset));
    const original=(await cached.get(m.asset)).scene,node=new Group();
    node.name=m.id;node.position.fromArray(m.position);node.rotation.fromArray([...m.rotation,'XYZ']);node.scale.fromArray(m.scale);
    node.add(original.clone(true));node.userData.worldEditor=m.id;node.userData.editorDetail=m.detail;
    node.traverse(o=>{if(o.isMesh){o.castShadow=m.shadow;o.receiveShadow=true;}});
    root.add(node);
  }));
  return root;
}
export function updateEditorModelVisibility(root,quality){
  for(const n of root.children){
    const d=n.userData.editorDetail;n.visible=d==='low'||d==='medium'&&quality!=='low'||d==='high'&&quality==='high';
  }
}
