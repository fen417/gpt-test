import * as THREE from 'three';
// Preserve the original triangle order and every vertex attribute, including
// normalized integer values, while removing vertices unused by a material group.
export function compactGeometryGroup(source,group){
  const total=source.index?.count??source.attributes.position.count;
  const end=Math.min(total,group.start+group.count);
  const indices=source.index?.array,attributeEntries=Object.entries(source.attributes);
  if(group.start===0&&end===total||Object.keys(source.morphAttributes).length||
     attributeEntries.some(([,a])=>!a.array&&!a.isInterleavedBufferAttribute||a.isFloat16BufferAttribute||a.isInstancedBufferAttribute)){
    const geometry=source.clone();
    const selected=Array.from({length:Math.max(0,end-group.start)},(_,i)=>indices?indices[group.start+i]:group.start+i);
    geometry.setIndex(selected);geometry.clearGroups();return geometry;
  }
  const used=[],lookup=new Map(),remapped=[];
  for(let i=group.start;i<end;i++){
    const index=indices?indices[i]:i;
    let next=lookup.get(index);
    if(next===undefined){next=used.length;lookup.set(index,next);used.push(index);}
    remapped.push(next);
  }
  const geometry=new THREE.BufferGeometry();
  for(const [name,attribute] of attributeEntries){
    const interleaved=attribute.isInterleavedBufferAttribute,raw=interleaved?attribute.data.array:attribute.array;
    const stride=interleaved?attribute.data.stride:attribute.itemSize,offset=interleaved?attribute.offset:0;
    const values=new raw.constructor(used.length*attribute.itemSize);
    for(let i=0;i<used.length;i++)for(let j=0;j<attribute.itemSize;j++)values[i*attribute.itemSize+j]=raw[used[i]*stride+offset+j];
    const attr=new THREE.BufferAttribute(values,attribute.itemSize,attribute.normalized);
    attr.name=attribute.name;attr.gpuType=attribute.gpuType??attr.gpuType;
    geometry.setAttribute(name,attr);
  }
  geometry.setIndex(remapped);return geometry;
}
