import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { getVehicleDimensions, vehicleAimDirection, HUMVEE_SIDE_WINDOWS, TURRET_MAX_PITCH, TURRET_MIN_PITCH, VEHICLE_TYPES } from '../shared/vehicles.js';

const upAxis = new THREE.Vector3(0, 1, 0);
const turretHeading = new THREE.Quaternion();
const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
const paneGeometry = new THREE.PlaneGeometry(1, 1);
const roundedGeometry = new RoundedBoxGeometry(1, 1, 1, 1, .13);
const cylinderGeometry = new THREE.CylinderGeometry(1, 1, 1, 16);
const sphereGeometry = new THREE.SphereGeometry(1, 12, 8);
const ringGeometry = new THREE.TorusGeometry(1, .10, 8, 24);
const H = Math.PI / 2;

function parts(parent, materials, draw) {
  const batches = new Map();
  const position = new THREE.Vector3(), scale = new THREE.Vector3();
  const rotation = new THREE.Euler(), quaternion = new THREE.Quaternion(), matrix = new THREE.Matrix4();
  const piece = (geometry, mat, x, y, z, w, h, d, rx=0, ry=0, rz=0) => {
    matrix.compose(position.set(x,y,z),quaternion.setFromEuler(rotation.set(rx,ry,rz)),scale.set(w,h,d));
    const clone = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    clone.applyMatrix4(matrix);
    if (!batches.has(mat)) batches.set(mat, []);
    batches.get(mat).push(clone);
  };
  const prism = (mat,...params) => piece(boxGeometry,mat,...params);
  const pane = (x,y,z,w,h,rx=0,ry=0) => piece(paneGeometry,'glass',x,y,z,w,h,1,rx,ry);
  const round = (mat,...params) => piece(roundedGeometry,mat,...params);
  const ball = (mat,...params) => piece(sphereGeometry,mat,...params);
  const ring = (mat,...params) => piece(ringGeometry,mat,...params);
  const cylinder = (mat,x,y,z,r,length,rx=0,ry=0,rz=0) => piece(cylinderGeometry,mat,x,y,z,r,length,r,rx,ry,rz);
  const tube = (mat,r,ax,ay,az,bx,by,bz) => {
    const delta = new THREE.Vector3(bx-ax,by-ay,bz-az);
    const angle = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0,1,0),delta.clone().normalize(),
    ));
    cylinder(mat,(ax+bx)/2,(ay+by)/2,(az+bz)/2,r,delta.length(),angle.x,angle.y,angle.z);
  };
  draw({ prism, pane, piece, round, ball, ring, cylinder, tube });
  for (const [key, list] of batches) {
    const geometry = mergeGeometries(list);
    for (const item of list) item.dispose();
    const mesh = new THREE.Mesh(geometry, materials[key]);
    mesh.name = key;
    mesh.castShadow = !mesh.material.transparent;
    mesh.receiveShadow = !mesh.material.transparent;
    parent.add(mesh);
  }
}

function wheel(parent, materials, x, z, radius, width, front) {
  const carrier = new THREE.Group(), tire = new THREE.Group();
  carrier.position.set(x,radius,z);
  carrier.add(tire);
  parent.add(carrier);
  parts(tire,materials,({cylinder,prism})=>{
    cylinder('rubber',0,0,0,radius,width,0,0,H);
    for (const side of [-1,1]) {
      cylinder('rubber',side*width*.48,0,0,radius*.86,width*.095,0,0,H);
      cylinder('rim',side*width*.54,0,0,radius*.55,width*.075,0,0,H);
      cylinder('steel',side*width*.59,0,0,radius*.27,width*.12,0,0,H);
      for(let n=0;n<6;n++){
        const a=n*Math.PI/3;
        cylinder('rim',side*width*.68,Math.cos(a)*radius*.18,Math.sin(a)*radius*.18,.014,.026,0,0,H);
      }
    }
    for(let n=0;n<18;n++){
      const a=n*Math.PI/9;
      prism('tread',0,Math.cos(a)*radius,Math.sin(a)*radius,width*.93,.026,radius*.14,a,0,(n%2-.5)*.32);
    }
  });
  return {carrier,tire,front,radius};
}

