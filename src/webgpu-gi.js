import {texture,uniform,vec2,vec4,positionWorld,materialAO,materialEmissive,diffuseColor,float,clamp,mix,step,smoothstep,floor,fract} from 'three/tsl';
const bindings=new WeakMap();
export function setWebGpuGI(material,field){
  const old=bindings.get(material);
  if(old){
    if(material.aoNode===old.ao)restore(material,'aoNode',old.baseAO);
    if(material.emissiveNode===old.emissive)restore(material,'emissiveNode',old.baseEmissive);
    if(material.customProgramCacheKey===old.key)material.customProgramCacheKey=old.cache;
    bindings.delete(material);
    material.needsUpdate=true;
  }
  if(!field)return;
  const bounds=uniform(field.bounds),grid=uniform(field.grid),strength=uniform(field.strength.value),tint=uniform(field.sunTint);
  // All materials use the same live uniform nodes per field.
  field.gpu??={strength};const power=field.gpu.strength;
  const uv=positionWorld.xz.sub(bounds.xy).div(bounds.zw),edge=vec2(.5).div(grid.xy);
  const cell=clamp(uv,edge,edge.oneMinus());
  const sample=layer=>texture(field.texture).sample(cell.add(vec2(layer.mod(2),floor(layer.mul(.5)))).mul(.5));
  const h=sample(float(3)).rg;
  const altitude=positionWorld.y.sub(grid.z).sub(h.r.mul(65280).add(h.g.mul(255)).div(65535).mul(grid.w));
  const level=clamp(altitude.sub(.65).div(2.55),0,1).add(clamp(altitude.sub(3.2).div(5.3),0,1));
  const value=field.quality.value<1.5?sample(floor(level.add(.5))):mix(sample(floor(level)),sample(floor(level).add(1).min(2)),fract(level));
  const fade=smoothstep(9,17,altitude).oneMinus().mul(step(0,uv.x)).mul(step(0,uv.y)).mul(step(uv.x,1)).mul(step(uv.y,1));
  const probe=mix(vec4(0,0,0,1),value,fade).toVar();
  const baseAO=material.aoNode,baseEmissive=material.emissiveNode,cache=material.customProgramCacheKey;
  const originalAO=baseAO??(material.aoMap?materialAO:vec2(1).x);
  const ao=originalAO.mul(probe.a.oneMinus().mul(-.34).mul(power.min(1)).add(1));
  // The standard node material already reduces diffuseColor by metalness in
  // its variants. Using diffuseColor also preserves vertex and instance color.
  const bounce=diffuseColor.rgb.mul(probe.rgb).mul(tint).mul(power).mul(originalAO);
  const emissive=(baseEmissive??materialEmissive).add(bounce);
  const key=()=>cache.call(material)+'|s09-gi:'+material.id+':'+emissive.id;
  material.aoNode=ao;material.emissiveNode=emissive;material.customProgramCacheKey=key;
  bindings.set(material,{baseAO,baseEmissive,ao,emissive,cache,key});material.needsUpdate=true;
}
function restore(m,k,v){if(v===undefined)delete m[k];else m[k]=v;}
