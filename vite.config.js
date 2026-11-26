import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
import {visualizer} from 'rollup-plugin-visualizer';
import {worldEditorPlugin} from './scripts/world-editor-server.mjs';
import {gripEditorPlugin} from './scripts/grip-editor-server.mjs';

export default defineConfig({
  base: './',
  plugins:[worldEditorPlugin(),gripEditorPlugin(),visualizer({filename:'.perf-local/bundle.html',gzipSize:true})],
  build: {
    target: 'es2022',
    manifest:true,
    rollupOptions: {
      output:{manualChunks(id){
        if(id.includes('/node_modules/three/')){
          // Keep WebGPU nodes and backend out of the original WebGL boot payload.
          // Core scene/geometry/math modules remain shared, not duplicated.
          if(id.endsWith('/three/examples/jsm/csm/CSMShadowNode.js')||/\/three\/(?:src\/(?:nodes\/|materials\/nodes\/|renderers\/(?:common\/|webgpu\/|webgl-fallback\/)|Three\.(?:WebGPU|TSL)\.js)|examples\/jsm\/tsl\/|build\/three\.(?:webgpu|tsl)\.js)/.test(id))return 'vendor-three-webgpu';
          if(id.endsWith('/SMAAPass.js')||id.endsWith('/SMAAShader.js'))return 'vendor-three-smaa';
          return 'vendor-three';
        }
        if(id.includes('/node_modules/meshoptimizer/'))return 'vendor-meshopt';
        if(id.includes('/node_modules/fflate/'))return 'vendor-compression';
      }},
      input: {
        credits: fileURLToPath(new URL('./credits.html', import.meta.url)),
        game: fileURLToPath(new URL('./index.html', import.meta.url)),
      },
    },
  },
  optimizeDeps:{entries:['index.html','world-editor.html'],include:['three/addons/controls/TransformControls.js','three/addons/controls/OrbitControls.js','three/addons/exporters/GLTFExporter.js','three/addons/loaders/FBXLoader.js','three/addons/loaders/OBJLoader.js','three/addons/loaders/MTLLoader.js']},
  server: { host: '127.0.0.1' },
});
