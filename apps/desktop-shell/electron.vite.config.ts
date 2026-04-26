import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

const root = resolve(__dirname, '../..');
const libsRoot = resolve(root, 'libs');

/**
 * Path aliases that map @fdc3-poc/* to their TypeScript source.
 * electron-vite bundles these into the output, so no separate compile step is needed.
 */
const libAliases: Record<string, string> = {
  '@fdc3-poc/fdc3-core': resolve(libsRoot, 'fdc3-core/src/index.ts'),
  '@fdc3-poc/app-registry': resolve(libsRoot, 'app-registry/src/index.ts'),
  '@fdc3-poc/channel-engine': resolve(libsRoot, 'channel-engine/src/index.ts'),
  '@fdc3-poc/intent-engine': resolve(libsRoot, 'intent-engine/src/index.ts'),
  '@fdc3-poc/workspace-engine': resolve(libsRoot, 'workspace-engine/src/index.ts'),
  '@fdc3-poc/interop-electron-adapter': resolve(libsRoot, 'interop-electron-adapter/src/index.ts'),
  '@fdc3-poc/shared-domain': resolve(libsRoot, 'shared-domain/src/index.ts'),
};

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: libAliases },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/main.ts'),
        },
      },
      outDir: resolve(__dirname, 'out/main'),
    },
  },

  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: libAliases },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/preload.ts'),
        },
      },
      outDir: resolve(__dirname, 'out/preload'),
    },
  },

  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react()],
    resolve: {
      alias: {
        ...libAliases,
        '@fdc3-poc/shared-ui': resolve(libsRoot, 'shared-ui/src/index.ts'),
      },
    },
    server: {
      port: 5173,
    },
    build: {
      outDir: resolve(__dirname, 'out/renderer'),
      rollupOptions: {
        input: resolve(__dirname, 'src/renderer/index.html'),
      },
    },
  },
});
