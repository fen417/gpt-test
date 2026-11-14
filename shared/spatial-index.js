// Immutable broad phase. Exact collision/visibility remains the caller's job.
export class SpatialIndex {
  constructor(items, cell = 16, bounds = p => ({minX:p.x,maxX:p.x,minZ:p.z,maxZ:p.z})) {
    this.cell=cell;this.bins=new Map();this.bounds=bounds;this.ids=new Map(items.map((item,i)=>[item,i]));this.visited=new Uint32Array(items.length);this.visit=0;
    for(const item of items){const b=bounds(item);
      for(let z=Math.floor(b.minZ/cell);z<=Math.floor(b.maxZ/cell);z++)
        for(let x=Math.floor(b.minX/cell);x<=Math.floor(b.maxX/cell);x++){
          let row=this.bins.get(z);if(!row){row=new Map();this.bins.set(z,row);}const list=row.get(x)??[];list.push(item);row.set(x,list);
        }
    }
  }
  query(minX,minZ,maxX,maxZ,out=[]) {
    out.length=0;const c=this.cell;this.visit=(this.visit+1)>>>0;if(!this.visit){this.visited.fill(0);this.visit=1;}
    for(let z=Math.floor(minZ/c);z<=Math.floor(maxZ/c);z++)for(let x=Math.floor(minX/c);x<=Math.floor(maxX/c);x++)
      for(const item of this.bins.get(z)?.get(x)??[]){const id=this.ids.get(item);if(this.visited[id]===this.visit)continue;this.visited[id]=this.visit;
        const b=this.bounds(item);if(b.maxX>=minX&&b.minX<=maxX&&b.maxZ>=minZ&&b.minZ<=maxZ)out.push(item);
      }
    return out;
  }
}
