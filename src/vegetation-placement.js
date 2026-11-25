import {SpatialIndex} from '../shared/spatial-index.js';
import {boxBounds} from '../shared/geometry.js';
import {foliageRandom} from './vegetation-art.js';
export const FOLIAGE_LEVEL={legacy:0,low:1,medium:2,high:3,ultra:4};
export const GRASS_CELL=24;
const profiles={
  village:[.53,.42,.82,0x9b986c],quarry:[.31,.25,.60,0xaaa47c],port:[.14,.14,.34,0xa49b73],
  linden_estate:[.94,.18,.39,0x8da45e],fy_pool_day:[0,0,0,0xffffff],
  alhadra:[.40,.28,.62,0xa9a070],'alhadra-desert':[.25,.24,.55,0xb4a16d],
  'tel-mazin':[.35,.22,.53,0xa79d6e],nahar:[.13,.13,.36,0x98996d],safra:[.38,.25,.60,0xab9d6a],
};
export const vegetationProfile=map=>profiles[map?.id]??[.25,.18,.42,0xa8a17a];
export function foliageLOD(distance,quality,grass=false){
  const q=FOLIAGE_LEVEL[quality]??0;
  const near=grass?[0,0,18,32,42][q]:[0,0,36,70,100][q];
  const mid=grass?[0,20,36,65,85][q]:[0,58,90,145,200][q];
  return distance<near?0:distance<mid?1:2;
}
export function createPlacement(map){
  const area=map.playArea??{minX:-(map.width??map.size)/2,maxX:(map.width??map.size)/2,minZ:-(map.depth??map.size)/2,maxZ:(map.depth??map.size)/2};
  const obstacles=(map.boxes??[]).filter(b=>b.w>.12&&b.d>.12&&b.h>.10&&!/scrub|grass|leaf|palm/i.test(b.kind??'')).map(boxBounds);
  for(const s of map.structures??[])if(s.w>1&&s.d>1)obstacles.push(boxBounds(s));
  const index=new SpatialIndex(obstacles,16,b=>b),near=[];
  const roads=(map.roads??[]).filter(b=>b.w>0&&b.d>0).map(b=>{
    const c=Math.cos(b.yaw??0),s=Math.sin(b.yaw??0),ex=(Math.abs(c)*b.w+Math.abs(s)*b.d)/2,ez=(Math.abs(s)*b.w+Math.abs(c)*b.d)/2;
    return {...b,c,s,minX:b.x-ex-2,maxX:b.x+ex+2,minZ:b.z-ez-2,maxZ:b.z+ez+2};
  });
  const roadIndex=new SpatialIndex(roads,24,b=>b),roadNear=[];
  const reserved=[...(map.points??[]).map(p=>({...p,r:6})),...(map.spawns??[]).map(p=>({...p,r:5})),...(map.vehicleSpawns??[]).map(p=>({...p,r:3}))].filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.z));
  function allowed(x,z){
    if(x<area.minX+1||x>area.maxX-1||z<area.minZ+1||z>area.maxZ-1)return false;
    if(map.id==='fy_pool_day')return false;
    if(map.shoreX!=null&&x<map.shoreX+5)return false;
    if(map.id==='port'&&Math.abs(z)<map.size*.43&&x<area.maxX-12)return false;
    if(map.id==='nahar'&&Math.abs(x)<80)return false;
    if(map.id==='linden_estate'){
      // Only the authored lawn bands, not the house, pool or paving.
      if(Math.abs(x)<17||z<-16||z>30)return false;
    }
    if(reserved.some(p=>(p.x-x)**2+(p.z-z)**2<p.r*p.r))return false;
    index.query(x-.48,z-.48,x+.48,z+.48,near);if(near.length)return false;
    roadIndex.query(x-1.3,z-1.3,x+1.3,z+1.3,roadNear);
    for(const r of roadNear){const dx=x-r.x,dz=z-r.z;if(Math.abs(dx*r.c-dz*r.s)<r.w/2+.95&&Math.abs(dx*r.s+dz*r.c)<r.d/2+.95)return false;}
    const y=map.terrain?.heightAt(x,z)??0;
    if(!Number.isFinite(y)||y<-.25&&map.id==='nahar')return false;
    const hx=map.terrain?.heightAt(x+.45,z)??y,hz=map.terrain?.heightAt(x,z+.45)??y;
    return Math.abs(hx-y)<.32&&Math.abs(hz-y)<.32;
  }
  return {area,allowed};
}
export function grassTile(map,placement,cx,cz,density){
  const p=vegetationProfile(map),random=foliageRandom(Math.imul(cx+913,73856093)^Math.imul(cz+517,19349663)^map.id.length*911);
  const plants=[],max=map.id==='linden_estate'?150:96,amount=Math.max(0,Math.min(1,density));
  for(let i=0;i<max;i++){
    const x=(cx+random())*GRASS_CELL,z=(cz+random())*GRASS_CELL;
    const choice=random(),yaw=random()*Math.PI*2,size=p[1]+(p[2]-p[1])*random(),shade=.78+random()*.36;
    const patch=.52+.48*Math.sin(x*.17+Math.cos(z*.11)*2)*Math.cos(z*.21);
    if(choice>p[0]*amount*patch||!placement.allowed(x,z))continue;
    const y=map.terrain?.heightAt(x,z)??0;
    // Root the crossed cards just beneath the sampled terrain. On a slope,
    // use the downhill edge to avoid visible floating blades.
    const half=.55*size/.77;
    const low=Math.min(y,map.terrain?.heightAt(x-half,z)??y,map.terrain?.heightAt(x+half,z)??y,map.terrain?.heightAt(x,z-half)??y,map.terrain?.heightAt(x,z+half)??y);
    const sink=Math.min(.14,.055+Math.max(0,y-low)*.7);
    plants.push({x,y:y-sink,z,yaw,scale:size/.77,shade,color:p[3],kind:'grass'});
  }
  return plants;
}
export function authoredPlants(map){
  const p=vegetationProfile(map),plants=[];
  for(const b of map.boxes??[]){
    if(b.kind!=='village-palm'&&b.kind!=='village-scrub')continue;
    const palm=b.kind==='village-palm',height=b.h??(palm?7.6:.6);
    if(!Number.isFinite(b.x)||!Number.isFinite(b.z))continue;
    const random=foliageRandom(Math.round(b.x*113+b.z*791));
    const y=b.baseY??map.terrain?.heightAt(b.x,b.z)??0;
    plants.push({kind:palm?'palm':'scrub',x:b.x,y:y+(palm?height:0),z:b.z,yaw:random()*Math.PI*2,scale:palm?Math.max(.35,Math.min(1.55,height/7.6)):Math.min(1.2,Math.max(.25,height/.96)),shade:.83+random()*.30,color:p[3]});
  }
  // The estate's garden layer combines ground and baked vegetation. Add
  // leaf detail to existing crowns/planters without removing any mixed mesh.
  for(const b of map.furnishings??[]){
    if(b.type==='tree')plants.push({kind:'broadleaf',x:b.x,y:3.0,z:b.z,yaw:b.x*.37,scale:1.8,shade:1,color:0x9caf78});
    else if(b.type==='planter'||b.type==='hedge'){
      const count=Math.max(1,Math.floor((b.type==='hedge'?b.d:b.w)/1.0));
      for(let i=0;i<count;i++){
        const offset=(i+.5)/count-.5,hedge=b.type==='hedge';
        plants.push({kind:'scrub',x:b.x+(hedge?0:offset*b.w*.85),y:(b.y??0)+(b.h??.75)-.06,z:b.z+(hedge?offset*b.d*.85:0),yaw:i*2.4,scale:.58,shade:1,color:0x9da979});
      }
    }
  }
  return plants;
}
