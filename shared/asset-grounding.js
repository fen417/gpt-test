const wallKinds = new Set(['village-barricade', 'wall', 'barrier', 'sandbags']);

export function groundAsset(value, terrain) {
  if (!terrain || value.editorParent || !wallKinds.has(value.kind)) return value;
  let low = Infinity, high = -Infinity;
  const nx = Math.max(1, Math.ceil(value.w / (terrain.cell ?? 2)));
  const nz = Math.max(1, Math.ceil(value.d / (terrain.cell ?? 2)));
  for (let ix = 0; ix <= nx; ix++) for (let iz = 0; iz <= nz; iz++) {
    const y = terrain.heightAt(value.x + value.w * (ix / nx - .5), value.z + value.d * (iz / nz - .5));
    low = Math.min(low, y);
    high = Math.max(high, y);
  }
  const bodyHeight = value.bodyHeight ?? value.h;
  return { ...value, bodyHeight, baseY: low - .08, h: bodyHeight + high - low + .08 };
}

export function shipTerrainPad(ship, terrain) {
  const height = terrain.heightAt(ship.x - ship.w / 2 - 5, ship.z);
  return { x: ship.x, z: ship.z, w: ship.w + 12, d: ship.d + 16, height, blend: 9 };
}
