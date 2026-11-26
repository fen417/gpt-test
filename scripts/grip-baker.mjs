// Bake the new glove geometry onto the existing FPS poses and trigger morphs.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RIFLE_SUPPORT_POSE, RIFLE_TRIGGER_WRIST, SUPPLY_POSE, DEFIB_POSE, BINOCULAR_POSE } from '../src/gadget-poses.js';
import { fitGlove, gloveCut, packArmPart, retargetGlove, shapeSleeve, sleeveCut } from './fps-arm-retarget.mjs';

globalThis.self = globalThis;
const root = new URL('../', import.meta.url);
const sourceDir = fileURLToPath(new URL('art-source/fps-arms/', root));
const windowsBlender = 'C:/Program Files/Blender Foundation/Blender 5.3/blender.exe';
const blender = process.env.BLENDER_EXE ?? (fs.existsSync(windowsBlender) ? windowsBlender : 'blender');
let cachedSource;
export function loadArmSource(){
if(cachedSource)return cachedSource;
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'sector09-hands-'));
const geometryFile = path.join(temporary, 'geometry.json');
let source;
try {
  execFileSync(blender, ['--factory-startup', '-b', path.join(sourceDir, 'bobeer.blend'), '-t', '4',
    '--python-exit-code', '1', '--python', path.join(sourceDir, 'export_geometry.py'), '--', geometryFile],
    { stdio: 'inherit' });
  source = JSON.parse(fs.readFileSync(geometryFile, 'utf8'));
} finally {
  if (fs.existsSync(geometryFile)) fs.unlinkSync(geometryFile);
  fs.rmdirSync(temporary);
}
  return cachedSource=source;
}
export const poses = {
  pistolSupport: { source: 'pistol', side: 'R', mirror: true, scale: .48, rotation: [.35, .02, 0], wrist: [-.035, -.053, -.014], origin: [0, 0, 0], index: [.002,.012,-.064], fingers: [[.004,-.003,-.060],[.002,-.019,-.057],[-.003,-.035,-.050]], thumb: [-.010,.050,-.047] },
  pistolTrigger: { source: 'pistol', side: 'R', scale: .48, rotation: [.35, .02, 0], wrist: [.010, -.195, .175], origin: [0, 0, 0], index: [.006, -.122, .034], fingers: [[-.024,-.157,.081],[-.024,-.177,.087],[-.023,-.198,.092]], thumb: [-.024,-.136,.088] },
  // Palms face the case sides; fingers rise around its lower corners. The
  // thumbs form horizontal shelves underneath (an L on each lower corner).
  supplyLeft: { source:'rifle',side:'L',scale:.45,rotation:[Math.PI/2,0,-Math.PI/2],wrist:SUPPLY_POSE.leftWrist,origin:[0,0,0],index:[-.144,.117,.090],indexWrap:true,fingers:[[-.144,.108,.069],[-.144,.094,.051],[-.144,.071,.035]],fingerPole:[-1,0,0],thumb:[-.062,-.012,.085],thumbPole:[0,0,1] },
  supplyRight: { source:'rifle',side:'L',mirror:true,scale:.45,rotation:[Math.PI/2,0,-Math.PI/2],wrist:SUPPLY_POSE.rightWrist,origin:[0,0,0],index:[.144,.117,.090],indexWrap:true,fingers:[[.144,.108,.069],[.144,.094,.051],[.144,.071,.035]],fingerPole:[1,0,0],thumb:[.062,-.012,.085],thumbPole:[0,0,1] },
};

