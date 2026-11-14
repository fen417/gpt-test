export function applyTextureFiltering(roots,materials,quality,maxAnisotropy){
  const limit=quality==='high'?maxAnisotropy:Math.min(maxAnisotropy,quality==='medium'?4:2);
  const visited=new Set(),textures=new Set();
  function apply(material){
    if(!material||visited.has(material))return;visited.add(material);
    for(const value of Object.values(material))if(value?.isTexture&&!textures.has(value)){
      textures.add(value);if(value.anisotropy!==limit){value.anisotropy=limit;value.needsUpdate=true;}
    }
    apply(material._highMaterial);apply(material._lowMaterial);
  }
  for(const material of materials)apply(material);
  for(const root of roots)root?.traverse(object=>{for(const material of Array.isArray(object.material)?object.material:[object.material])apply(material);});
  return limit;
}
