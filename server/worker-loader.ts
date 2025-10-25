import { Worker, WorkerOptions } from 'worker_threads';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// Get the directory name in an ESM-compatible way
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Supported worker extensions in order of preference
const WORKER_EXTENSIONS = ['.mjs', '.js', '.cjs', '.ts'];
const isDocker = process.env.DOCKER_ENV === 'true';

// Cache for resolved worker paths
const workerPathCache = new Map<string, string>();

/**
 * Resolve the full path to a worker file
 */
function resolveWorkerPath(workerPath: string): string | null {
  const cacheKey = `${process.env.NODE_ENV}:${workerPath}`;
  if (workerPathCache.has(cacheKey)) {
    return workerPathCache.get(cacheKey) || null;
  }

  const isDev = process.env.NODE_ENV !== 'production';
  const cwd = isDocker ? '/app' : process.cwd();
  
  // Possible base directories to search
  const baseDirs = [
    cwd,
    path.join(cwd, 'dist/server'),
    path.join(cwd, 'dist'),
    path.join(cwd, 'server')
  ];

  // Possible subdirectories to check
  const workerDirs = [
    'workers',
    'dist/workers',
    'dist/server/workers',
    'server/workers',
    ''
  ];

  // Worker name without extension
  const workerName = path.basename(workerPath, path.extname(workerPath));
  
  // Try different naming patterns
  const possibleNames = [
    workerName.endsWith('.worker') ? workerName : `${workerName}.worker`,
    workerName.endsWith('.worker') ? workerName.replace(/\.worker$/, '') : workerName
  ];

  // Try all combinations of base dirs, worker dirs, names and extensions
  for (const baseDir of baseDirs) {
    for (const workerDir of workerDirs) {
      for (const name of possibleNames) {
        for (const ext of WORKER_EXTENSIONS) {
          const fullPath = path.join(baseDir, workerDir, `${name}${ext}`);
          if (fs.existsSync(fullPath)) {
            console.log(`[Worker Loader] Found worker at: ${fullPath}`);
            workerPathCache.set(cacheKey, fullPath);
            return fullPath;
          }
        }
      }
    }
  }

  // Try direct path if not found in search paths
  if (fs.existsSync(workerPath)) {
    const resolvedPath = path.resolve(workerPath);
    workerPathCache.set(cacheKey, resolvedPath);
    return resolvedPath;
  }

  console.error(`[Worker Loader] Worker file not found: ${workerPath}`);
  console.error('[Worker Loader] Searched in:', {
    baseDirs,
    workerDirs,
    possibleNames,
    extensions: WORKER_EXTENSIONS
  });
  
  return null;
}

/**
 * Creates and configures a worker thread with proper error handling and module resolution
 */
export function createWorker(workerPath: string, options: WorkerOptions = {}): Worker {
  const isDev = process.env.NODE_ENV !== 'production';
  const workerName = path.basename(workerPath, path.extname(workerPath));
  
  console.log(`[Worker Loader] Initializing worker: ${workerName}`);
  
  // Resolve the worker file path
  const resolvedPath = resolveWorkerPath(workerPath);
  
  if (!resolvedPath) {
    throw new Error(`Worker file not found: ${workerPath}`);
  }

  // Configure worker options
  const workerOptions: WorkerOptions = {
    ...options,
    workerData: {
      ...(options.workerData || {}),
      __filename: resolvedPath,
      __dirname: path.dirname(resolvedPath),
      workerPath: resolvedPath,
      isDocker,
      NODE_ENV: process.env.NODE_ENV
    },
    // Enable ES modules and source maps
    execArgv: [
      ...(options.execArgv || []),
      ...(isDev ? ['--loader', 'ts-node/esm'] : []),
      '--no-warnings',
      '--experimental-modules',
      '--es-module-specifier-resolution=node'
    ].filter(Boolean),
    env: {
      ...process.env,
      NODE_OPTIONS: '--experimental-modules --es-module-specifier-resolution=node',
      NODE_ENV: process.env.NODE_ENV || 'production'
    }
  };

  console.log(`[Worker Loader] Loading worker from: ${resolvedPath}`);
  console.log(`[Worker Loader] Worker options:`, {
    ...workerOptions,
    workerData: { ...workerOptions.workerData, __filename: 'REDACTED' }
  });

  try {
    // Create and configure the worker
    const worker = new Worker(resolvedPath, workerOptions);

    // Set up error handling
    worker.on('error', (error: Error) => {
      console.error(`[Worker ${workerName}] Error:`, error);
    });

    worker.on('exit', (code: number) => {
      if (code !== 0) {
        console.error(`[Worker ${workerName}] Worker stopped with exit code ${code}`);
      }
    });

    worker.on('online', () => {
      console.log(`[Worker ${workerName}] Worker is online`);
    });

    if (process.env.NODE_ENV !== 'production') {
      worker.on('message', (message: unknown) => {
        console.log(`[Worker ${workerName}] Message:`, message);
      });
    }

    return worker;
  } catch (error) {
    console.error(`[Worker ${workerName}] Failed to create worker:`, error);
    throw error;
  }
}