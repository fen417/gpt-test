import * as THREE from 'three';

// Explicitly marked work-in-progress reconstruction; all solids come from
// shared/pool-day.js and therefore match authoritative collisions.
export function buildPoolDay(owner,map,root){
  const neutral=new THREE.MeshStandardMaterial({color:0xe3e4dd,roughness:.86});
  const tile=new THREE.MeshStandardMaterial({color:0xc7d8d8,roughness:.72});
  const red=new THREE.MeshStandardMaterial({color:0x955a5b,roughness:.83});
  const blue=new THREE.MeshStandardMaterial({color:0x5b7798,roughness:.83});
  const edge=new THREE.MeshStandardMaterial({color:0xe8e3d7,roughness:.82});
  const underwater=new THREE.MeshStandardMaterial({color:0x60b8c7,roughness:.72});
  const water=new THREE.MeshPhysicalMaterial({color:0x53b9cc,roughness:.19,metalness:0,
    transparent:true,opacity:.66,side:THREE.DoubleSide,depthWrite:false});
  const pickMat=box=>box.kind==='pool-red'?red:box.kind==='pool-blue'?blue:tile;
  const solid=(x,y,z,w,h,d,mat)=>{
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);
    mesh.position.set(x,y,z);mesh.receiveShadow=true;root.add(mesh);return mesh;
  };
  // Tiles are actual floors, not an invisible plane across water.
  // A uniform 1m mesh is split only around pool apertures, merged through
  // instancing to keep draw calls bounded on HD 610.
  const n=50,inst=new THREE.InstancedMesh(new THREE.BoxGeometry(1,.18,1),neutral,n*n);
  const pose=new THREE.Object3D();let count=0;
  for(let iz=0;iz<n;iz++)for(let ix=0;ix<n;ix++){
    const x=ix-n/2+.5,z=iz-n/2+.5;
    if(map.pools.some(p=>Math.abs(x-p.x)<p.w/2+.35&&Math.abs(z-p.z)<p.d/2+.35))continue;
    pose.position.set(x,-.12,z);pose.updateMatrix();inst.setMatrixAt(count++,pose.matrix);
  }
  inst.count=count;inst.instanceMatrix.needsUpdate=true;inst.receiveShadow=true;root.add(inst);
  for(const b of map.boxes)solid(b.x,(b.baseY??0)+b.h/2,b.z,b.w,b.h,b.d,pickMat(b));
  for(const p of map.pools){
    solid(p.x,-p.depth-.10,p.z,p.w,.19,p.d,underwater);
    // Floor-to-coping inner faces use four narrow vertical pieces.
    for(const s of [-1,1]){
      solid(p.x+s*(p.w/2+.06),-p.depth/2,p.z,.13,p.depth,p.d+.26,tile);
      solid(p.x,-p.depth/2,p.z+s*(p.d/2+.06),p.w+.26,p.depth,.13,tile);
      solid(p.x+s*(p.w/2+.29),.04,p.z,.45,.17,p.d+.65,edge);
      solid(p.x,.04,p.z+s*(p.d/2+.29),p.w+.65,.17,.45,edge);
    }
    const surface=new THREE.Mesh(new THREE.PlaneGeometry(p.w,p.d),water);
    surface.rotation.x=-Math.PI/2;surface.position.set(p.x,p.waterY,p.z);
    surface.renderOrder=1;root.add(surface);
    for(const s of [-1,1]){
      // Simple light-metal pool ladders with genuinely dimensional railings.
      const mx=p.x+s*(p.w/2-.6),mz=p.z+p.d/2-.9;
      const steel=new THREE.MeshStandardMaterial({color:0xb8c6cb,metalness:.58,roughness:.38});
      for(const dx of [-.26,.26])solid(mx+dx,-.38,mz,.055,1.15,.055,steel);
      for(let k=0;k<4;k++)solid(mx,-.85+k*.3,mz,.65,.035,.075,steel);
    }
  }
  // No costly screen-space reflections. Water colour, transparent geometry
  // and tile/specular roughness scale automatically with existing render size.
  root.userData.poolMaterials=[neutral,tile,red,blue,edge,underwater,water];
}
