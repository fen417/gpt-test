import * as THREE from 'three';
import {buildSpecialProp} from '../../shared/prop-models.js';

// Same six-wheel cargo truck used by the existing maps, with its original
// rounded cab, undercarriage, glazing, grille, body ribs and textured materials.
export function createCampaignTruck(renderer,parent,x,z,ownedMaterials){
  const group=new THREE.Group();parent.add(group);
  buildSpecialProp.call(renderer,group,{kind:'truck',x:0,z:0,w:3,d:7,h:3.3},renderer.materials.steel);
  const clones=new Map();
  group.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const clone=source=>{
      if(!clones.has(source)){const material=source.clone();material.userData={...source.userData,unburnedColor:source.color?.clone(),unburnedOpacity:source.opacity};clones.set(source,material);ownedMaterials.push(material);}
      return clones.get(source);
    };
    mesh.material=Array.isArray(mesh.material)?mesh.material.map(clone):clone(mesh.material);
  });
  groundCampaignTruck(group,renderer.map.terrain,x,z);return group;
}
export function groundCampaignTruck(group,terrain,x,z,yaw=0){
  const c=Math.cos(yaw),s=Math.sin(yaw),sample=(lx,lz)=>terrain.heightAt(x+c*lx+s*lz,z-s*lx+c*lz);
  const sx=(sample(1.38,0)-sample(-1.38,0))/2.76,sz=(sample(0,2.4)-sample(0,-2.4))/4.8;
  const base=sample(0,0),correction=Math.max(...[-1.38,1.38].flatMap(lx=>[-2.52,-.84,2.24].map(lz=>sample(lx,lz)-base-sx*lx-sz*lz)));
  group.position.set(x,base+correction,z);group.rotation.set(-Math.atan(sz),yaw,Math.atan(sx),'YXZ');
}
export function burnCampaignTruck(group,destroyed){
  if(group.userData.burned===destroyed)return;group.userData.burned=destroyed;
  group.traverse(mesh=>{for(const m of mesh.material?(Array.isArray(mesh.material)?mesh.material:[mesh.material]):[]){if(m.userData.unburnedColor)m.color.copy(m.userData.unburnedColor).lerp(new THREE.Color('#292620'),destroyed?.82:0);if(m.transparent)m.opacity=destroyed?.25:m.userData.unburnedOpacity;}});
}
