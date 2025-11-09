
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
  console.log(`[Worker Loader] Creating worker from path: ${workerPath}`);
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
  
  // Add worker name and type information
  envVars.WORKER_NAME = workerName;
  envVars.WORKER_TYPE = workerName.toUpperCase();
  envVars.NODE_ENV = process.env.NODE_ENV || 'production';
  
  // Debug log environment variables
  console.log(`[Worker Loader] Environment for ${workerName}:`, {
    NODE_ENV: envVars.NODE_ENV,
    WORKER_NAME: envVars.WORKER_NAME,
    WORKER_TYPE: envVars.WORKER_TYPE,
    MONGODB_URI: envVars.MONGODB_URI ? '***REDACTED***' : 'NOT SET',
    NEXTAUTH_SECRET: envVars.NEXTAUTH_SECRET ? '***REDACTED***' : 'NOT SET',
    NEXTAUTH_URL: envVars.NEXTAUTH_URL || 'NOT SET'
  });
  
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
  
  // First try the exact path
  const exactPath = path.resolve(__dirname, workerPath);
  if (existsSync(exactPath)) {
    finalPath = exactPath;
    console.log(`[Worker Loader] Found worker at exact path: ${exactPath}`);
  } else {
    // Try with different extensions
    for (const ext of possibleExtensions) {
      const testPath = path.resolve(__dirname, workerPath.replace(/\.(js|ts)$/, ext));
      if (existsSync(testPath)) {
        finalPath = testPath;
        console.log(`[Worker Loader] Found worker with extension ${ext}: ${testPath}`);
        break;
      }
    }
  }

  if (!finalPath) {
    const errorMsg = `Worker file not found: ${workerPath}. Tried paths: ${[exactPath, ...possibleExtensions.map(ext => 
      path.resolve(__dirname, workerPath.replace(/\.(js|ts)$/, ext))
    )].join(', ')}`;
    console.error('[Worker Loader]', errorMsg);
    throw new Error(errorMsg);
  }

  console.log(`[Worker Loader] Using worker file: ${finalPath}`);

  console.log(`[Worker Loader] Starting ${workerName} worker from: ${finalPath}`);
  
  try {
    // Log worker options with sensitive data redacted
    const loggableOptions = {
      ...(workerOptions as Record<string, unknown>),
      env: {
        ...(workerOptions.env as Record<string, unknown>),
        MONGODB_URI: '***REDACTED***',
        NEXTAUTH_SECRET: '***REDACTED'
      }
    };
    console.log(`[Worker Loader] Creating worker instance for ${workerName} with options:`, loggableOptions);
    
    const worker = new Worker(finalPath, workerOptions) as WorkerWithPort;
    
    // Add error handling for worker thread creation
    worker.on('error', (error) => {
      console.error(`[Worker ${workerName}] Thread error:`, error);
    });
    
    worker.on('online', () => {
      console.log(`[Worker ${workerName}] Thread is now online`);
    });
    
    worker.on('messageerror', (error) => {
      console.error(`[Worker ${workerName}] Message error:`, error);
    });
    
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
