import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

const libsRoot = resolve(__dirname, '../../libs');

export default defineConfig({
  root: __dirname,
  plugins: [react()],
  server: { port: 4014, fs: { allow: [resolve(__dirname, '../..')] } },
  resolve: {
    alias: {
      '@fdc3-poc/fdc3-core': resolve(libsRoot, 'fdc3-core/src/index.ts'),
      '@fdc3-poc/shared-ui': resolve(libsRoot, 'shared-ui/src/index.ts'),
    },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});

