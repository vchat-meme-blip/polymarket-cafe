/// <reference types="node" />

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// Get the current working directory (project root)
const projectRoot = process.cwd();

// Define paths to environment files
const envLocalPath = path.join(projectRoot, '.env.local');
const envPath = path.join(projectRoot, '.env');

console.log('Looking for .env files in:', projectRoot);

// Load environment variables
function loadEnv() {
  // Try to load .env.local first, fall back to .env if it doesn't exist
  if (fs.existsSync(envLocalPath)) {
    dotenv.config({ path: envLocalPath });
    console.log(`[Env] Loaded environment variables from ${envLocalPath}`);
  } else if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    console.log(`[Env] Loaded environment variables from ${envPath}`);
  } else {
    console.warn('[Env] No .env.local or .env file found. Using system environment variables.');
  }

  // Verify required environment variables
  if (!process.env.MONGODB_URI) {
    console.error('Error: MONGODB_URI environment variable is not set.');
    console.error('Please create a .env.local file in your project root with the following content:');
    console.error('MONGODB_URI="your_mongodb_connection_string_here"');
    process.exit(1);
  }
}

export default loadEnv;