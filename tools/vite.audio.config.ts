// Separate Vite build for the offline audio render check (tools/audio-check.html → .audio-dist/).
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const here = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: here,
  base: './',
  logLevel: 'warn',
  build: {
    target: 'es2022',
    outDir: resolve(here, '../.audio-dist'),
    emptyOutDir: true,
    rollupOptions: { input: { 'audio-check': resolve(here, 'audio-check.html') } },
  },
});
