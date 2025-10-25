import { Worker, WorkerOptions } from 'node:worker_threads';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

// Get the directory name in an ESM-compatible way
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WORKER_EXTENSIONS = ['.js', '.mjs', '.cjs', '.ts'];
const isDocker = process.env.DOCKER_ENV === 'true';

/**
 * Creates and configures a worker thread with proper error handling and module resolution
 * @param workerPath - Path to the worker file (can be relative or absolute)
 * @param options - Additional worker options
 * @returns Configured Worker instance
 */
export function createWorker(workerPath: string, options: WorkerOptions = {}): Worker {
  const isDev = process.env.NODE_ENV !== 'production';
  
  // Base directories to search for workers
  const baseDirs = [
    isDocker ? '/app' : process.cwd(),
    path.join(isDocker ? '/app' : process.cwd(), 'dist/server'),
    path.join(isDocker ? '/app' : process.cwd(), 'server'),
    path.join(isDocker ? '/app' : process.cwd(), 'dist')
  ];
  
  // Possible subdirectories to check within base directories
  const workerDirs = [
    'workers',
    'server/workers',
    'dist/server/workers',
    'dist/workers',
    '' // root of base directory
  ];
  
  console.log(`[Worker Loader] Searching for worker: ${workerPath}`);
  console.log(`[Worker Loader] Base directories:`, baseDirs);

  // Worker name without extension
  const workerName = path.basename(workerPath, path.extname(workerPath));
  
  // Possible file names to try (with and without .worker)
  const possibleNames = [
    `${workerName}.worker`,
    workerName,
    workerName.replace(/\.worker$/, '')
  ];

  // Find the first existing worker file
  let finalPath: string | null = null;
  
  // Try all combinations of base directories and worker directories
  for (const baseDir of baseDirs) {
    for (const workerDir of workerDirs) {
      for (const name of possibleNames) {
        for (const ext of WORKER_EXTENSIONS) {
          const fullPath = path.join(baseDir, workerDir, `${name}${ext}`);
          if (fs.existsSync(fullPath)) {
            console.log(`[Worker Loader] Found worker at: ${fullPath}`);
            finalPath = fullPath;
            break;
          }
        }
        if (finalPath) break;
      }
      if (finalPath) break;
    }
    if (finalPath) break;
  }

  // If still not found, try direct path
  if (!finalPath && fs.existsSync(workerPath)) {
    finalPath = path.resolve(workerPath);
  }

  if (!finalPath) {
    const searchedPaths = baseDirs.flatMap(dir => 
      possibleNames.flatMap(name => 
        WORKER_EXTENSIONS.map(ext => 
          path.join(dir, 'dist', 'server', 'workers', `${name}${ext}`)
        )
      )
    );
    
    console.error('Worker file not found. Searched paths:', searchedPaths);
    throw new Error(`Worker file not found for: ${workerPath}`);
  }

  console.log(`[Worker Loader] Loading worker from: ${finalPath}`);

  // Configure worker options
  const workerOptions: WorkerOptions = {
    ...options,
    workerData: {
      ...(options.workerData || {}),
      __filename: finalPath,
      __dirname: path.dirname(finalPath),
      workerPath: finalPath
    },
    // Enable ES modules and source maps
    execArgv: [
      ...(options.execArgv || []),
      ...(isDev ? ['--loader', 'ts-node/esm'] : []),
      '--experimental-loader', 'node:module',
      '--no-warnings'
    ]
  };
  
  console.log(`[Worker Loader] Using worker path: ${finalPath}`);
  console.log(`[Worker Loader] Worker options:`, {
    ...workerOptions,
    workerData: { ...workerOptions.workerData, __filename: 'REDACTED' }
  });

  // Create and configure the worker
  const worker = new Worker(finalPath, workerOptions);

  // Set up error handling
  worker.on('error', (error: Error) => {
    console.error(`[Worker ${workerName}] Error:`, error);
  });

  worker.on('exit', (code: number) => {
    if (code !== 0) {
      console.error(`[Worker ${workerName}] Worker stopped with exit code ${code}`);
    }
  });

  worker.on('message', (message: unknown) => {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[Worker ${workerName}] Message:`, message);
    }
  });

  return worker;
}