import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
// FIX: Import 'process' to provide correct types for process.exit and resolve TypeScript error.
import process from 'process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

function loadEnv() {
    const envLocalPath = path.join(projectRoot, '.env.local');
    const envPath = path.join(projectRoot, '.env');

    let loaded = false;

    if (fs.existsSync(envLocalPath)) {
        dotenv.config({ path: envLocalPath });
        console.log('[Env] Loaded .env.local');
        loaded = true;
    }

    if (!loaded && fs.existsSync(envPath)) {
        dotenv.config({ path: envPath });
        console.log('[Env] Loaded .env');
        loaded = true;
    }

    if (!loaded) {
        console.error('[Env] No environment files found!');
        process.exit(1);
    }

    // Validate required environment variables
    const required = ['MONGODB_URI'];
    const missing = required.filter(key => !process.env[key]);

    if (missing.length > 0) {
        console.error('[Env] Missing required environment variables:', missing.join(', '));
        console.error('[Env] Please check your .env.local or .env file');
        process.exit(1);
    }

    console.log('[Env] Environment loaded successfully');
}

loadEnv();

export default loadEnv;