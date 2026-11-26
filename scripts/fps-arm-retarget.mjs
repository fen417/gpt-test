import * as T from 'three';

export const positionScale = 40000;
const wristAnchor = -.296;
const cuffEdge = -.284;
const digits = {
  L: [
    ['joint5_05', 'joint18_04', 'joint19_07', 'joint20_06'],
    ['joint6_08', 'joint7_09', 'joint8_010', 'joint9_011'],
    ['joint10_012', 'joint11_013', 'joint12_014', 'joint13_015'],
    ['joint14_016', 'joint15_017', 'joint16_018', 'joint17_019'],
    ['joint21_020', 'joint22_021', 'joint23_022'],
  ],
  R: [
    ['joint28_027', 'joint29_028', 'joint30_029', 'joint31_030'],
    ['joint32_031', 'joint33_032', 'joint34_033', 'joint35_034'],
    ['joint36_035', 'joint37_036', 'joint38_037', 'joint39_038'],
    ['joint40_039', 'joint41_040', 'joint42_041', 'joint43_042'],
    ['joint44_043', 'joint45_044', 'joint46_045'],
  ],
};

const point = array => new T.Vector3(...array);
const between = (from, to) => to.clone().sub(from);
const fmt = n => String(n).padStart(3, '0');
const pack = (values, Type, scale = 1) =>
  Buffer.from(Type.from(values, value => Math.round(value * scale)).buffer).toString('base64');
const fields = { p: [Int16Array, positionScale], n: [Int16Array, 32767], uv: [Uint16Array, 65535],
  morph: [Int16Array, positionScale], morphN: [Int16Array, 16000] };

function palmFrame(wrist, index, middle, pinky) {
  const forward = between(wrist, middle).normalize();
  const across = between(pinky, index);
  across.addScaledVector(forward, -across.dot(forward)).normalize();
  return new T.Matrix4().makeBasis(across, forward, across.clone().cross(forward));
}

export function retargetGlove(rig, source, side, toGame, rotation, mirror) {
  const worldPoint = name => rig.getObjectByName(name).getWorldPosition(new T.Vector3());
  const digitPoint = number => worldPoint(`Bone_${side}${number}`);
  const targets = [5, 9, 13, 17, 20].map(first => [
    ...[0, 1, 2].map(i => digitPoint(fmt(first + i))),
    digitPoint(fmt(first + 2) + '_end'),
  ]);
  return fitGlove(source, side, worldPoint(`Hand_${side}`), targets, 1.65, toGame, rotation, mirror);
}

