import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' + hash routing lets the build run from any GitHub Pages sub-path.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: true,
    chunkSizeWarningLimit: 4000,
  },
  server: { port: 5173 },
  preview: { port: 4173 },
});
