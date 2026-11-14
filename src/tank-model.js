import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {KTX2Loader} from 'three/addons/loaders/KTX2Loader.js';
export {placeTankDriverCamera} from './tank-camera.js';

// Original procedural armour. Rigid details are merged per articulated island.
const wheelAxis=new THREE.Vector3(1,0,0),position=new THREE.Vector3(),scale=new THREE.Vector3(),quaternion=new THREE.Quaternion(),matrix=new THREE.Matrix4();
let atlas,atlasPromise;
export function loadTankAtlas(renderer){if(atlasPromise)return atlasPromise;const loader=new KTX2Loader().setWorkerLimit(1).setTranscoderPath(import.meta.env.BASE_URL+'basis/').detectSupport(renderer);return atlasPromise=loader.loadAsync(new URL('./assets/tank/atlas.ktx2',import.meta.url).href).then(texture=>{atlas=texture;texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=Math.min(16,renderer.capabilities.getMaxAnisotropy());}).catch(error=>{atlasPromise=null;throw error;}).finally(()=>loader.dispose());}
function island(parent,material,draw){
  const parts=[];
  const piece=(geometry,x,y,z,sx,sy,sz,color=0x788368,rx=0,ry=0,rz=0)=>{
    const source=geometry;geometry=geometry.index?geometry.toNonIndexed():geometry;if(source!==geometry)source.dispose();
    quaternion.setFromEuler(new THREE.Euler(rx,ry,rz));matrix.compose(position.set(x,y,z),quaternion,scale.set(sx,sy,sz));geometry.applyMatrix4(matrix);
    const tint=new THREE.Color(color),colors=new Float32Array(geometry.attributes.position.count*3);for(let i=0;i<colors.length;i+=3){colors[i]=tint.r;colors[i+1]=tint.g;colors[i+2]=tint.b;}
    geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));geometry.setAttribute('trackSide',new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count),1));parts.push(geometry);
  };
  const box=(x,y,z,w,h,d,color,rx=0,ry=0,rz=0)=>piece(new THREE.BoxGeometry(1,1,1),x,y,z,w,h,d,color,rx,ry,rz);
  const cylinder=(x,y,z,r,length,color,segments=10,rx=0,rz=0)=>piece(new THREE.CylinderGeometry(1,1,1,segments),x,y,z,r,length,r,color,rx,0,rz);
  draw({box,cylinder,piece});const geometry=mergeGeometries(parts,false);parts.forEach(g=>g.dispose());
  const mesh=new THREE.Mesh(geometry,material);parent.add(mesh);return mesh;
}
function buildLevel(level,material){
  const group=new THREE.Group(),body=new THREE.Group(),turret=new THREE.Group(),gun=new THREE.Group();group.add(body);body.add(turret);turret.position.set(0,1.72,-.4);turret.add(gun);gun.position.set(0,.34,-.9);
  const hull=island(body,material,({box,cylinder})=>{
    box(0,.78,.1,2.95,.72,6.4,0x515b49);box(0,1.28,.2,3.12,.44,5.9);
    box(0,1.18,-2.92,3.12,.46,.9,0x85916e,-.42);box(0,1.19,3.05,3,.44,.8,0x606c55,.19);
    if(level<2){
      box(0,1.56,1.9,2.65,.13,1.6,0x424a40);for(let i=0;i<8;i++)box(0,1.64,1.3+i*.17,2.35,.045,.055,0x242c28);
      for(const side of [-1,1]){box(side*1.66,1.19,.1,.26,.6,6.55,0x788064);
        if(!level)for(let i=0;i<6;i++){box(side*1.735,1.25,-2.53+i*1.02,.13,.46,.9,i%2?0x5e6b52:0x889074);box(side*1.55,1.62,-2.6+i*.92,.13,.07,.16,0x343e35);}
        box(side*1.17,1.72,2.45,.08,.08,1.7,0x444d43);for(const z of [1.65,3.2])box(side*1.17,1.6,z,.08,.3,.08,0x444d43);
        box(side*1.35,1.48,-3.22,.32,.19,.12,0xbfc4a3);
      }
    }
  });
  const turretMesh=island(turret,material,({box,cylinder,piece})=>{
    cylinder(0,-.03,0,1.16,.16,0x303b30,level===2?8:12);
    piece(new THREE.CylinderGeometry(.92,1.25,.62,8),0,.27,.1,1,1,1.16,0x707d60,0,Math.PI/8);
    for(const side of [-1,1])box(side*.99,.29,-.77,.65,.57,1.27,0x879471,-.12,side*.23);
    box(0,.36,1.3,2.4,.59,.62,0x616e56);cylinder(0,.6,.27,.98,.13,0x889276,8);
    if(!level){for(const side of [-1,1])for(let i=0;i<4;i++)box(side*1.26,.34,-.57+i*.48,.18,.39,.4,i%2?0x4a5745:0x7a8866,0,side*.15);
      box(.73,.81,-.27,.26,.26,.4,0x2a3830);box(.73,.84,-.49,.22,.11,.04,0x8cb0a5);
      box(-.85,.98,1.07,.035,.72,.035,0x2c332e);}
  });
  const barrel=island(gun,material,({box,cylinder})=>{
    box(0,0,.04,.69,.49,.65,0x58674e);cylinder(0,0,-1.65,.104,3.35,0x7c886a,level===2?6:10,Math.PI/2);
    if(level<2){cylinder(0,0,-.63,.15,.55,0x46553e,10,Math.PI/2);cylinder(0,0,-2.98,.14,.24,0x4e5c45,10,Math.PI/2);box(0,0,-3.37,.18,.18,.04,0x101714);cylinder(.41,-.04,-.52,.037,.92,0x242c28,8,Math.PI/2);}
  });
  const hatch=island(body,material,({box,cylinder})=>{cylinder(-.62,1.63,-1.9,.36,.12,0x3f4c3b,level===2?6:12);if(level<2)box(-.62,1.81,-1.88,.62,.27,.08,0x4b5944,-.65);});
  const tracks=island(body,material,({box})=>{for(const side of [-1,1]){
    box(side*1.5,.6,.05,.59,.82,6.4,0x242c28);box(side*1.5,.64,-3.08,.59,.60,.65,0x313a32,-.45);box(side*1.5,.64,3.18,.59,.60,.65,0x313a32,.45);
    if(!level)for(let i=0;i<22;i++)box(side*1.5,1.025,-2.9+i*.28,.62,.04,.13,0x50564a);
  }});
  const trackPositions=tracks.geometry.attributes.position,trackSide=tracks.geometry.attributes.trackSide;
  for(let i=0;i<trackSide.count;i++)trackSide.setX(i,Math.sign(trackPositions.getX(i)));
  let wheels=null;
  if(level<2){const geometry=new THREE.CylinderGeometry(.35,.35,.15,level?8:12);geometry.rotateZ(Math.PI/2);const count=level?10:14;wheels=new THREE.InstancedMesh(geometry,material,count);const color=new THREE.Color(0x7b8167);
    for(let i=0;i<count;i++){matrix.makeTranslation(i<count/2?-1.81:1.81,.58,-2.65+i%(count/2)*5.3/(count/2-1));wheels.setMatrixAt(i,matrix);wheels.setColorAt(i,color);}body.add(wheels);}
  if(level===1){const geometry=mergeGeometries([hull.geometry,hatch.geometry],false);hull.geometry.dispose();hatch.geometry.dispose();hull.geometry=geometry;hatch.removeFromParent();}
  if(level===2){group.updateMatrixWorld(true);const parts=[];group.traverse(o=>{if(o.isMesh)parts.push(o.geometry.clone().applyMatrix4(o.matrixWorld));});const geometry=mergeGeometries(parts,false);parts.forEach(g=>g.dispose());group.traverse(o=>{if(o.isMesh)o.geometry.dispose();});body.clear();const mesh=new THREE.Mesh(geometry,material);body.add(mesh);}
  return {group,body,turret,gun,hull,turretMesh,barrel,hatch,tracks,wheels};
}
export function createTankRig(){
  const travel={value:new THREE.Vector2()},material=new THREE.MeshLambertMaterial({vertexColors:true,map:atlas??null}),group=new THREE.Group();
  material.onBeforeCompile=shader=>{shader.uniforms.tankTravel=travel;shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float trackSide;uniform vec2 tankTravel;').replace('#include <uv_vertex>','#include <uv_vertex>\n#ifdef USE_MAP\nif(abs(trackSide)>.5)vMapUv.y+=trackSide<0.?tankTravel.x:tankTravel.y;\n#endif');};
  const levels=[0,1,2].map(level=>buildLevel(level,material));for(const l of levels)group.add(l.group);
  const body=new THREE.Group();group.add(body); // Shared seated-actor parent, independent of LOD swaps.
  return {tank:true,group,body,levels,level:0,material,travel,materialsToDispose:new Set([material]),riders:[],initialized:false};
}
export function updateTankRig(rig,v,p,dt,blend,view,low,terrain){
  const group=rig.group,reset=!rig.initialized||group.position.distanceToSquared(position.set(v.x,v.y??0,v.z))>64,t=reset?1:blend;
  group.position.lerp(position,t);group.rotation.y+=Math.atan2(Math.sin(v.yaw-group.rotation.y),Math.cos(v.yaw-group.rotation.y))*t;rig.initialized=true;
  const distance=p?Math.hypot(v.x-p.x,v.z-p.z):0,near=low?32:40,far=low?85:100;
  if(rig.level===0&&distance>near*1.06)rig.level=1;else if(rig.level===1&&distance<near*.94)rig.level=0;
  if(rig.level===1&&distance>far*1.06)rig.level=2;else if(rig.level===2&&distance<far*.94)rig.level=1;
  if(p?.vehicleId===v.id)rig.level=0;
  rig.body.rotation.set(v.bodyPitch??0,0,v.bodyRoll??0);
  rig.travel.value.x+=(v.speed-(v.steer??0)*1.8)*dt*.35;rig.travel.value.y+=(v.speed+(v.steer??0)*1.8)*dt*.35;
  const delta=(v.aimYaw??v.yaw)-group.rotation.y;
  rig.wreckAge=v.hp<=0?(rig.wreckAge??0)+dt:0;
  for(const [index,l] of rig.levels.entries()){
    l.group.visible=index===rig.level;l.body.rotation.copy(rig.body.rotation);
    l.turret.rotation.y=Math.atan2(Math.sin(delta),Math.cos(delta));l.gun.rotation.x=v.aimPitch??0;
    l.turret.position.y=1.72+(v.hp<=0?Math.max(0,Math.min(3,rig.wreckAge*8)-Math.max(0,rig.wreckAge-.35)*5):0);l.turret.rotation.z=v.hp<=0?Math.min(.55,rig.wreckAge):0;
    if(rig.cannonSeq!==undefined&&rig.cannonSeq!==v.cannonSeq)rig.recoil=.4;
    l.gun.position.z=-.9+(rig.recoil??0);l.hatch.visible=!(p?.vehicleId===v.id&&p.vehicleSeat===0&&!view.vehicleThirdPerson);
    l.hull.castShadow=l.turretMesh.castShadow=index===1&&distance<48;
    if(l.wheels){const half=l.wheels.count/2;for(let i=0;i<l.wheels.count;i++){quaternion.setFromAxisAngle(wheelAxis,(i<half?rig.travel.value.x:rig.travel.value.y)*5);matrix.compose(position.set(i<half?-1.81:1.81,.58,-2.65+i%half*5.3/(half-1)),quaternion,scale.set(1,1,1));l.wheels.setMatrixAt(i,matrix);}l.wheels.instanceMatrix.needsUpdate=true;}
  }
  rig.recoil=Math.max(0,(rig.recoil??0)-dt*.8);rig.cannonSeq=v.cannonSeq;
  rig.material.color.setHex(v.hp<=0?0x383c38:0xffffff);
  if(reset)group.updateMatrixWorld(true);
}
export function tankModelStats(rig){return rig.levels.map(l=>{let triangles=0,draws=0;l.group.traverse(o=>{if(o.isMesh){triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3*(o.count??1);draws++;}});return{triangles,draws};});}
