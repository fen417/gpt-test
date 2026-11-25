import * as THREE from 'three';
import { getAssetColliders } from '../shared/asset-colliders.js';
import { SpatialIndex } from '../shared/spatial-index.js';
import { affineBox,rayAffineBox } from '../shared/geometry.js';

// Only explicit solid pieces qualify, never entire buildings or approximate prop bounds.
export function isOpaqueOccluder(b){
  if(b.parts||b.convex||b.triangles||b.noCollision)return false;
  return ['wall','village-wall','port-wall','bunker-concrete','laguna-shell'].includes(b.kind)
    ||(/^laguna-(red|blue)$/.test(b.kind)&&/^laguna-(arcade|partition)-/.test(b.id));
}
function insetShape(b){
  const shape=b.obb??affineBox({x:(b.minX+b.maxX)/2,y:(b.minY+b.h)/2,z:(b.minZ+b.maxZ)/2},[(b.maxX-b.minX)/2,(b.h-b.minY)/2,(b.maxZ-b.minZ)/2]);
  const half=shape.half.map((h,i)=>h-.08/Math.max(1e-6,Math.hypot(shape.matrix[i],shape.matrix[i+3],shape.matrix[i+6])));
  return half.every(h=>h>.02)?{...shape,half}:null;
}
// Every corner must be behind the SAME convex wall, so windows/doorways stay
// visible. Apply only during the colour pass; shadow casters remain intact.
export class InteriorVisibility {
  constructor(){this.eye=new THREE.Vector3(Infinity,0,0);this.orientation=new THREE.Quaternion();this.cursor=0;this.hidden=[];}
  apply(owner){
    const {staticRoot,map,camera,viewFrustum}=owner;
    if(!staticRoot||!map)return;
    this.lastHidden=0;this.lastChecks=0;
    if(this.root!==staticRoot||this.revision!==owner.staticMaterialRevision){
      this.revision=owner.staticMaterialRevision;
      this.root=staticRoot;this.items=[];
      staticRoot.updateMatrixWorld(true);
      const flags=new Set([...owner.flags.values()].map(f=>f.group));
      staticRoot.traverse(mesh=>{
        for(let p=mesh;p;p=p.parent)if(flags.has(p))return;
        const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
        if(!mesh.isMesh||mesh.isInstancedMesh||mesh.isSkinnedMesh||mesh.userData.noBatch||mesh.children.length||materials.some(m=>!m||m.transparent||m.alphaTest>0||m.transmission>0))return;
        if(!mesh.geometry?.attributes.position)return;
        if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();
        const box=mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld),size=box.getSize(new THREE.Vector3());
        if(box.isEmpty())return;
        if(Math.max(size.x,size.z)>40)return;
        const corners=[];for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])corners.push({x,y,z});
        this.items.push({mesh,box,corners,blocked:false});
      });
      const occluders=getAssetColliders(map).filter(isOpaqueOccluder).map(b=>({...b,occlusionShape:insetShape(b)})).filter(b=>b.occlusionShape);
      this.wallCount=occluders.length;this.walls=new SpatialIndex(occluders,16,b=>b);
      this.eye.set(Infinity,0,0);this.cursor=0;this.remaining=0;
    }
    const eye=camera.position;
    const disabledKey=this.disabled?[...this.disabled].sort().join('/'):'',shadowRestriction=Boolean(owner.webgpu&&owner.renderer.shadowMap.enabled);
    const moved=!this.eye.equals(eye)||this.previousDisabled!==disabledKey||this.shadowRestriction!==shadowRestriction;
    const turned=!this.orientation.equals(camera.quaternion);
    if(moved){
      for(const item of this.items)item.blocked=false;this.eye.copy(eye);this.previousDisabled=disabledKey;this.shadowRestriction=shadowRestriction;
    }
    // Keep the cursor across movement to avoid starving later candidates.
    if(moved||turned){this.remaining=this.items.length;this.orientation.copy(camera.quaternion);}
    if(this.remaining>0){
    const walls=this.walls.query(eye.x-40,eye.z-40,eye.x+40,eye.z+40)
      .filter(box=>!this.disabled?.has(box.id))
      .sort((a,b)=>(a.x-eye.x)**2+(a.z-eye.z)**2-((b.x-eye.x)**2+(b.z-eye.z)**2)).slice(0,16);
    const deadline=performance.now()+.6;let count=0;
    // Revisit the relevant candidates when the view changes; stationary
    // frames reuse proven results instead of repeatedly spending the budget.
    while(this.remaining>0&&count++<this.items.length&&performance.now()<deadline){
      const item=this.items[this.cursor++%this.items.length];this.remaining--;
      if(!item.mesh.visible||shadowRestriction&&item.mesh.castShadow||!viewFrustum.intersectsBox(item.box))continue;
      this.lastChecks++;
      item.blocked=walls.some(wall=>item.corners.every(p=>{
        const dx=p.x-eye.x,dy=p.y-eye.y,dz=p.z-eye.z,length=Math.hypot(dx,dy,dz);
        if(length<.1)return false;
        const hit=rayAffineBox(eye,{x:dx/length,y:dy/length,z:dz/length},wall.occlusionShape,length);
        return hit>.05&&hit<length-.1;
      }));
    }
    }
    for(const item of this.items)if(item.blocked&&item.mesh.visible&&!(shadowRestriction&&item.mesh.castShadow)){item.mesh.visible=false;this.hidden.push(item.mesh);}
    this.lastHidden=this.hidden.length;
  }
  restore(){for(const mesh of this.hidden)mesh.visible=true;this.hidden.length=0;}
}
