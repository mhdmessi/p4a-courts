import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Builds into ../docs, which GitHub Pages serves.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: { outDir: '../docs', emptyOutDir: true },
  server: { fs: { allow: ['..'] } },
});
