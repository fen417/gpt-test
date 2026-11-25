import {texture,uniform,vec2,vec4,positionWorld,materialAO,materialEmissive,diffuseColor,float,clamp,mix,step,smoothstep,floor,fract} from 'three/tsl';
const bindings=new WeakMap(),graphs=new WeakMap();
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
  const baseAO=material.aoNode,baseEmissive=material.emissiveNode,cache=material.customProgramCacheKey;
  const variant=[material.type,field.quality.value<1.5?1:2,Boolean(material.aoMap),baseAO?.id??'default',baseEmissive?.id??'default'].join('/');
  let variants=graphs.get(field);if(!variants){variants=new Map();graphs.set(field,variants);}
  let graph=variants.get(variant);
  if(!graph){
  const bounds=uniform(field.bounds),grid=uniform(field.grid),strength=uniform(field.strength.value),tint=uniform(field.sunTint);
  // All materials use the same live uniform nodes per field.
  field.gpu??={strength};const power=field.gpu.strength;
  const uv=positionWorld.xz.sub(bounds.xy).div(bounds.zw),edge=vec2(.5).div(grid.xy);
  const cell=clamp(uv,edge,edge.oneMinus());
  const anchor=floor(cell.mul(grid.xy)).add(.5).div(grid.xy);
  const sample=(coordinate,layer)=>texture(field.texture).sample(coordinate.add(vec2(layer.mod(4),floor(layer.mul(.25)))).div(vec2(4,2)));
  const connected=layer=>{
    const links=sample(anchor,layer.add(4)),delta=cell.sub(anchor).mul(grid.xy);
    const allow=mix(links.rb,links.ga,step(vec2(0),delta));
    return sample(anchor.add(delta.mul(allow).div(grid.xy)),layer);
  };
  const h=sample(cell,float(3)).rg;
  const altitude=positionWorld.y.sub(grid.z).sub(h.r.mul(65280).add(h.g.mul(255)).div(65535).mul(grid.w));
  const level=clamp(altitude.sub(.65).div(2.55),0,1).add(clamp(altitude.sub(3.2).div(5.3),0,1));
  let value;
  if(field.quality.value<1.5)value=connected(floor(level.add(.5)));
  else{
    const lower=floor(level),upper=lower.add(1).min(2),t=fract(level),vertical=sample(anchor,float(7)).rg;
    const permitted=mix(vertical.r,vertical.g,step(1,lower));
    value=mix(connected(lower),connected(upper),mix(step(.5,t),t,permitted));
  }
  const fade=smoothstep(9,17,altitude).oneMinus().mul(step(0,uv.x)).mul(step(0,uv.y)).mul(step(uv.x,1)).mul(step(uv.y,1));
  const probe=mix(vec4(0,0,0,1),value,fade).toVar();
  const originalAO=baseAO??(material.aoMap?materialAO:vec2(1).x);
  const ao=originalAO.mul(probe.a.oneMinus().mul(-.46).mul(power.min(1)).add(1));
  // The standard node material already reduces diffuseColor by metalness in
  // its variants. Using diffuseColor also preserves vertex and instance color.
  const bounce=diffuseColor.rgb.mul(probe.rgb).mul(tint).mul(power).mul(originalAO);
  const emissive=(baseEmissive??materialEmissive).add(bounce);
  graph={ao,emissive};variants.set(variant,graph);
  }
  const {ao,emissive}=graph;
  // Only shared graphs share the cache key. Their uniform sources and custom
  // base nodes are identical; renderer-managed material values stay per draw.
  const key=()=>cache.call(material)+'|s09-gi:'+emissive.id;
  material.aoNode=ao;material.emissiveNode=emissive;material.customProgramCacheKey=key;
  bindings.set(material,{baseAO,baseEmissive,ao,emissive,cache,key});material.needsUpdate=true;
}
function restore(m,k,v){if(v===undefined)delete m[k];else m[k]=v;}
