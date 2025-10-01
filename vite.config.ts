import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import { fileURLToPath } from 'url';
import react from '@vitejs/plugin-react';

// FIX: Define __dirname in an ES module context using the cross-platform compatible `fileURLToPath`.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    return {
      root: __dirname,
      publicDir: path.resolve(__dirname, 'public'),
      base: '/',
      plugins: [react()],
      define: {
        'process.env': JSON.stringify(env),
      },
      build: {
        outDir: path.resolve(__dirname, 'dist/client'),
        emptyOutDir: true,
        rollupOptions: {
          input: path.resolve(__dirname, 'index.html'),
          output: {
            entryFileNames: 'assets/[name].[hash].js',
            chunkFileNames: 'assets/[name].[hash].js',
            assetFileNames: 'assets/[name].[hash][extname]',
          },
        },
        sourcemap: true,
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, './src'),
        },
        extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
      },
      server: {
        port: 3000,
        strictPort: true,
        open: true,
      },
      preview: {
        port: 3000,
        strictPort: true,
      },
      optimizeDeps: {
        include: ['react', 'react-dom', 'react-dom/client'],
      },
    };
});