// Work-in-progress survey of the CS 1.6 fy_pool_day overview.
// NOT a BSP extraction. See docs/pool-day-accuracy.md before calling it a 1:1 port.
// Units: Sector 09 metres. One GoldSrc unit is approximately 0.0254 m.
// The same solids feed server collisions, navigation and WebGL presentation.
const size=64;
const boxes=[];
const wall=(x,z,w,d,h=3.7,kind='pool-wall',baseY=0)=>boxes.push({
  id:'pool-solid-'+boxes.length,kind,x,z,w,d,h,baseY,
  color:kind==='pool-red'?'#915c61':kind==='pool-blue'?'#596d93':'#d8dddd',
});
// Outer envelope, open to the light above.
for(const z of [-25.5,25.5])wall(0,z,50,0.7,5);
for(const x of [-25.5,25.5])wall(x,0,.7,51,5);
// Dividing walls around the central hall; original layout is broadly bilateral.
for(const side of [-1,1]){
  // Segmented wall at the edge of the red / blue areas.
  for(const [z,d]of [[-21.5,7],[-2.3,9.5],[19.5,10]]){
    wall(side*12.25,z,.65,d,4);
  }
  // Changing/shower screens and long internal cover as seen in the overview.
  wall(side*19.6,-18.4,.55,7.6,3.35,side<0?'pool-red':'pool-blue');
  wall(side*17.4,-6.2,7.5,.6,2.85,side<0?'pool-red':'pool-blue');
  wall(side*17.4,-4.0,.6,6.2,2.85,side<0?'pool-red':'pool-blue');
  wall(side*17.3,4.8,8.4,.6,2.9,side<0?'pool-red':'pool-blue');
  wall(side*19.3,9.7,.6,7.4,2.9,side<0?'pool-red':'pool-blue');
  wall(side*18.6,19.0,7.6,.55,2.4,side<0?'pool-red':'pool-blue');
  wall(side*14.0,15.8,1.0,4.5,3);
}
// A transverse shower screen between two pool sections.
wall(-8,-10.7,8,.6,2.5);
wall(8,-10.7,8,.6,2.5);
// Outer doorway lintels; collidable at head height, traversable underneath.
for(const side of [-1,1])for(const z of [-11.0,12.5]){
  wall(side*12.25,z,.65,5.0,.8,'pool-wall',2.9);
}
const pools=[
  {id:'main',x:0,z:5.5,w:11.6,d:17.5,depth:1.75,waterY:-.35},
  {id:'small',x:-1.9,z:-19.1,w:5.8,d:5.6,depth:1.18,waterY:-.27},
];
const poolAt=(x,z)=>pools.find(p=>Math.abs(x-p.x)<p.w/2&&Math.abs(z-p.z)<p.d/2);
const terrain={cell:1,heightAt(x,z){return -(poolAt(x,z)?.depth??0);},
  raycast(o,d,max){if(d.y>=0)return Infinity;const ground=this.heightAt(o.x,o.z);const t=(ground-o.y)/d.y;return t>=0&&t<=max?t:Infinity;}};
// Authored placements rather than random equipment drops; each side gets each available firearm.
const armory=['p19','m50','ar416','ak12','mcx9','vk45','mg36','pkp','dmr12','sv98'];
const weaponSpawns=[];
for(const side of [-1,1])for(const [i,weaponId] of armory.entries()){
  const column=i%2,row=Math.floor(i/2);
  weaponSpawns.push({id:`rack-${side<0?'red':'blue'}-${weaponId}`,weaponId,
    x:side*(15.0+column*6),z:-15.3+row*7.1,y:0,yaw:side<0?-Math.PI/2:Math.PI/2});
}
const spawns=[{x:-21.6,z:11.7},{x:21.6,z:11.7}];
// Valid object coordinates for authoritative TDM spawns. The original
// [x,z] tuples were read as {x,z} and collapsed every participant at (0,0).
// A dense, symmetric set gives 30+ fighters separate places in their own rooms.
// Collision and proximity filtering happens in Simulation.respawn().
const spawnXs=[14.4,16.6,18.8,21.0,23.2];
const spawnZs=[-22.7,-19.8,-16.9,-13.9,-11.1,-8.4,-3.5,-.6,2.6,7.0,10.2,13.3,16.5,20.5,23.0];
const spawnPoints=[-1,1].map(side=>spawnZs.flatMap(z=>
  spawnXs.map(x=>({x:side*x,z}))));
export const POOL_DAY_MAP={
  id:'fy_pool_day',name:'Комплекс «Лагуна» (WIP)',theme:'pool-day',size,playArea:{minX:-24.5,maxX:24.5,minZ:-24.5,maxZ:24.5},
  terrain,boxes,structures:[],landforms:[],landmarks:[
    {id:'main-pool',name:'Большой бассейн',x:0,z:5.5},
    {id:'small-pool',name:'Малый бассейн',x:-1.9,z:-19.1},
    {id:'red-room',name:'Красная сторона',x:-18,z:0},
    {id:'blue-room',name:'Синяя сторона',x:18,z:0}],
  pools,weaponSpawns,spawnPoints,spawns,points:[],vehicleSpawns:[],
  districts:[{id:'main',name:'Большой бассейн',x:0,z:5.5},{id:'red',name:'Красная сторона',x:-18,z:0},{id:'blue',name:'Синяя сторона',x:18,z:0}],
  navigationCell:1.25,navigationSize:size,stepHeight:.32,
};
