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
      output:{manualChunks(id){
        if(id.includes('/node_modules/three/')){
          // Keep WebGPU nodes and backend out of the original WebGL boot payload.
          // Core scene/geometry/math modules remain shared, not duplicated.
          if(id.endsWith('/three/examples/jsm/csm/CSMShadowNode.js')||/\/three\/(?:src\/(?:nodes\/|materials\/nodes\/|renderers\/(?:common\/|webgpu\/|webgl-fallback\/)|Three\.(?:WebGPU|TSL)\.js)|examples\/jsm\/tsl\/|build\/three\.(?:webgpu|tsl)\.js)/.test(id))return 'vendor-three-webgpu';
          return 'vendor-three';
        }
        if(id.includes('/node_modules/meshoptimizer/'))return 'vendor-meshopt';
        if(id.includes('/node_modules/fflate/'))return 'vendor-compression';
      }},
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
