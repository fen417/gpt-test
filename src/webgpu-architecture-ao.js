import {texture,attribute,materialAO,float,uniform,mix} from 'three/tsl';
const bindings=new WeakMap();
export function setWebGpuArchitectureAO(material,atlas,strength=0){
  const old=bindings.get(material);
  if(old){
    if(atlas===old.atlas){old.strength.value=strength;return;}
    if(material.aoNode===old.node){if(old.base===undefined)delete material.aoNode;else material.aoNode=old.base;}
    if(material.customProgramCacheKey===old.key)material.customProgramCacheKey=old.cache;
    bindings.delete(material);material.needsUpdate=true;
  }
  if(!atlas)return;
  const base=material.aoNode,cache=material.customProgramCacheKey,amount=uniform(strength);
  const geometryAO=mix(float(1),texture(atlas,attribute('s09ArchitectureUV','vec2')).a,amount);
  const node=(base??(material.aoMap?materialAO:float(1))).mul(geometryAO);
  const key=()=>cache.call(material)+'|s09-architecture-ao:'+node.id;
  material.aoNode=node;material.customProgramCacheKey=key;
  bindings.set(material,{atlas,base,cache,key,node,strength:amount});material.needsUpdate=true;
}