const rigs=new Map();
async function getRig(name){
  if(!rigs.has(name)){
    const buffer=fs.readFileSync(new URL(`art-source/djmaesen-arms/${name}-arms.glb`,root));
    rigs.set(name,new GLTFLoader().parseAsync(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength),'').then(gltf=>{
      const skeleton=gltf.scene.getObjectByName('FPArms').skeleton;
      return {gltf,rest:skeleton.bones.map(b=>b.quaternion.clone())};
    }).catch(error=>{rigs.delete(name);throw error;}));
  }
  const {gltf,rest}=await rigs.get(name);
  const skeleton=gltf.scene.getObjectByName('FPArms').skeleton;
  skeleton.bones.forEach((bone,i)=>bone.quaternion.copy(rest[i]));
  gltf.scene.updateMatrixWorld(true);skeleton.update();
  return gltf;
}
export async function bakeIK(source,pose){
  const gltf = await getRig(pose.source);
  const skeleton = gltf.scene.getObjectByName('FPArms').skeleton;
  const hand = gltf.scene.getObjectByName(`Hand_${pose.side}`);
  const wrist = hand.getWorldPosition(new T.Vector3());
  const rotation = new T.Quaternion().setFromEuler(new T.Euler(...pose.rotation));
  const target = new T.Vector3(...pose.wrist).sub(new T.Vector3(...pose.origin));
  const transform = p => { p.sub(wrist).multiplyScalar(pose.scale).applyQuaternion(rotation); if(pose.mirror) p.x *= -1; return p.add(target); };
  function fingerIK(point, numbers=['007','006','005'], tipName='007_end', wrap=false, bendPole=pose.fingerPole||[0,0,-1]) {
    const goal = new T.Vector3(...point).sub(target);
    if(pose.mirror) goal.x *= -1;
    goal.applyQuaternion(rotation.clone().invert()).divideScalar(pose.scale).add(wrist);
    const tip = gltf.scene.getObjectByName(`Bone_${pose.side}${tipName}`);
    if(wrap) {
      const bones=[...numbers].reverse().map(number=>gltf.scene.getObjectByName(`Bone_${pose.side}${number}`));
      const points=[...bones,tip].map(b=>b.getWorldPosition(new T.Vector3()));
      const count=bones.length, lengths=bones.map((_,i)=>points[i].distanceTo(points[i+1])),anchor=points[0].clone();
      // Bend round the front strap, rather than taking a straight path through
      // the solid handle. FABRIK is build-time only; lengths stay unchanged.
      const pole=new T.Vector3(...bendPole);
      if(pose.mirror) pole.x*=-1;
      pole.applyQuaternion(rotation.clone().invert());
      for(let i=1;i<count;i++) points[i].lerpVectors(anchor,goal,i/count).addScaledVector(pole,count===3?(i===1?.085:.065):.085);
      for(let pass=0;pass<32;pass++) {
        points[count].copy(goal);
        for(let i=count-1;i>=0;i--)points[i].sub(points[i+1]).setLength(lengths[i]).add(points[i+1]);
        points[0].copy(anchor);
        for(let i=1;i<=count;i++)points[i].sub(points[i-1]).setLength(lengths[i-1]).add(points[i-1]);
      }
      for(let i=0;i<count;i++) {
        const bone=bones[i],next=i===count-1?tip:bones[i+1],pivot=bone.getWorldPosition(new T.Vector3());
        const delta=new T.Quaternion().setFromUnitVectors(next.getWorldPosition(new T.Vector3()).sub(pivot).normalize(),points[i+1].clone().sub(pivot).normalize());
        const parent=bone.parent.getWorldQuaternion(new T.Quaternion());
        bone.quaternion.premultiply(parent.clone().invert().multiply(delta).multiply(parent));
        gltf.scene.updateMatrixWorld(true);
      }
      skeleton.update();return;
    }
    for(let pass=0;pass<12;pass++) for(const number of numbers) {
      const bone = gltf.scene.getObjectByName(`Bone_${pose.side}${number}`);
      const pivot=bone.getWorldPosition(new T.Vector3());
      const from=tip.getWorldPosition(new T.Vector3()).sub(pivot).normalize(), to=goal.clone().sub(pivot).normalize();
      const delta=new T.Quaternion().setFromUnitVectors(from,to);
      const angle=2*Math.acos(T.MathUtils.clamp(delta.w,-1,1));
      if(angle>.14) delta.slerp(new T.Quaternion(),1-.14/angle);
      const parent=bone.parent.getWorldQuaternion(new T.Quaternion());
      bone.quaternion.premultiply(parent.clone().invert().multiply(delta).multiply(parent));
      gltf.scene.updateMatrixWorld(true);
    }
    skeleton.update();
  }
  if(pose.index) fingerIK(pose.index,undefined,undefined,Boolean(pose.indexWrap));
  if(pose.thumb) {
    if(pose.thumbDirection||(pose.side==='R'&&!pose.mirror)) {
      const bone=gltf.scene.getObjectByName(`Bone_${pose.side}022`),tip=gltf.scene.getObjectByName(`Bone_${pose.side}022_end`);
      const length=bone.getWorldPosition(new T.Vector3()).distanceTo(tip.getWorldPosition(new T.Vector3()))*pose.scale;
      const forward=new T.Vector3(...(pose.thumbDirection||[-.10,.18,-1])).normalize();
      const distal=new T.Vector3(...pose.thumb).addScaledVector(forward,-length);
      fingerIK(distal.toArray(),['021','020'],'022',Boolean(pose.thumbPole),pose.thumbPole);
      const pivot=bone.getWorldPosition(new T.Vector3());
      const direction=forward.clone();
      if(pose.mirror) direction.x*=-1;
      direction.applyQuaternion(rotation.clone().invert());
      const delta=new T.Quaternion().setFromUnitVectors(tip.getWorldPosition(new T.Vector3()).sub(pivot).normalize(),direction);
      const parent=bone.parent.getWorldQuaternion(new T.Quaternion());
      bone.quaternion.premultiply(parent.clone().invert().multiply(delta).multiply(parent));
      gltf.scene.updateMatrixWorld(true);skeleton.update();
    } else fingerIK(pose.thumb,['022','021','020'],'022_end',Boolean(pose.thumbPole),pose.thumbPole);
  }
  if(pose.fingers) for(let i=0;i<3;i++) {
    const end=11+i*4, number=n=>String(n).padStart(3,'0');
    fingerIK(pose.fingers[i],[number(end),number(end-1),number(end-2)],`${number(end)}_end`,true);
  }
  const authored = source.hands[pose.side];
  const fit = () => retargetGlove(gltf.scene, source, pose.side, transform, rotation, pose.mirror);
  const vertices = authored.vertices.map(fit());
  // Bake both ends of the trigger/release motion on the same imported topology.
  for (const bone of skeleton.bones) {
    if (!bone.name.startsWith(`Bone_${pose.side}`)) continue;
    const finger = bone.name.slice(`Bone_${pose.side}`.length);
    if ((pose.side === 'L' || pose.mirror) && ['005', '006', '007', '009', '010', '011', '013', '014', '015', '017', '018', '019'].includes(finger)) {
      bone.quaternion.slerp(new T.Quaternion(), .55);
    }
  }
  gltf.scene.updateMatrixWorld(true); skeleton.update();
  if(pose.index && !pose.mirror) fingerIK([pose.index[0]-.008,pose.index[1],pose.index[2]+.004]);
  const morph = authored.vertices.map(fit());
  for (const [i, vertex] of vertices.entries()) {
    vertex.morph = morph[i].p.map((value, axis) => value - vertex.p[axis]);
    vertex.morphN = morph[i].n.map((value, axis) => value - vertex.n[axis]);
  }
  return packArmPart(authored, vertices, gloveCut, pose.mirror);
}
export function bakeFixed(source, wrist, joints, { side = 'L', mirror = false, origin = [0, 0, 0], morph = null } = {}) {
  const arm = source.hands[side];
  const offset = new T.Vector3(...origin);
  const transform = position => {
    if (mirror) position.x *= -1;
    return position.sub(offset);
  };
  const fit = chains => fitGlove(source, side, new T.Vector3(...wrist),
    chains.map(chain => chain.map(p => new T.Vector3(...p))), .80, transform, new T.Quaternion(), mirror);
  const vertices = arm.vertices.map(fit(joints));
  if (morph) {
    const moved = arm.vertices.map(fit(morph));
    for (const [i, vertex] of vertices.entries()) {
      vertex.morph = moved[i].p.map((value, axis) => value - vertex.p[axis]);
      vertex.morphN = moved[i].n.map((value, axis) => value - vertex.n[axis]);
    }
  }
  return packArmPart(arm, vertices, gloveCut, mirror);
}