function buildAtv(body, materials) {
  parts(body,materials,({prism,round,cylinder,tube})=>{
    round('steel',0,.47,.04,.58,.32,1.50);
    round('steel',0,.6,-.08,.46,.35,.68);
    round('paint',0,.82,-.65,.83,.29,.85,.13);
    round('paint',0,.73,.55,.64,.22,.99);
    round('canvas',0,.87,.27,.45,.16,.92,-.03);
    round('canvas',0,.96,.63,.42,.115,.25,-.08);
    prism('badge',0,.962,-.76,.18,.025,.18,.13);
    for(const side of [-1,1]){
      round('paint',side*.43,.69,-.71,.49,.14,.78,.12);
      round('paint',side*.44,.70,.74,.46,.15,.67,-.09);
      round('tread',side*.43,.51,.06,.30,.07,.67);
      for(let n=0;n<5;n++) prism('rim',side*.44,.55,-.20+n*.10,.22,.022,.017);
      tube('rim',.031,side*.17,.5,-.73,side*.52,.32,-.74);
      tube('rim',.031,side*.17,.5,.73,side*.52,.32,.74);
      tube('steel',.033,side*.25,.61,.6,side*.25,.75,1.02);
      prism('lamp',side*.24,.77,-1.068,.20,.10,.032,.16);
      prism('rear',side*.23,.73,1.07,.12,.075,.03);
      tube('rim',.034,side*.34,.65,-.94,side*.34,.47,-1.13);
      tube('rim',.034,side*.34,.47,-1.13,side*.34,.44,-.89);
    }
    for (const [front,rear,y] of [[-.95,-.57,.94],[.76,1.1,.87]]) {
      for(const x of [-.31,.31])tube('rim',.027,x,y,front,x,y,rear);
      for(let i=0;i<4;i++){
        const z=THREE.MathUtils.lerp(front,rear,i/3);
        tube('rim',.026,-.31,y,z,.31,y,z);
      }
    }
    tube('rim',.033,-.34,.47,-1.13,.34,.47,-1.13);
    cylinder('rim',.26,.58,.76,.064,.39,H);
    cylinder('rubber',.26,.58,.97,.037,.025,H);
    for(let n=0;n<7;n++)prism('rim',-.28,.56+n*.028,-.16,.021,.009,.31);
  });
  const controls = new THREE.Group();
  controls.position.set(0,1.06,-.48);
  body.add(controls);
  parts(controls,materials,({prism,round,tube})=>{
    tube('rim',.03,0,-.26,.07,0,-.026,.02);
    for(const side of [-1,1]){
      tube('rim',.019,0,-.03,0,side*.26,.015,-.01);
      tube('rubber',.032,side*.23,.015,-.01,side*.44,.017,.025);
      tube('rim',.009,side*.33,.009,-.064,side*.43,.009,-.036);
    }
    round('rubber',0,.005,-.08,.29,.08,.18,-.2);
    prism('screen',0,.048,-.074,.19,.008,.097,-.2);
    for(let i=0;i<3;i++)prism('lamp',-.055+i*.055,.053,-.053,.018,.005,.019,-.2);
  });
  return controls;
}

