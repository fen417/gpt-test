const colors = [
  [75, 91, 60],   // olive
  [46, 54, 44],   // charcoal green
  [117, 124, 87], // sage
  [124, 106, 73], // dry earth
];

function hash(x, y) {
  const n = Math.imul(x + 41, 1597334677) ^ Math.imul(y + 97, 3812015801);
  return (Math.imul(n ^ (n >>> 16), 2246822519) >>> 0) / 4294967295;
}

function noise(x, y) {
  const i = Math.floor(x), j = Math.floor(y);
  const u = x - i, v = y - j;
  const s = u * u * (3 - 2 * u), t = v * v * (3 - 2 * v);
  const a = hash(i, j), b = hash(i, j + 1);
  return (a + (hash(i + 1, j) - a) * s) * (1 - t) + (b + (hash(i + 1, j + 1) - b) * s) * t;
}

export function paintRegularUniform({ data, width, height }, readLuma) {
  for (let y = 0, i = 0; y < height; y++) {
    for (let x = 0; x < width; x++, i += 4) {
      const u = x * 31 / width, v = y * 47 / height;
      const warp = noise(u * 1.7 + 31, v * 1.7) - .5;
      const region = noise(u + warp * .82, v - warp * .93) + (noise(u * 3, v * 3) - .5) * .22;
      const patch = noise(u * 1.6 + 67, v * 1.4 + 33) + warp * .21;
      const color = colors[region < .32 ? 1 : patch > .68 ? 3 : region > .60 ? 2 : 0];
      const grained = (hash(x, y) - .5) * .065 + ((x + y) % 4 === 0 ? .018 : 0);
      const luma = readLuma(data[i], data[i + 1], data[i + 2]) / 255;
      const shading = .48 + .73 * luma + grained;
      for (let c = 0; c < 3; c++) data[i + c] = color[c] * shading;
    }
  }
}
