import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {KTX2Loader} from 'three/addons/loaders/KTX2Loader.js';
import {vehicleAimDirection,TANK_TURRET_BASE_Y} from '../shared/vehicles.js';
import {TANK_MUZZLE_DISTANCE} from '../shared/tank.js';
export {placeTankDriverCamera} from './tank-camera.js';

// Original procedural armour. Rigid details are merged per articulated island.
const wheelAxis=new THREE.Vector3(1,0,0),position=new THREE.Vector3(),scale=new THREE.Vector3(),quaternion=new THREE.Quaternion(),matrix=new THREE.Matrix4();
const modelDirection={x:0,y:0,z:0};
const barrelVertex=new THREE.Vector3();
let atlas,atlasPromise;
export function loadTankAtlas(renderer){if(atlasPromise)return atlasPromise;const loader=new KTX2Loader().setWorkerLimit(1).setTranscoderPath(import.meta.env.BASE_URL+'basis/').detectSupport(renderer);return atlasPromise=loader.loadAsync(new URL('./assets/tank/atlas.ktx2',import.meta.url).href).then(texture=>{atlas=texture;texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=Math.min(16,renderer.capabilities.getMaxAnisotropy());}).catch(error=>{atlasPromise=null;throw error;}).finally(()=>loader.dispose());}
function island(parent,material,draw){
  const parts=[];
  const piece=(geometry,x,y,z,sx,sy,sz,color=0x858776,rx=0,ry=0,rz=0)=>{
    const source=geometry;geometry=geometry.index?geometry.toNonIndexed():geometry;if(source!==geometry)source.dispose();
    quaternion.setFromEuler(new THREE.Euler(rx,ry,rz));matrix.compose(position.set(x,y,z),quaternion,scale.set(sx,sy,sz));geometry.applyMatrix4(matrix);
    // The camouflage has a common scale in metres instead of stretching a whole tile over every bolt.
    const p=geometry.attributes.position,n=geometry.attributes.normal,uv=new Float32Array(p.count*2);
    for(let i=0;i<p.count;i++){const top=Math.abs(n.getY(i))>.65,side=Math.abs(n.getX(i))>Math.abs(n.getZ(i));uv[i*2]=(top?p.getX(i):side?p.getZ(i):p.getX(i))*.18+.5;uv[i*2+1]=(top?p.getZ(i):p.getY(i))*.18+.5;}
    geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));
    const tint=new THREE.Color(color),colors=new Float32Array(geometry.attributes.position.count*3);for(let i=0;i<colors.length;i+=3){colors[i]=tint.r;colors[i+1]=tint.g;colors[i+2]=tint.b;}
    geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));geometry.setAttribute('trackSide',new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count),1));parts.push(geometry);
  };
  const box=(x,y,z,w,h,d,color,rx=0,ry=0,rz=0)=>piece(new THREE.BoxGeometry(1,1,1),x,y,z,w,h,d,color,rx,ry,rz);
  const cylinder=(x,y,z,r,length,color,segments=10,rx=0,rz=0)=>piece(new THREE.CylinderGeometry(1,1,1,segments),x,y,z,r,length,r,color,rx,0,rz);
  draw({box,cylinder,piece});const geometry=mergeGeometries(parts,false);parts.forEach(g=>g.dispose());
  const mesh=new THREE.Mesh(geometry,material);parent.add(mesh);return mesh;
}
function slopedHull(){
  const vertices=[],indices=[],stations=[[-3.4,.68,.94,1.43,1.11],[-1.9,.43,1.45,1.51,1.2],[2.85,.43,1.45,1.49,1.2],[3.35,.62,1.18,1.42,1.15]];
  for(const [z,bottom,top,wide,narrow]of stations)vertices.push(-narrow,bottom,z,narrow,bottom,z,wide,top,z,-wide,top,z);
  for(let ring=0;ring<stations.length-1;ring++)for(let edge=0;edge<4;edge++){const a=ring*4+edge,b=ring*4+(edge+1)%4,c=b+4,d=a+4;indices.push(a,b,d,b,c,d);}
  indices.push(0,3,1,1,3,2,12,13,15,13,14,15);
  const indexed=new THREE.BufferGeometry();indexed.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));indexed.setIndex(indices);const geometry=indexed.toNonIndexed();indexed.dispose();geometry.computeVertexNormals();return geometry;
}
function batchDistantTank(hull,hatch,tracks,turretMesh,barrel,gun){
  const hullParts=[hull.geometry,hatch.geometry,tracks.geometry];
  hull.geometry=mergeGeometries(hullParts,false);
  for(const geometry of hullParts)geometry.dispose();
  hatch.removeFromParent();
  tracks.removeFromParent();

  // Keep two draws: hull with scrolling tracks, and the rotating turret.
  // The barrel shares the turret mesh, with only its vertices posed on demand.
  const turretGeometry=turretMesh.geometry,barrelGeometry=barrel.geometry;
  const offset=turretGeometry.attributes.position.count;
  const restPosition=barrelGeometry.attributes.position,restNormal=barrelGeometry.attributes.normal;
  turretMesh.geometry=mergeGeometries([turretGeometry,barrelGeometry],false);
  const {position:vertices,normal:normals}=turretMesh.geometry.attributes;
  vertices.setUsage(THREE.DynamicDrawUsage);
  normals.setUsage(THREE.DynamicDrawUsage);
  turretGeometry.dispose();
  barrelGeometry.dispose();
  barrel.removeFromParent();

  let lastPitch,lastRecoil;
  const updateBarrel=()=>{
    if(gun.rotation.x===lastPitch&&gun.position.z===lastRecoil)return;
    lastPitch=gun.rotation.x;
    lastRecoil=gun.position.z;
    gun.updateMatrix();
    for(let i=0;i<restPosition.count;i++){
      barrelVertex.fromBufferAttribute(restPosition,i).applyMatrix4(gun.matrix);
      vertices.setXYZ(offset+i,barrelVertex.x,barrelVertex.y,barrelVertex.z);
      barrelVertex.fromBufferAttribute(restNormal,i).transformDirection(gun.matrix);
      normals.setXYZ(offset+i,barrelVertex.x,barrelVertex.y,barrelVertex.z);
    }
    for(const attribute of [vertices,normals]){
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(offset*3,restPosition.count*3);
      attribute.needsUpdate=true;
    }
    turretMesh.geometry.computeBoundingSphere();
  };
  updateBarrel();
  return updateBarrel;
}
function buildLevel(level,material){
  const group=new THREE.Group(),body=new THREE.Group(),turret=new THREE.Group(),gun=new THREE.Group();group.add(body);body.add(turret);turret.position.set(0,TANK_TURRET_BASE_Y,-.4);turret.add(gun);gun.position.set(0,.34,-.9);
  const hull=island(body,material,({box,cylinder,piece})=>{
    piece(slopedHull(),0,0,0,1,1,1);
    if(level<2){
      box(0,1.48,1.9,2.48,.05,1.45,0x343b32);for(let i=0;i<(level?5:10);i++)box(0,1.52,1.25+i*(level?.31:.155),2.12,.04,.055,0x202820);
      for(const side of [-1,1]){
        box(side*1.48,1.42,.05,.62,.1,6.7,0x7d826c);
        for(let i=0;i<(level?3:6);i++)box(side*1.75,1.09,-2.64+i*(level?2.12:1.06),.10,.6,level?2.06:1.0,i%2?0x747965:0x838673);
        box(side*1.10,1.66,2.3,.055,.055,1.6,0x424a3e);for(const z of [1.55,3.05])box(side*1.10,1.56,z,.055,.22,.055,0x424a3e);
        cylinder(side*.87,.98,3.1,.28,.74,0x737b66,level?8:12,0,Math.PI/2);
        box(side*1.28,1.1,-3.22,.24,.18,.18,0x323b32);cylinder(side*1.28,1.12,-3.32,.073,.04,0xd0cbb0,8,Math.PI/2);
        if(!level){for(let i=0;i<4;i++)box(side*.54,1.3+i*.041,-2.95+i*.27,.94,.13,.22,0x8b9078,-.27);box(side*1.30,1.57,2.3,.15,.08,.43,0x353e32);}
      }
    }
  });
  const turretMesh=island(turret,material,({box,cylinder,piece})=>{
    cylinder(0,-.03,0,1.13,.13,0x343d31,level===2?8:12);
    const profile=[[0,0],[1.11,0],[1.31,.12],[1.25,.32],[1.03,.53],[.64,.63],[0,.63]].map(([r,y])=>new THREE.Vector2(r,y));
    piece(new THREE.LatheGeometry(profile,level===2?10:level?16:24),0,0,.04,1,1,1.08,0x7d826c);
    if(level<2){
      for(const side of [-1,1]){box(side*.60,.32,1.13,.94,.3,.43,0x66705a);cylinder(side*.47,.66,.30,.30,.10,0x535f4e,12);}
      for(let i=-3;i<=3;i++){const a=i*.25;box(Math.sin(a)*1.24,.27,-Math.cos(a)*1.27,.34,.32,.18,i%2?0x959982:0x777f69,-.2,-a);}
    }
    if(!level){
      for(const side of [-1,1]){box(side*.88,.54,-.12,.14,.16,.28,0x303b31);box(side*.88,.56,-.27,.11,.07,.025,0x88a59b);}
      box(-.82,.93,.84,.028,.88,.028,0x30382d);box(.38,.74,.37,.38,.07,.39,0x626e58,.35);
    }
  });
  const barrel=island(gun,material,({box,cylinder})=>{
    box(0,0,.04,.53,.38,.56,0x68745e);cylinder(0,0,-TANK_MUZZLE_DISTANCE/2,.085,TANK_MUZZLE_DISTANCE,0x7b836f,level===2?6:12,Math.PI/2);
    if(level<2){cylinder(0,0,-.70,.14,.68,0x55624e,12,Math.PI/2);cylinder(0,0,-2.25,.13,.32,0x68735e,12,Math.PI/2);cylinder(0,0,-3.83,.105,.18,0x4b5747,12,Math.PI/2);box(0,0,-TANK_MUZZLE_DISTANCE,.13,.13,.025,0x131c17);cylinder(.29,-.02,-.48,.029,.82,0x30392e,8,Math.PI/2);}
  });
  const hatch=island(body,material,({box,cylinder})=>{cylinder(-.62,1.50,-1.9,.33,.10,0x505e49,level===2?6:12);if(level<2)box(-.62,1.65,-1.88,.52,.20,.07,0x4e5c47,-.65);});
  const tracks=island(body,material,({box,piece})=>{for(const side of [-1,1]){
    if(level===2)box(side*1.5,.44,.05,.56,.88,6.8,0x242c28);
    else{
      // A continuous open belt exposes the road wheels; its lower run rests on the ground.
      const outline=new THREE.Shape();outline.moveTo(-3.4,.23);for(const [z,y]of[[-3.15,0],[3.15,0],[3.4,.23],[3.4,.65],[3.15,.88],[-3.15,.88],[-3.4,.65]])outline.lineTo(z,y);outline.closePath();
      const opening=new THREE.Path();opening.moveTo(-3.03,.18);for(const [z,y]of[[3.03,.18],[3.2,.29],[3.2,.59],[3.03,.7],[-3.03,.7],[-3.2,.59],[-3.2,.29]])opening.lineTo(z,y);opening.closePath();outline.holes.push(opening);
      const belt=new THREE.ExtrudeGeometry(outline,{depth:.56,bevelEnabled:false,steps:1,curveSegments:1});belt.translate(0,0,-.28);belt.rotateY(Math.PI/2);piece(belt,side*1.5,0,.05,1,1,1,0x313a32);
    }
    if(!level)for(let i=0;i<22;i++)for(const y of [.03,.88])box(side*1.5,y,-2.9+i*.28,.58,.04,.13,0x50564a);
  }});
  const trackPositions=tracks.geometry.attributes.position,trackSide=tracks.geometry.attributes.trackSide;
  for(let i=0;i<trackSide.count;i++)trackSide.setX(i,Math.sign(trackPositions.getX(i)));
  let wheels=null;
  if(level<2){const template=island(new THREE.Group(),material,({cylinder})=>{
      cylinder(0,0,0,.35,.14,0x30372e,level?8:12,0,Math.PI/2);
      if(!level)cylinder(0,0,0,.27,.17,0x7e846d,12,0,Math.PI/2);
      cylinder(0,0,0,.105,.22,0x505d46,8,0,Math.PI/2);
    });const geometry=template.geometry,count=level?10:12;wheels=new THREE.InstancedMesh(geometry,material,count);const color=new THREE.Color(0xffffff);
    for(let i=0;i<count;i++){matrix.makeTranslation(i<count/2?-1.72:1.72,.42,-2.65+i%(count/2)*5.3/(count/2-1));wheels.setMatrixAt(i,matrix);wheels.setColorAt(i,color);}body.add(wheels);}
  if(level===1){const geometry=mergeGeometries([hull.geometry,hatch.geometry],false);hull.geometry.dispose();hatch.geometry.dispose();hull.geometry=geometry;hatch.removeFromParent();}
  const updateBarrel=level===2?batchDistantTank(hull,hatch,tracks,turretMesh,barrel,gun):null;
  return {group,body,turret,gun,hull,turretMesh,hatch,tracks,wheels,updateBarrel};
}
export function createTankRig(){
  const travel={value:new THREE.Vector2()},material=new THREE.MeshLambertMaterial({vertexColors:true,map:atlas??null}),group=new THREE.Group();
  material.onBeforeCompile=shader=>{shader.uniforms.tankTravel=travel;shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float trackSide;uniform vec2 tankTravel;').replace('#include <uv_vertex>','#include <uv_vertex>\n#ifdef USE_MAP\nif(abs(trackSide)>.5)vMapUv.y+=trackSide<0.?tankTravel.x:tankTravel.y;\n#endif');};
  material.customProgramCacheKey=()=> 's09-tank-tracks-v1';
  const levels=[0,1,2].map(level=>buildLevel(level,material));for(const l of levels)group.add(l.group);
  const body=new THREE.Group();group.add(body); // Shared seated-actor parent, independent of LOD swaps.
  const shadowMaterial=new THREE.MeshLambertMaterial({colorWrite:false,depthWrite:false}),shadow=new THREE.Mesh(mergeGeometries([levels[1].hull.geometry,levels[1].tracks.geometry],false),shadowMaterial);shadow.castShadow=true;shadow.visible=false;body.add(shadow);
  return {tank:true,group,body,shadow,levels,level:0,material,travel,materialsToDispose:new Set([material,shadowMaterial]),riders:[],initialized:false};
}
export function updateTankRig(rig,v,p,dt,blend,view,low,terrain){
  position.set(v.x,v.y??0,v.z);
  const group=rig.group,reset=!rig.initialized||group.position.distanceToSquared(position)>64,t=reset?1:blend;
  group.scale.set(v.modelScale?.x??1,v.modelScale?.y??1,v.modelScale?.z??1);
  group.position.lerp(position,t);group.rotation.y+=Math.atan2(Math.sin(v.yaw-group.rotation.y),Math.cos(v.yaw-group.rotation.y))*t;rig.initialized=true;
  const distance=p?Math.hypot(v.x-p.x,v.z-p.z):0,near=low?32:40,far=low?85:100;
  if(rig.level===0&&distance>near*1.06)rig.level=1;else if(rig.level===1&&distance<near*.94)rig.level=0;
  if(rig.level===1&&distance>far*1.06)rig.level=2;else if(rig.level===2&&distance<far*.94)rig.level=1;
  if(p?.vehicleId===v.id)rig.level=0;
  const tilt=reset?1:1-Math.exp(-dt*14);rig.body.rotation.x+=((v.bodyPitch??0)-rig.body.rotation.x)*tilt;rig.body.rotation.z+=((v.bodyRoll??0)-rig.body.rotation.z)*tilt;
  rig.shadow.visible=rig.level===0&&distance<48;
  rig.travel.value.x+=(v.speed+(v.steer??0)*1.8)*dt*.35;rig.travel.value.y+=(v.speed-(v.steer??0)*1.8)*dt*.35;
  const pose=rig.aimPose??={};pose.yaw=group.rotation.y;pose.modelScale=v.modelScale;pose.bodyPitch=rig.body.rotation.x;pose.bodyRoll=rig.body.rotation.z;
  const direction=vehicleAimDirection(pose,v.aimYaw??v.yaw,v.aimPitch??0,modelDirection),delta=Math.atan2(-direction.x,-direction.z),pitch=Math.atan2(direction.y,Math.hypot(direction.x,direction.z));
  if(reset){rig.cannonSeq=v.cannonSeq;rig.recoil=0;}
  rig.wreckAge=v.hp<=0?(rig.wreckAge??0)+dt:0;
  for(const [index,l] of rig.levels.entries()){
    l.group.visible=index===rig.level;l.body.rotation.copy(rig.body.rotation);
    l.turret.rotation.y=delta;l.gun.rotation.x=pitch;
    l.turret.position.set(v.hp<=0?Math.min(3.2,rig.wreckAge*3.2):0,v.hp<=0?Math.max(.15,TANK_TURRET_BASE_Y+rig.wreckAge*8-rig.wreckAge**2*10):TANK_TURRET_BASE_Y,-.4+(v.hp<=0?Math.min(2,rig.wreckAge*2):0));l.turret.rotation.z=v.hp<=0?Math.min(1.1,rig.wreckAge):0;
    if(rig.cannonSeq!==undefined&&rig.cannonSeq!==v.cannonSeq)rig.recoil=.4;
    l.gun.position.z=-.9+(rig.recoil??0);l.hatch.visible=!(p?.vehicleId===v.id&&p.vehicleSeat===0&&!view.vehicleThirdPerson);
    if(l.group.visible)l.updateBarrel?.();
    l.hull.castShadow=l.turretMesh.castShadow=index===1&&distance<48;
    if(l.wheels){const half=l.wheels.count/2;for(let i=0;i<l.wheels.count;i++){quaternion.setFromAxisAngle(wheelAxis,(i<half?rig.travel.value.x:rig.travel.value.y)*5);matrix.compose(position.set(i<half?-1.72:1.72,.42,-2.65+i%half*5.3/(half-1)),quaternion,scale.set(1,1,1));l.wheels.setMatrixAt(i,matrix);}l.wheels.instanceMatrix.needsUpdate=true;}
  }
  rig.recoil=Math.max(0,(rig.recoil??0)-dt*.8);rig.cannonSeq=v.cannonSeq;
  rig.material.color.setHex(v.hp<=0?0x383c38:0xffffff);
  if(reset)group.updateMatrixWorld(true);
}
export function tankModelStats(rig){return rig.levels.map(l=>{let triangles=0,draws=0;l.group.traverse(o=>{if(o.isMesh){triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3*(o.count??1);draws++;}});return{triangles,draws};});}
