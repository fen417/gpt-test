import * as THREE from 'three';

const down = new THREE.Vector3(0, -1, 0);
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
  const arm = new THREE.Group(), elbow = new THREE.Group();
  arm.position.set(side * .207, 1.39, 0);
  elbow.position.y = -.285;
  pose.add(arm); arm.add(elbow);
  volume(arm, gear.uniform, [[-.297,.054,.054],[-.22,.061,.066],[-.10,.074,.077],[-.03,.071,.069],[.027,.034,.036],[.04,.002,.002]]);
  volume(elbow, gear.uniform, [[-.253,.039,.041],[-.21,.046,.048],[-.13,.053,.059],[-.04,.056,.063],[.025,.045,.046]]);
  owner.rounded(elbow, 0, -.037, .052, .095, .13, .043, gear.armor);
  owner.rounded(elbow, 0, -.211, 0, .088, .034, .091, gear.web);
  ellipsoid(owner, elbow, gear.rubber, 0, -.265, -.007, .048, .063, .047);
  ellipsoid(owner, elbow, gear.rubber, side * .03, -.262, -.04, .022, .037, .02);
  for (let n = 0; n < 3; n++) owner.rounded(elbow, (n - 1) * .021, -.283, -.042, .018, .045, .017, gear.web);
  owner.rounded(arm, side * .067, -.115, 0, .018, .081, .082, gear.patch);
  return { arm, elbow };
}

function makeLeg(owner, pose, gear, side) {
  const leg = new THREE.Group(), knee = new THREE.Group();
  leg.position.set(side * .097, .92, 0);
  knee.position.y = -.402;
  pose.add(leg); leg.add(knee);
  volume(leg, gear.uniform, [[-.411,.066,.072],[-.32,.073,.081],[-.18,.094,.103],[-.08,.096,.111],[.014,.083,.09]]);
  owner.rounded(leg, side * .071, -.18, .028, .051, .17, .13, gear.armor);
  owner.rounded(leg, side * .09, -.124, .029, .021, .045, .12, gear.web);
  volume(knee, gear.uniform, [[-.37,.043,.052],[-.29,.052,.061],[-.20,.066,.076],[-.09,.064,.075],[.042,.06,.071]]);
  ellipsoid(owner, knee, gear.shell, 0, -.043, -.074, .068, .085, .027);
  owner.rounded(knee, 0, -.044, .025, .135, .033, .117, gear.web);
  ellipsoid(owner, knee, gear.rubber, 0, -.405, -.06, .071, .069, .148);
  owner.rounded(knee, 0, -.455, -.062, .146, .035, .291, gear.rubber);
  owner.rounded(knee, 0, -.348, .01, .114, .123, .127, gear.web);
  for (let n = 0; n < 3; n++) owner.box(knee, 0, -.37 - n * .009, -.047 - n * .024, .078, .009, .011, gear.accent);
  return { leg, knee };
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
  owner.rounded(rifle, 0, -.087, -.076, classId === 'support' ? .118 : .055, .155, .087, gear.steel);
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
  return { rifle, flash };
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
  const arms = [], elbows = [], legs = [], knees = [];
  for (const side of [-1, 1]) {
    const { arm, elbow } = makeArm(owner, pose, gear, side);
    const { leg, knee } = makeLeg(owner, pose, gear, side);
    arms.push(arm); elbows.push(elbow); legs.push(leg); knees.push(knee);
  }
  const { rifle, flash } = makeRifle(owner, pose, gear, player.classId);
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
  owner.scene.add(group);
  const rig = {group,pose,distant,head,legs,arms,knees,elbows,rifle,marker,uniform:gear.uniform,flash,team:player.team,classId:player.classId,lastX:player.x,lastZ:player.z,lastTime:0,targetSpeed:0,speed:0,walk:0,initialized:false,deathAge:0,alive:true,recoil:0,lastShot:player.shotSeq};
  updateSoldierArms(rig);
  return rig;
}

const grips = [new THREE.Vector3(-.057, -.033, -.127), new THREE.Vector3(.004, -.057, .105)];
const target = new THREE.Vector3(), axis = new THREE.Vector3(), bend = new THREE.Vector3();
const elbowPosition = new THREE.Vector3(), upper = new THREE.Vector3(), lower = new THREE.Vector3();
const inverse = new THREE.Quaternion();

// Aim both elbows toward the weapon grips while keeping upper and lower arm lengths fixed.
export function updateSoldierArms(rig) {
  rig.rifle.updateMatrix();
  const upperLength = .285, lowerLength = .265;
  for (let i = 0; i < 2; i++) {
    const arm = rig.arms[i], elbow = rig.elbows[i];
    target.copy(grips[i]).applyMatrix4(rig.rifle.matrix);
    axis.subVectors(target, arm.position);
    const distance = THREE.MathUtils.clamp(axis.length(), .085, upperLength + lowerLength - .004);
    axis.normalize();
    bend.set(i === 0 ? -.58 : .7, -.86, .12);
    bend.addScaledVector(axis, -bend.dot(axis)).normalize();
    const along = (upperLength ** 2 + distance ** 2 - lowerLength ** 2) / (2 * distance);
    const sideways = Math.sqrt(Math.max(0, upperLength ** 2 - along ** 2));
    elbowPosition.copy(arm.position).addScaledVector(axis, along).addScaledVector(bend, sideways);
    upper.subVectors(elbowPosition, arm.position).normalize();
    arm.quaternion.setFromUnitVectors(down, upper);
    lower.copy(arm.position).addScaledVector(axis, distance).sub(elbowPosition).normalize();
    lower.applyQuaternion(inverse.copy(arm.quaternion).invert());
    elbow.quaternion.setFromUnitVectors(down, lower);
  }
}
