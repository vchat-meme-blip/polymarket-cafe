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
    const basePath = isDocker ? '/app/dist/server' : path.resolve(__dirname, '..');
    const workerName = path.basename(workerPath, '.worker');
    finalPath = path.join(basePath, 'workers', `${workerName}.worker.js`);
  }

  console.log(`[Worker Loader] Starting worker at: ${finalPath}`);
}