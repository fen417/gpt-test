import * as THREE from 'three';
import {pairMaterials} from './visuals.js';

// Lightweight fallback and editor geometry from the same volumes and floor profile.
export function buildPoolDay(owner,map,root){
  const materials=new Map();
  const material=(color,water=false)=>{
    if(!materials.has(color)){
      const style={color,...(water?{transparent:true,depthWrite:false,opacity:.46}:{})};
      materials.set(color,pairMaterials(new THREE.MeshStandardMaterial({...style,roughness:water?.22:.85}),
        new THREE.MeshLambertMaterial(style)));
    }
    return materials.get(color);
  };
  const add=(geometry,style,cast=true)=>{
    geometry.userData.owned=true;
    const mesh=new THREE.Mesh(geometry,style);
    mesh.receiveShadow=mesh.castShadow=cast;
    root.add(mesh);
    return mesh;
  };
  const floor=(x0,x1,z0,z1,y0,y1,style)=>{
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute([x0,y0,z0,x0,y1,z1,x1,y1,z1,x1,y0,z0],3));
    geometry.setIndex([0,1,2,0,2,3]);
    geometry.computeVertexNormals();
    const mesh=add(geometry,style,false);
    mesh.receiveShadow=!style.transparent;
    return mesh;
  };
  const limit=25.22;
  const xs=[-limit,...new Set(map.pools.flatMap(p=>[p.x-p.w/2,p.x+p.w/2])),limit].sort((a,b)=>a-b);
  const zs=[-limit,...new Set(map.pools.flatMap(p=>[p.z-p.d/2,p.z+p.d/2])),limit].sort((a,b)=>a-b);
  for(let x=1;x<xs.length;x++)for(let z=1;z<zs.length;z++){
    if(map.terrain.heightAt((xs[x-1]+xs[x])/2,(zs[z-1]+zs[z])/2)<0)continue;
    floor(xs[x-1],xs[x],zs[z-1],zs[z],0,0,material(0x828477));
  }
  for(const section of map.floorSections)
    floor(section.minX,section.maxX,section.minZ,section.maxZ,section.y0,section.y1,material(0x507d80));
  for(const p of map.pools)
    floor(p.x-p.w/2,p.x+p.w/2,p.z-p.d/2,p.z+p.d/2,p.waterY,p.waterY,material(0x41858c,true)).renderOrder=1;
  for(const b of map.boxes)
    add(new THREE.BoxGeometry(b.w,b.h,b.d),material(b.color)).position.set(b.x,(b.baseY??0)+b.h/2,b.z);
}
