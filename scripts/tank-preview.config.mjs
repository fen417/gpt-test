import{defineConfig}from'vite';import{fileURLToPath}from'node:url';
export default defineConfig({base:'/',build:{target:'es2022',outDir:'.perf-local/tank-preview',emptyOutDir:true,rollupOptions:{input:fileURLToPath(new URL('../test/tank-review.html',import.meta.url))}},preview:{host:'127.0.0.1',port:4175}});
