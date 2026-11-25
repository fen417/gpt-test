import {Vector4} from 'three';
import {texture,uniform,vec2,vec3,vec4,positionWorld,cameraPosition,normalWorldGeometry,materialColor,step,mix,smoothstep,clamp} from 'three/tsl';
const bindings=new WeakMap(),graphs=new WeakMap();
function restoreColor(m,b){if(b.base===undefined)delete m.colorNode;else m.colorNode=b.base;m.customProgramCacheKey=b.cache;}
export function suspendWebGpuWeathering(m){const b=bindings.get(m);if(b&&m.colorNode===b.node)restoreColor(m,b);}
export function setWebGpuWeathering(m,mask,params){
  const b=bindings.get(m);
  if(!mask||!params){if(b){if(m.colorNode===b.node)restoreColor(m,b);bindings.delete(m);m.needsUpdate=true;}return;}
  const base=b&&m.colorNode===b.node?b.base:m.colorNode;
  const variant=[m.type,base?.id??'default',...params].join('/');
  if(b&&b.base===base&&b.mask===mask&&b.variant===variant){
    m.colorNode=b.node;m.customProgramCacheKey=b.key;return;
  }
  if(b&&m.colorNode===b.node)restoreColor(m,b);
  const cache=m.customProgramCacheKey;
  let variants=graphs.get(mask);if(!variants){variants=new Map();graphs.set(mask,variants);}
  let graph=variants.get(variant);
  if(!graph){
  const parameters=uniform(new Vector4(...params.slice(0,4))),p=positionWorld;
  const wide=p.xz.add(vec2(p.y.mul(.53),p.y.mul(.91))).mul(.023),macro=texture(mask).sample(wide).toVar();
  const variation=macro.r.sub(.5).mul(parameters.x);
  let dirt=smoothstep(.47,.78,macro.g).mul(parameters.y),crack=vec3(0).x;
  if(params[4]){
    const n=normalWorldGeometry.abs(),vertical=step(n.y,n.x.max(n.z));
    const projected=mix(p.xz,mix(p.xy,p.zy,step(n.z,n.x)),vertical);
    const local=texture(mask).sample(projected.mul(vec2(.18,.12)).add(wide.mul(.17))).toVar();
    dirt=dirt.add(smoothstep(.51,.79,local.g).mul(parameters.y).mul(vertical.mul(.28).add(.32)));
    crack=local.b.mul(parameters.z).mul(smoothstep(18,55,p.sub(cameraPosition).length()).oneMinus());
  }
  const shade=clamp(variation.add(1).sub(dirt).sub(crack),.57,1.22);
  const tint=vec3(.65,.15,-.8).mul(parameters.w).mul(macro.r.add(.5)).add(1).mul(shade);
  const node=vec4(base??materialColor).mul(vec4(tint,1));
  graph={node};variants.set(variant,graph);
  }
  const {node}=graph;
  // Identical immutable parameter sets share the graph; never mutate a
  // shared uniform to apply a different map or material weather profile.
  const key=()=>cache.call(m)+'|s09-weather:'+node.id;
  m.colorNode=node;m.customProgramCacheKey=key;bindings.set(m,{base,mask,variant,node,cache,key});m.needsUpdate=true;
}
