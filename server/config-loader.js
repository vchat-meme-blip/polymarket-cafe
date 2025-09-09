import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// This file is pre-loaded with node's -r flag to ensure env vars are set before app code runs.
console.log('[ConfigLoader] Initializing environment...');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');
const envLocalPath = path.join(projectRoot, '.env.local');

if (fs.existsSync(envLocalPath)) {
    dotenv.config({ path: envLocalPath });
    console.log(`[ConfigLoader] Loaded environment variables from: .env.local`);
} else {
    // Fallback to .env or system variables
    dotenv.config();
    console.log('[ConfigLoader] .env.local not found, using default .env or system variables.');
}