function humveeGlazing({prism,pane,piece,tube}) {
  const windows = HUMVEE_SIDE_WINDOWS;
  const front = { bottomY: 1.26, bottomZ: -1.34, topZ: -1.11 };
  const rear = { bottomY: 1.32, bottomZ: 1.43, topZ: 1.395 };
  const topY = 1.75;
  const zAt = (end, y) => THREE.MathUtils.lerp(end.bottomZ, end.topZ, (y - end.bottomY) / (topY - end.bottomY));

  // Each pane and its frame share one plane between the cowl and the roof.
  for (const end of [front, rear]) {
    const height = topY - end.bottomY;
    const depth = end.topZ - end.bottomZ;
    const pitch = Math.atan2(depth, height);
    const length = Math.hypot(height, depth);
    const midY = (topY + end.bottomY) / 2;
    const midZ = (end.topZ + end.bottomZ) / 2;
    const width = 1.98, rail = .048;
    const frame = (x, offset, w, h) => prism('paint', x,
      midY + offset * Math.cos(pitch), midZ + offset * Math.sin(pitch), w, h, .049, pitch);
    for (const side of [-1, 1]) {
      frame(0, side * (length - rail) / 2, width, rail);
      frame(side * (width - rail) / 2, 0, rail, length - 2 * rail);
    }
    if (end === front) {
      frame(0, 0, rail, length - 2 * rail);
      const paneWidth = (width - 3 * rail) / 2;
      for (const side of [-1, 1]) {
        pane(side * (rail + paneWidth) / 2, midY, midZ, paneWidth, length - 2 * rail, pitch);
        tube('steel', .009, side * .34, 1.32, zAt(front, 1.32) - .022,
          side * .57, 1.54, zAt(front, 1.54) - .022);
      }
    } else {
      pane(0, midY, midZ, width - 2 * rail, length - 2 * rail, pitch);
    }
  }

  // One continuous shell joins the lower body to the glazing around both doors.
  const floor = .89;
  const frame = new THREE.Shape();
  frame.moveTo(front.bottomZ, floor);
  frame.lineTo(rear.bottomZ, floor);
  frame.lineTo(rear.bottomZ, rear.bottomY);
  frame.lineTo(rear.topZ, topY);
  frame.lineTo(front.topZ, topY);
  frame.lineTo(front.bottomZ, front.bottomY);
  frame.closePath();
  const sideWindows = [windows.front, windows.rear];
  for (const window of sideWindows) {
    const left = window.z - window.width / 2, right = window.z + window.width / 2;
    const bottom = windows.y - windows.height / 2, top = windows.y + windows.height / 2;
    const opening = new THREE.Path();
    opening.moveTo(left, bottom);
    opening.lineTo(left, top);
    opening.lineTo(right, top);
    opening.lineTo(right, bottom);
    opening.closePath();
    frame.holes.push(opening);
  }
  const sideFrame = new THREE.ExtrudeGeometry(frame, { depth: .045, bevelEnabled: false });
  sideFrame.translate(0, 0, -.0225);
  for (const side of [-1, 1]) {
    piece(sideFrame, 'paint', side * windows.x, 0, 0, 1, 1, 1, 0, -H);
    for (const window of sideWindows) pane(side * windows.x, windows.y, window.z, window.width, windows.height, 0, -H);
  }
  sideFrame.dispose();
}

