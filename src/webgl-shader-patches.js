const materialPatches=new WeakMap();
const order=['penumbra','relief','weathering'];

export function setWebGlShaderPatch(material, key, patch) {
  let binding=materialPatches.get(material);
  if(!binding){
    if(!patch)return;
    const compile=material.onBeforeCompile, cache=material.customProgramCacheKey;
    const originalKey=cache.call(material);
    binding={compile,cache,patches:new Map()};
    materialPatches.set(material,binding);
    material.onBeforeCompile=function(shader,renderer){
      binding.patches.get('cascades')?.(shader);
      compile.call(this,shader,renderer);
      for(const name of order)binding.patches.get(name)?.(shader);
    };
    material.customProgramCacheKey=()=>originalKey+'|'+['cascades',...order].filter(name=>binding.patches.has(name)).join(',');
  }
  if(patch)binding.patches.set(key,patch);
  else if(!binding.patches.delete(key))return;
  if(!binding.patches.size){
    material.onBeforeCompile=binding.compile;
    material.customProgramCacheKey=binding.cache;
    materialPatches.delete(material);
  }
  material.needsUpdate=true;
}
