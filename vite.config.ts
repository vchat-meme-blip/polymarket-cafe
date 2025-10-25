/// <reference types="node" />

import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import { fileURLToPath } from 'node:url';

// FIX: Define __dirname in an ES module context using the cross-platform compatible `fileURLToPath`.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
    // Load environment variables
    const env = loadEnv(mode, process.cwd(), '');
    
    // Create a safe environment object to expose to the client
    const clientEnv = {
        // Explicitly define which environment variables should be available to the client
        NODE_ENV: process.env.NODE_ENV || mode,
        VITE_APP_TITLE: env.VITE_APP_TITLE,
        // FIX: Expose VITE_PUBLIC_APP_URL to the client build via process.env.
        VITE_PUBLIC_APP_URL: env.VITE_PUBLIC_APP_URL,
        // Add other client-side environment variables here
    };

    return {
        // Define environment variables for client-side code
        define: {
            // FIX: Ensure `process.env` is correctly typed by making sure Node.js types are loaded via `/// <reference types="node" />` at the top of the file.
            'process.env': JSON.stringify(clientEnv),
            '__APP_ENV__': JSON.stringify(mode)
        },
        server: {
            proxy: {
                '/api': {
                    target: 'http://localhost:3001',
                    changeOrigin: true,
                    secure: false,
                },
                '/socket.io': {
                    target: 'http://localhost:3001',
                    ws: true,
                    changeOrigin: true,
                    secure: false,
                }
            }
        },
        build: {
            outDir: 'dist/client',
            emptyOutDir: true,
            // Improve chunking to address the large chunk warning
            rollupOptions: {
                output: {
                    manualChunks: {
                        vendor: ['react', 'react-dom', 'three'],
                        // Add other large dependencies here
                    },
                },
            },
            chunkSizeWarningLimit: 1000, // Increase chunk size warning limit to 1000KB
        },
        resolve: {
            alias: {
                '@': path.resolve(__dirname, './'),
            }
        },
    };
});