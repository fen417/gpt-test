import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
import {visualizer} from 'rollup-plugin-visualizer';

export default defineConfig({
  base: './',
  plugins:[visualizer({filename:'.perf-local/bundle.html',gzipSize:true})],
  build: {
    target: 'es2022',
    manifest:true,
    rollupOptions: {
      output:{manualChunks(id){if(id.includes('/node_modules/three/'))return 'vendor-three';if(id.includes('/node_modules/meshoptimizer/'))return 'vendor-meshopt';if(id.includes('/node_modules/fflate/'))return 'vendor-compression';}},
      input: {
        credits: fileURLToPath(new URL('./credits.html', import.meta.url)),
        soldiers: fileURLToPath(new URL('./soldier-review.html', import.meta.url)),
        game: fileURLToPath(new URL('./index.html', import.meta.url)),
        editor: fileURLToPath(new URL('./editor/index.html', import.meta.url)),
      },
    },
  },
  server: { host: '127.0.0.1' },
});
