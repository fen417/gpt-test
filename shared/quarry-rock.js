// One deterministic surface for rendering and projectile collision, including bevels.
const outline=[[-.5,-.41],[-.41,-.5],[.41,-.5],[.5,-.41],[.5,.41],[.41,.5],[-.41,.5],[-.5,.41]];
const profile=[[-.07,1,.73],[.13,.993,.88],[.43,.98,1.06],[.55,.98,.84],[.83,.96,.96],[.97,.86,1.10]];
export function quarryRockSurface(box,terrain){
  let seed=2166136261;for(const ch of String(box.id??`${box.x}/${box.z}/${box.w}/${box.d}`))seed=Math.imul(seed^ch.charCodeAt(0),16777619)>>>0;
  const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296),slant=outline.map(()=>(random()-.5)*.065);
  const rings=profile.map(([height,scale],level)=>outline.map(([vx,vz],i)=>{
    const x=box.x+vx*box.w*scale,z=box.z+vz*box.d*scale,y=(box.baseY??0)+box.h*(height+slant[i]);
    return[x,level===0?Math.min(y,(terrain?.heightAt(x,z)??0)-.12):y,z];
  })),faces=[];
  for(let level=0;level<rings.length-1;level++)for(let i=0;i<8;i++){
    const j=(i+1)%8,a=rings[level][i],b=rings[level+1][i],c=rings[level+1][j],d=rings[level][j];
    const tone=(profile[level][2]+profile[level+1][2])/2*(.94+random()*.12),axis=Math.abs(a[0]-d[0])>Math.abs(a[2]-d[2])?0:2;
    faces.push({vertices:[a,b,c],tone,axis},{vertices:[a,c,d],tone,axis});
  }
  const cap=rings.at(-1);for(let i=1;i<7;i++)faces.push({vertices:[cap[0],cap[i+1],cap[i]],tone:1.15,axis:0,top:true});
  return{rings,faces};
}
