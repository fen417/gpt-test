import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// The uploaded Blender scene is a single GLB with 42 meshes/20 materials.
// Use GLTFLoader for the original mesh and its embedded texture images, not a
// procedural substitute. Authoritative gameplay collision is in shared/.
const FILE='assets/maps/linden-estate.glb';

function createTemporaryBlockout(map){
  const root=new THREE.Group();
  root.name='Estate loading fallback';
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(50,48),
    new THREE.MeshStandardMaterial({color:0x425039,roughness:1}));
  ground.rotation.x=-Math.PI/2;ground.position.set(0,-.04,7);
  ground.receiveShadow=true;root.add(ground);

  const material=new THREE.MeshStandardMaterial({color:0x8c8274,roughness:.92});
  const solids=map.boxes.filter(b=>b.kind==='wall'&&!b.overhead);
  const batch=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),material,solids.length);
  const temp=new THREE.Object3D();
  for(const [i,box] of solids.entries()){
    temp.position.set(box.x,(box.baseY??0)+box.h/2,box.z);
    temp.scale.set(box.w,box.h,box.d);temp.updateMatrix();
    batch.setMatrixAt(i,temp.matrix);
  }
  batch.instanceMatrix.needsUpdate=true;
  batch.receiveShadow=true;
  root.add(batch);
  const water=new THREE.Mesh(new THREE.PlaneGeometry(9,3.1),
    new THREE.MeshStandardMaterial({color:0x367f88,roughness:.35,transparent:true,opacity:.65}));
  water.rotation.x=-Math.PI/2;water.position.set(-1.5,-.17,17.45);
  root.add(water);
  return root;
}

export function buildLindenEstate(map,root){
  const fallback=createTemporaryBlockout(map);
  root.add(fallback);
  const loader=new GLTFLoader();
  const source=new URL(FILE,document.baseURI).href;
  loader.load(source,gltf=>{
    if(!root.parent){
      gltf.scene.traverse(object=>{
        if(object.isMesh){object.geometry?.dispose();for(const m of Array.isArray(object.material)?object.material:[object.material])m?.dispose();}
      });
      return;
    }
    const estate=gltf.scene;
    estate.name='Linden Estate · imported GLB';
    estate.traverse(object=>{
      if(!object.isMesh)return;
      object.frustumCulled=true;
      object.receiveShadow=true;
      // A few large surfaces casting shadows are cheaper than thousands of
      // small chairs, railings and foliage on Intel HD 610.
      object.castShadow=/Masonry|Roof|Portico|Chimney|Tree trunk/i.test(object.name);
    });
    root.add(estate);
    root.remove(fallback);
    fallback.traverse(object=>{
      if(object.geometry)object.geometry.dispose();
      if(object.material){
        for(const mat of Array.isArray(object.material)?object.material:[object.material])mat.dispose();
      }
    });
    console.info('[SECTOR 09] Linden Estate GLB loaded',source);
  },undefined,error=>{
    console.error('[SECTOR 09] Linden Estate GLB was not loaded; showing collision blockout:',source,error);
  });
}
