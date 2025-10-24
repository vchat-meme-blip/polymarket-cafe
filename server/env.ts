import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

// Default configuration
const defaultConfig = {
  NODE_ENV: process.env.NODE_ENV || 'production',
  PORT: process.env.PORT || '3000',
  // Add other default environment variables here
};

function loadEnv() {
  try {
    const envLocalPath = path.join(projectRoot, '.env.local');
    const envPath = path.join(projectRoot, '.env');
    let loaded = false;

    // Try loading .env.local first
    if (fs.existsSync(envLocalPath)) {
      dotenv.config({ path: envLocalPath });
      console.log('[Env] Loaded .env.local');
      loaded = true;
    }

    // Then try .env
    if (!loaded && fs.existsSync(envPath)) {
      dotenv.config({ path: envPath });
      console.log('[Env] Loaded .env');
      loaded = true;
    }

    // Merge environment variables with defaults
    const config: Record<string, string | undefined> = {
      ...defaultConfig,
      ...process.env,
    };

    // Validate required environment variables
    const requiredVars = ['NODE_ENV'];
    const missingVars = requiredVars.filter(varName => !config[varName]);

    if (missingVars.length > 0) {
      console.warn(`[Env] Missing required environment variables: ${missingVars.join(', ')}`);
      console.warn('[Env] Using default configuration');
    } else {
      console.log('[Env] Environment loaded successfully');
    }

    return config;
  } catch (error) {
    console.error('[Env] Error loading environment:', error);
    console.warn('[Env] Using default configuration due to error');
    return defaultConfig;
  }
}

// Load environment and export the config
const config = loadEnv();

export default config;