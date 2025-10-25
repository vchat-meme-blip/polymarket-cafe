import { Worker, WorkerOptions } from 'node:worker_threads';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Get the directory name in an ESM-compatible way
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createWorker(workerPath: string, options?: WorkerOptions) {
  // In development, use ts-node to run TypeScript files directly
  const isDev = process.env.NODE_ENV !== 'production';
  
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

  // Resolve the worker path relative to the current file
  const resolvedPath = path.resolve(__dirname, workerPath);
  
  // Add .ts extension if not present and in development
  const finalPath = isDev && !workerPath.endsWith('.ts') && !workerPath.endsWith('.js')
    ? `${resolvedPath}.ts`
    : resolvedPath;

  return new Worker(finalPath, workerOptions);
}