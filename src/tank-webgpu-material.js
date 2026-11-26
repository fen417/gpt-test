// WebGPU counterpart of the original GLSL track UV scrolling and camouflage.
// Instancing/LOD/rigging remain in tank-model.js. No additional draw passes.
import {MeshLambertNodeMaterial,MeshStandardNodeMaterial} from 'three/webgpu';
import {attribute,uv,texture,reference,vertexColor,uniform,vec2,vec4,
  abs,select,smoothstep,mix,clamp} from 'three/tsl';
export function createWebGpuTankMaterial({atlas,travel,desertCamo,desertSand,desertBrown,surface}){
  const material=surface?new MeshStandardNodeMaterial({
    vertexColors:true,map:surface.map,side:surface.side,
    normalMap:surface.normalMap,normalScale:surface.normalScale.clone(),
    roughnessMap:surface.roughnessMap,roughness:surface.roughness,
    metalnessMap:surface.metalnessMap,metalness:surface.metalness,envMapIntensity:.4,
  }):new MeshLambertNodeMaterial({vertexColors:true,map:atlas});
  const desertNode=uniform(0);
  desertCamo.node=desertNode;
  let atlasUv=uv(1);
  if(!surface){
    const travelNode=uniform(travel.value);
    const side=attribute('trackSide','float');
    const offset=select(abs(side).greaterThan(.5),
      select(side.lessThan(0),travelNode.x,travelNode.y),0);
    atlasUv=uv().add(vec2(0,offset));
  }
  const sampled=texture(atlas,atlasUv);
  // The shadow pipeline evaluates the material's alpha with a temporary
  // override material. Its uniform must still reference the tank material.
  const color=reference('color','color',material);
  const shade=smoothstep(.34,.60,sampled.r);
  const paint=surface?attribute('tankPaint','float'):smoothstep(.08,.17,vertexColor().r);
  const camo=mix(uniform(desertBrown.value),uniform(desertSand.value),shade)
    .mul(clamp(vertexColor().r.div(.23),.72,1.16));
  // Three.js applies vertex colors after colorNode, exactly as in GLSL.
  const pigment=surface?color.mul(texture(surface.map,uv()).rgb):color;
  const base=surface?mix(pigment,pigment.mul(sampled.rgb),paint):pigment.mul(sampled.rgb);
  material.colorNode=vec4(mix(base,pigment.mul(camo),paint.mul(desertNode)),sampled.a);
  return material;
}
