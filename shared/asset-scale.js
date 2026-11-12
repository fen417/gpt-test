export const UNIT_SCALE = Object.freeze({ x: 1, y: 1, z: 1 });
const sizeAxes = { w: 'x', d: 'z', h: 'y', bodyHeight: 'y', rx: 'x', rz: 'z', height: 'y' };

export function scaleAsset(value, scale = UNIT_SCALE) {
  const result = { ...value, modelScale: { ...scale } };
  for (const [field, axis] of Object.entries(sizeAxes)) {
    if (Number.isFinite(value[field])) result[field] = value[field] * scale[axis];
  }
  return result;
}

export function localAsset(value, anchor, scale = UNIT_SCALE) {
  const result = scaleAsset(value, { x: 1 / scale.x, y: 1 / scale.y, z: 1 / scale.z });
  result.x = (value.x - anchor.x) / scale.x;
  result.z = (value.z - anchor.z) / scale.z;
  result.baseY = ((value.baseY ?? 0) - (anchor.baseY ?? 0)) / scale.y;
  result.modelScale = UNIT_SCALE;
  return result;
}
