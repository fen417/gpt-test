import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';

// A standalone authoring preview, separate from the shipped game entry points.
export default defineConfig({
  base:'/',
  build:{target:'es2022',outDir:'.perf-local/pistol-preview',emptyOutDir:true,rollupOptions:{input:fileURLToPath(new URL('../test/pistol-review.html',import.meta.url))}},
  preview:{host:'127.0.0.1',port:4174},
});
