import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: __dirname,
  base: './',
  build: {
    outDir: resolve(__dirname, '../.bench-dist'),
    emptyOutDir: true,
    rollupOptions: { input: { pixi: resolve(__dirname, 'pixi.html'), phaser: resolve(__dirname, 'phaser.html') } },
  },
});