// The cuff approaches the fore-end from behind. The palm supports the lower
// rail and the fingertips curl up the opposite side.
export const foreEnd = [
  [[-.016,-.072,-.448],[.010,-.064,-.464],[.029,-.052,-.473],[.030,-.032,-.476]],
  [[.001,-.070,-.426],[.027,-.062,-.440],[.044,-.046,-.448],[.043,-.026,-.449]],
  [[.013,-.072,-.406],[.037,-.064,-.419],[.051,-.044,-.425],[.049,-.027,-.426]],
  [[.018,-.077,-.386],[.040,-.070,-.396],[.053,-.052,-.401],[.052,-.037,-.404]],
  [[-.068,-.091,-.397],[-.062,-.071,-.427],[-.052,-.052,-.449],[-.049,-.040,-.471]],
];
export const openForeEnd = foreEnd.map((chain, finger) => {
  if (finger === 4) return chain;
  const root = new T.Vector3(...chain[0]);
  const direction = new T.Vector3(.74, .14, -.66);
  return chain.map((p, i) => i === 0 ? p : root.clone()
    .addScaledVector(direction, [0,.030,.052,.069][i] * (finger === 3 ? .86 : 1)).toArray());
});

// The glove comes around the back strap. The thumb opposes the fingers
// across the grip, and the index moves independently when the trigger cycles.
export const firingGrip = [
  [[.036,-.119,.083],[.034,-.109,.055],[.025,-.107,.034],[.012,-.110,.021]],
  [[.034,-.140,.090],[.030,-.145,.058],[.013,-.149,.042],[-.009,-.152,.048]],
  [[.034,-.160,.099],[.028,-.165,.070],[.011,-.171,.054],[-.010,-.175,.059]],
  [[.034,-.181,.109],[.027,-.186,.083],[.012,-.193,.066],[-.007,-.196,.071]],
  [[.034,-.174,.132],[.012,-.150,.130],[-.013,-.137,.122],[-.027,-.126,.109]],
];
export const firingMorph = [...firingGrip];
firingMorph[0] = [...firingGrip[0].slice(0, 2), [.022,-.108,.036],[.007,-.109,.029]];


