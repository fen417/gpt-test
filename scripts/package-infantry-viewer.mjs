import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = new URL('../', import.meta.url);
const output = new URL('.perf-local/infantry-viewer/', root);
const path = url => fileURLToPath(url);
const copy = (from, to) => cp(new URL(from, root), new URL(to, output), { recursive: true });
await build({
  configFile: false,
  root: path(root),
  base: './',
  publicDir: false,
  build: {
    target: 'es2022',
    outDir: path(new URL('site/', output)),
    emptyOutDir: true,
    rollupOptions: { input: path(new URL('soldier-review.html', root)) },
  },
});
await mkdir(new URL('licenses/', output), { recursive: true });
await Promise.all([
  copy('public/basis/', 'site/basis/'),
  copy('scripts/viewer/Start.cmd', 'Start.cmd'),
  copy('scripts/viewer/viewer-server.mjs', 'viewer-server.mjs'),
  copy('scripts/viewer/README.md', 'README.md'),
  copy('LICENSE', 'licenses/SECTOR-09.txt'),
  copy('node_modules/three/LICENSE', 'licenses/Three.js.txt'),
  copy('node_modules/meshoptimizer/LICENSE.md', 'licenses/Meshoptimizer.txt'),
  copy('scripts/viewer/Basis-Universal.txt', 'licenses/Basis-Universal.txt'),
  copy('src/assets/infantry/SOURCES.md', 'licenses/Источники.md'),
]);
console.log(path(output));
