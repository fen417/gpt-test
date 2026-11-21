// Laguna's floor and solids are shared by the simulation and the Blender export.
const size=64;
const boxes=[];
const palette={
  shell:'#788180',gallery:'#637274',red:'#8b645d',blue:'#597580',
  service:'#626e63',bench:'#7a7265',column:'#4c6264',roof:'#4d5a59',lining:'#43696c',
};
const solid=(id,x,z,w,d,h,surface='gallery',baseY=0)=>boxes.push({
  id:'laguna-'+id,kind:'laguna-'+surface,x,z,w,d,h,baseY,color:palette[surface],overhead:baseY>2.5,
});
for(const sign of [-1,1]){
  solid('end-'+sign,0,sign*24.9,49.25,.55,5.2,'shell');
  solid('side-'+sign,sign*24.9,0,.55,50.35,4.5,'shell');
  const wing=sign<0?'red':'blue';
  // A broken perimeter arcade, with entrances staggered across both banks.
  for(const [i,z,d] of [[0,-20.35,9.1],[1,-6,7.4],[2,6.05,3.9],[3,19.05,11.65]])
    solid('arcade-'+sign+'-'+i,sign*12.8,sign*z,.62,d,4.0,wing);
  for(const [i,z,d] of [[0,-13.3,5],[1,.85,5],[2,10.6,5]])
    solid('lintel-'+sign+'-'+i,sign*12.8,sign*z,.68,d,.64,'column',3.34);
  for(const [i,z,d] of [[0,-18.3,12.7],[1,18.3,12.7]])
    solid('canopy-'+sign+'-'+i,sign*18.85,sign*z,11.5,d,.24,'roof',3.92);
  solid('partition-a-'+sign,sign*19.4,sign*-12.4,6.2,.46,2.38,wing);
  solid('partition-b-'+sign,sign*20.35,sign*11.5,6.3,.48,2.55,wing);
  solid('lockers-'+sign,sign*23.8,sign*15.9,.8,5.4,2.42,wing);
  solid('counter-'+sign,sign*18.6,sign*1.8,2.0,4.65,1.06,'bench');
  solid('screen-'+sign,sign*4.9,sign*17.9,8.0,.58,1.22,'gallery');
  solid('pump-'+sign,sign*9.2,sign*-19.7,4.35,3.3,2.25,'service');
  solid('deck-seat-a-'+sign,sign*8.9,sign*-7.4,1.15,4.3,.86,'bench');
  solid('deck-seat-b-'+sign,sign*8.6,sign*6.4,1.25,3.1,1.08,'bench');
  for(const z of [-15.0,-3.1,3.1,15.0])
    solid('column-'+sign+'-'+z,sign*10.35,z,.54,.54,5.07,'column');
}
for(const z of [-15,-3.1,3.1,15])solid('beam-'+z,0,z,21.1,.58,.32,'column',4.94);

const pools=[-1,1].map(sign=>({
  id:sign<0?'north':'south',x:0,z:sign*8.45,w:11.4,d:12.3,depth:1.28,ramp:2.55,waterY:-.24,
}));
for(const pool of pools)for(const side of [-1,1])
  solid('lining-'+pool.id+'-'+side,pool.x+side*(pool.w/2+.08),pool.z,.16,pool.d,pool.depth,'lining',-pool.depth);
