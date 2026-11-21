import * as THREE from 'three';
import {ESTATE_WIDTH_SCALE} from '../shared/linden-estate.js';

// Keep the editor and a failed asset request usable with the exact shared solids.
export function buildLindenEstate(map,root){
  const materials=new Map();
  function material(color){
    if(!materials.has(color))materials.set(color,new THREE.MeshLambertMaterial({color}));
    return materials.get(color);
  }
  function solid(x,y,z,w,h,d,color){
    const geometry=new THREE.BoxGeometry(w,h,d);
    geometry.userData.owned=true;
    const mesh=new THREE.Mesh(geometry,material(color));
    mesh.position.set(x,y,z);
    mesh.castShadow=mesh.receiveShadow=true;
    root.add(mesh);
  }
  const pool=map.pool, area=map.playArea;
  const manorHalfWidth=11.95*ESTATE_WIDTH_SCALE;
  const left=pool.x-pool.w/2,right=pool.x+pool.w/2,back=pool.z-pool.d/2,front=pool.z+pool.d/2;
  const xs=[area.minX-7,-manorHalfWidth,left,right,manorHalfWidth,area.maxX+7];
  const zs=[area.minZ-5,-6.95,6.95,back,front,area.maxZ+3];
  for(let ix=0;ix<xs.length-1;ix++)for(let iz=0;iz<zs.length-1;iz++){
    const x=(xs[ix]+xs[ix+1])/2,z=(zs[iz]+zs[iz+1])/2;
    if(x>left&&x<right&&z>back&&z<front)continue;
    const indoors=Math.abs(x)<manorHalfWidth&&Math.abs(z)<6.95;
    solid(x,(indoors?.2:0)-.055,z,xs[ix+1]-xs[ix],.11,zs[iz+1]-zs[iz],indoors?0x87765c:0x697052);
  }
  const profile=[[left,0],[left+pool.ramp,-pool.depth],[right-pool.ramp,-pool.depth],[right,0]];
  const floor=new THREE.BufferGeometry();
  floor.setAttribute('position',new THREE.Float32BufferAttribute(profile.flatMap(([x,y])=>[x,y,back,x,y,front]),3));
  floor.setIndex(profile.slice(1).flatMap((_,i)=>[2*i,2*i+1,2*i+3,2*i,2*i+3,2*i+2]));
  floor.computeVertexNormals();
  floor.userData.owned=true;
  const basin=new THREE.Mesh(floor,material(0x527974));
  basin.receiveShadow=true;
  root.add(basin);
  for(const b of map.boxes){
    const stair=b.kind==='village-stair';
    if(b.noCollision&&!stair)continue;
    const h=stair?.18:b.h,y=stair?b.h-h/2:(b.baseY??0)+b.h/2;
    solid(b.x,y,b.z,b.w,h,b.d,b.color??(stair?0x887153:0xa39580));
  }
}
