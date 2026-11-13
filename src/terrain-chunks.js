import * as THREE from 'three';

// Partition the original indexed grid AFTER roads have attached UV1/materials.
// Copy original normals/UVs verbatim: no terrain seams or appearance changes.
export function partitionTerrain(parent, geometry, cells = 24) {
  const meshes=parent.children.filter(o=>o.isMesh&&o.geometry===geometry);
  const width=geometry.parameters.widthSegments,height=geometry.parameters.heightSegments;
  for(let z=0;z<height;z+=cells)for(let x=0;x<width;x+=cells){
    const w=Math.min(cells,width-x),h=Math.min(cells,height-z),chunk=new THREE.BufferGeometry();
    for(const [name,attribute] of Object.entries(geometry.attributes)){
      const data=new attribute.array.constructor((w+1)*(h+1)*attribute.itemSize);let offset=0;
      for(let j=0;j<=h;j++)for(let i=0;i<=w;i++){
        const start=((z+j)*(width+1)+x+i)*attribute.itemSize;
        data.set(attribute.array.subarray(start,start+attribute.itemSize),offset);offset+=attribute.itemSize;
      }
      chunk.setAttribute(name,new THREE.BufferAttribute(data,attribute.itemSize,attribute.normalized));
    }
    const indices=[];
    for(let j=0;j<h;j++)for(let i=0;i<w;i++){
      const a=j*(w+1)+i,b=a+w+1;indices.push(a,b,a+1,b,b+1,a+1);
    }
    chunk.setIndex(indices);chunk.computeBoundingSphere();chunk.userData.owned=true;
    for(const mesh of meshes){const tile=new THREE.Mesh(chunk,mesh.material);
      tile.position.copy(mesh.position);tile.rotation.copy(mesh.rotation);tile.scale.copy(mesh.scale);
      tile.receiveShadow=mesh.receiveShadow;tile.castShadow=mesh.castShadow;tile.renderOrder=mesh.renderOrder;
      tile.userData.noBatch=true;parent.add(tile);
    }
  }
  for(const mesh of meshes)mesh.removeFromParent();geometry.dispose();
}
