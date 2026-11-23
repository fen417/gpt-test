import { affineBox, inverseMatrix, multiplyMatrix, rayAffineBox, rotationMatrix, transformVector } from './geometry.js';
import { BLACK_HAWK, VEHICLE_TYPES, vehicleAimDirection,TANK_TURRET_BASE_Y, isEnclosedTankCrew, vehicleShape } from './vehicles.js';

// Local-space armour follows the visible hull, leaving real window apertures.
// The movement footprint remains solid; only projectile/visibility rays use it.
const box=(x,y,z,w,h,d,rx=0)=>affineBox({x,y,z},[w/2,h/2,d/2],rotationMatrix({x:rx}));
const front={y:1.505,z:-1.225,pitch:Math.atan2(.23,.49),length:Math.hypot(.49,.23)};
export const VEHICLE_GLASS=[
  ...[-1,1].map(side=>({id:side<0?0:1,shape:box(side*.483,front.y,front.z,.918,front.length-.096,.008,front.pitch)})),
  {id:2,shape:box(0,1.535,1.4125,1.884,Math.hypot(.43,.035)-.096,.008,Math.atan2(-.035,.43))},
  ...[-1,1].flatMap((side,i)=>[-.53,.73].map((z,j)=>({id:3+i*2+j,shape:box(side*.975,1.54,z,.008,.35,1.01+(j?.15:0))}))),
];
const humvee=[box(0,.70,.02,1.98,.49,4.43),box(0,1.02,-1.69,1.87,.31,1.36,.085),
  box(0,1.82,.14,1.95,.14,2.53),box(0,1.20,-1.33,1.98,.15,.13),box(0,1.25,1.43,1.98,.15,.10),
  box(0,.95,1.91,1.75,.4,.83),box(0,1.51,-1.225,.048,.45,.049,front.pitch),
  ...[-1,1].flatMap(side=>[box(side*.985,1.125,.33,.069,.48,2.73),
    box(side*.975,1.742,.12,.05,.065,2.57),box(side*.975,1.54,.06,.05,.35,.175),
    box(side*.965,1.50,-1.16,.07,.45,.19),box(side*.965,1.53,1.365,.07,.44,.09)]),
  ...[-1,1].flatMap(side=>[-1,1].map(end=>box(side*.89,.49,end*1.55,.43,.94,.94))),
];
const shield=[box(0,-.063,-.29,.81,.24,.069,-.09),...[-1,1].flatMap(s=>[
  box(s*.277,.069,-.29,.26,.23,.075,-.09),box(s*.39,-.03,-.14,.073,.36,.39)])];
const atv=[box(0,.58,.02,.64,.50,1.48),box(0,.82,-.65,.83,.29,.85,.13),box(0,.73,.55,.64,.22,.99),
  ...[-1,1].flatMap(side=>[-1,1].map(end=>box(side*.54,.31,end*.73,.28,.60,.60)))];