export const fingerNames=['index','middle','ring','pinky','thumb'];
export const weaponIds=['p19','m50','ar416','ak12','mcx9','vk45','mg36','pkp','dmr12','sv98'];
export const isPistol=id=>id==='p19'||id==='m50';
export function normalizeGrip(input={}){
  if(!input||typeof input!=='object')throw Error('Invalid grip');
  const result={};
  for(const name of [...fingerNames,'position','rotation']){
    const v=input[name]??[0,0,0],limit=name==='rotation'?60:.06;
    if(!Array.isArray(v)||v.length!==3||v.some(x=>typeof x!=='number'||!Number.isFinite(x)||Math.abs(x)>limit))throw Error('Invalid grip '+name);
    result[name]=v.map(x=>Math.round(x*100000)/100000);
  }
  return result;
}
const add=(a,b)=>a.map((v,i)=>v+b[i]);
const moved=v=>v.some(x=>x!==0);
function moveChain(chain,delta){
  if(!moved(delta))return chain;
  const points=chain.map(p=>new T.Vector3(...p)),anchor=points[0].clone();
  const goal=points.at(-1).clone().add(new T.Vector3(...delta));
  const lengths=points.slice(1).map((p,i)=>p.distanceTo(points[i]));
  const last=points.length-1;
  // Preserve the original bend as a starting point and all segment lengths.
  for(let i=1;i<=last;i++)points[i].addScaledVector(new T.Vector3(...delta),i/last);
  for(let pass=0;pass<24;pass++){
    points[last].copy(goal);
    for(let i=last-1;i>=0;i--)points[i].sub(points[i+1]).setLength(lengths[i]).add(points[i+1]);
    points[0].copy(anchor);
    for(let i=1;i<=last;i++)points[i].sub(points[i-1]).setLength(lengths[i-1]).add(points[i-1]);
  }
  return points.map(p=>p.toArray());
}
export async function bakeProfile(id,side,input){
  if(!weaponIds.includes(id)||!['left','right'].includes(side))throw Error('Unknown weapon/hand');
  const params=normalizeGrip(input);
  let geometry=null;
  if(fingerNames.some(name=>moved(params[name]))){
    const source=loadArmSource();
    if(isPistol(id)){
      const base=poses[side==='right'?'pistolTrigger':'pistolSupport'];
      const pose={...base,index:add(base.index,params.index),thumb:add(base.thumb,params.thumb),fingers:base.fingers.map((p,i)=>add(p,params[fingerNames[i+1]]))};
      geometry=await bakeIK(source,pose);
    }else{
      const right=side==='right';
      const adjust=chains=>chains.map((chain,i)=>moveChain(chain,params[fingerNames[i]]));
      geometry=bakeFixed(source,right?RIFLE_TRIGGER_WRIST:RIFLE_SUPPORT_POSE.wrist,adjust(right?firingGrip:foreEnd),right?{side:'R',morph:adjust(firingMorph)}:{origin:RIFLE_SUPPORT_POSE.origin,morph:adjust(openForeEnd)});
    }
  }
  return {params,geometry};
}
