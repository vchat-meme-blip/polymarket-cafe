
import { Worker, WorkerOptions, MessagePort } from 'node:worker_threads';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

interface WorkerMessage {
  type: string;
  data?: any;
  [key: string]: unknown;
}

interface WorkerWithPort extends Worker {
  postMessage(message: any, transferList?: ReadonlyArray<ArrayBuffer | MessagePort>): void;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Required environment variables for workers
const REQUIRED_ENV_VARS = [
  'MONGODB_URI',
  'NEXTAUTH_SECRET',
  'NEXTAUTH_URL',
  'NODE_ENV'
];

function validateEnvironment() {
  const missingVars = REQUIRED_ENV_VARS.filter(varName => !process.env[varName]);
  if (missingVars.length > 0) {
    console.error('[Worker Loader] Missing required environment variables:', missingVars);
    return false;
  }
  return true;
}

export function createWorker(workerPath: string, options: WorkerOptions = {}): Worker {
  if (!validateEnvironment()) {
    throw new Error('Missing required environment variables for worker');
  }

  const isDev = process.env.NODE_ENV !== 'production';
  const workerName = path.basename(workerPath, path.extname(workerPath));
  
  // Create a clean environment object with filtered and typed environment variables
  const envVars: NodeJS.ProcessEnv = {};
  
  // Add all defined environment variables
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      envVars[key] = value;
    }
  }
  
  // Add worker name
  envVars.WORKER_NAME = workerName;
  
  // Merge with any custom env vars from options
  if (options.env) {
    for (const [key, value] of Object.entries(options.env)) {
      if (value !== undefined) {
        envVars[key] = value;
      }
    }
  }

  const workerOptions: WorkerOptions = {
    ...options,
    env: envVars,
    execArgv: isDev ? ['--import', 'tsx'] : [],
  };

  // Handle both .ts and .js extensions
  let finalPath = '';
  const possibleExtensions = isDev ? ['.ts', '.js'] : ['.js', '.ts'];
  
  for (const ext of possibleExtensions) {
    const testPath = path.resolve(__dirname, workerPath.replace(/\.(js|ts)$/, ext));
    try {
      if (existsSync(testPath)) {
        finalPath = testPath;
        break;
      }
    } catch (e) {
      console.error(`[Worker Loader] Error checking path ${testPath}:`, e);
    }
  }

  if (!finalPath) {
    throw new Error(`Worker file not found: ${workerPath}`);
  }

  console.log(`[Worker Loader] Starting ${workerName} worker from: ${finalPath}`);
  
  try {
    const worker = new Worker(finalPath, workerOptions) as WorkerWithPort;
    
    worker.on('error', (error) => {
      console.error(`[Worker ${worker.threadId}] Error in ${workerName}:`, error);
    });
    
    worker.on('exit', (code) => {
      if (code !== 0) {
        console.error(`[Worker ${worker.threadId}] ${workerName} stopped with exit code ${code}`);
      }
    });
    
    // Add message handler for debugging
    worker.on('message', (message: WorkerMessage) => {
      if (message?.type === 'log') {
        console.log(`[Worker ${worker.threadId}] ${message.data}`);
      }
    });
    
    return worker;
  } catch (error) {
    console.error(`[Worker Loader] Failed to start worker ${workerName}:`, error);
    throw error;
  }
}
