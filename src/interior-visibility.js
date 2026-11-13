import * as THREE from 'three';
import { getAssetColliders, rayCollider } from '../shared/asset-colliders.js';
import { SpatialIndex } from '../shared/spatial-index.js';

// Only solid wall pieces qualify. Openings, ruins and furniture never occlude.
// Every corner must be behind the SAME convex wall, so windows/doorways stay
// visible. Apply only during the colour pass; shadow casters remain intact.
export class InteriorVisibility {
  constructor(){this.eye=new THREE.Vector3(Infinity,0,0);this.cursor=0;this.hidden=[];}
  apply(owner){
    const {staticRoot,map,camera,viewFrustum}=owner;if(map.id!=='village')return;
    if(this.root!==staticRoot){
      this.root=staticRoot;this.items=[];
      staticRoot.updateMatrixWorld(true);
      const flags=new Set([...owner.flags.values()].map(f=>f.group));
      staticRoot.traverse(mesh=>{
        for(let p=mesh;p;p=p.parent)if(flags.has(p))return;
        if(!mesh.isMesh||mesh.isInstancedMesh||mesh.material?.transparent||mesh.userData.noBatch)return;
        mesh.geometry.computeBoundingBox();const box=mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld),size=box.getSize(new THREE.Vector3());
        if(Math.max(size.x,size.z)>40)return;
        const corners=[];for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])corners.push({x,y,z});
        this.items.push({mesh,box,corners,blocked:false});
      });
      this.walls=new SpatialIndex(getAssetColliders(map).filter(b=>b.kind==='village-wall'&&!b.parts),16,b=>b);
      this.eye.set(Infinity,0,0);
    }
    const eye=camera.position;
    if(!this.eye.equals(eye)){for(const item of this.items)item.blocked=false;this.eye.copy(eye);}
    const walls=this.walls.query(eye.x-24,eye.z-24,eye.x+24,eye.z+24)
      .sort((a,b)=>(a.x-eye.x)**2+(a.z-eye.z)**2-((b.x-eye.x)**2+(b.z-eye.z)**2)).slice(0,12);
    const deadline=performance.now()+.6;let count=0;
    while(count++<this.items.length&&performance.now()<deadline){
      const item=this.items[this.cursor++%this.items.length];
      if(!item.mesh.visible||!viewFrustum.intersectsBox(item.box))continue;
      item.blocked=walls.some(wall=>item.corners.every(p=>{
        const dx=p.x-eye.x,dy=p.y-eye.y,dz=p.z-eye.z,length=Math.hypot(dx,dy,dz);
        if(length<.1)return false;
        const hit=rayCollider(eye,{x:dx/length,y:dy/length,z:dz/length},wall,length);
        return hit>.05&&hit<length-.1;
      }));
    }
    for(const item of this.items)if(item.blocked&&item.mesh.visible){item.mesh.visible=false;this.hidden.push(item.mesh);}
  }
  restore(){for(const mesh of this.hidden)mesh.visible=true;this.hidden.length=0;}
}
