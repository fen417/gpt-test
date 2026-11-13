// Immutable broad phase. Exact collision/visibility remains the caller's job.
export class SpatialIndex {
  constructor(items, cell = 16, bounds = p => ({minX:p.x,maxX:p.x,minZ:p.z,maxZ:p.z})) {
    this.cell=cell;this.bins=new Map();this.bounds=bounds;
    for(const item of items){const b=bounds(item);
      for(let z=Math.floor(b.minZ/cell);z<=Math.floor(b.maxZ/cell);z++)
        for(let x=Math.floor(b.minX/cell);x<=Math.floor(b.maxX/cell);x++){
          const key=x+','+z,list=this.bins.get(key)??[];list.push(item);this.bins.set(key,list);
        }
    }
  }
  query(minX,minZ,maxX,maxZ,out=[]) {
    out.length=0;const seen=new Set(),c=this.cell;
    for(let z=Math.floor(minZ/c);z<=Math.floor(maxZ/c);z++)for(let x=Math.floor(minX/c);x<=Math.floor(maxX/c);x++)
      for(const item of this.bins.get(x+','+z)??[]){if(seen.has(item))continue;seen.add(item);
        const b=this.bounds(item);if(b.maxX>=minX&&b.minX<=maxX&&b.maxZ>=minZ&&b.minZ<=maxZ)out.push(item);
      }
    return out;
  }
}
