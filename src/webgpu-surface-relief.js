import { texture, uv, positionView, normalViewGeometry, wgslFn, uniform, vec4, materialNormal,
  materialRoughness, materialAO } from 'three/tsl';

const reliefUv=wgslFn(`
fn s09ReliefUv(heightMap: texture_2d<f32>, heightSampler: sampler, baseUv: vec2f, viewPosition: vec3f,
  normal: vec3f, scale: f32, steps: i32) -> vec2f {
  let dx=dpdx(baseUv); let dy=dpdy(baseUv);
  let px=dpdx(viewPosition); let py=dpdy(viewPosition);
  let determinant=dx.x*dy.y-dx.y*dy.x;
  if(abs(determinant)<1.e-10 || abs(viewPosition.z)>46.){return baseUv;}
  let tangent=normalize(px*dy.y-py*dx.y)*sign(determinant);
  let bitangent=normalize(py*dx.x-px*dy.x)*sign(determinant);
  let view=normalize(-viewPosition);
  let facing=abs(dot(normal,view));
  let strength=scale*(1.-smoothstep(28.,46.,abs(viewPosition.z)))*smoothstep(.04,.19,facing);
  let span=vec2f(dot(view,tangent),dot(view,bitangent))*strength/max(.22,facing);
  if(steps==1){return baseUv-span*(.5-textureSampleGrad(heightMap,heightSampler,baseUv,dx,dy).r);}
  var level=0.;
  let stepSize=1./f32(steps);
  var previous=0.;
  var coordinate=baseUv+span*.5;
  let delta=span*stepSize;
  for(var i=0;i<=16;i++){
    let surface=1.-textureSampleGrad(heightMap,heightSampler,coordinate,dx,dy).r;
    let gap=surface-level;
    if(gap<=0.){return coordinate+delta*clamp(-gap/max(1.e-5,previous-gap),0.,1.);}
    if(i>=steps){break;}
    previous=gap;
    coordinate-=delta;
    level+=stepSize;
  }
  return coordinate;
}`);

const bindings=new WeakMap();

export function setWebGpuRelief(material,map,steps,scale) {
  const previous=bindings.get(material);
  if(!map){
    if(!previous)return;
    for(const [key,value] of Object.entries(previous.base)){
      if(value===undefined)delete material[key];else material[key]=value;
    }
    material.needsUpdate=true;
    bindings.delete(material);
    return;
  }
  if(previous?.map===map&&previous.albedo===material.map&&previous.hasAO===Boolean(material.aoMap)){
    previous.stepCount.value=steps;
    return;
  }
  const base=previous?.base??Object.fromEntries(['colorNode','normalNode','roughnessNode','aoNode'].map(key=>[key,material[key]]));
  const height=texture(map),stepCount=uniform(steps,'int');
  const coordinates=reliefUv({heightMap:height,heightSampler:height,baseUv:uv(),viewPosition:positionView,
    normal:normalViewGeometry,scale:uniform(scale),steps:stepCount}).toVar();
  const context={getUV:()=>coordinates};
  const color=texture(material.map).sample(coordinates).rgb.mul(uniform(material.color));
  material.colorNode=vec4(color,1);
  material.normalNode=materialNormal.context(context);
  material.roughnessNode=materialRoughness.context(context);
  material.aoNode=material.aoMap?materialAO.context(context):null;
  material.needsUpdate=true;
  bindings.set(material,{base,map,albedo:material.map,hasAO:Boolean(material.aoMap),stepCount});
}
