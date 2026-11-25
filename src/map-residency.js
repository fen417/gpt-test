// GPU residency estimates are based on buffer/mip payloads, not driver VRAM.
export function resourceSet(){return {geometries:new Set(),materials:new Set(),textures:new Set(),instances:new Set()};}
export function collectMaterial(out,m){
  if(!m?.isMaterial||out.materials.has(m))return;
  out.materials.add(m);
  for(const value of Object.values(m))if(value?.isTexture)out.textures.add(value);
  collectMaterial(out,m._lowMaterial);collectMaterial(out,m._highMaterial);
}
export function collectRoot(out,root){
  root?.traverse(o=>{
    if(o.geometry)out.geometries.add(o.geometry);
    if(o.isInstancedMesh)out.instances.add(o);
    for(const m of Array.isArray(o.material)?o.material:[o.material])collectMaterial(out,m);
  });
  return out;
}
export function collectModel(out,model){
  collectRoot(out,model?.base);collectRoot(out,model?.detail);
  for(const m of model?.materials?.values()??[])collectMaterial(out,m);
  for(const t of model?.textures??[])out.textures.add(t);
  if(model?.paint)out.textures.add(model.paint);
  return out;
}
export function collectWorld(world){
  const out=collectRoot(resourceSet(),world.root);
  return collectModel(out,world.model);
}
export function estimateBytes(out,shared=resourceSet()){
  const buffers=new Set();
  const add=a=>{const array=a?.isInterleavedBufferAttribute?a.data.array:a?.array;if(array)buffers.add(array);};
  for(const g of out.geometries)if(!shared.geometries.has(g)){add(g.index);for(const a of Object.values(g.attributes??{}))add(a);for(const list of Object.values(g.morphAttributes??{}))for(const a of list)add(a);}
  for(const m of out.instances)if(!shared.instances.has(m)){add(m.instanceMatrix);add(m.instanceColor);}
  let bytes=0;for(const a of buffers)bytes+=a.byteLength;
  for(const t of out.textures)if(!shared.textures.has(t)){
    if(t.isCompressedTexture&&t.mipmaps?.length){for(const m of t.mipmaps)bytes+=m.data?.byteLength??0;continue;}
    const image=t.image,w=image?.width??0,h=image?.height??0;
    bytes+=Math.ceil((image?.data?.byteLength??w*h*4)*(t.generateMipmaps?4/3:1));
  }
  return bytes;
}
export function releaseResources(out,protectedSet,alreadyDisposed=resourceSet(),forgetMaterial=()=>{}){
  for(const o of out.instances)if(!protectedSet.instances.has(o)&&!alreadyDisposed.instances.has(o))o.dispose?.();
  for(const g of out.geometries)if(!protectedSet.geometries.has(g)&&!alreadyDisposed.geometries.has(g))g.dispose();
  for(const m of out.materials)if(!protectedSet.materials.has(m)){
    forgetMaterial(m);if(!alreadyDisposed.materials.has(m))m.dispose();
  }
  for(const t of out.textures)if(!protectedSet.textures.has(t)&&!alreadyDisposed.textures.has(t))t.dispose();
}
export function residencyPolicy(integrated,low){return integrated||low?{worlds:2,bytes:96*1024*1024}:{worlds:3,bytes:256*1024*1024};}
