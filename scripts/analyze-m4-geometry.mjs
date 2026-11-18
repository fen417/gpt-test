// Geometry probe for the combined third-person M4 receiver mesh. Run only
// when adjusting the first-person iron-sight cut.
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
const bytes=await readFile(new URL('../src/assets/infantry/m4a1.glb',import.meta.url));
const gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).register(()=>({
  name:'KHR_texture_basisu',loadTexture:()=>Promise.resolve(new THREE.Texture()),
})).parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
gltf.scene.updateMatrixWorld(true);
for(const mesh of gltf.scene.children[0].children.filter(x=>x.isMesh)){
 const g=mesh.geometry,p=g.attributes.position,idx=g.index;
 const parent=Array.from({length:p.count},(_,i)=>i);
 const find=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i]}return i};
 const unite=(a,b)=>{a=find(a);b=find(b);if(a!==b)parent[b]=a};
 const weld=new Map();
 for(let i=0;i<p.count;i++){
  const key=[p.getX(i),p.getY(i),p.getZ(i)].map(x=>Math.round(x*10000)).join(',');
  const old=weld.get(key);if(old===undefined)weld.set(key,i);else unite(i,old);
 }
 for(let i=0;i<idx.count;i+=3){const a=idx.getX(i),b=idx.getX(i+1),c=idx.getX(i+2);unite(a,b);unite(b,c)}
 const comps=new Map();
 for(let i=0;i<idx.count;i+=3){
   const root=find(idx.getX(i));let c=comps.get(root);
   if(!c){c={tris:0,min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};comps.set(root,c)}
   c.tris++;
   for(let j=0;j<3;j++){const v=idx.getX(i+j);const xyz=[p.getX(v),p.getY(v),p.getZ(v)];for(let k=0;k<3;k++){c.min[k]=Math.min(c.min[k],xyz[k]);c.max[k]=Math.max(c.max[k],xyz[k])}}
 }
 const results=[...comps.values()].sort((a,b)=>b.tris-a.tris);
 console.log('MESH',mesh.name,'node position',mesh.position.toArray(),'scale',mesh.scale.toArray(),'overall triangles',idx.count/3,'components',results.length);
 for(const c of results.filter(c=>c.tris>=8)){
    console.log('M4_COMPONENT',JSON.stringify({tris:c.tris,min:c.min.map(v=>+v.toFixed(4)),max:c.max.map(v=>+v.toFixed(4))}));
 }
}
