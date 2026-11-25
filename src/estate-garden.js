import * as THREE from 'three';
export function gardenTriangleKind(x,y,z,plants){
  if(y<.09)return 'ground';
  for(const p of plants){
    const dx=Math.abs(x-p.x),dz=Math.abs(z-p.z);
    if(p.type==='tree'&&y>2.65&&dx<1.95&&dz<1.85)return 'replace';
    if((p.type==='hedge'||p.type==='planter')&&y>(p.y??0)+(p.h??.75)-.38&&dx<p.w*.5+.48&&dz<p.d*.5+.48)return 'replace';
  }
  return 'leaves';
}
function subset(source,indices){
  const g=source.clone();g.setIndex(indices);g.clearGroups();g.setDrawRange(0,indices.length);return g;
}
export function splitEstateGarden(scene,map,leafMaterial){
  scene.updateMatrixWorld(true);
  const plants=map.furnishings.filter(p=>['tree','hedge','planter'].includes(p.type));
  const meshes=[];scene.traverse(mesh=>{if(mesh.isMesh&&mesh.userData.architecturalSurface==='garden')meshes.push(mesh);});
  const inverse=new THREE.Matrix4().copy(scene.matrixWorld).invert(),point=new THREE.Vector3(),center=new THREE.Vector3(),added=[];
  for(const mesh of meshes){
    const source=mesh.geometry,position=source.attributes.position,index=source.index,count=index?.count??position.count;
    const groups={ground:[],replace:[],leaves:[]};
    for(let i=0;i<count;i+=3){
      center.set(0,0,0);const ids=[index?index.getX(i):i,index?index.getX(i+1):i+1,index?index.getX(i+2):i+2];
      for(const id of ids)center.add(point.fromBufferAttribute(position,id).applyMatrix4(mesh.matrixWorld));
      center.multiplyScalar(1/3);groups[gardenTriangleKind(center.x,center.y,center.z,plants)].push(...ids);
    }
    if(!groups.replace.length&&!groups.leaves.length)continue;
    mesh.geometry=subset(source,groups.ground);
    if(!groups.ground.length)mesh.visible=false;
    for(const kind of ['replace','leaves']){
      if(!groups[kind].length)continue;
      const part=new THREE.Mesh(subset(source,groups[kind]),leafMaterial);
      part.name=mesh.name+' '+kind;part.userData.architecturalSurface='foliage';
      part.userData.estateLegacyLeaves=kind==='replace';part.castShadow=part.receiveShadow=true;
      part.matrix.multiplyMatrices(inverse,mesh.matrixWorld);
      part.matrix.decompose(part.position,part.quaternion,part.scale);added.push(part);
    }
    source.dispose();
  }
  // Appending after all original nodes preserves architecture bake mesh IDs.
  scene.add(...added);scene.updateMatrixWorld(true);
}
