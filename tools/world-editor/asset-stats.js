
import {Box3,Vector3} from 'three';
export function assetStats(root){
 let triangles=0,meshes=0,vertices=0,drawCalls=0,geometryBytes=0,textureBytes=0;
 const geometries=new Set(),materials=new Set(),textures=new Set(),arrays=new Set();
 root.traverse(o=>{
  if(!o.isMesh)return;meshes++;
  const g=o.geometry,instances=o.isInstancedMesh?o.count:1,n=g.index?.count??g.attributes.position?.count??0;
  triangles+=Math.floor(n/3)*instances;vertices+=(g.attributes.position?.count??0)*instances;
  drawCalls+=Array.isArray(o.material)?Math.max(1,g.groups.length):1;
  if(!geometries.has(g)){
   geometries.add(g);
   for(const a of [...Object.values(g.attributes),g.index,...Object.values(g.morphAttributes).flat()]){
    const array=a?.isInterleavedBufferAttribute?a.data.array:a?.array;if(array&&!arrays.has(array.buffer)){arrays.add(array.buffer);geometryBytes+=array.buffer.byteLength;}
   }
  }
  for(const mat of [o.material].flat())if(mat&&!materials.has(mat)){
   materials.add(mat);for(const value of Object.values(mat))if(value?.isTexture)textures.add(value);
  }
 });
 for(const t of textures){
  const image=t.image??t.source?.data;
  if(t.isCompressedTexture&&t.mipmaps?.length)textureBytes+=t.mipmaps.reduce((s,m)=>s+(m.data?.byteLength??0),0);
  else if(image?.width&&image?.height)textureBytes+=image.width*image.height*4*(t.generateMipmaps?4/3:1);
 }
 const bounds=new Box3().setFromObject(root),size=bounds.isEmpty()?[0,0,0]:bounds.getSize(new Vector3()).toArray();
 return {triangles,meshes,vertices,drawCalls,geometryBytes,textureBytes:Math.round(textureBytes),textures:textures.size,materials:materials.size,size};
}
