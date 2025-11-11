/// <reference types="node" />
import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { resolve } from 'path';

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
        VITE_API_BASE_URL: env.VITE_API_BASE_URL,
        VITE_SOCKET_URL: env.VITE_SOCKET_URL,
    };

    return {
        plugins: [
            react({
                jsxImportSource: 'react',
                babel: {
                    plugins: [
                        ['@babel/plugin-transform-react-jsx', { runtime: 'automatic' }]
                    ]
                }
            })
        ],
        define: {
            'process.env': JSON.stringify(clientEnv),
            '__APP_ENV__': JSON.stringify(mode),
            'global': 'window'
        },
        server: {
            proxy: {
                '/api': {
                    target: env.VITE_API_BASE_URL || 'http://localhost:3001',
                    changeOrigin: true,
                    secure: false,
                },
                '/socket.io': {
                    target: env.VITE_SOCKET_URL || 'ws://localhost:3001',
                    // Required for WebSocket connections
                    ws: true,
                    changeOrigin: true,
                    secure: false,
                    configure: (proxy, _options) => {
                        proxy.on('error', (err, _req, _res) => {
                            console.error('Proxy error:', err);
                        });
                        proxy.on('proxyReq', (proxyReq, req, _res) => {
                            console.log('Sending Request to the Target:', {
                                method: req.method,
                                url: req.url,
                                headers: req.headers,
                            });
                        });
                    }
                }
            }
        },
        // Configure build settings
        build: {
            outDir: 'dist/client',
            emptyOutDir: true,
            assetsDir: 'assets',
            // Don't inline any files, keep them as separate files
            assetsInlineLimit: 0,
            rollupOptions: {
                input: {
                    main: path.resolve(__dirname, 'index.html')
                },
                output: {
                    manualChunks: {
                        vendor: ['react', 'react-dom', '@solana/web3.js', '@solana/wallet-adapter-react']
                    },
                    chunkFileNames: 'assets/js/[name]-[hash].js',
                    entryFileNames: 'assets/js/[name]-[hash].js',
                    assetFileNames: 'assets/[ext]/[name]-[hash][extname]'
                }
            },
            // Increase chunk size warning limit
            chunkSizeWarningLimit: 2000, // Increased to 2MB
            // Enable sourcemaps in development
            sourcemap: mode === 'development',
            // Minify for production
            minify: mode === 'production' ? 'esbuild' : false,
        },
        // Configure static assets handling
        publicDir: 'public',
        // Copy public directory to dist
        copyPublicDir: true,
        // Explicitly include all asset types
        assetsInclude: [
            '**/*.vrm', '**/*.glb', '**/*.gltf', '**/*.bin',
            '**/*.png', '**/*.jpg', '**/*.jpeg', '**/*.gif', '**/*.webp', '**/*.avif',
            '**/*.svg', '**/*.woff', '**/*.woff2', '**/*.eot', '**/*.ttf', '**/*.otf',
            '**/*.mp4', '**/*.webm', '**/*.ogg', '**/*.mp3', '**/*.wav', '**/*.flac',
            '**/*.aac', '**/*.pdf', '**/*.zip', '**/*.wasm'
        ],
        resolve: {
            alias: {
                '@': path.resolve(__dirname, './src'),
                mongoose: 'mongoose',
            }
        },
    };
});