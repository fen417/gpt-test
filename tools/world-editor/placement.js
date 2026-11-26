
import {Box3,Vector3,Quaternion} from 'three';
export function alignToTerrain(node,heightAt){
 node.updateWorldMatrix(true,false);
 const p=node.getWorldPosition(new Vector3()),q=node.getWorldQuaternion(new Quaternion()),d=.5;
 const dx=(heightAt(p.x+d,p.z)-heightAt(p.x-d,p.z))/(2*d),dz=(heightAt(p.x,p.z+d)-heightAt(p.x,p.z-d))/(2*d);
 if(!Number.isFinite(dx+dz))throw Error('Невозможно определить уклон');
 const normal=new Vector3(-dx,1,-dz).normalize();
 const heading=new Vector3(0,0,1).applyQuaternion(q);heading.y=0;if(heading.lengthSq()<1e-8)heading.set(0,0,1);heading.normalize();
 const flat=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),Math.atan2(heading.x,heading.z));
 const world=new Quaternion().setFromUnitVectors(new Vector3(0,1,0),normal).multiply(flat);
 const parent=node.parent?.getWorldQuaternion(new Quaternion())??new Quaternion();
 node.quaternion.copy(parent.invert().multiply(world));node.updateWorldMatrix(true,true);
 return normal;
}
export function dropToTerrain(node,heightAt,offset=0){
 node.updateWorldMatrix(true,true);
 const p=node.getWorldPosition(new Vector3()),b=new Box3().setFromObject(node,true);
 const y=heightAt(p.x,p.z);if(!Number.isFinite(y)||b.isEmpty())throw Error('Модель пустая или вне карты');
 // Measure the actual contact against the slope, rather than the bottom
 // of the world AABB (which would lift a tilted model above the surface).
 let gap=Infinity;const v=new Vector3();
 node.traverse(mesh=>{
  if(!mesh.isMesh||!mesh.geometry.attributes.position)return;
  const a=mesh.geometry.attributes.position,step=Math.max(1,Math.floor(a.count/50000));
  for(let i=0;i<a.count;i+=step){v.fromBufferAttribute(a,i).applyMatrix4(mesh.matrixWorld);const h=heightAt(v.x,v.z);if(Number.isFinite(h))gap=Math.min(gap,v.y-h);}
 });
 p.y+=(Number.isFinite(gap)?-gap:y-b.min.y)+offset;
 node.position.copy(node.parent?node.parent.worldToLocal(p):p);node.updateWorldMatrix(true,true);
}
export function localBounds(node){
 node.updateWorldMatrix(true,true);
 const inv=node.matrixWorld.clone().invert(),bounds=new Box3();
 node.traverse(n=>{if(!n.isMesh)return;n.geometry.computeBoundingBox();const b=n.geometry.boundingBox;if(!b||b.isEmpty())return;
  const matrix=inv.clone().multiply(n.matrixWorld);for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z])bounds.expandByPoint(new Vector3(x,y,z).applyMatrix4(matrix));
 });return bounds;
}
