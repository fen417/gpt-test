const wallKinds = new Set(['village-barricade', 'wall', 'barrier', 'sandbags']);

export function groundAsset(value, terrain) {
  if (!terrain || value.editorParent || value.groundFit || !wallKinds.has(value.kind)) return value;
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

export function fitLowProp(box, terrain) {
  if (!box.groundFit || !terrain || box.editorParent) return box;
  const halfX=box.w/2, halfZ=box.d/2, sample=(x,z)=>terrain.heightAt(box.x+x,box.z+z);
  const slopeX=(sample(halfX,0)-sample(-halfX,0))/box.w;
  const slopeZ=(sample(0,halfZ)-sample(0,-halfZ))/box.d;
  const baseY=sample(0,0);
  if(box.authoredRotation)return {...box,baseY};
  const modelRotation={x:-Math.atan(slopeZ),y:0,z:Math.atan(slopeX)};
  const correction=Math.min(0,...[-halfX,halfX].flatMap(x=>[-halfZ,halfZ].map(z=>sample(x,z)-baseY-x*slopeX-z*slopeZ)));
  return {...box,baseY:baseY+correction-.035,modelRotation};
}
