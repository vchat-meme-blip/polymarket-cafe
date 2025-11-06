
import { Worker, WorkerOptions } from 'node:worker_threads';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createWorker(workerPath: string, options?: WorkerOptions) {
  const isDev = process.env.NODE_ENV !== 'production';
  
  const workerOptions: WorkerOptions = {
    ...options,
    execArgv: isDev ? ['--import', 'tsx'] : [],
  };

  const finalPath = isDev 
    ? path.resolve(__dirname, workerPath.replace('.js', '.ts'))
    : path.resolve(__dirname, workerPath.replace('.ts', '.js'));

  console.log(`[Worker Loader] Starting worker: ${finalPath}`);
  
  const worker = new Worker(finalPath, workerOptions);
  
  worker.on('error', (error) => {
    console.error(`[Worker ${worker.threadId}] Error in ${workerPath}:`, error);
  });
  
  worker.on('exit', (code) => {
    if (code !== 0) {
      console.error(`[Worker ${worker.threadId}] ${workerPath} stopped with exit code ${code}`);
    }
  });
  
  return worker;
}
