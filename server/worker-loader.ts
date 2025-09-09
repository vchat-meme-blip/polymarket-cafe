import { Worker, WorkerOptions } from 'node:worker_threads';
import path from 'node:path';
// FIX: Import 'process' to provide correct types for process.platform and resolve TypeScript error.
import process from 'process';

// Get the directory name in an ESM-compatible way
const currentDir = (() => {
  const fileUrl = new URL(import.meta.url).pathname;
  // On Windows, the path might start with a forward slash
  const normalizedPath = process.platform === 'win32' && fileUrl.startsWith('/')
    ? fileUrl.slice(1)
    : fileUrl;
  return path.dirname(normalizedPath);
})();

// For compatibility with code that expects __dirname
const __dirname = currentDir;

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