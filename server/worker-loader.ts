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
    // In development, use the TypeScript files directly
    const resolvedPath = path.resolve(__dirname, workerPath);
    finalPath = !workerPath.endsWith('.ts') && !workerPath.endsWith('.js') && !workerPath.endsWith('.mjs')
      ? `${resolvedPath}.ts`
      : resolvedPath;
  } else {
    // In production, handle different possible paths
    const workerName = path.basename(workerPath, '.worker.ts');
    const possiblePaths = [
      // Try with .mjs extension first (ES Modules)
      path.resolve(process.cwd(), 'dist', 'server', 'server', 'workers', `${workerName}.worker.mjs`),
      path.resolve(process.cwd(), 'dist', 'server', 'server', 'workers', `${workerName}.js`),
      // Fallback to .js extension
      path.resolve(process.cwd(), 'dist', 'server', 'server', 'workers', `${workerName}.worker.js`),
      // Docker paths
      path.resolve('/app/dist/server/server/workers', `${workerName}.worker.mjs`),
      path.resolve('/app/dist/server/server/workers', `${workerName}.js`),
    ];

    // Find the first path that exists
    const existingPath = possiblePaths.find(p => fs.existsSync(p));
    
    if (!existingPath) {
      throw new Error(`Worker file not found. Tried:\n${possiblePaths.join('\n')}\nCurrent directory: ${process.cwd()}`);
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