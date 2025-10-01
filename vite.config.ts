import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import { fileURLToPath } from 'url';

// FIX: Define __dirname in an ES module context using the cross-platform compatible `fileURLToPath`.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    return {
      root: __dirname,
      publicDir: path.resolve(__dirname, 'public'),
      base: '/',
      define: {
        'process.env': JSON.stringify(env),
      },
      build: {
        outDir: path.resolve(__dirname, 'dist/client'),
        emptyOutDir: true,
        rollupOptions: {
          input: path.resolve(__dirname, 'index.html')
        }
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, './'),
        }
      },
      server: {
        port: 3000,
        strictPort: true,
      },
      preview: {
        port: 3000,
        strictPort: true,
      }
    };
});