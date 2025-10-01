import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import { fileURLToPath } from 'url';

// FIX: Define __dirname in an ES module context using the cross-platform compatible `fileURLToPath`.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    return {
      // FIX: Added a `define` property to inject environment variables into the client-side code.
      // This replaces `process.env` with the actual values from your `.env.local` file at build time.
      // It is the correct way to expose server-side variables to the browser and resolves the
      // critical `__DEFINES__ is not defined` error during startup.
      define: {
        'process.env': JSON.stringify(env),
      },
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