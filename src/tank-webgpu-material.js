// WebGPU counterpart of the original GLSL track UV scrolling and camouflage.
// Instancing/LOD/rigging remain in tank-model.js. No additional draw passes.
import {MeshLambertNodeMaterial} from 'three/webgpu';
import {attribute,uv,texture,materialReference,vertexColor,uniform,vec2,vec4,
  abs,select,smoothstep,mix,clamp} from 'three/tsl';
import * as THREE from 'three';

export function createWebGpuTankMaterial({atlas,travel,desertCamo,desertSand,desertBrown}){
  const material=new MeshLambertNodeMaterial({
    vertexColors:true,map:atlas,
  });
  const travelNode=uniform(travel.value);
  const desertNode=uniform(0);
  desertCamo.node=desertNode;
  const side=attribute('trackSide','float');
  const offset=select(abs(side).greaterThan(.5),
    select(side.lessThan(0),travelNode.x,travelNode.y),0);
  const sampled=texture(atlas,uv().add(vec2(0,offset)));
  const color=materialReference('color','color');
  const shade=smoothstep(.34,.60,sampled.r);
  const paint=smoothstep(.08,.17,vertexColor().r).mul(desertNode);
  const camo=mix(uniform(desertBrown.value),uniform(desertSand.value),shade)
    .mul(clamp(vertexColor().r.div(.23),.72,1.16));
  // Three.js applies vertex colors after colorNode, exactly as in GLSL.
  material.colorNode=vec4(mix(color.mul(sampled.rgb),color.mul(camo),paint),sampled.a);
  material.userData.tankTrackTravel=true;
  return material;
}
