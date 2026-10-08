import { defineConfig } from 'vite';
import { resolve } from 'node:path';

/** Stand-alone build of the terrain art preview page (tools/terrain-preview.html). */
export default defineConfig({
  root: __dirname,
  base: './',
  resolve: { alias: { '@src': resolve(__dirname, '../src') } },
  build: {
    outDir: resolve(__dirname, '../.preview-dist'),
    emptyOutDir: true,
    target: 'es2022',
    minify: false,
    rollupOptions: { input: { index: resolve(__dirname, 'terrain-preview.html') } },
  },
  preview: { port: 4199, strictPort: true },
});
