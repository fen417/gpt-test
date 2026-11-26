import {texture,uv,positionView,normalViewGeometry,wgslFn,uniform,materialColor,materialNormal,
  materialRoughness,materialMetalness,materialAO} from 'three/tsl';

const reliefUv=wgslFn(`
fn s09ReliefUv(heightMap: texture_2d<f32>,heightSampler: sampler,baseUv: vec2f,viewPosition: vec3f,
  normal: vec3f,scale: f32,stepsMax: i32,range: f32) -> vec2f {
  let dx=dpdx(baseUv);let dy=dpdy(baseUv);
  let px=dpdx(viewPosition);let py=dpdy(viewPosition);
  let determinant=dx.x*dy.y-dx.y*dy.x;let dist=length(viewPosition);
  if(abs(determinant)<1.e-10||dist>=range){return baseUv;}
  let tangent=normalize(px*dy.y-py*dx.y)*sign(determinant);
  let bitangent=normalize(py*dx.x-px*dy.x)*sign(determinant);
  let view=normalize(-viewPosition);let facing=abs(dot(normal,view));
  if(facing<=.04){return baseUv;}
  let strength=scale*(1.-smoothstep(range*.60,range,dist))*smoothstep(.04,.19,facing);
  let span=vec2f(dot(view,tangent),dot(view,bitangent))*strength/max(.22,facing);
  if(stepsMax==1){return baseUv-span*(.5-textureSampleGrad(heightMap,heightSampler,baseUv,dx,dy).r);}
  let lod=clamp(1.-dist/range,0.,1.);
  let steps=i32(clamp(floor(f32(stepsMax)*(.30+.70*lod)*(.58+.42*clamp(1.-facing,0.,1.))+.5),4.,f32(stepsMax)));
  var level=0.;let stepSize=1./f32(steps);
  var previous=0.;var coordinate=baseUv+span*.5;let delta=span*stepSize;
  for(var i=0;i<=24;i++){
    let gap=1.-textureSampleGrad(heightMap,heightSampler,coordinate,dx,dy).r-level;
    if(gap<=0.){
      if(i==0){return coordinate;}
      if(stepsMax>16){
        var lo=coordinate;var hi=coordinate+delta;
        var loLevel=level;var hiLevel=level-stepSize;
        for(var j=0;j<2;j++){
          let mid=(lo+hi)*.5;let ml=(loLevel+hiLevel)*.5;
          if(1.-textureSampleGrad(heightMap,heightSampler,mid,dx,dy).r>ml){hi=mid;hiLevel=ml;}
          else{lo=mid;loLevel=ml;}
        }
        return (lo+hi)*.5;
      }
      return coordinate+delta*clamp(-gap/max(1.e-5,previous-gap),0.,1.);
    }
    if(i>=steps){break;}
    previous=gap;coordinate-=delta;level+=stepSize;
  }
  return coordinate;
}`);
const bindings=new WeakMap();
export function setWebGpuRelief(material,map,steps,scale,range=46){
  const previous=bindings.get(material);
  if(!map){
    if(!previous)return;
    for(const [key,value] of Object.entries(previous.base)){
      if(value===undefined)delete material[key];else material[key]=value;
    }
    material.needsUpdate=true;bindings.delete(material);return;
  }
  const packedAO=Boolean(material.aoMap&&material.aoMap===material.roughnessMap);
  const signature=[material.map?.uuid,material.normalMap?.uuid,material.roughnessMap?.uuid,material.metalnessMap?.uuid,packedAO].join('/');
  if(previous?.map===map&&previous.signature===signature){
    previous.stepCount.value=steps;previous.depth.value=scale;previous.range.value=range;return;
  }
  if(previous)setWebGpuRelief(material,null);
  const base=Object.fromEntries(['colorNode','normalNode','roughnessNode','metalnessNode','aoNode'].map(key=>[key,material[key]]));
  const height=texture(map),stepCount=uniform(steps,'int'),depth=uniform(scale),reach=uniform(range);
  // All PBR scan channels share the same repeat. Trace in transformed
  // texture space, then undo the repeat before MaterialNode's UV transform.
  const repeat=uniform(map.repeat),offset=uniform(map.offset);
  const coordinates=reliefUv({heightMap:height,heightSampler:height,baseUv:uv().mul(repeat).add(offset),viewPosition:positionView,
    normal:normalViewGeometry,scale:depth,stepsMax:stepCount,range:reach}).sub(offset).div(repeat).toVar();
  const context={getUV:()=>coordinates};
  material.colorNode=(base.colorNode??materialColor).context(context);
  material.normalNode=(base.normalNode??materialNormal).context(context);
  material.roughnessNode=(base.roughnessNode??materialRoughness).context(context);
  if(material.metalnessMap)material.metalnessNode=(base.metalnessNode??materialMetalness).context(context);
  if(packedAO)material.aoNode=(base.aoNode??materialAO).context(context);
  material.needsUpdate=true;
  bindings.set(material,{base,map,signature,stepCount,depth,range:reach});
}
