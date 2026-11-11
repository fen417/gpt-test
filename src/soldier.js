import * as THREE from 'three';

const down = new THREE.Vector3(0, -1, 0);
const { clamp, lerp, smoothstep } = THREE.MathUtils;
const UPPER_ARM = .285;
const FOREARM = .265;
const THIGH = .402;
const SHIN = .365;
const ANKLE_HEIGHT = .109;
const material = (name, color, roughness = .85, metalness = 0) =>
  new THREE.MeshStandardMaterial({ name, color, roughness, metalness });

// Tapered elliptical sections with continuous normals for the fabric and armor.
function volume(parent, mat, sections, segments = 14) {
  const positions = [], uv = [], indices = [];
  for (const [ring, [y, width, depth, offset = 0]] of sections.entries()) {
    for (let i = 0; i <= segments; i++) {
      const angle = i * Math.PI * 2 / segments;
      positions.push(Math.cos(angle) * width, y, offset + Math.sin(angle) * depth);
      uv.push(i / segments, ring / (sections.length - 1));
      if (i < segments && ring < sections.length - 1) {
        const a = ring * (segments + 1) + i, b = a + segments + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.userData.owned = geometry.userData.actorOwned = true;
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function ellipsoid(owner, parent, mat, x, y, z, width, height, depth) {
  const mesh = new THREE.Mesh(owner.geo.sphere, mat);
  mesh.position.set(x, y, z);
  mesh.scale.set(width, height, depth);
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function palette(owner, team) {
  if (owner.soldierMaterials.has(team)) return owner.soldierMaterials.get(team);
  const uniform = owner.surfaces.cloth.clone();
  uniform.name = 'uniform fabric';
  uniform.color.setHex(team ? 0xc1ab85 : 0x849783);
  const colors = {
    uniform,
    armor: material('plate carrier', team ? 0x827252 : 0x46574b),
    web: material('nylon webbing', team ? 0x524b37 : 0x303d34),
    shell: material('helmet shell', team ? 0x796c51 : 0x48594c, .63),
    rubber: material('rubber and gloves', 0x232928),
    steel: material('gun metal', 0x333b3d, .42, .62),
    visor: material('opaque goggle lens', 0x334949, .19, .35),
    accent: material('equipment hardware', 0x89836e, .65, .28),
    patch: material('unit patch', team ? 0xad7950 : 0x668e8d),
  };
  owner.soldierMaterials.set(team, colors);
  return colors;
}

function makeArm(owner, pose, gear, side) {
  const arm = new THREE.Group(), elbow = new THREE.Group(), wrist = new THREE.Group();
  arm.position.set(side * .207, 1.39, 0);
  elbow.position.y = -UPPER_ARM;
  wrist.position.y = -FOREARM;
  pose.add(arm); arm.add(elbow); elbow.add(wrist);
  volume(arm, gear.uniform, [[-.297,.054,.054],[-.22,.061,.066],[-.10,.074,.077],[-.03,.071,.069],[.027,.034,.036],[.04,.002,.002]]);
  volume(elbow, gear.uniform, [[-.253,.039,.041],[-.21,.046,.048],[-.13,.053,.059],[-.04,.056,.063],[.025,.045,.046]]);
  owner.rounded(elbow, 0, -.037, .052, .095, .13, .043, gear.armor);
  owner.rounded(elbow, 0, -.211, 0, .088, .034, .091, gear.web);
  ellipsoid(owner, wrist, gear.rubber, 0, 0, -.007, .045, .061, .045);
  ellipsoid(owner, wrist, gear.rubber, side * .03, .003, -.04, .022, .037, .02);
  for (let n = 0; n < 3; n++) owner.rounded(wrist, (n - 1) * .021, -.018, -.042, .018, .045, .017, gear.web);
  owner.rounded(arm, side * .067, -.115, 0, .018, .081, .082, gear.patch);
  return { arm, elbow, wrist };
}

function makeLeg(owner, pose, gear, side) {
  const leg = new THREE.Group(), knee = new THREE.Group(), ankle = new THREE.Group();
  leg.position.set(side * .097, .92, 0);
  knee.position.y = -THIGH;
  ankle.position.y = -SHIN;
  pose.add(leg); leg.add(knee); knee.add(ankle);
  volume(leg, gear.uniform, [[-.411,.066,.072],[-.32,.073,.081],[-.18,.094,.103],[-.08,.096,.111],[.014,.083,.09]]);
  owner.rounded(leg, side * .071, -.18, .028, .051, .17, .13, gear.armor);
  owner.rounded(leg, side * .09, -.124, .029, .021, .045, .12, gear.web);
  volume(knee, gear.uniform, [[-.37,.043,.052],[-.29,.052,.061],[-.20,.066,.076],[-.09,.064,.075],[.042,.06,.071]]);
  ellipsoid(owner, knee, gear.shell, 0, -.043, -.074, .068, .085, .027);
  owner.rounded(knee, 0, -.044, .025, .135, .033, .117, gear.web);
  ellipsoid(owner, ankle, gear.rubber, 0, -.04, -.06, .071, .069, .148);
  owner.rounded(ankle, 0, -.09, -.062, .146, .035, .291, gear.rubber);
  owner.rounded(ankle, 0, .017, .01, .114, .123, .127, gear.web);
  for (let n = 0; n < 3; n++) owner.box(ankle, 0, -.005 - n * .009, -.047 - n * .024, .078, .009, .011, gear.accent);
  return { leg, knee, ankle };
}

function makeRifle(owner, pose, gear, classId) {
  const rifle = new THREE.Group();
  rifle.position.set(.125, 1.24, -.32);
  pose.add(rifle);
  const length = classId === 'recon' ? .57 : classId === 'medic' ? .32 : .45;
  owner.rounded(rifle, 0, 0, -.055, .076, .103, .39, gear.steel);
  owner.rounded(rifle, 0, .008, -length * .57, .071, .065, length * .75, gear.rubber);
  const barrel = owner.cylinder(rifle, 0, .013, -length, .015, .17, gear.steel);
  barrel.rotation.x = Math.PI / 2;
  const magazine = new THREE.Group();
  magazine.position.set(0, -.087, -.076);
  rifle.add(magazine);
  owner.rounded(magazine, 0, 0, 0, classId === 'support' ? .118 : .055, .155, .087, gear.steel);
  owner.rounded(rifle, 0, -.055, .105, .052, .106, .064, gear.rubber);
  owner.rounded(rifle, 0, -.008, .233, .064, .078, .223, gear.rubber);
  owner.rounded(rifle, 0, .059, -.079, .052, .024, .304, gear.steel);
  if (classId === 'recon') {
    const optic = owner.cylinder(rifle, 0, .106, -.102, .032, .153, gear.steel);
    optic.rotation.x = Math.PI / 2;
  } else owner.rounded(rifle, 0, .079, -.115, .046, .046, .059, gear.rubber);
  const flash = new THREE.Mesh(new THREE.ConeGeometry(.06, .18, 6), new THREE.MeshBasicMaterial({ name:'muzzle flash', color:0xffd997, transparent:true, opacity:.9, depthWrite:false }));
  flash.geometry.userData.actorOwned = true;
  flash.rotation.x = -Math.PI / 2;
  flash.position.set(0, .012, -length - .13);
  flash.visible = false;
  flash.userData.animated = true;
  rifle.add(flash);
  return { rifle, flash, magazine };
}

export function createSoldierRig(owner, player) {
  const gear = palette(owner, player.team), group = new THREE.Group(), pose = new THREE.Group();
  group.add(pose);
  volume(pose, gear.uniform, [[.84,.123,.085],[.93,.178,.121],[1.06,.159,.108],[1.21,.176,.123],[1.34,.217,.128],[1.42,.182,.102],[1.465,.088,.064]]);
  volume(pose, gear.armor, [[1.01,.153,.102,-.037],[1.09,.179,.139,-.032],[1.29,.181,.144,-.026],[1.383,.133,.108,-.032],[1.405,.09,.069,-.014]]);
  owner.rounded(pose, 0, .966, 0, .339, .052, .238, gear.web);
  owner.rounded(pose, 0, .965, -.131, .075, .045, .025, gear.accent);
  for (const side of [-1, 1]) {
    const strap = owner.rounded(pose, side * .111, 1.362, -.008, .047, .091, .272, gear.web);
    strap.rotation.z = side * .11;
    owner.rounded(pose, side * .175, 1.078, .027, .058, .139, .112, gear.armor);
  }
  for (let n = 0; n < 3; n++) {
    const x = (n - 1) * .092;
    owner.rounded(pose, x, 1.14, -.168, .084, .145, .079, gear.armor);
    owner.rounded(pose, x, 1.19, -.208, .081, .045, .015, gear.web);
    owner.box(pose, x, 1.171, -.218, .027, .038, .013, gear.accent);
  }
  for (let n = 0; n < 4; n++) owner.box(pose, 0, 1.246 + n * .025, -.171, .244 - n * .012, .011, .014, gear.web);
  owner.rounded(pose, .118, 1.322, -.145, .065, .027, .014, gear.patch);
  owner.rounded(pose, -.147, 1.238, -.157, .047, .115, .054, gear.rubber);
  owner.cylinder(pose, -.149, 1.371, -.16, .007, .17, gear.rubber);
  const packDepth = player.classId === 'support' || player.classId === 'medic' ? .164 : .116;
  owner.rounded(pose, 0, 1.205, .159, .258, .335, packDepth, gear.armor);
  owner.rounded(pose, 0, 1.145, .159 + packDepth / 2, .207, .138, .039, gear.web);
  for (const x of [-.074, .074]) owner.box(pose, x, 1.217, .183 + packDepth / 2, .026, .248, .018, gear.web);
  const head = new THREE.Group(); head.position.y = 1.566; pose.add(head);
  ellipsoid(owner, head, gear.web, 0, .002, -.007, .097, .127, .093);
  ellipsoid(owner, head, gear.rubber, 0, -.073, -.057, .082, .06, .071);
  volume(head, gear.shell, [[.028,.113,.102,.004],[.065,.123,.115,.009],[.117,.116,.112,.012],[.166,.085,.086,.011],[.196,.032,.036,.009],[.201,.002,.002,.009]], 18);
  owner.rounded(head, 0, .069, -.109, .208, .034, .05, gear.shell);
  owner.rounded(head, 0, .083, -.124, .062, .039, .024, gear.accent);
  for (const side of [-1, 1]) {
    const goggle = owner.rounded(head, side * .048, .023, -.093, .096, .057, .058, gear.rubber);
    goggle.rotation.y = -side * .17;
    const lens = owner.rounded(head, side * .048, .024, -.123, .079, .041, .013, gear.visor);
    lens.rotation.y = -side * .17;
    ellipsoid(owner, head, gear.web, side * .108, .005, .014, .027, .065, .05);
    owner.rounded(head, side * .112, .059, .017, .019, .025, .101, gear.accent);
  }
  const arms = [], elbows = [], wrists = [], legs = [], knees = [], ankles = [];
  for (const side of [-1, 1]) {
    const { arm, elbow, wrist } = makeArm(owner, pose, gear, side);
    const { leg, knee, ankle } = makeLeg(owner, pose, gear, side);
    arms.push(arm); elbows.push(elbow); wrists.push(wrist);
    legs.push(leg); knees.push(knee); ankles.push(ankle);
  }
  const { rifle, flash, magazine } = makeRifle(owner, pose, gear, player.classId);
  const marker = new THREE.Mesh(new THREE.OctahedronGeometry(.059), new THREE.MeshBasicMaterial({ color:0x5bd9e8 }));
  marker.geometry.userData.actorOwned = true;
  marker.position.y = 1.95;
  group.add(marker);
  owner.batchActor(pose);

  const distant = new THREE.Group(); group.add(distant);
  ellipsoid(owner,distant,gear.armor,0,1.19,0,.213,.326,.151);
  ellipsoid(owner,distant,gear.shell,0,1.633,0,.126,.136,.124);
  for(const side of [-1,1]){
    ellipsoid(owner,distant,gear.uniform,side*.103,.525,0,.095,.424,.104);
    ellipsoid(owner,distant,gear.rubber,side*.103,.086,-.059,.068,.082,.141);
    const arm=ellipsoid(owner,distant,gear.uniform,side*.192,1.193,-.128,.075,.196,.083);
    arm.rotation.x=.96;
  }
  owner.rounded(distant,.125,1.232,-.357,.07,.083,.6,gear.steel);
  owner.batchActor(distant);
  distant.visible = false;
  const rig = {group,pose,distant,head,legs,arms,knees,elbows,ankles,wrists,rifle,magazine,marker,uniform:gear.uniform,flash,team:player.team,classId:player.classId,lastX:player.x,lastZ:player.z,lastTime:0,targetSpeed:0,speed:0,walk:0,initialized:false,deathAge:0,alive:true,recoil:0,lastShot:player.shotSeq};
  updateSoldierArms(rig);
  return rig;
}

export function cloneSoldierRig(template, player) {
  const group = template.group.clone();
  const nodes = new Map();
  function pairNodes(source, clone) {
    nodes.set(source, clone);
    source.children.forEach((child, index) => pairNodes(child, clone.children[index]));
  }
  pairNodes(template.group, group);
  const rig = { ...template, group, lastX: player.x, lastZ: player.z, lastShot: player.shotSeq };
  for (const key of ['pose', 'distant', 'head', 'rifle', 'magazine', 'marker', 'flash']) rig[key] = nodes.get(template[key]);
  for (const key of ['legs', 'arms', 'knees', 'elbows', 'ankles', 'wrists']) rig[key] = template[key].map(node => nodes.get(node));
  rig.marker.material = rig.marker.material.clone();
  rig.flash.material = rig.flash.material.clone();
  return rig;
}

const grips = [new THREE.Vector3(-.057, -.033, -.127), new THREE.Vector3(.004, -.057, .105)];
const target = new THREE.Vector3(), axis = new THREE.Vector3(), bend = new THREE.Vector3();
const middle = new THREE.Vector3(), upper = new THREE.Vector3(), lower = new THREE.Vector3();
const inverse = new THREE.Quaternion();
const up = new THREE.Vector3(0, 1, 0);
const supportPalm = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI * .37);
const poseInverse = new THREE.Matrix4();
const stockOffset = new THREE.Vector3(0, -.008, .295);
const stockScratch = new THREE.Vector3();
const handTarget = new THREE.Vector3();
const pouchTarget = new THREE.Vector3(-.098, 1.14, -.225);
const handMagazine = new THREE.Vector3();
const nominal = new THREE.Vector3();
const hipScratch = new THREE.Vector3();

function solveLimb(upperJoint, lowerJoint, goal, upperLength, lowerLength, bendX, bendY, bendZ) {
  axis.subVectors(goal, upperJoint.position);
  const reach = axis.length();
  const distance = clamp(reach, Math.abs(upperLength - lowerLength) + .02, upperLength + lowerLength - .003);
  if (reach > 1e-6) axis.multiplyScalar(1 / reach);
  else axis.copy(down);
  bend.set(bendX, bendY, bendZ);
  bend.addScaledVector(axis, -bend.dot(axis));
  if (bend.lengthSq() < 1e-6) bend.set(1, 0, 0).addScaledVector(axis, -axis.x);
  bend.normalize();
  const along = (upperLength ** 2 + distance ** 2 - lowerLength ** 2) / (2 * distance);
  const sideways = Math.sqrt(Math.max(0, upperLength ** 2 - along ** 2));
  middle.copy(upperJoint.position).addScaledVector(axis, along).addScaledVector(bend, sideways);
  upper.subVectors(middle, upperJoint.position).normalize();
  upperJoint.quaternion.setFromUnitVectors(down, upper);
  lower.copy(upperJoint.position).addScaledVector(axis, distance).sub(middle).normalize();
  lower.applyQuaternion(inverse.copy(upperJoint.quaternion).invert());
  lowerJoint.quaternion.setFromUnitVectors(down, lower);
}

// Aim both elbows toward the weapon grips while keeping upper and lower arm lengths fixed.
export function updateSoldierArms(rig, supportTarget = null) {
  rig.rifle.updateMatrix();
  for (let i = 0; i < 2; i++) {
    const arm = rig.arms[i], elbow = rig.elbows[i];
    if (i === 0 && supportTarget) target.copy(supportTarget);
    else target.copy(grips[i]).applyMatrix4(rig.rifle.matrix);
    solveLimb(arm, elbow, target, UPPER_ARM, FOREARM, i === 0 ? -.46 : .66, -.95, .12);
    const wrist = rig.wrists?.[i];
    if (!wrist) continue;
    wrist.quaternion.copy(arm.quaternion).multiply(elbow.quaternion).invert().multiply(rig.rifle.quaternion);
    if (i === 0) wrist.quaternion.multiply(supportPalm);
  }
}

function newFoot() {
  return {
    planted: new THREE.Vector3(), start: new THREE.Vector3(), end: new THREE.Vector3(),
    local: new THREE.Vector3(), yaw: 0, startYaw: 0, endYaw: 0,
    lift: 0, startLift: 0, swinging: false, settle: 1,
  };
}

function nearestAngle(from, to) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function restingFoot(out, position, yaw, side, crouch) {
  const lateral = side * (.106 + .018 * crouch);
  const fore = side === -1 ? .075 : -.065;
  const cos = Math.cos(yaw), sin = Math.sin(yaw);
  return out.set(position.x + lateral * cos + fore * sin, 0, position.z - lateral * sin + fore * cos);
}

function startStep(foot, end, yaw) {
  foot.start.copy(foot.planted);
  foot.end.copy(end);
  foot.startYaw = foot.yaw;
  foot.endYaw = foot.yaw + nearestAngle(foot.yaw, yaw);
  foot.startLift = foot.lift;
}

function moveStep(foot, fraction, lift) {
  const t = clamp(fraction, 0, 1);
  const travel = smoothstep(t, 0, 1);
  foot.planted.lerpVectors(foot.start, foot.end, travel);
  foot.yaw = lerp(foot.startYaw, foot.endYaw, travel);
  foot.lift = foot.startLift * (1 - travel) + Math.sin(t * Math.PI) * lift;
}

function resetLocomotion(rig, position, yaw, crouched) {
  const motion = rig.motion ?? { feet: [newFoot(), newFoot()] };
  Object.assign(motion, {
    x: position.x, z: position.z, phase: .05, time: 0,
    speed: 0, vx: 0, vz: 0, crouch: Number(crouched), sprint: 0, aim: .6,
    air: 0, reloadTime: 0, reloadBlend: 0,
  });
  for (let i = 0; i < 2; i++) {
    const foot = motion.feet[i], side = i === 0 ? -1 : 1;
    restingFoot(foot.planted, position, yaw, side, motion.crouch);
    foot.yaw = yaw - side * .08;
    foot.lift = 0;
    foot.swinging = false;
    foot.settle = 1;
  }
  rig.motion = motion;
  rig.recoil = 0;
  return motion;
}

function animateFeet(motion, position, yaw, dt, distance) {
  const moving = motion.speed > .22;
  const { feet, sprint, crouch, air } = motion;
  const jog = smoothstep(motion.speed, .3, 5.8);
  const standingStride = lerp(lerp(.6, 2.55, jog), 3.9, sprint);
  const crouchedStride = lerp(.55, 1.48, smoothstep(motion.speed, .25, 3));
  const stride = lerp(standingStride, crouchedStride, crouch);
  const stance = lerp(lerp(lerp(.66, .39, jog), .27, sprint), .59, crouch);
  const lift = lerp(lerp(.11, .19, sprint), .078, crouch);
  const speed = Math.hypot(motion.vx, motion.vz);
  const directionX = speed > .001 ? motion.vx / speed : -Math.sin(yaw);
  const directionZ = speed > .001 ? motion.vz / speed : -Math.cos(yaw);
  if (moving && air < .5) motion.phase = (motion.phase + distance / stride) % 1;
  const cos = Math.cos(yaw), sin = Math.sin(yaw);
  for (let i = 0; i < feet.length; i++) {
    const foot = feet[i], side = i === 0 ? -1 : 1;
    const toeYaw = yaw - side * .08;
    restingFoot(nominal, position, yaw, side, crouch);
    const phase = (motion.phase + i * .5) % 1;
    if (air > .5) {
      const tuck = i === 0 ? .105 : .18;
      foot.planted.lerp(nominal, 1 - Math.exp(-dt * 17));
      foot.yaw += nearestAngle(foot.yaw, toeYaw) * (1 - Math.exp(-dt * 12));
      foot.lift = lerp(foot.lift, tuck, 1 - Math.exp(-dt * 14));
      foot.swinging = false;
      foot.settle = 1;
    } else if (moving) {
      const swinging = phase >= stance;
      if (swinging && !foot.swinging) {
        // This location stays fixed in world space through the next stance.
        const lead = stride * (1 - phase + stance * .48);
        nominal.x += directionX * lead;
        nominal.z += directionZ * lead;
        startStep(foot, nominal, toeYaw);
      }
      if (swinging) moveStep(foot, (phase - stance) / (1 - stance), lift);
      else if (foot.swinging) moveStep(foot, 1, lift);
      else foot.lift = lerp(foot.lift, 0, 1 - Math.exp(-dt * 22));
      foot.swinging = swinging;
      foot.settle = 1;
    } else {
      const outOfPlace = foot.planted.distanceToSquared(nominal) > .019;
      const turning = Math.abs(nearestAngle(foot.yaw, toeYaw)) > .38;
      if (foot.swinging || (foot.settle >= 1 && feet[1-i].settle >= 1 && (outOfPlace || turning))) {
        startStep(foot, nominal, toeYaw);
        foot.settle = 0;
      }
      foot.swinging = false;
      if (foot.settle < 1) {
        foot.settle = Math.min(1, foot.settle + dt / .22);
        moveStep(foot, foot.settle, .068);
      } else foot.lift = lerp(foot.lift, 0, 1 - Math.exp(-dt * 18));
    }
    const dx = foot.planted.x - position.x, dz = foot.planted.z - position.z;
    foot.local.set(cos * dx - sin * dz, ANKLE_HEIGHT + foot.lift, sin * dx + cos * dz);
  }
}

function constrainFootReach(rig, feet) {
  let pelvisCeiling = .1;
  for (let i = 0; i < feet.length; i++) {
    const foot = feet[i];
    const hip = hipScratch.copy(rig.legs[i].position).applyQuaternion(rig.pose.quaternion);
    const lateral = foot.local.x - hip.x;
    const forward = foot.local.z - hip.z;
    const reach = Math.hypot(lateral, forward);
    if (reach > .53) {
      foot.local.x = hip.x + lateral * .53 / reach;
      foot.local.z = hip.z + forward * .53 / reach;
    }
    const usable = THIGH + SHIN - .013;
    const height = Math.sqrt(Math.max(.11, usable ** 2 - Math.min(reach, .53) ** 2));
    pelvisCeiling = Math.min(pelvisCeiling, foot.local.y + height - hip.y);
  }
  return pelvisCeiling;
}

function animateUpperBody(rig, motion, player, dt, reset) {
  const { sprint, crouch, speed, phase } = motion;
  const look = clamp(Number(player.pitch) || 0, -1.15, 1.15);
  const requestedAim = player.aim === undefined ? .7 : player.aim ? 1 : .3;
  motion.aim = lerp(motion.aim, requestedAim * (1 - sprint), 1 - Math.exp(-dt * 13));
  if (reset) rig.lastShot = player.shotSeq;
  if (player.shotSeq !== undefined && player.shotSeq !== rig.lastShot) {
    rig.recoil = 1;
    rig.lastShot = player.shotSeq;
  }
  rig.recoil *= Math.exp(-dt * 15);
  rig.flash.visible = rig.recoil > .58;
  motion.reloadTime = player.reloading ? motion.reloadTime + dt : 0;
  motion.reloadBlend = lerp(motion.reloadBlend, Number(Boolean(player.reloading)), 1 - Math.exp(-dt * 12));
  const duration = rig.classId === 'support' ? 3.1 : 2;
  const reloadPhase = clamp(player.reloadProgress ?? motion.reloadTime / duration, 0, 1);
  const reload = Math.sin(reloadPhase * Math.PI) * motion.reloadBlend;
  const strideSway = Math.sin(phase * Math.PI * 2) * Math.min(speed * .014, .09);
  const readyPitch = lerp(-.14, .025, motion.aim);
  const riflePitch = clamp(look * .78 + readyPitch - sprint * .47 - reload * .33 - rig.pose.rotation.x * .74, -.78, .95);
  rig.rifle.rotation.set(riflePitch + rig.recoil * .085, -.025 + sprint * .19 + reload * .24, strideSway * sprint - reload * .18, 'YXZ');
  // Rotate the rifle around the stock so both grips travel with the weapon.
  stockScratch.copy(stockOffset).applyQuaternion(rig.rifle.quaternion);
  rig.rifle.position.set(.126, 1.277 + motion.aim * .052 - sprint * .075, -.012 + rig.recoil * .027).sub(stockScratch);
  rig.head.rotation.x = clamp(look * .73 - rig.pose.rotation.x * .83, -.83, .93);
  rig.head.rotation.z = -rig.pose.rotation.z * .65;
  rig.head.rotation.y = lerp(0, .045, sprint) - crouch * .025;

  let leftHand = null;
  rig.magazine.visible = true;
  rig.magazine.position.y = -.087;
  if (player.reloading) {
    const pull = smoothstep(reloadPhase, .13, .33);
    const seat = smoothstep(reloadPhase, .57, .79);
    const offset = .14 * pull * (1 - seat);
    rig.magazine.position.y -= offset;
    rig.magazine.visible = reloadPhase < .34 || reloadPhase > .57;
    rig.rifle.updateMatrix();
    handTarget.copy(grips[0]).applyMatrix4(rig.rifle.matrix);
    handMagazine.copy(rig.magazine.position).addScaledVector(down, .045).applyMatrix4(rig.rifle.matrix);
    const releaseGrip = smoothstep(reloadPhase, .03, .18) * (1 - smoothstep(reloadPhase, .79, .97));
    const reachPouch = smoothstep(reloadPhase, .28, .43) * (1 - smoothstep(reloadPhase, .47, .67));
    handMagazine.lerp(pouchTarget, reachPouch);
    handTarget.lerp(handMagazine, releaseGrip);
    leftHand = handTarget;
  }
  updateSoldierArms(rig, leftHand);
}

// The renderer sets the interpolated root position/yaw first. Foot contacts
// use that same motion, so server snapshot cadence does not reset the stride.
export function animateSoldier(rig, { dt, player, reset = false }) {
  dt = clamp(Number(dt) || 1/60, .001, .1);
  const { position } = rig.group, yaw = rig.group.rotation.y;
  const crouched = Boolean(player.crouch || player.crouching);
  const existing = rig.motion;
  const teleported = !existing || Math.hypot(position.x - existing.x, position.z - existing.z) > 4;
  const motion = reset || teleported ? resetLocomotion(rig, position, yaw, crouched) : existing;
  const dx = position.x - motion.x, dz = position.z - motion.z;
  const distance = Math.hypot(dx, dz);
  const response = 1 - Math.exp(-dt * 12);
  motion.x = position.x;
  motion.z = position.z;
  motion.time += dt;
  motion.speed = lerp(motion.speed, Math.min(12, distance / dt), response);
  motion.vx = lerp(motion.vx, dx / dt, response);
  motion.vz = lerp(motion.vz, dz / dt, response);
  motion.crouch = lerp(motion.crouch, Number(crouched), response);
  motion.sprint = lerp(motion.sprint, player.sprint ? smoothstep(motion.speed, 2.0, 5.2) : 0, response);
  const airborne = player.grounded === undefined ? position.y > .075 : !player.grounded;
  motion.air = lerp(motion.air, Number(airborne), response);
  animateFeet(motion, position, yaw, dt, distance);
  const stridePhase = motion.phase * Math.PI * 2;
  const gaitWeight = smoothstep(motion.speed, .18, 3.8);
  const breathing = Math.sin(motion.time * 2.4) * .004;
  const bodyHeight = lerp(-.075 - motion.sprint * .06, -.435, motion.crouch);
  const bodyBob = Math.cos(stridePhase * 2) * .018 * gaitWeight + breathing;
  rig.pose.rotation.x = -.02 - motion.sprint * .11 - motion.crouch * .12;
  rig.pose.rotation.z = Math.sin(stridePhase) * .028 * gaitWeight;
  const pelvisCeiling = constrainFootReach(rig, motion.feet);
  const desiredHeight = Math.min(bodyHeight + bodyBob, pelvisCeiling);
  rig.pose.position.y = Math.min(lerp(rig.pose.position.y, desiredHeight, reset || teleported ? 1 : response), pelvisCeiling);
  rig.pose.updateMatrix();
  poseInverse.copy(rig.pose.matrix).invert();
  for (let i = 0; i < 2; i++) {
    const foot = motion.feet[i], leg = rig.legs[i], knee = rig.knees[i], ankle = rig.ankles[i];
    target.copy(foot.local).applyMatrix4(poseInverse);
    solveLimb(leg, knee, target, THIGH, SHIN, i === 0 ? -.07 : .07, 0, -1);
    // Counter-rotate the boot so the sole remains parallel to the ground in stance.
    inverse.setFromAxisAngle(up, nearestAngle(yaw, foot.yaw));
    ankle.quaternion.copy(rig.pose.quaternion).multiply(leg.quaternion).multiply(knee.quaternion).invert().multiply(inverse);
    ankle.rotateX(-foot.lift * 1.8);
  }
  animateUpperBody(rig, motion, player, dt, reset || teleported);
}
