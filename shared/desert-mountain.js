const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
const hash = (x, z, seed) => {
  let n = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ seed;
  n = Math.imul(n ^ n >>> 13, 1274126177);
  return ((n ^ n >>> 16) >>> 0) / 4294967295;
};
export function mountainNoise(x, z, seed) {
  const ix = Math.floor(x), iz = Math.floor(z), u = smooth(x - ix), v = smooth(z - iz);
  const a = hash(ix, iz, seed), b = hash(ix + 1, iz, seed);
  const c = hash(ix, iz + 1, seed), d = hash(ix + 1, iz + 1, seed);
  return a + (b - a) * u + (c - a + (d - c - b + a) * u) * v;
}
export { hash as mountainHash };

export const MOUNTAIN_COLUMNS = 48, MOUNTAIN_ROWS = 56;
export function desertMountainSurface(box, terrain) {
  let seed = 2166136261;
  for (const ch of String(box.modelSeed ?? box.assetTemplate ?? box.id ?? 'desert-ridge')) {
    seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619);
  }
  const peaks = Array.from({ length: 5 }, (_, i) => ({
    x: (hash(i, 0, seed) - .5) * .85, z: (hash(i, 1, seed) - .5) * 1.1,
    height: .62 + hash(i, 2, seed) * .36, width: .48 + hash(i, 3, seed) * .24,
  }));
  const stride = MOUNTAIN_COLUMNS + 1;
  const heights = new Float32Array(stride * (MOUNTAIN_ROWS + 1)), tones = new Float32Array(heights.length);
  const minX = box.x - box.w / 2, minZ = box.z - box.d / 2;
  for (let iz = 0; iz <= MOUNTAIN_ROWS; iz++) for (let ix = 0; ix <= MOUNTAIN_COLUMNS; ix++) {
    const u = ix / MOUNTAIN_COLUMNS * 2 - 1, v = iz / MOUNTAIN_ROWS * 2 - 1;
    const edge = 1 - smooth((Math.max(Math.abs(u), Math.abs(v)) - .67) / .33);
    let profile = 0;
    for (const peak of peaks) {
      const distance = Math.hypot((u - peak.x) / peak.width, (v - peak.z) / (peak.width * 1.15));
      profile = Math.max(profile, peak.height * Math.pow(Math.max(0, 1 - distance), .8));
    }
    const ridge = 1 - Math.abs(mountainNoise(u * 8 + 20, v * 8 + 20, seed) * 2 - 1);
    const fine = mountainNoise(u * 25 + 50, v * 25 + 50, seed ^ 713);
    profile = Math.min(1, (profile + ridge * .16 + fine * .045) * edge);
    const floor = terrain?.heightAt(minX + ix * box.w / MOUNTAIN_COLUMNS, minZ + iz * box.d / MOUNTAIN_ROWS) ?? box.baseY ?? 0;
    const peak = Math.max(floor - .3, (box.baseY ?? 0) + box.h * profile - .6);
    const y = floor - .3 + (peak - (floor - .3)) * edge;
    const index = iz * stride + ix;
    heights[index] = y;
    tones[index] = .83 + ridge * .1 + fine * .1 + Math.sin(y * 1.1 + mountainNoise(u * 3 + 10, v * 3 + 10, seed) * 3) * .045;
  }
  function heightAt(x, z) {
    const gx = (x - minX) / box.w * MOUNTAIN_COLUMNS, gz = (z - minZ) / box.d * MOUNTAIN_ROWS;
    if (gx < 0 || gz < 0 || gx >= MOUNTAIN_COLUMNS || gz >= MOUNTAIN_ROWS) return -Infinity;
    const ix = Math.floor(gx), iz = Math.floor(gz), u = gx - ix, v = gz - iz, index = iz * stride + ix;
    const a = heights[index], b = heights[index + 1], c = heights[index + stride], d = heights[index + stride + 1];
    return u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
  }
  return { heights, tones, heightAt };
}
