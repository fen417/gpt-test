// Bake the licensed, UV-mapped DJMaesen mesh into the game's grip space.
// Only a wrist-length section is retained: the existing animated sleeves cover
// the cut. Fingers stay part of the palm, including during trigger morphs.
import fs from 'node:fs';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

globalThis.self = globalThis;
const root = new URL('../', import.meta.url);
const poses = {
  support: { source: 'rifle', side: 'L', scale: .45, rotation: [-.04, -Math.PI/2, 0], wrist: [-.104, -.067, -.455], origin: [-.018, -.075, -.36], index: [.063,.047,-.081], indexWrap: true, fingers: [[.058,.045,-.060],[.051,.043,-.042],[.036,.035,-.023]], fingerPole: [1,0,0], thumb: [-.038,.053,-.127], thumbDirection: [0,.08,-1] },
  trigger: { source: 'pistol', side: 'R', scale: .48, rotation: [.35, .02, 0], wrist: [.010, -.202, .145], origin: [0, 0, 0], index: [.008, -.090, .018], fingers: [[-.024,-.149,.047],[-.024,-.178,.052],[-.022,-.199,.045]], thumb: [-.024,-.129,.055] },
  pistolSupport: { source: 'pistol', side: 'R', mirror: true, scale: .48, rotation: [.35, .02, 0], wrist: [-.035, -.053, -.014], origin: [0, 0, 0], index: [.002,.012,-.064], fingers: [[.004,-.003,-.060],[.002,-.019,-.057],[-.003,-.035,-.050]], thumb: [-.010,.050,-.047] },
  pistolTrigger: { source: 'pistol', side: 'R', scale: .48, rotation: [.35, .02, 0], wrist: [.010, -.195, .175], origin: [0, 0, 0], index: [.006, -.122, .034], fingers: [[-.024,-.157,.081],[-.024,-.177,.087],[-.023,-.198,.092]], thumb: [-.024,-.136,.088] },
};
const encoded = {};
const pack = (values, Type, scale) => Buffer.from(new Type(values.map(v => Math.round(v * scale))).buffer).toString('base64');
for (const [name, pose] of Object.entries(poses)) {
  const buffer = fs.readFileSync(new URL(`art-source/djmaesen-arms/${pose.source}-arms.glb`, root));
  const gltf = await new GLTFLoader().parseAsync(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), '');
  gltf.scene.updateMatrixWorld(true);
  const mesh = gltf.scene.getObjectByName('FPArms');
  const geo = mesh.geometry, skeleton = mesh.skeleton;
  skeleton.update();
  const hand = gltf.scene.getObjectByName(`Hand_${pose.side}`);
  const wrist = hand.getWorldPosition(new T.Vector3());
  const forearm = gltf.scene.getObjectByName(`BoneTwist_01${pose.side}`).getWorldPosition(new T.Vector3());
  const wristAxis = wrist.clone().sub(forearm).normalize();
  const rotation = new T.Quaternion().setFromEuler(new T.Euler(...pose.rotation));
  const target = new T.Vector3(...pose.wrist).sub(new T.Vector3(...pose.origin));
  const transform = p => { p.sub(wrist).multiplyScalar(pose.scale).applyQuaternion(rotation); if(pose.mirror) p.x *= -1; return p.add(target); };
  function fingerIK(point, numbers=['007','006','005'], tipName='007_end', wrap=false) {
    const goal = new T.Vector3(...point).sub(target);
    if(pose.mirror) goal.x *= -1;
    goal.applyQuaternion(rotation.clone().invert()).divideScalar(pose.scale).add(wrist);
    const tip = gltf.scene.getObjectByName(`Bone_${pose.side}${tipName}`);
    if(wrap) {
      const bones=[...numbers].reverse().map(number=>gltf.scene.getObjectByName(`Bone_${pose.side}${number}`));
      const points=[...bones,tip].map(b=>b.getWorldPosition(new T.Vector3()));
      const lengths=[0,1,2].map(i=>points[i].distanceTo(points[i+1])),anchor=points[0].clone();
      // Bend round the front strap, rather than taking a straight path through
      // the solid handle. FABRIK is build-time only; lengths stay unchanged.
      const pole=new T.Vector3(...(pose.fingerPole||[0,0,-1])).applyQuaternion(rotation.clone().invert());
      points[1].lerpVectors(anchor,goal,1/3).addScaledVector(pole,.085);
      points[2].lerpVectors(anchor,goal,2/3).addScaledVector(pole,.065);
      for(let pass=0;pass<32;pass++) {
        points[3].copy(goal);
        for(let i=2;i>=0;i--)points[i].sub(points[i+1]).setLength(lengths[i]).add(points[i+1]);
        points[0].copy(anchor);
        for(let i=1;i<4;i++)points[i].sub(points[i-1]).setLength(lengths[i-1]).add(points[i-1]);
      }
      for(let i=0;i<3;i++) {
        const bone=bones[i],next=i===2?tip:bones[i+1],pivot=bone.getWorldPosition(new T.Vector3());
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
      fingerIK(distal.toArray(),['021','020'],'022');
      const pivot=bone.getWorldPosition(new T.Vector3());
      const direction=forward.applyQuaternion(rotation.clone().invert());
      const delta=new T.Quaternion().setFromUnitVectors(tip.getWorldPosition(new T.Vector3()).sub(pivot).normalize(),direction);
      const parent=bone.parent.getWorldQuaternion(new T.Quaternion());
      bone.quaternion.premultiply(parent.clone().invert().multiply(delta).multiply(parent));
      gltf.scene.updateMatrixWorld(true);skeleton.update();
    } else fingerIK(pose.thumb,['022','021','020'],'022_end');
  }
  if(pose.fingers) for(let i=0;i<3;i++) {
    const end=11+i*4, number=n=>String(n).padStart(3,'0');
    fingerIK(pose.fingers[i],[number(end),number(end-1),number(end-2)],`${number(end)}_end`,true);
  }
  const position = geo.getAttribute('position'), skinIndex = geo.getAttribute('skinIndex'), skinWeight = geo.getAttribute('skinWeight');
  const normal = geo.getAttribute('normal'), uv = geo.getAttribute('uv'), uv1 = geo.getAttribute('uv1') || uv;
  const boneMatrix = new T.Matrix4(), skinMatrix = new T.Matrix4(), nMatrix = new T.Matrix3();
  const v = new T.Vector3(), n = new T.Vector3();
  const vertices = [];
  for (let i = 0; i < position.count; i++) {
    let left = 0, right = 0;
    skinMatrix.elements.fill(0);
    for (let k = 0; k < 4; k++) {
      const weight = skinWeight.getComponent(i, k), joint = skinIndex.getComponent(i, k);
      if (!weight) continue;
      const boneName = skeleton.bones[joint].name;
      if (/L(?:_end)?$/.test(boneName) || boneName.includes('_L')) left += weight;
      if (/R(?:_end)?$/.test(boneName) || boneName.includes('_R')) right += weight;
      boneMatrix.fromArray(skeleton.boneMatrices, joint * 16);
      for (let e = 0; e < 16; e++) skinMatrix.elements[e] += boneMatrix.elements[e] * weight;
    }
    mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld);
    const cut = v.clone().sub(wrist).dot(wristAxis) + .065;
    // Skin the authored normals as well as positions, retaining UV seam normals.
    skinMatrix.premultiply(mesh.bindMatrixInverse).multiply(mesh.bindMatrix).premultiply(mesh.matrixWorld);
    n.fromBufferAttribute(normal, i).applyNormalMatrix(nMatrix.getNormalMatrix(skinMatrix)).applyQuaternion(rotation).normalize();
    if(pose.mirror) n.x *= -1;
    vertices.push({ side: left > right ? 'L' : 'R', cut, p: transform(v.clone()).toArray(), n: n.toArray(), uv: [uv.getX(i), uv.getY(i)], uv1: [uv1.getX(i), uv1.getY(i)], source: i });
  }
  // Connected-finger deformation: the trigger and release poses use the source
  // finger bones offline, then become one GPU morph on the welded hand mesh.
  for (const bone of skeleton.bones) {
    if (!bone.name.startsWith(`Bone_${pose.side}`)) continue;
    const finger = bone.name.slice(`Bone_${pose.side}`.length);
    if ((pose.side === 'L' || pose.mirror) && ['005', '006', '007', '009', '010', '011', '013', '014', '015', '017', '018', '019'].includes(finger)) {
      bone.quaternion.slerp(new T.Quaternion(), .55);
    }
  }
  gltf.scene.updateMatrixWorld(true); skeleton.update();
  if(pose.index && !pose.mirror) fingerIK([pose.index[0]-.008,pose.index[1],pose.index[2]+.004]);
  for (let i = 0; i < vertices.length; i++) {
    mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld);
    vertices[i].morph = transform(v.clone()).sub(new T.Vector3(...vertices[i].p)).toArray();
    skinMatrix.elements.fill(0);
    for(let k=0;k<4;k++) {
      const weight=skinWeight.getComponent(i,k), joint=skinIndex.getComponent(i,k);
      boneMatrix.fromArray(skeleton.boneMatrices,joint*16);
      for(let e=0;e<16;e++) skinMatrix.elements[e]+=boneMatrix.elements[e]*weight;
    }
    skinMatrix.premultiply(mesh.bindMatrixInverse).multiply(mesh.bindMatrix).premultiply(mesh.matrixWorld);
    n.fromBufferAttribute(normal,i).applyNormalMatrix(nMatrix.getNormalMatrix(skinMatrix)).applyQuaternion(rotation).normalize();
    if(pose.mirror) n.x *= -1;
    vertices[i].morphN=n.sub(new T.Vector3(...vertices[i].n)).toArray();
  }
  const lerp = (a, b, t) => {
    const out = { cut: 0 };
    for (const attr of ['p', 'n', 'uv', 'uv1', 'morph', 'morphN']) out[attr] = a[attr].map((x, i) => T.MathUtils.lerp(x, b[attr][i], t));
    return out;
  };
  const arrays = { p: [], n: [], uv: [], uv1: [], morph: [], morphN: [], index: [] }, lookup = new Map();
  function add(vertex) {
    const key = ['p', 'n', 'uv', 'uv1'].flatMap(attr => vertex[attr]).map(x => Math.round(x * 1000000)).join(',');
    if (lookup.has(key)) return lookup.get(key);
    const i = arrays.p.length / 3; lookup.set(key, i);
    for (const attr of ['p', 'n', 'uv', 'uv1', 'morph', 'morphN']) arrays[attr].push(...vertex[attr]);
    return i;
  }
  for (let i = 0; i < geo.index.count; i += 3) {
    const triangle = [0, 1, 2].map(k => vertices[geo.index.getX(i + k)]);
    if (triangle.some(v => v.side !== pose.side)) continue;
    const clipped = [];
    for (let k = 0; k < 3; k++) {
      const a = triangle[k], b = triangle[(k + 1) % 3];
      if (a.cut >= 0) clipped.push(a);
      if ((a.cut >= 0) !== (b.cut >= 0)) clipped.push(lerp(a, b, a.cut / (a.cut - b.cut)));
    }
    for (let k = 1; k < clipped.length - 1; k++) arrays.index.push(add(clipped[0]), add(clipped[pose.mirror ? k + 1 : k]), add(clipped[pose.mirror ? k : k + 1]));
  }
  for (const x of [...arrays.p, ...arrays.morph]) if (Math.abs(x * 100000) > 32767) throw new Error(`${name}: position outside packing range`);
  for (const x of [...arrays.uv,...arrays.uv1]) if(x<-.00001||x>1.00001) throw new Error(`${name}: UV outside packing range`);
  encoded[name] = {
    p: pack(arrays.p, Int16Array, 100000), n: pack(arrays.n, Int16Array, 32767),
    uv: pack(arrays.uv, Uint16Array, 65535), uv1: pack(arrays.uv1, Uint16Array, 65535),
    morph: pack(arrays.morph, Int16Array, 100000), morphN: pack(arrays.morphN, Int16Array, 16000), index: pack(arrays.index, Uint16Array, 1),
  };
  console.log(`${name}: ${arrays.p.length / 3} vertices, ${arrays.index.length / 3} triangles`);
}
// UV/index buffers shared by multiple grips are emitted only once.
const buffers=new Map(), declarations=[];
const entries=Object.entries(encoded).map(([pose,attributes])=>{
  const fields=Object.entries(attributes).map(([name,value])=>{
    if(!buffers.has(value)) { const id=`b${buffers.size}`;buffers.set(value,id);declarations.push(`const ${id}=${JSON.stringify(value)};`); }
    return `${name}:${buffers.get(value)}`;
  });
  return `${pose}:{${fields.join(',')}}`;
});
fs.writeFileSync(new URL('src/fps-hands-data.js', root), `// Generated by scripts/build-fps-hands.mjs. DJMaesen / CC BY 4.0; see art-source/djmaesen-arms/README.md.\n${declarations.join('\n')}\nexport const FPS_HANDS={${entries.join(',')}};\n`);
