import {Vector4} from 'three';
import {texture,uniform,vec2,vec3,vec4,float,positionWorld,cameraPosition,normalWorldGeometry,materialColor,materialRoughness,step,mix,smoothstep,clamp} from 'three/tsl';
const bindings=new WeakMap(),graphs=new WeakMap();
function restore(m,b){
  if(m.colorNode===b.node){if(b.base===undefined)delete m.colorNode;else m.colorNode=b.base;}
  if(b.roughness&&m.roughnessNode===b.roughness){if(b.baseRoughness===undefined)delete m.roughnessNode;else m.roughnessNode=b.baseRoughness;}
  if(m.customProgramCacheKey===b.key)m.customProgramCacheKey=b.cache;
}
export function suspendWebGpuWeathering(m){const b=bindings.get(m);if(b)restore(m,b);}
export function setWebGpuWeathering(m,mask,params){
  const b=bindings.get(m);
  if(!mask||!params){if(b){restore(m,b);bindings.delete(m);m.needsUpdate=true;}return;}
  const base=b&&m.colorNode===b.node?b.base:m.colorNode;
  const baseRoughness=b&&m.roughnessNode===b.roughness?b.baseRoughness:m.roughnessNode;
  const road=m.roadMask&&m.userData.villageRoadSpan&&params[4]?m.roadMask:null;
  const variant=[m.type,base?.id??'default',baseRoughness?.id??'default',road?.uuid??'',...params].join('/');
  if(b&&b.base===base&&b.baseRoughness===baseRoughness&&b.mask===mask&&b.variant===variant){
    m.colorNode=b.node;if(b.roughness)m.roughnessNode=b.roughness;m.customProgramCacheKey=b.key;return;
  }
  if(b)restore(m,b);
  const cache=m.customProgramCacheKey;
  let variants=graphs.get(mask);if(!variants){variants=new Map();graphs.set(mask,variants);}
  let graph=variants.get(variant);
  if(!graph){
    const parameters=uniform(new Vector4(...params.slice(0,4))),p=positionWorld;
    const art=vec4(...params.slice(5,9)),response=params[9];
    const wide=p.xz.add(vec2(p.y.mul(.53),p.y.mul(.91))).mul(.023),macro=texture(mask).sample(wide).toVar();
    const variation=macro.r.sub(.5).mul(parameters.x),n=normalWorldGeometry.abs(),vertical=step(n.y,n.x.max(n.z));
    let dirt=smoothstep(.47,.78,macro.g).mul(parameters.y),crack=float(0),streak=float(0),chips=float(0),oxide=float(0);
    let dust=smoothstep(.40,.76,macro.g).mul(art.w).mul(vertical.mul(.55).oneMinus()).mul(.34);
    if(params[4]){
      const projected=mix(p.xz,mix(p.xy,p.zy,step(n.z,n.x)),vertical);
      const local=texture(mask).sample(projected.mul(vec2(.18,.12)).add(wide.mul(.17))).toVar();
      const near=smoothstep(18,55,p.sub(cameraPosition).length()).oneMinus();
      const detail=texture(mask).sample(projected.mul(mix(vec2(.81,.81),vec2(.62,.38),vertical)).add(wide.mul(.23))).toVar();
      dirt=dirt.add(smoothstep(.51,.79,local.g).mul(parameters.y).mul(vertical.mul(.28).add(.32)));
      crack=local.b.mul(parameters.z).mul(near);
      streak=smoothstep(.46,.73,detail.a).mul(smoothstep(.62,.84,macro.g)).mul(art.x).mul(vertical).mul(near).mul(.14);
      chips=smoothstep(.61,.84,local.g.add(detail.b.mul(.35))).mul(art.y).mul(near).mul(.34);
      oxide=smoothstep(.45,.72,local.g.add(detail.a.mul(.23))).mul(art.z).mul(near).mul(.62);
      dust=dust.add(smoothstep(.40,.73,local.r).mul(art.w).mul(vertical.mul(.65).oneMinus()).mul(near).mul(.24));
    }
    const shade=clamp(variation.add(1).sub(dirt).sub(crack).sub(streak),.72,1.22);
    let tint=vec3(.65,.15,-.8).mul(parameters.w).mul(macro.r.add(.5)).add(1).mul(shade)
      .mul(mix(vec3(1),vec3(...params.slice(10,13)),clamp(dust,0,.7)))
      .mul(mix(vec3(1),vec3(...params.slice(13,16)),chips))
      .mul(mix(vec3(1),vec3(...params.slice(16,19)),oxide));
    if(road){
      const roadUv=p.xz.mul(vec2(1,-1)).div(m.userData.villageRoadSpan).add(.5);
      const r=texture(road).sample(roadUv).g,shoulder=r.mul(r.oneMinus()).mul(4);
      const noise=texture(mask).sample(p.xz.mul(.18)).r;
      tint=tint.mul(shoulder.mul(noise.sub(.32)).mul(.26).sub(r.mul(smoothstep(.55,.84,noise)).mul(.09)).add(1));
    }
    const node=vec4(base??materialColor).mul(vec4(tint,1));
    const roughness=m.isMeshStandardMaterial?clamp((baseRoughness??materialRoughness).add(dust.add(oxide).add(streak).add(chips.mul(.35)).mul(response)),.04,1):null;
    graph={node,roughness};variants.set(variant,graph);
  }
  const {node,roughness}=graph;
  const key=()=>cache.call(m)+'|s09-weather:'+node.id;
  m.colorNode=node;if(roughness)m.roughnessNode=roughness;
  m.customProgramCacheKey=key;bindings.set(m,{base,baseRoughness,mask,variant,node,roughness,cache,key});m.needsUpdate=true;
}
