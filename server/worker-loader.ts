import { Worker, WorkerOptions, isMainThread, parentPort, workerData } from 'node:worker_threads';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Get the directory name in an ESM-compatible way
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Inline worker code as a fallback
const workerTemplates: Record<string, string> = {
  'market-watcher.worker': `
    const { parentPort, workerData } = require('node:worker_threads');
    // Market watcher worker logic here
    console.log('Market watcher worker started');
    parentPort?.on('message', (msg) => {
      console.log('Worker received:', msg);
      parentPort?.postMessage({ type: 'pong', data: 'Market data updated' });
    });
  `,
  'autonomy.worker': `
    const { parentPort, workerData } = require('node:worker_threads');
    // Autonomy worker logic here
    console.log('Autonomy worker started');
    parentPort?.on('message', (msg) => {
      console.log('Worker received:', msg);
      parentPort?.postMessage({ type: 'pong', data: 'Autonomy task completed' });
    });
  `,
  'dashboard.worker': `
    const { parentPort, workerData } = require('node:worker_threads');
    // Dashboard worker logic here
    console.log('Dashboard worker started');
    parentPort?.on('message', (msg) => {
      console.log('Worker received:', msg);
      parentPort?.postMessage({ type: 'pong', data: 'Dashboard updated' });
    });
  `,
  'arena.worker': `
    const { parentPort, workerData } = require('node:worker_threads');
    // Arena worker logic here
    console.log('Arena worker started');
    parentPort?.on('message', (msg) => {
      console.log('Worker received:', msg);
      parentPort?.postMessage({ type: 'pong', data: 'Arena match updated' });
    });
  `,
  'resolution.worker': `
    const { parentPort, workerData } = require('node:worker_threads');
    // Resolution worker logic here
    console.log('Resolution worker started');
    parentPort?.on('message', (msg) => {
      console.log('Worker received:', msg);
      parentPort?.postMessage({ type: 'pong', data: 'Resolution processed' });
    });
  `
};

export function createWorker(workerPath: string, options: WorkerOptions = {}) {
  const isDev = process.env.NODE_ENV !== 'production';
  const workerName = path.basename(workerPath, path.extname(workerPath));
  
  // Default worker options
  const workerOptions: WorkerOptions = {
    ...options,
    workerData: {
      ...(options.workerData || {}),
      __workerName: workerName
    },
    execArgv: [
      ...(options.execArgv || []),
      ...(isDev ? ['--loader', 'ts-node/esm'] : [])
    ]
  };

  // Try to load the worker file
  const loadWorker = () => {
    try {
      // Try to resolve the worker file
      const resolvedPath = require.resolve(workerPath, { paths: [process.cwd(), __dirname] });
      console.log(`[Worker Loader] Found worker at: ${resolvedPath}`);
      return new Worker(resolvedPath, workerOptions);
    } catch (error) {
      console.warn(`[Worker Loader] Could not load worker file ${workerPath}:`, error.message);
      return null;
    }
  };

  // Try to use inline worker as a fallback
  const createInlineWorker = () => {
    const inlineCode = workerTemplates[workerName] || workerTemplates[`${workerName}.worker`];
    
    if (inlineCode) {
      console.log(`[Worker Loader] Using inline worker for ${workerName}`);
      return new Worker(inlineCode, {
        ...workerOptions,
        eval: true
      });
    }
    
    return null;
  };

  // Try to load the worker file first
  let worker = loadWorker();
  
  // If that fails, try the inline worker
  if (!worker) {
    worker = createInlineWorker();
  }

  // If we still don't have a worker, try one more time with common paths
  if (!worker) {
    console.warn('[Worker Loader] Could not find worker, trying common paths...');
    const commonPaths = [
      `./dist/workers/${workerName}.js`,
      `./dist/server/workers/${workerName}.js`,
      `./workers/${workerName}.js`,
      `./server/workers/${workerName}.js`,
      `/app/dist/workers/${workerName}.js`,
      `/app/dist/server/workers/${workerName}.js`,
      `/app/workers/${workerName}.js`
    ];

    for (const path of commonPaths) {
      try {
        worker = new Worker(path, workerOptions);
        console.log(`[Worker Loader] Successfully loaded worker from ${path}`);
        break;
      } catch (e) {
        console.warn(`[Worker Loader] Failed to load worker from ${path}:`, e.message);
      }
    }
  }

  // If we still don't have a worker, create a dummy one that logs errors
  if (!worker) {
    console.error(`[Worker Loader] Could not load worker ${workerName}, creating dummy worker`);
    worker = new Worker(
      `const { parentPort } = require('worker_threads');
      console.error('Dummy worker created for ${workerName}');
      parentPort?.on('message', (msg) => {
        console.error('Dummy worker received message:', msg);
        parentPort?.postMessage({ error: 'Worker not properly initialized', name: '${workerName}' });
      });`,
      { ...workerOptions, eval: true }
    );
  }

  // Add error and exit handlers
  worker.on('error', (error) => {
    console.error(`[Worker ${workerName}] Error:`, error);
  });

  worker.on('exit', (code) => {
    if (code !== 0) {
      console.error(`[Worker ${workerName}] exited with code ${code}`);
      // Optionally restart the worker
      // worker = createWorker(workerPath, options);
    }
  });

  return worker;
}

// If this file is run directly, it means it's being used as a worker
if (!isMainThread) {
  const workerName = workerData?.__workerName || 'unknown';
  console.log(`[Worker ${workerName}] Started`);
  
  // Handle messages from the main thread
  if (parentPort) {
    parentPort.on('message', (message) => {
      console.log(`[Worker ${workerName}] Received message:`, message);
      // Echo the message back as a simple response
      parentPort?.postMessage({ 
        type: 'pong', 
        worker: workerName,
        data: `Hello from ${workerName} worker`,
        timestamp: new Date().toISOString()
      });
    });
  }
}