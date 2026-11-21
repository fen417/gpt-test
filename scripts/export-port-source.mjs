import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { getMap } from '../shared/world.js';
import { portLayoutKey } from '../src/port-layout-key.js';

const destination = resolve(process.argv[2] ?? '.perf-local/port-bake');
const map = getMap('port');
const { size, shoreX, boxes, structures, roads, cranes, railTracks, ship, signs } = map;
await mkdir(destination, { recursive: true });
await writeFile(resolve(destination, 'port.json'),
  JSON.stringify({ layout: portLayoutKey(map), size, shoreX, boxes, structures, roads, cranes, railTracks, ship, signs }));

const runtime = resolve('src/assets/port');
await mkdir(runtime, { recursive: true });
const dimension = 384, canvas = createCanvas(dimension, dimension);
const context = canvas.getContext('2d'), paint = context.createImageData(dimension, dimension);
let seed = 417;
for (let y = 0; y < dimension; y++) for (let x = 0; x < dimension; x++) {
  const u = x * Math.PI * 2 / dimension, v = y * Math.PI * 2 / dimension;
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  const grain = (seed / 4294967296 - .5) * 11;
  const coat = 237 + grain + 5 * Math.sin(u * 5 + v * 3) * Math.cos(v * 7 - u * 3)
    + 6 * Math.sin(u * 2 - v * 3) * Math.cos(u + v * 2);
  const scuff = Math.max(0, Math.sin(u * 17 + v * 7) * Math.cos(u * 3 - v * 9) - .78) * 57;
  paint.data.set([coat - scuff, coat - scuff * 1.16, coat - scuff * 1.35, 255], (y * dimension + x) * 4);
}
context.putImageData(paint, 0, 0);
await writeFile(resolve(runtime, 'paint.webp'), canvas.toBuffer('image/webp', 88));
