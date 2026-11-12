import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      input: {
        game: fileURLToPath(new URL('./index.html', import.meta.url)),
        editor: fileURLToPath(new URL('./editor/index.html', import.meta.url)),
      },
    },
  },
  server: { host: '127.0.0.1' },
});