function buildHumvee(body, materials) {
  parts(body,materials,helpers=>{
    const {prism,round,cylinder,ring,tube}=helpers;
    round('steel',0,.53,.04,1.70,.24,4.18);
    round('paint',0,.76,-.09,1.98,.34,4.43);
    round('paint',0,1.02,-1.69,1.87,.31,1.36,.085);
    round('steel',0,.70,-2.32,1.68,.43,.15);
    round('rubber',0,.92,-2.37,1.14,.31,.07);
    for(let n=0;n<8;n++)prism('steel',-.44+n*.126,.92,-2.413,.065,.27,.025);
    prism('steel',0,.51,-2.43,2.17,.17,.14);
    prism('steel',0,.52,2.37,2.16,.18,.17);
    prism('badge',0,.72,2.27,.22,.16,.024);
    prism('canvas',0,.74,.25,1.75,.045,2.8);
    prism('canvas',0,1.14,-1.08,1.81,.24,.32,.15);
    prism('paint',0,1.82,.14,1.95,.14,2.53);
    prism('rubber',0,1.751,.14,1.83,.032,2.45);
    prism('paint',0,1.20,-1.33,1.98,.15,.13);
    prism('paint',0,1.25,1.43,1.98,.15,.10);
    humveeGlazing(helpers);
    prism('rubber',0,1.04,.08,.22,.42,1.63);
    round('canvas',0,1.26,-.16,.27,.055,.54);
    for(let n=0;n<7;n++)prism('tread',-.56,.775,-.83+n*.092,.46,.022,.023);
    for(const side of [-1,1]){
      round('paint',side*.84,.98,1.82,.29,.31,1);
      prism('paint',side*.985,1.125,.33,.069,.48,2.73);
      prism('steel',side*1.054,.70,.16,.18,.08,2.30);
      for(const z of [-.52,.71]){
        round('canvas',side*.55,.91,z,.42,.15,.44);
        round('canvas',side*.55,1.16,z+.25,.41,.54,.116,-.12);
        round('canvas',side*.55,1.46,z+.29,.26,.18,.11,-.12);
        prism('steel',side*1.038,1.19,z+.30,.056,.047,.16);
        prism('rubber',side*1.021,1.015,z-.55,.018,.23,.022);
      }
      prism('badge',side*1.031,1.05,-.51,.022,.18,.29);
      for(const z of [-1.58,1.56]){
        round('paint',side*.975,.99,z,.30,.12,1.04);
        prism('steel',side*1.037,.55,z+.49,.07,.30,.04);
      }
      cylinder('rim',side*.777,.94,-2.324,.178,.10,H);
      cylinder('lamp',side*.777,.94,-2.389,.137,.038,H);
      prism('rear',side*.9,.86,2.279,.13,.27,.056);
      prism('signal',side*1.022,1.02,-1.97,.056,.075,.15);
      tube('steel',.024,side*.96,1.29,-.98,side*1.205,1.35,-.93);
      round('steel',side*1.235,1.35,-.95,.17,.17,.09);
      prism('mirror',side*1.238,1.35,-.899,.138,.13,.015);
      prism('rubber',side*.57,.72,-2.529,.2,.20,.13);
      tube('steel',.031,side*.7,1.17,-2.31,side*.73,.69,-2.5);
      round('steel',side*.50,1.225,-.895,.48,.12,.29,-.23);
      prism('screen',side*.50,1.286,-.882,.25,.012,.09,-.23);
      for(let n=0;n<4;n++)prism('lamp',side*.50-.09+n*.06,1.293,-.858,.019,.012,.019,-.23);
    }
    tube('steel',.031,-.7,1.17,-2.31,.7,1.17,-2.31);
    round('rim',0,.66,-2.525,.29,.17,.12);
    tube('rim',.014,.81,1.10,2.06,.78,2.57,2.11);
    ring('steel',0,1.917,.19,.55,.55,.55,H);
    cylinder('steel',0,1.92,.19,.39,.13);
    round('canvas',-.57,1.28,1.86,.39,.34,.53);
    for(const z of [1.68,2.02])prism('steel',-.57,1.46,z,.40,.023,.042);
    cylinder('rubber',0,.81,2.21,.37,.30,H);
    cylinder('rim',0,.81,2.38,.21,.08,H);
  });
  const controls = new THREE.Group();
  controls.position.set(-.54,1.24,-.825);
  body.add(controls);
  parts(controls,materials,({prism,round,ring})=>{
    ring('rubber',0,.024,0,.195,.195,.195,-.44);
    round('steel',0,.024,.02,.126,.090,.052,-.44);
    prism('steel',0,-.05,.025,.025,.13,.027,-.44);
    prism('steel',0,.053,.014,.31,.025,.031,-.44);
  });
  return controls;
}

