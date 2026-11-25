// Offline-only geometry acceleration. No ray tracing or BVH code in game chunks.
import * as THREE from 'three';
import {architectureSurface} from '../src/architecture-lightmap-format.js';

const ignored=/water|glass|glaz|skylight|lamp|leaf|foliage|sign|label|fabric|cloth|canvas|grass|unlit|flag|sprite/i;
const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),instance=new THREE.Matrix4(),matrix=new THREE.Matrix4();
function meshEligible(mesh,material,detail){
  if(!mesh.isMesh||!material||material.transparent||material.opacity<.99||mesh.userData.legacyPalmLeaf||mesh.userData.waterSurface||mesh.userData.waterReflection)return false;
  const surface=architectureSurface(mesh)||material.userData?.remasterSurface||material.userData?.weatherSurface||'';
  if(ignored.test(surface)||ignored.test(mesh.name??'')||material.isMeshBasicMaterial&&surface==='unlit')return false;
  if(detail&&!mesh.castShadow&&!Object.entries(mesh.userData).some(([k,v])=>k.endsWith('Caster')&&v===true))return false;
  return true;
}
export function collectGiTriangles(scene,{detail=false}={}){
  const result=[];scene.updateMatrixWorld(true);
  scene.traverse(mesh=>{
    if(!mesh.isMesh||!mesh.geometry?.attributes.position)return;
    const g=mesh.geometry,p=g.attributes.position,idx=g.index,col=g.attributes.color;
    const groups=Array.isArray(mesh.material)?g.groups:[{start:0,count:idx?.count??p.count,materialIndex:0}];
    const count=mesh.isInstancedMesh?mesh.count:1;
    for(let k=0;k<count;k++){
      if(mesh.isInstancedMesh){mesh.getMatrixAt(k,instance);matrix.multiplyMatrices(mesh.matrixWorld,instance);}else matrix.copy(mesh.matrixWorld);
      for(const group of groups){
        const material=Array.isArray(mesh.material)?mesh.material[group.materialIndex]:mesh.material;
        if(!meshEligible(mesh,material,detail))continue;
        const tint=material.color??{r:.55,g:.55,b:.55};
        // GLBs carry linear vertex colors; procedural meshes carry material tint.
        const hasColor=Boolean(col)&&(material.vertexColors||Boolean(architectureSurface(mesh))||mesh.userData.quarryKit);
        const end=Math.min(idx?.count??p.count,group.start+group.count);
        for(let i=group.start;i+2<end;i+=3){
          const ia=idx?idx.getX(i):i,ib=idx?idx.getX(i+1):i+1,ic=idx?idx.getX(i+2):i+2;
          a.fromBufferAttribute(p,ia).applyMatrix4(matrix);b.fromBufferAttribute(p,ib).applyMatrix4(matrix);c.fromBufferAttribute(p,ic).applyMatrix4(matrix);
          const ex=b.x-a.x,ey=b.y-a.y,ez=b.z-a.z,fx=c.x-a.x,fy=c.y-a.y,fz=c.z-a.z;
          const nx=ey*fz-ez*fy,ny=ez*fx-ex*fz,nz=ex*fy-ey*fx,area=Math.hypot(nx,ny,nz);
          if(area<(detail?.035:1e-6))continue;
          const color=hasColor?[
            tint.r*(col.getX(ia)+col.getX(ib)+col.getX(ic))/3,
            tint.g*(col.getY(ia)+col.getY(ib)+col.getY(ic))/3,
            tint.b*(col.getZ(ia)+col.getZ(ib)+col.getZ(ic))/3
          ]:[tint.r,tint.g,tint.b];
          result.push({x:a.x,y:a.y,z:a.z,ex,ey,ez,fx,fy,fz,nx:nx/area,ny:ny/area,nz:nz/area,color,
            minX:Math.min(a.x,b.x,c.x),minY:Math.min(a.y,b.y,c.y),minZ:Math.min(a.z,b.z,c.z),
            maxX:Math.max(a.x,b.x,c.x),maxY:Math.max(a.y,b.y,c.y),maxZ:Math.max(a.z,b.z,c.z),
            cx:(a.x+b.x+c.x)/3,cy:(a.y+b.y+c.y)/3,cz:(a.z+b.z+c.z)/3});
        }
      }
    }
  });
  return result;
}
function build(tris,start,end){
  let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
  for(let i=start;i<end;i++){
    const t=tris[i];minX=Math.min(minX,t.minX);minY=Math.min(minY,t.minY);minZ=Math.min(minZ,t.minZ);
    maxX=Math.max(maxX,t.maxX);maxY=Math.max(maxY,t.maxY);maxZ=Math.max(maxZ,t.maxZ);
  }
  const node={minX,minY,minZ,maxX,maxY,maxZ,start,end,left:null,right:null};
  if(end-start<=12)return node;
  const x=maxX-minX,y=maxY-minY,z=maxZ-minZ,axis=x>=y&&x>=z?'cx':y>=z?'cy':'cz';
  // Sort once per level by centroid. A balanced tree handles long terrain
  // triangles and small architectural details without a per-ray linear scan.
  const sorted=tris.slice(start,end).sort((a,b)=>a[axis]-b[axis]);
  for(let i=0;i<sorted.length;i++)tris[start+i]=sorted[i];
  const mid=(start+end)>>1;node.left=build(tris,start,mid);node.right=build(tris,mid,end);
  return node;
}
function boxNear(n,ox,oy,oz,dx,dy,dz,max){
  let lo=0,hi=max;
  if(Math.abs(dx)<1e-10){if(ox<n.minX||ox>n.maxX)return Infinity;}
  else{const a=(n.minX-ox)/dx,b=(n.maxX-ox)/dx;lo=Math.max(lo,Math.min(a,b));hi=Math.min(hi,Math.max(a,b));if(lo>hi)return Infinity;}
  if(Math.abs(dy)<1e-10){if(oy<n.minY||oy>n.maxY)return Infinity;}
  else{const a=(n.minY-oy)/dy,b=(n.maxY-oy)/dy;lo=Math.max(lo,Math.min(a,b));hi=Math.min(hi,Math.max(a,b));if(lo>hi)return Infinity;}
  if(Math.abs(dz)<1e-10){if(oz<n.minZ||oz>n.maxZ)return Infinity;}
  else{const a=(n.minZ-oz)/dz,b=(n.maxZ-oz)/dz;lo=Math.max(lo,Math.min(a,b));hi=Math.min(hi,Math.max(a,b));if(lo>hi)return Infinity;}
  return lo;
}
function triangleDistance(t,ox,oy,oz,dx,dy,dz,max){
  // Two-sided Moller–Trumbore: a thin rendered wall still blocks either way.
  const px=dy*t.fz-dz*t.fy,py=dz*t.fx-dx*t.fz,pz=dx*t.fy-dy*t.fx;
  const det=t.ex*px+t.ey*py+t.ez*pz;if(Math.abs(det)<1e-9)return max;
  const inv=1/det,sx=ox-t.x,sy=oy-t.y,sz=oz-t.z,u=(sx*px+sy*py+sz*pz)*inv;
  if(u<0||u>1)return max;
  const qx=sy*t.ez-sz*t.ey,qy=sz*t.ex-sx*t.ez,qz=sx*t.ey-sy*t.ex,v=(dx*qx+dy*qy+dz*qz)*inv;
  if(v<0||u+v>1)return max;
  const d=(t.fx*qx+t.fy*qy+t.fz*qz)*inv;
  return d>.018&&d<max?d:max;
}
export function createGiTracer(triangles){
  if(!triangles.length)throw Error('GI geometry has no opaque triangles');
  const tris=triangles.slice(),root=build(tris,0,tris.length),stack=[];
  return {triangleCount:tris.length,trace(o,d,max,skip=null){
    let best=max,hit=null;
    const ox=o.x,oy=o.y,oz=o.z,dx=d.x,dy=d.y,dz=d.z;
    stack.length=0;if(boxNear(root,ox,oy,oz,dx,dy,dz,best)===Infinity)return {hit,distance:best};
    stack.push(root);
    while(stack.length){
      const node=stack.pop();
      if(boxNear(node,ox,oy,oz,dx,dy,dz,best)===Infinity)continue;
      if(node.left){
        const l=boxNear(node.left,ox,oy,oz,dx,dy,dz,best),r=boxNear(node.right,ox,oy,oz,dx,dy,dz,best);
        if(l<r){if(r!==Infinity)stack.push(node.right);if(l!==Infinity)stack.push(node.left);}
        else{if(l!==Infinity)stack.push(node.left);if(r!==Infinity)stack.push(node.right);}
      }else for(let i=node.start;i<node.end;i++){
        const t=tris[i];if(t===skip)continue;
        const n=triangleDistance(t,ox,oy,oz,dx,dy,dz,best);
        if(n<best){best=n;hit=t;}
      }
    }
    return {hit,distance:best};
  }};
}
