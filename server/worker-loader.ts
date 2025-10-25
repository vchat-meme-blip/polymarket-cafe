import { Worker, WorkerOptions } from 'node:worker_threads';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs'; // FIX: Import fs for fs.existsSync

// Get the directory name in an ESM-compatible way
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createWorker(workerPath: string, options?: WorkerOptions) {
  const isDev = process.env.NODE_ENV !== 'production';
  const isDocker = process.env.DOCKER_ENV === 'true';
  
  const workerOptions: WorkerOptions = {
    ...options,
    workerData: {
      ...(options?.workerData || {})
    },
    execArgv: [
      ...(options?.execArgv || []),
      ...(isDev ? ['--loader', 'ts-node/esm'] : [])
    ]
  };

  let finalPath: string;
  
  if (isDev) {
    // In development, use the TypeScript files directly from the server/workers directory
    const workerName = path.basename(workerPath, '.worker');
    finalPath = path.resolve(__dirname, 'workers', `${workerName}.worker.ts`);
    
    if (!fs.existsSync(finalPath)) {
      throw new Error(`Worker file not found: ${finalPath}`);
    }
  } else {
    // In production, look in the correct dist directory
    const basePath = isDocker ? '/app/dist' : path.resolve(__dirname, '..');
    const workerName = path.basename(workerPath, '.worker');
    
    // Try these paths in order
    const possiblePaths = [
      // First try the direct path if it was specified with extension
      path.resolve(basePath, workerPath),
      // Then try standard locations
      path.join(basePath, 'server', 'workers', `${workerName}.worker.js`),
      path.join(basePath, 'dist', 'server', 'workers', `${workerName}.worker.js`),
      path.join(basePath, 'dist', 'workers', `${workerName}.worker.js`),
      // Also try without .worker in the filename
      path.join(basePath, 'server', 'workers', `${workerName}.js`),
      path.join(basePath, 'dist', 'server', 'workers', `${workerName}.js`),
      path.join(basePath, 'dist', 'workers', `${workerName}.js`)
    ];
    
    // Find the first path that exists
    const foundPath = possiblePaths.find(p => fs.existsSync(p));
    
    if (!foundPath) {
      console.error('Worker file not found. Tried paths:', possiblePaths);
      throw new Error(`Worker file not found for: ${workerName}`);
    }
    
    finalPath = foundPath;
    
    console.log('[Worker Loader] Looking for worker in paths:', possiblePaths);
    
    // Find the first existing path
    const existingPath = possiblePaths.find(p => {
      try {
        // FIX: Replaced require.resolve with fs.existsSync for ESM compatibility.
        return fs.existsSync(p);
      } catch {
        return false;
      }
    });
    
    if (!existingPath) {
      throw new Error(`Worker file not found. Tried: ${possiblePaths.join(', ')}`);
    }
    
    finalPath = existingPath;
  }

  console.log(`[Worker Loader] Starting worker at: ${finalPath}`);
  
  try {
    const worker = new Worker(finalPath, workerOptions);
    
    worker.on('error', (error) => {
      console.error(`[Worker ${worker.threadId}] Error:`, error);
    });
    
    worker.on('exit', (code) => {
      if (code !== 0) {
        console.error(`[Worker ${worker.threadId}] stopped with exit code ${code}`);
      }
    });
    
    return worker;
  } catch (error) {
    console.error(`[Worker Loader] Failed to start worker at ${finalPath}:`, error);
    throw error;
  }
}