function buildTurret(body, materials) {
  const turret = new THREE.Group(), gun = new THREE.Group();
  turret.position.set(0,2.18,.19);
  turret.add(gun);
  body.add(turret);
  parts(turret,materials,({prism,round,cylinder})=>{
    cylinder('rim',0,-.14,0,.29,.17);
    prism('steel',0,-.02,-.043,.22,.16,.24);
    round('paint',0,-.063,-.29,.81,.24,.069,-.09);
    for(const side of [-1,1]){
      round('paint',side*.277,.069,-.29,.26,.23,.075,-.09);
      prism('rim',side*.277,.181,-.299,.25,.021,.083);
      round('paint',side*.39,-.03,-.14,.073,.36,.39,0,side*.28);
      cylinder('rim',side*.26,.105,-.332,.026,.034,H);
    }
  });
  parts(gun,materials,({prism,round,cylinder,tube})=>{
    round('steel',0,.054,-.37,.153,.148,.55);
    prism('rim',0,.134,-.48,.11,.026,.37);
    cylinder('rim',0,.058,-.94,.046,.79,H);
    cylinder('steel',0,.058,-1.332,.073,.19,H);
    cylinder('rubber',0,.058,-1.433,.044,.008,H);
    cylinder('steel',0,.058,-.69,.061,.29,H);
    for(let n=0;n<5;n++)cylinder('rim',0,.058,-.58-n*.052,.066,.018,H);
    prism('steel',0,.15,-1.2,.032,.085,.05);
    prism('rim',0,.192,-1.2,.019,.05,.021);
    round('paint',-.22,-.01,-.35,.24,.22,.36);
    prism('rim',-.22,.108,-.35,.22,.026,.32);
    for(let n=0;n<6;n++)cylinder('brass',-.21+n*.03,.132+Math.sin(n*Math.PI/5)*.04,-.27,.012,.086,H);
    tube('steel',.018,-.048,.041,-.14,-.11,-.015,.07);
    tube('steel',.018,.048,.041,-.14,.11,-.015,.07);
    tube('rubber',.027,-.11,-.048,.07,-.11,.023,.07);
    tube('rubber',.027,.11,-.048,.07,.11,.023,.07);
  });
  const flash = new THREE.Mesh(sphereGeometry,new THREE.MeshBasicMaterial({color:0xffbd5d}));
  flash.position.set(0,.058,-1.56);
  flash.scale.set(.09,.08,.23);
  flash.visible = false;
  gun.add(flash);
  return {turret,gun,flash};
}

function addGloves(parent, materials, atv, gunner=false) {
  const hands=new THREE.Group();
  parent.add(hands);
  parts(hands,materials,({ball,tube})=>{
    for(const side of [-1,1]){
      const x=side*(gunner?.11:atv?.39:.19),y=gunner?-.022:atv?.027:.055,z=gunner?.08:atv?.019:.017;
      tube('uniform',.046,x+side*.024,y-.125,z+.21,x,y,z+.012);
      ball('rubber',x,y,z,.052,.042,.061);
    }
  });
  hands.visible=false;
  return hands;
}

function rider(body, materials, seat, index, type) {
  const rider = new THREE.Group();
  const gunner = seat.role === 'gunner';
  rider.position.set(seat.x,seat.height-.81,seat.z);
  body.add(rider);
  parts(rider,materials,({prism,round,ball,tube})=>{
    round('uniform',0,.33,.032,.40,.45,.24,-.13);
    round('riderArmor',0,.27,-.104,.36,.31,.083,-.13);
    round('riderArmor',0,.36,.151,.32,.36,.16,-.13);
    ball('skin',0,.645,-.028,.123,.139,.115);
    ball('riderHelmet',0,.705,-.026,.145,.109,.132);
    round('rubber',0,.655,-.12,.213,.058,.072);
    for(const side of [-1,1]){
      prism('badge',side*.206,.442,.027,.024,.093,.09);
      tube('uniform',.073,side*.19,.45,.025,side*.24,.24,-.14);
      const reachesControls=gunner||index===0;
      const gripZ=gunner?-.28:reachesControls?-.36:-.18;
      const gripY=reachesControls?.36:.14;
      tube('uniform',.062,side*.24,.24,-.14,side*.26,gripY,gripZ);
      ball('rubber',side*.26,gripY,gripZ,.059,.047,.072);
      if(type==='atv'){
        tube('uniform',.092,side*.13,.18,.02,side*.29,.12,-.20);
        tube('uniform',.071,side*.29,.12,-.20,side*.33,-.105,-.04);
        round('rubber',side*.33,-.115,-.098,.132,.13,.23);
      }
    }
  });
  return rider;
}

const riderColors = [
  { uniform: 0x849783, riderArmor: 0x46574b, riderHelmet: 0x48594c },
  { uniform: 0xc1ab85, riderArmor: 0x827252, riderHelmet: 0x796c51 },
];

