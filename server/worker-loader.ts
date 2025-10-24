import { Worker, WorkerOptions } from 'node:worker_threads';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
    finalPath = !workerPath.endsWith('.ts') && !workerPath.endsWith('.js')
      ? `${resolvedPath}.ts`
      : resolvedPath;
  } else {
    // In production, handle Docker environment
    const basePath = isDocker ? '/app/dist' : path.resolve(__dirname, '..');
    const workerName = path.basename(workerPath, '.worker');
    
    // First, try to find the worker file in the filesystem
    const fs = require('fs');
    
    // Function to find a file in a directory with any extension
    const findFile = (dir: string, baseName: string): string | null => {
      try {
        const files = fs.readdirSync(dir);
        const found = files.find((file: string) => {
          const name = path.basename(file, path.extname(file));
          return name === baseName || name === `${baseName}.worker`;
        });
        return found || null;
      } catch (e) {
        return null;
      }
    };
    
    // Check possible directories
    const workersDir = path.join(basePath, 'workers');
    const serverWorkersDir = path.join(basePath, 'server', 'workers');
    
    // Try to find the worker file
    let workerFile = findFile(workersDir, workerName) || 
                    findFile(serverWorkersDir, workerName);
    
    let foundPath: string | null = null;
    
    if (workerFile) {
      // If found in workers directory
      const workersPath = path.join(workersDir, workerFile);
      const serverWorkersPath = path.join(serverWorkersDir, workerFile);
      
      if (fs.existsSync(workersPath)) {
        foundPath = workersPath;
      } 
      // If found in server/workers directory
      else if (fs.existsSync(serverWorkersPath)) {
        foundPath = serverWorkersPath;
      }
    }
    
    // If not found, fall back to default paths
    const possiblePaths = [
      path.join(basePath, 'workers', `${workerName}.worker.mjs`),
      path.join(basePath, 'workers', `${workerName}.mjs`),
      path.join(basePath, 'workers', `${workerName}.worker.js`),
      path.join(basePath, 'workers', `${workerName}.js`),
      path.join(basePath, 'server', 'workers', `${workerName}.worker.mjs`),
      path.join(basePath, 'server', 'workers', `${workerName}.mjs`),
      path.join(basePath, 'server', 'workers', `${workerName}.worker.js`),
      path.join(basePath, 'server', 'workers', `${workerName}.js`)
    ];
    
    // Try to find an existing path
    const existingPath = possiblePaths.find((p: string) => {
      try {
        require.resolve(p);
        return true;
      } catch {
        return false;
      }
    });
    
    // Use the found path or the first possible path as a fallback
    finalPath = foundPath || existingPath || possiblePaths[0];
    
    console.log('[Worker Loader] Using worker path:', finalPath);
    console.log('[Worker Loader] Worker name:', workerName);
    console.log('[Worker Loader] Base path:', basePath);
    console.log('[Worker Loader] Workers dir exists:', fs.existsSync(workersDir));
    console.log('[Worker Loader] Server workers dir exists:', fs.existsSync(serverWorkersDir));
    
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