const materialPatches=new WeakMap();
const order=['penumbra','relief','weathering','gi','architectureAO','vegetation'];

export function setWebGlShaderPatch(material, key, patch, variant=key) {
  let binding=materialPatches.get(material);
  if(!binding){
    if(!patch)return;
    const compile=material.onBeforeCompile, cache=material.customProgramCacheKey;
    const originalKey=cache.call(material);
    binding={compile,cache,patches:new Map(),variants:new Map()};
    materialPatches.set(material,binding);
    material.onBeforeCompile=function(shader,renderer){
      binding.patches.get('cascades')?.(shader);
      compile.call(this,shader,renderer);
      for(const name of order)binding.patches.get(name)?.(shader);
    };
    material.customProgramCacheKey=()=>originalKey+'|'+['cascades',...order].filter(name=>binding.patches.has(name)).map(name=>binding.variants.get(name)===name?name:name+':'+binding.variants.get(name)).join(',');
  }
  if(patch){binding.patches.set(key,patch);binding.variants.set(key,variant);}
  else{if(!binding.patches.delete(key))return;binding.variants.delete(key);}
  if(!binding.patches.size){
    material.onBeforeCompile=binding.compile;
    material.customProgramCacheKey=binding.cache;
    materialPatches.delete(material);
  }
  material.needsUpdate=true;
}