const floorSections=pools.flatMap(pool=>{
  const {x,z,w,d,depth,ramp}=pool,back=z-d/2,front=z+d/2;
  const minX=x-w/2,maxX=x+w/2;
  return [
    {minX,maxX,minZ:back,maxZ:back+ramp,y0:0,y1:-depth},
    {minX,maxX,minZ:back+ramp,maxZ:front-ramp,y0:-depth,y1:-depth},
    {minX,maxX,minZ:front-ramp,maxZ:front,y0:-depth,y1:0},
  ].map(section=>({...section,pool:pool.id}));
});
const profiles=floorSections.map(p=>{
  const slope=(p.y1-p.y0)/(p.maxZ-p.minZ);
  return {...p,slope,intercept:p.y0-slope*p.minZ};
});
const sectionAt=(x,z)=>profiles.find(p=>x>p.minX&&x<p.maxX&&z>=p.minZ&&z<=p.maxZ);
const terrain={
  cell:1,
  heightAt(x,z){const p=sectionAt(x,z);return p?p.intercept+p.slope*z:0;},
  raycast(o,d,max){
    let nearest=Infinity;
    if(d.y<0){
      const t=-o.y/d.y;
      if(t>=0&&t<=max&&!sectionAt(o.x+d.x*t,o.z+d.z*t))nearest=t;
    }
    for(const p of profiles){
      const cross=d.y-p.slope*d.z;
      if(cross>=-1e-8)continue;
      const t=(p.intercept+p.slope*o.z-o.y)/cross;
      if(t<0||t>max||t>=nearest)continue;
      const x=o.x+d.x*t,z=o.z+d.z*t;
      if(x>=p.minX&&x<=p.maxX&&z>=p.minZ&&z<=p.maxZ)nearest=t;
    }
    return nearest;
  },
};
// Every side has the full pool of pickups on clear deck surfaces.
const armory=['p19','m50','ar416','ak12','mcx9','vk45','mg36','pkp','dmr12','sv98'];
const spawns=[{x:-21.6,z:8.3},{x:21.6,z:-8.3}];
const weaponSpawns=[];
for(const side of [-1,1])for(const [i,weaponId] of armory.entries()){
  weaponSpawns.push({id:'rack-'+(side<0?'red':'blue')+'-'+weaponId,weaponId,
    x:side*(16.1+i%2*5.65),z:side*(-18.4+Math.floor(i/2)*9.25),y:0,yaw:side<0?-Math.PI/2:Math.PI/2});
}
const open=(x,z)=>!boxes.some(b=>b.baseY<1.7&&Math.abs(b.x-x)<b.w/2+.62&&Math.abs(b.z-z)<b.d/2+.62);
const spawnPoints=[-1,1].map(side=>[-22.7,-19.8,-16.9,-13.9,-11.1,-8.4,-3.5,-.6,2.6,7.0,10.2,13.3,16.5,20.5,23.0]
  .flatMap(z=>[14.6,16.7,18.8,20.9,23.0].map(x=>({x:side*x,z:side*z}))).filter(p=>open(p.x,p.z)));
export const POOL_DAY_MAP={
  // The stable match identifier keeps existing clients' map selection compatible.
  id:'fy_pool_day',name:'Комплекс «Лагуна»',tdmLoadout:'pickup',theme:'pool-day',size,layoutVersion:2,
  playArea:{minX:-24.5,maxX:24.5,minZ:-24.5,maxZ:24.5},
  sunColor:0xffecda,sunIntensity:2.49,hemisphereLightIntensity:1.72,ambientLightIntensity:.30,
  fogDensity:.0031,fogColor:0x92a2a4,
  menuView:{eye:[7.15,2.16,16.5],target:[-2.7,1.28,-5.5],fov:66},
  terrain,boxes,structures:[],landforms:[],landmarks:[
    {id:'north-pool',name:'Северная чаша',x:0,z:-8.45},
    {id:'south-pool',name:'Южная чаша',x:0,z:8.45},
    {id:'red-room',name:'Красное крыло',x:-18,z:0},
    {id:'blue-room',name:'Синее крыло',x:18,z:0},
  ],
  pools,floorSections,weaponSpawns,spawnPoints,spawns,points:[],vehicleSpawns:[],
  districts:[{id:'pool',name:'Бассейны',x:0,z:0},{id:'red',name:'Красное крыло',x:-18,z:0},{id:'blue',name:'Синее крыло',x:18,z:0}],
  navigationCell:1.25,navigationSize:size,stepHeight:.32,
};
