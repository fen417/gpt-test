// Dynamic point grid for bot perception. Results preserve players Map order
// (target tie-breaking, observation order and deterministic random calls).
export class BotSenseGrid {
  constructor(cell=64){this.cell=cell;this.bins=new Map();this.entries=new Map();this.result=[];this.pool=[];this.active=false;this.valid=true;}
  key(x,z){return Math.floor(x/this.cell)+','+Math.floor(z/this.cell);}
  begin(players){
    for(const bucket of this.bins.values()){bucket.clear();this.pool.push(bucket);}
    this.bins.clear();this.entries.clear();this.players=players;this.active=players.size>=16;this.valid=true;
    if(!this.active)return;
    let order=0;
    for(const p of players.values()){this.entries.set(p,{order:order++,key:null});this.sync(p);}
  }
  sync(p){
    if(!this.active)return;
    const entry=this.entries.get(p);
    if(!entry||!Number.isFinite(p.x)||!Number.isFinite(p.z)){this.valid=false;return;}
    const key=this.key(p.x,p.z);
    if(key===entry.key)return;
    if(entry.key!==null){const old=this.bins.get(entry.key);old?.delete(p);if(old&&!old.size){this.bins.delete(entry.key);this.pool.push(old);}}
    let bucket=this.bins.get(key);
    if(!bucket){bucket=this.pool.pop()??new Set();this.bins.set(key,bucket);}
    bucket.add(p);entry.key=key;
  }
  end(){this.active=false;}
  query(p,radius,players){
    if(!this.active||!this.valid||players!==this.players||players.size!==this.entries.size||!Number.isFinite(radius)||radius<0||!Number.isFinite(p.x)||!Number.isFinite(p.z))return players.values();
    const x0=Math.floor((p.x-radius)/this.cell),x1=Math.floor((p.x+radius)/this.cell),z0=Math.floor((p.z-radius)/this.cell),z1=Math.floor((p.z+radius)/this.cell);
    if((x1-x0+1)*(z1-z0+1)>players.size*2)return players.values();
    const out=this.result;out.length=0;
    for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++)for(const q of this.bins.get(x+','+z)??[]){
      if(Math.abs(q.x-p.x)<=radius&&Math.abs(q.z-p.z)<=radius)out.push(q);
    }
    out.sort((a,b)=>this.entries.get(a).order-this.entries.get(b).order);
    return out;
  }
}