export function createVehicleRig(type, material, teamColors) {
  const group = new THREE.Group(), body = new THREE.Group();
  group.add(body);
  const atv = type === 'atv';
  const materials = {
    paint: material(atv?0x687650:0x7c8066,.8,.21), canvas: material(0x404837,.97,.03),
    steel: material(0x343a38,.74,.43), rim: material(0x697170,.57,.60),
    rubber: material(0x222725,.96,.03), tread: material(0x343b34,.94,.02),
    lamp: material(0xffe7b4,.25,.15,{emissive:0x705b35,emissiveIntensity:.45}),
    signal: material(0xce751c,.44,.12,{emissive:0x703509,emissiveIntensity:.3}),
    rear: material(0xb32b25,.45,.11,{emissive:0x711615,emissiveIntensity:.38}),
    glass: material(0x687e83,.19,.14,{transparent:true,opacity:.19,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true}),
    screen: material(0x557c6a,.40,.14,{emissive:0x203e34,emissiveIntensity:.50}),
    mirror: material(0x879395,.19,.65), uniform: material(riderColors[0].uniform,.93,.01),
    riderArmor: material(riderColors[0].riderArmor,.95,.01), riderHelmet: material(riderColors[0].riderHelmet,.84,.08),
    skin: material(0xa2846d,.93,.01), brass: material(0x927045,.45,.68),
    badge: material(teamColors[0],.84,.1), wreck: material(0x333735,1,.1),
  };
  const controls=atv?buildAtv(body,materials):buildHumvee(body,materials);
  const wheels = [];
  for(const side of [-1,1])for(const direction of [-1,1]){
    wheels.push(wheel(body,materials,side*(atv?.54:.89),direction*(atv?.73:1.55),atv?.31:.49,atv?.28:.39,direction<0));
  }
  const turret = atv?null:buildTurret(body,materials);
  const driverGloves=addGloves(controls,materials,atv);
  const gunnerGloves=turret?addGloves(turret.gun,materials,false,true):null;
  const riders=VEHICLE_TYPES[type].seats.map((seat,index)=>rider(body,materials,seat,index,type));
  const paintMeshes=body.children.filter(node=>node.name==='paint');
  const materialsToDispose=new Set(Object.values(materials).flatMap(mat=>[mat,mat._lowMaterial]).filter(Boolean));
  if(turret)materialsToDispose.add(turret.flash.material);
  return {group,body,wheels,controls,turret,riders,paintMeshes,driverGloves,gunnerGloves,materials,materialsToDispose,teamColors};
}

