/// <reference types="node" />
import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
    // Load environment variables
    const env = loadEnv(mode, process.cwd(), '');
    
    // Set production mode based on Vite's mode
    const isProduction = mode === 'production';
    
    // Create a safe environment object to expose to the client
    const clientEnv = {
        // App configuration
        VITE_APP_TITLE: env.VITE_APP_TITLE || 'Poly Café',
        VITE_API_BASE_URL: isProduction ? env.VITE_API_BASE_URL : 'http://localhost:3001',
        VITE_SOCKET_URL: isProduction ? env.VITE_SOCKET_URL : 'ws://localhost:3001',
        
        // Solana configuration
        VITE_SOLANA_NETWORK: env.VITE_SOLANA_NETWORK || 'devnet',
        VITE_SOLANA_RPC: env.VITE_SOLANA_RPC || 'https://api.devnet.solana.com',
        VITE_AUTO_CONNECT_WALLET: env.VITE_AUTO_CONNECT_WALLET || 'true',
        
        // Feature flags
        VITE_ENABLE_ANALYTICS: env.VITE_ENABLE_ANALYTICS || 'false',
        VITE_ENABLE_MAINTENANCE_MODE: env.VITE_ENABLE_MAINTENANCE_MODE || 'false'
    };
    
    // Log environment in development
    if (!isProduction) {
        console.log('Vite Environment:', {
            mode,
            isProduction,
            ...clientEnv
        });
    }

    return {
        // Base public path when served in production
        base: isProduction ? '/' : '/',
        
        // Plugins
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
        
        // Environment variables
        define: {
            'process.env': JSON.stringify(clientEnv),
            '__APP_ENV__': JSON.stringify(mode),
            'global': 'window',
            'process.env.NODE_ENV': JSON.stringify(isProduction ? 'production' : 'development')
        },
        
        // Resolve configuration
        resolve: {
            alias: {
                '@': path.resolve(__dirname, './src'),
                '~': path.resolve(__dirname, './')
            }
        },
        
        // Build configuration
        build: {
            outDir: 'dist/client',
            emptyOutDir: true,
            assetsDir: 'assets',
            sourcemap: !isProduction,
            minify: isProduction ? 'esbuild' : false,
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
            }
        },
        // Server configuration
        server: {
            port: 3000,
            strictPort: true,
            open: !isProduction,
            proxy: {
                '/api': {
                    target: clientEnv.VITE_API_BASE_URL,
                    changeOrigin: true,
                    secure: false
                },
                '/socket.io': {
                    target: clientEnv.VITE_SOCKET_URL,
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
        // Static assets handling
        publicDir: 'public',
        copyPublicDir: true,
        
        // Asset handling
        assetsInclude: [
            '**/*.vrm', '**/*.glb', '**/*.gltf', '**/*.bin',
            '**/*.png', '**/*.jpg', '**/*.jpeg', '**/*.gif', '**/*.webp', '**/*.avif',
            '**/*.svg', '**/*.woff', '**/*.woff2', '**/*.eot', '**/*.ttf', '**/*.otf',
            '**/*.mp4', '**/*.webm', '**/*.ogg', '**/*.mp3', '**/*.wav', '**/*.flac'
        ]
    };
});