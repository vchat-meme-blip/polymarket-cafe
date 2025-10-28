import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';

function findProjectRoot(startDir) {
  let dir = startDir;
  while (dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return null;
}

function loadEnv() {
  const projectRoot = findProjectRoot(process.cwd());
  if (!projectRoot) {
    console.log('[Env] Could not find project root. Using current directory.');
  }
  
  const searchPath = projectRoot || process.cwd();
  console.log(`Looking for .env files in: ${searchPath}`);

  const envLocalPath = path.join(searchPath, '.env.local');
  if (fs.existsSync(envLocalPath)) {
    dotenv.config({ path: envLocalPath });
    console.log(`[Env] Loaded environment variables from ${envLocalPath}`);
    return;
  }
  
  const envPath = path.join(searchPath, '.env');
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    console.log(`[Env] Loaded environment variables from ${envPath}`);
    return;
  }
  
  console.log('[Env] No .env.local or .env file found. Using system environment variables.');
}

loadEnv();