const tank=[box(0,.95,.45,3,1,5),box(0,1.1,-2.65,2.94,.43,1.7,-.33),box(0,.91,3.12,2.85,.63,.5,.45),box(-1.5,.44,.05,.6,.88,6.8),box(1.5,.44,.05,.6,.88,6.8)];
const tankTurret=[box(0,.29,.04,2.5,.55,1.5),box(0,.26,-.95,2,.43,.8),box(0,.28,1.01,1.9,.4,.7),box(0,.34,-2.95,.22,.22,4.2)];
const blackHawk=[
  box(0,1.21,-.29,2.38,.51,7.46),box(0,1.89,-3.79,1.71,.24,.52),
  box(0,2.94,-.15,2.08,.25,4.69),box(0,3.36,-.02,2.55,.78,3.18),
  box(0,2.12,2.32,2.14,1.48,1.6),box(0,2.19,5.48,.99,1.08,4.25,-.09),
  box(-.32,3.52,7.13,.38,1.98,.67),box(0,2.44,6.94,4.04,.13,.70),
  ...[-1,1].flatMap(side=>[
    box(side*1.25,2.12,1.54,.13,1.32,.17),box(side*1.26,2.12,-1.29,.13,1.36,.13),
    box(side*1.38,.46,-1.91,.35,.87,.88), box(side*1.29,1.05,-.65,.48,.11,1.01),
  ]),
  box(0,.32,6.15,.26,.64,.64),
];
const armor = { tank, humvee, atv, [BLACK_HAWK]: blackHawk };
const crew=Object.fromEntries(Object.entries(VEHICLE_TYPES).map(([type,spec])=>[type,spec.seats.map(seat=>{
  const matrix=rotationMatrix({y:seat.facing??0});
  const part=(y,z,w,h,d)=>{
    const offset=transformVector(matrix,{x:0,y,z});
    return affineBox({x:seat.x+offset.x,y:seat.height+offset.y,z:seat.z+offset.z},[w/2,h/2,d/2],matrix);
  };
  return [part(-.005,-.028,.26,.28,.25),part(-.32,.02,.43,.49,.31),part(-.67,-.12,.45,.27,.44)];
})]));
const frames=new WeakMap();
function frame(v){
  const key=[v.x,v.y,v.z,v.yaw,v.bodyPitch,v.bodyRoll,v.modelScale?.x,v.modelScale?.y,v.modelScale?.z].join('/');
  let f=frames.get(v);if(f?.key===key)return f;
  const scale=v.modelScale??{x:1,y:1,z:1};
  const matrix=multiplyMatrix(rotationMatrix({y:v.yaw}),multiplyMatrix([scale.x,0,0,0,scale.y,0,0,0,scale.z],rotationMatrix({x:v.bodyPitch??0,z:v.bodyRoll??0})));
  f={key,matrix,inverse:inverseMatrix(matrix)};frames.set(v,f);return f;
}
export function vehicleRay(v,origin,direction){
  const {inverse}=frame(v);
  return {origin:transformVector(inverse,{x:origin.x-v.x,y:origin.y-(v.y??0),z:origin.z-v.z}),direction:transformVector(inverse,direction)};
}
export function rayVehicleArmor(origin,direction,v,maximum){
  if(v.compactWreck&&v.hp<=0)return rayAffineBox(origin,direction,vehicleShape(v),maximum);
  const ray=vehicleRay(v,origin,direction);let hit=Infinity;
  for(const shape of armor[v.type])hit=Math.min(hit,rayAffineBox(ray.origin,ray.direction,shape,Math.min(hit,maximum)));
  if(v.type==='tank'){
    const yaw=(v.aimYaw??v.yaw)-v.yaw,c=Math.cos(yaw),s=Math.sin(yaw),x=ray.origin.x,z=ray.origin.z+.4;
    const local={x:x*c-z*s,y:ray.origin.y-TANK_TURRET_BASE_Y,z:x*s+z*c},dir={x:ray.direction.x*c-ray.direction.z*s,y:ray.direction.y,z:ray.direction.x*s+ray.direction.z*c};
    for(const shape of tankTurret)hit=Math.min(hit,rayAffineBox(local,dir,shape,Math.min(hit,maximum)));
  }
  if(v.type==='humvee'){
    const aim=vehicleAimDirection(v,v.aimYaw??v.yaw,0),yaw=Math.atan2(-aim.x,-aim.z),c=Math.cos(yaw),s=Math.sin(yaw);
    const x=ray.origin.x,z=ray.origin.z-.19;
    const local={x:x*c-z*s,y:ray.origin.y-2.18,z:x*s+z*c};
    const dir={x:ray.direction.x*c-ray.direction.z*s,y:ray.direction.y,z:ray.direction.x*s+ray.direction.z*c};
    for(const shape of shield)hit=Math.min(hit,rayAffineBox(local,dir,shape,Math.min(hit,maximum)));
  }
  return hit;
}
export function rayVehicleGlass(origin,direction,v,maximum){
  if(v.type!=='humvee')return [];
  const ray=vehicleRay(v,origin,direction),hits=[];
  for(const pane of VEHICLE_GLASS){
    if((v.glassBroken??0)&(1<<pane.id))continue;
    const distance=rayAffineBox(ray.origin,ray.direction,pane.shape,maximum);
    if(Number.isFinite(distance))hits.push({id:pane.id,distance});
  }
  return hits;
}
export function rayVehicleCrew(origin,direction,v,index,maximum){
  if(isEnclosedTankCrew(v,index))return {distance:Infinity,headshot:false};
  const shapes=crew[v.type][index],ray=vehicleRay(v,origin,direction);
  if(v.type==='tank'&&index===1){const yaw=(v.aimYaw??v.yaw)-v.yaw,c=Math.cos(yaw),s=Math.sin(yaw),x=ray.origin.x,z=ray.origin.z+.4,dx=ray.direction.x,dz=ray.direction.z;ray.origin.x=x*c-z*s;ray.origin.z=x*s+z*c-.4;ray.direction.x=dx*c-dz*s;ray.direction.z=dx*s+dz*c;}
  const head=rayAffineBox(ray.origin,ray.direction,shapes[0],maximum);
  const torso=rayAffineBox(ray.origin,ray.direction,shapes[1],maximum);
  const legs=rayAffineBox(ray.origin,ray.direction,shapes[2],maximum);
  const distance=Math.min(head,torso,legs);return {distance,headshot:head<=torso&&head<=legs};
}
