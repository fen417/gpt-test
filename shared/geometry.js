export const IDENTITY = Object.freeze([1,0,0,0,1,0,0,0,1]);
export const ZERO_ROTATION = Object.freeze({x:0,y:0,z:0});
export const hasRotation = value => value && ['x','y','z'].some(axis=>Math.abs(value[axis]??0)>1e-8);
export function rotationMatrix({x=0,y=0,z=0}={}){
  const a=Math.cos(x),b=Math.sin(x),c=Math.cos(y),d=Math.sin(y),e=Math.cos(z),f=Math.sin(z);
  return [c*e,-c*f,d,a*f+b*d*e,a*e-b*d*f,-b*c,b*f-a*d*e,b*e+a*d*f,a*c];
}
export function multiplyMatrix(a,b){
  const out=new Array(9);
  for(let row=0;row<3;row++)for(let col=0;col<3;col++)out[row*3+col]=a[row*3]*b[col]+a[row*3+1]*b[col+3]+a[row*3+2]*b[col+6];
  return out;
}
export function transformVector(m,p){return {x:m[0]*p.x+m[1]*p.y+m[2]*p.z,y:m[3]*p.x+m[4]*p.y+m[5]*p.z,z:m[6]*p.x+m[7]*p.y+m[8]*p.z};}
export function inverseMatrix(m){
  const [a,b,c,d,e,f,g,h,i]=m,det=a*(e*i-f*h)-b*(d*i-f*g)+c*(d*h-e*g);
  return [(e*i-f*h)/det,(c*h-b*i)/det,(b*f-c*e)/det,(f*g-d*i)/det,(a*i-c*g)/det,(c*d-a*f)/det,(d*h-e*g)/det,(b*g-a*h)/det,(a*e-b*d)/det];
}
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const cross=(a,b)=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
const columns=m=>[{x:m[0],y:m[3],z:m[6]},{x:m[1],y:m[4],z:m[7]},{x:m[2],y:m[5],z:m[8]}];
export function affineBox(center,half,matrix=IDENTITY){return {center,half,matrix,inverse:inverseMatrix(matrix)};}
export function uprightBox(x,y,z,radius,height){return affineBox({x,y:y+height/2,z},[radius,height/2,radius]);}
export function shapeForBox(box){return box.obb??affineBox({x:box.x,y:(box.baseY??0)+box.h/2,z:box.z},[box.w/2,box.h/2,box.d/2]);}
export function boxBounds(box){
  const shape=box.obb;
  if(!shape)return {...box,minX:box.x-box.w/2,maxX:box.x+box.w/2,minZ:box.z-box.d/2,maxZ:box.z+box.d/2,minY:box.baseY??0,h:(box.baseY??0)+box.h};
  const m=shape.matrix,q=shape.half,p=shape.center;
  const dx=Math.abs(m[0])*q[0]+Math.abs(m[1])*q[1]+Math.abs(m[2])*q[2];
  const dy=Math.abs(m[3])*q[0]+Math.abs(m[4])*q[1]+Math.abs(m[5])*q[2];
  const dz=Math.abs(m[6])*q[0]+Math.abs(m[7])*q[1]+Math.abs(m[8])*q[2];
  return {...box,minX:p.x-dx,maxX:p.x+dx,minY:p.y-dy,h:p.y+dy,minZ:p.z-dz,maxZ:p.z+dz};
}
export function rayAffineBox(origin,direction,shape,maximum){
  const o=transformVector(shape.inverse,{x:origin.x-shape.center.x,y:origin.y-shape.center.y,z:origin.z-shape.center.z});
  const d=transformVector(shape.inverse,direction);
  let near=0,far=maximum;
  for(const [i,axis] of ['x','y','z'].entries()){
    if(Math.abs(d[axis])<1e-9){if(Math.abs(o[axis])>shape.half[i])return Infinity;continue;}
    const a=(-shape.half[i]-o[axis])/d[axis],b=(shape.half[i]-o[axis])/d[axis];
    near=Math.max(near,Math.min(a,b));far=Math.min(far,Math.max(a,b));if(near>far)return Infinity;
  }
  return near;
}
export function overlapsAffine(a,b){
  const ae=columns(a.matrix),be=columns(b.matrix),delta={x:b.center.x-a.center.x,y:b.center.y-a.center.y,z:b.center.z-a.center.z};
  const axes=[cross(ae[0],ae[1]),cross(ae[1],ae[2]),cross(ae[2],ae[0]),cross(be[0],be[1]),cross(be[1],be[2]),cross(be[2],be[0])];
  for(const edge of ae)for(const other of be)axes.push(cross(edge,other));
  for(const axis of axes){
    if(dot(axis,axis)<1e-16)continue;
    const ra=ae.reduce((sum,edge,i)=>sum+Math.abs(dot(axis,edge))*a.half[i],0);
    const rb=be.reduce((sum,edge,i)=>sum+Math.abs(dot(axis,edge))*b.half[i],0);
    if(Math.abs(dot(delta,axis))>=ra+rb-1e-7)return false;
  }
  return true;
}
export function affineNormal(shape,point){
  const local=transformVector(shape.inverse,{x:point.x-shape.center.x,y:point.y-shape.center.y,z:point.z-shape.center.z});
  let nearest=Infinity,index=1,sign=1;
  for(const [i,axis] of ['x','y','z'].entries()){
    const distance=Math.abs(Math.abs(local[axis])-shape.half[i]);
    if(distance<nearest){nearest=distance;index=i;sign=local[axis]<0?-1:1;}
  }
  // A normal uses the inverse transpose, including non-uniform asset scaling.
  const n={x:shape.inverse[index*3]*sign,y:shape.inverse[index*3+1]*sign,z:shape.inverse[index*3+2]*sign};
  const length=Math.hypot(n.x,n.y,n.z)||1;return {x:n.x/length,y:n.y/length,z:n.z/length};
}

export function rotateMapAssets(map,edits={moves:{}}){
  const parents=new Map();
  for(const [kind,field] of [['structure','structures'],['crane','cranes'],['rail','railTracks']])
    for(const [i,value] of (map[field]??[]).entries())parents.set(value.editorKey??kind+':'+(value.id??i),value);
  for(const value of [map.ship,...(map.extraShips??[])].filter(Boolean))parents.set(value.editorKey??'ship:0',value);
  for(const box of map.boxes){
    const parent=parents.get(box.editorParent),rp=rotationMatrix(parent?.modelRotation),own=rotationMatrix(box.modelRotation);
    delete box.editorPose;
    delete box.modelBasis;
    delete box.obb;
    if(!hasRotation(parent?.modelRotation)&&!hasRotation(box.modelRotation))continue;
    const pivot={x:parent?.x??box.x,y:parent?.baseY??box.baseY??0,z:parent?.z??box.z};
    const p=transformVector(rp,{x:box.x-pivot.x,y:(box.baseY??0)-pivot.y,z:box.z-pivot.z});
    const direct=edits.moves['box:'+box.id];
    const bottom={x:direct?.x??pivot.x+p.x,y:direct?.y??pivot.y+p.y,z:direct?.z??pivot.z+p.z};
    const basis=multiplyMatrix(rp,own),center=transformVector(basis,{x:0,y:box.h/2,z:0});
    box.editorPose=bottom;box.modelBasis=basis;
    box.obb=affineBox({x:bottom.x+center.x,y:bottom.y+center.y,z:bottom.z+center.z},[box.w/2,box.h/2,box.d/2],basis);
  }
  for(const vehicle of map.vehicleSpawns??[])vehicle.yaw=(vehicle.yaw??0)+(vehicle.modelRotation?.y??0);
  return map;
}