export function fitGlove(source, side, targetWrist, targets, surfaceScale, toGame, rotation, mirror) {
  const authored = digits[side].map(chain => chain.map(name => point(source.joints[name])));
  const sourceWrist = point(source.joints[side === 'L' ? 'joint3_03' : 'joint26_024']);
  sourceWrist.y = wristAnchor;
  const originalFrame = palmFrame(sourceWrist, authored[0][0], authored[1][0], authored[3][0]);
  const fittedFrame = palmFrame(targetWrist, targets[0][0], targets[1][0], targets[3][0]);
  const palm = new T.Quaternion().setFromRotationMatrix(fittedFrame.clone().multiply(originalFrame.clone().transpose()));
  const width = targets[0][0].distanceTo(targets[3][0]) / authored[0][0].distanceTo(authored[3][0]);
  const length = targetWrist.distanceTo(targets[1][0]) / sourceWrist.distanceTo(authored[1][0]);
  const palmScale = new T.Vector3(width, length, surfaceScale);
  const palmMap = fittedFrame.clone().scale(palmScale).multiply(originalFrame.transpose());
  const palmNormals = new T.Matrix3().getNormalMatrix(palmMap);
  const fits = new Map();
  for (const [finger, chain] of digits[side].entries()) {
    const coordinates = authored[finger];
    if (finger === 4) coordinates.push(coordinates[2].clone()
      .add(between(coordinates[1], coordinates[2]).setLength(.024)));
    const joints = targets[finger];
    let orientation = palm;
    for (let segment = 0; segment < 3; segment++) {
      const start = coordinates[segment];
      const direction = between(start, coordinates[segment + 1]);
      const fitted = between(joints[segment], joints[segment + 1]);
      const along = fitted.length() / direction.length();
      direction.normalize();
      orientation = new T.Quaternion().setFromUnitVectors(direction.clone().applyQuaternion(orientation),
        fitted.normalize()).multiply(orientation);
      const fit = { start, target: joints[segment], direction, along, orientation };
      fits.set(chain[segment], fit);
      if (segment === 2 && chain[3]) fits.set(chain[3], fit);
    }
  }
  return ([position, normal, uv, weights]) => {
    const base = point(position), baseNormal = point(normal);
    // Tuck the wrist seam into the cuff, which follows the forearm separately.
    const taper = T.MathUtils.lerp(.88, 1, T.MathUtils.smoothstep(cuffEdge - base.y, 0, .036));
    base.x = T.MathUtils.lerp(sourceWrist.x, base.x, taper);
    base.z = T.MathUtils.lerp(sourceWrist.z, base.z, taper);
    const p = new T.Vector3(), n = new T.Vector3();
    const relative = new T.Vector3();
    let total = 0;
    for (const [name, weight] of weights) {
      const fit = fits.get(name);
      if (fit) {
        relative.copy(base).sub(fit.start).multiplyScalar(surfaceScale);
        relative.addScaledVector(fit.direction, relative.dot(fit.direction) * (fit.along / surfaceScale - 1));
        p.addScaledVector(relative.applyQuaternion(fit.orientation).add(fit.target), weight);
        relative.copy(baseNormal);
        relative.addScaledVector(fit.direction, relative.dot(fit.direction) * (surfaceScale / fit.along - 1));
        n.addScaledVector(relative.applyQuaternion(fit.orientation).normalize(), weight);
      } else {
        p.addScaledVector(relative.copy(base).sub(sourceWrist).applyMatrix4(palmMap).add(targetWrist), weight);
        n.addScaledVector(relative.copy(baseNormal).applyNormalMatrix(palmNormals), weight);
      }
      total += weight;
    }
    if (!total) throw new Error('Unweighted glove vertex');
    n.normalize().applyQuaternion(rotation);
    if (mirror) n.x *= -1;
    return { p: toGame(p.multiplyScalar(1 / total)).toArray(), n: n.toArray(), uv };
  };
}

export function shapeSleeve(source, side) {
  const joints = side === 'L' ? ['joint_00', 'joint2_01', 'joint3_03'] :
    ['joint24_023', 'joint25_025', 'joint26_024'];
  const shoulder = source.joints[joints[0]], elbow = source.joints[joints[1]], wrist = source.joints[joints[2]];
  return ([p, n, uv]) => {
    const [start, end] = p[1] > elbow[1] ? [shoulder, elbow] : [elbow, wrist];
    const fraction = T.MathUtils.clamp((p[1] - start[1]) / (end[1] - start[1]), 0, 1);
    const x = p[0] - T.MathUtils.lerp(start[0], end[0], fraction);
    return {
      p: [x * 1.1, p[2] * 1.1, (.275 - p[1]) / (.275 - cuffEdge) * .6],
      n: point([n[0], n[2], -n[1] * 1.1 * (.275 - cuffEdge) / .6]).normalize().toArray(), uv,
    };
  };
}

export function packArmPart(vertices, sourceIndices, mirror = false) {
  const names = Object.keys(fields).filter(name => Object.hasOwn(vertices[0], name));
  const arrays = Object.fromEntries(names.map(name => [name, []]));
  const indices = [], lookup = new Map();
  function add(vertex) {
    const key = names.flatMap(name => vertex[name]).map(value => Math.round(value * 1000000)).join(',');
    if (lookup.has(key)) return lookup.get(key);
    const i = arrays.p.length / 3;
    lookup.set(key, i);
    for (const name of names) arrays[name].push(...vertex[name]);
    return i;
  }
  for (let i = 0; i < sourceIndices.length; i += 3) {
    const [a, b, c] = sourceIndices.slice(i, i + 3);
    indices.push(add(vertices[a]), add(vertices[mirror ? c : b]), add(vertices[mirror ? b : c]));
  }
  if (!indices.length || lookup.size > 65535) throw new Error('Invalid FPS arm index count');
  for (const key of ['p', 'morph']) {
    if (arrays[key]?.some(value => !Number.isFinite(value) || Math.abs(value * positionScale) > 32767)) {
      throw new Error('FPS arm position outside packing range');
    }
  }
  return { ...Object.fromEntries(names.map(name => [name, pack(arrays[name], ...fields[name])])), index: pack(indices, Uint16Array) };
}
