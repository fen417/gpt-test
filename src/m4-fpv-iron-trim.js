// Surgical runtime trim of the pre-baked M4A1 sight islands. Its main mesh
// combines the receiver, barrel and both iron sights into one GLB primitive.
// The FPV clone needs a collimator; third-person shares the original geometry.
export function removeM4IronSights(source){
  const position=source.getAttribute('position'),index=source.getIndex();
  if(!position||!index)return {geometry:source.clone(),frontTriangles:0,rearTriangles:0};
  const vertexParent=Array.from({length:position.count},(_,i)=>i);
  const find=v=>{while(vertexParent[v]!==v){vertexParent[v]=vertexParent[vertexParent[v]];v=vertexParent[v]}return v;};
  const join=(a,b)=>{a=find(a);b=find(b);if(a!==b)vertexParent[b]=a;};
  // Imported vertices are split along normals/UV seams. Weld them by position
  // *for connectivity classification only*, without altering the PBR shading.
  const welded=new Map();
  for(let i=0;i<position.count;i++){
    const key=[position.getX(i),position.getY(i),position.getZ(i)]
      .map(value=>Math.round(value*10000)).join(',');
    const other=welded.get(key);
    if(other===undefined)welded.set(key,i);else join(i,other);
  }
  for(let i=0;i<index.count;i+=3){
    const a=index.getX(i),b=index.getX(i+1),c=index.getX(i+2);
    join(a,b);join(a,c);
  }
  const islands=new Map();
  for(let i=0;i<index.count;i+=3){
    const root=find(index.getX(i));
    let bounds=islands.get(root);
    if(!bounds){bounds={minX:Infinity,minY:Infinity,minZ:Infinity,maxX:-Infinity,maxY:-Infinity,maxZ:-Infinity};islands.set(root,bounds);}
    for(let j=0;j<3;j++){
      const v=index.getX(i+j),x=position.getX(v),y=position.getY(v),z=position.getZ(v);
      bounds.minX=Math.min(bounds.minX,x);bounds.maxX=Math.max(bounds.maxX,x);
      bounds.minY=Math.min(bounds.minY,y);bounds.maxY=Math.max(bounds.maxY,y);
      bounds.minZ=Math.min(bounds.minZ,z);bounds.maxZ=Math.max(bounds.maxZ,z);
    }
  }
  // Bounds are in the pre-fitted GLB's MAIN MESH LOCAL coordinates (not metres
  // in camera space). These regions were measured from the real mesh islands:
  // front tower is z≈-.55, rear folding aperture is z≈+.40.
  const discarded=new Map();
  for(const [root,b] of islands){
    // The previous filter intentionally/accidentally kept the TALLEST front
    // sight pieces (the 130/54/12-triangle post and protective ears reach
    // local Y=.26). Only detached components fully inside the front tower
    // footprint are removed, not the continuous handguard/barrel.
    const front=b.minZ>-.61&&b.maxZ<-.45&&b.minY>.11&&b.maxY<.31;
    const rear=b.minZ>.30&&b.maxZ<.51&&b.minY>.14
      &&(b.maxY>.19||(b.minZ>.47&&b.maxY>.16));
    discarded.set(root,front?'front':rear?'rear':null);
  }
  const retained=[],stats={frontTriangles:0,rearTriangles:0};
  for(let i=0;i<index.count;i+=3){
    const cut=discarded.get(find(index.getX(i)));
    if(cut){stats[cut+'Triangles']++;continue;}
    retained.push(index.getX(i),index.getX(i+1),index.getX(i+2));
  }
  const geometry=source.clone();
  geometry.setIndex(retained);
  geometry.clearGroups();
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  return {geometry,...stats};
}