export function updateVehicleRig(rig, vehicle, player, dt, blend, view, quality, terrain) {
  const {group,body,controls,wheels,turret,riders,paintMeshes,materials,teamColors}=rig;
  group.scale.set(vehicle.modelScale?.x??1,vehicle.modelScale?.y??1,vehicle.modelScale?.z??1);
  const reset = !rig.initialized || Math.hypot(group.position.x-vehicle.x,group.position.z-vehicle.z)>8;
  const t=reset?1:blend;
  group.position.x=THREE.MathUtils.lerp(group.position.x,vehicle.x,t);
  group.position.z=THREE.MathUtils.lerp(group.position.z,vehicle.z,t);
  group.position.y=THREE.MathUtils.lerp(group.position.y,vehicle.y??0,t);
  const angle=vehicle.yaw-group.rotation.y;
  group.rotation.y+=Math.atan2(Math.sin(angle),Math.cos(angle))*t;
  rig.initialized=true;
  const wrecked=vehicle.hp<=0;
  const steer=wrecked?0:vehicle.steer??0;
  let pitch = vehicle.modelRotation?.x??0, roll = vehicle.modelRotation?.z??0;
  if (terrain) {
    const { x, z } = group.position, sin = Math.sin(group.rotation.y), cos = Math.cos(group.rotation.y);
    const { length, width } = getVehicleDimensions(vehicle);
    const longitudinal = length * .35, lateral = width * .45;
    const front = terrain.heightAt(x - sin * longitudinal, z - cos * longitudinal);
    const rear = terrain.heightAt(x + sin * longitudinal, z + cos * longitudinal);
    const right = terrain.heightAt(x + cos * lateral, z - sin * lateral);
    const left = terrain.heightAt(x - cos * lateral, z + sin * lateral);
    pitch += Math.atan2(front - rear, longitudinal * 2);
    roll += Math.atan2(right - left, lateral * 2);
  }
  body.rotation.x=THREE.MathUtils.lerp(body.rotation.x,pitch,t);
  body.rotation.z=THREE.MathUtils.lerp(body.rotation.z,roll+steer*vehicle.speed*.0018,t);
  controls.rotation.z=THREE.MathUtils.lerp(controls.rotation.z,steer*(vehicle.type==='atv'?-.16:-.9),t);
  for(const wheel of wheels){
    if(wheel.front)wheel.carrier.rotation.y=THREE.MathUtils.lerp(wheel.carrier.rotation.y,-steer*.41,t);
    wheel.tire.rotation.x-=vehicle.speed*dt/(wheel.radius*(vehicle.modelScale?.y??1));
  }
  for(let index=0;index<riders.length;index++){
    riders[index].visible=!wrecked&&Boolean(vehicle.seats[index])&&vehicle.seats[index]!==player?.id
      && (vehicle.type==='atv'||index===1);
  }
  const localSeat=player?.vehicleId===vehicle.id?player.vehicleSeat:null;
  rig.driverGloves.visible=!wrecked&&localSeat===0;
  if(turret){
    const localGunner=localSeat===1;
    rig.gunnerGloves.visible=!wrecked&&localGunner;
    const desiredPitch=localGunner?THREE.MathUtils.clamp(view.pitch??player.pitch,TURRET_MIN_PITCH,TURRET_MAX_PITCH):vehicle.aimPitch;
    const direction=vehicleAimDirection({ ...vehicle, yaw:group.rotation.y, bodyPitch:body.rotation.x, bodyRoll:body.rotation.z },
      localGunner?(view.yaw??player.yaw):vehicle.aimYaw,desiredPitch);
    const target=Math.atan2(-direction.x,-direction.z),localPitch=Math.atan2(direction.y,Math.hypot(direction.x,direction.z));
    const delta=target-(rig.turretYaw??target);
    rig.turretYaw=(rig.turretYaw??target)+Math.atan2(Math.sin(delta),Math.cos(delta))*(localGunner?1:t);
    turretHeading.setFromAxisAngle(upAxis,rig.turretYaw);
    turret.turret.quaternion.copy(turretHeading);
    turret.gun.rotation.x=THREE.MathUtils.lerp(turret.gun.rotation.x,
      localPitch,localGunner?1:t);
    if(rig.gunSeq!==undefined&&rig.gunSeq!==vehicle.gunSeq)rig.flashTime=.055;
    rig.gunSeq=vehicle.gunSeq;
    rig.flashTime=Math.max(0,(rig.flashTime??0)-dt);
    turret.flash.visible=!wrecked&&rig.flashTime>0;
    turret.gun.position.z=turret.flash.visible?.024:0;
    riders[1].rotation.y=rig.turretYaw;
  }
  if(rig.team!==vehicle.team){
    // All occupied seats belong to the vehicle's current team.
    for(const [key,color] of Object.entries({ ...riderColors[vehicle.team === 1 ? 1 : 0], badge: teamColors[vehicle.team] ?? teamColors[0] })){
      const m=materials[key];
      m.color.setHex(color);
      m._lowMaterial?.color.setHex(color);
    }
    rig.team=vehicle.team;
  }
  if(rig.wrecked!==wrecked||rig.low!==quality){
    const paint=wrecked?materials.wreck:materials.paint;
    for(const mesh of paintMeshes)mesh.material=quality?(paint._lowMaterial??paint):paint;
    rig.wrecked=wrecked;rig.low=quality;
  }
  if(reset)group.updateMatrixWorld(true);
}

export function disposeVehicleRig(rig) {
  rig.group.removeFromParent();
  rig.group.traverse(node=>{if(node.geometry&&node.geometry!==sphereGeometry)node.geometry.dispose();});
  for(const material of rig.materialsToDispose)material.dispose();
}
