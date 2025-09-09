import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import { fileURLToPath } from 'url';

// FIX: Define __dirname in an ES module context using the cross-platform compatible `fileURLToPath`.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      build: {
        outDir: 'dist/client', // Output client build to a separate folder
        emptyOutDir: true, // Clean the directory before building
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, './'),
        }
      },
    };
});