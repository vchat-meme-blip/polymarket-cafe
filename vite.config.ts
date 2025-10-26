import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { resolve } from 'path';

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
        // Add other client-side environment variables here
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
                    rewrite: (path) => path.replace(/^\/api/, '')
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
                output: {
                    manualChunks: {
                        vendor: ['react', 'react-dom', 'three']
                        // Add other large dependencies here
                    },
                    // Ensure consistent chunk names
                    chunkFileNames: 'assets/js/[name]-[hash].js',
                    entryFileNames: 'assets/js/[name]-[hash].js',
                    assetFileNames: (assetInfo) => {
                        // Handle case where name might be undefined
                        if (!assetInfo.name) {
                            return 'assets/[name]-[hash][extname]';
                        }
                        
                        // Put different asset types in different directories
                        if (/\.(png|jpe?g|svg|gif|webp|avif)$/i.test(assetInfo.name)) {
                            return `assets/images/[name]-[hash][extname]`;
                        }
                        if (/\.(woff|woff2|eot|ttf|otf)$/i.test(assetInfo.name)) {
                            return `assets/fonts/[name]-[hash][extname]`;
                        }
                        if (/\.(vrm|glb|gltf|bin)$/i.test(assetInfo.name)) {
                            return `assets/models/[name]-[hash][extname]`;
                        }
                        // Default path for other assets
                        return 'assets/[name]-[hash][extname]';
                    },
                },
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
                '@': path.resolve(__dirname, './'),
                mongoose: 'mongoose',
            }
        },
    };
});