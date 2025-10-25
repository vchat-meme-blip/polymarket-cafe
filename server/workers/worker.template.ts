// Worker Template
// This is a template for creating new worker threads
// Save as [worker-name].worker.ts in the workers directory

import { parentPort, workerData, isMainThread } from 'worker_threads';
import { fileURLToPath } from 'url';
import path from 'path';

// Handle ESM module resolution
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Worker configuration
const config = {
  workerName: workerData?.workerName || 'unknown',
  isProduction: workerData?.isProduction || false,
  debug: !workerData?.isProduction
};

// Log helper with worker name prefix
function log(message: string, ...args: any[]) {
  if (config.debug) {
    console.log(`[Worker ${config.workerName}] ${message}`, ...args);
  }
}

// Error handler
function handleError(error: Error) {
  console.error(`[Worker ${config.workerName}] Error:`, error);
  
  // Notify parent about the error
  if (parentPort) {
    parentPort.postMessage({
      type: 'error',
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name
      }
    });
  }
  
  // In production, we might want to restart the worker on unhandled errors
  if (config.isProduction) {
    process.exit(1);
  }
}

// Handle messages from parent
function setupMessageHandler() {
  if (!parentPort) {
    log('No parentPort available');
    return;
  }

  parentPort.on('message', async (message) => {
    try {
      log('Received message:', message);
      
      // Handle specific message types
      if (message.type === 'ping') {
        parentPort?.postMessage({ type: 'pong', timestamp: Date.now() });
      }
      // Add more message handlers as needed
      
    } catch (error) {
      handleError(error as Error);
    }
  });

  // Notify parent that worker is ready
  parentPort.postMessage({ type: 'ready', workerName: config.workerName });
}

// Main worker initialization
async function init() {
  if (isMainThread) {
    console.error('This script must be run as a worker thread');
    process.exit(1);
  }

  log('Initializing worker...');
  
  // Set up error handlers
  process.on('uncaughtException', handleError);
  process.on('unhandledRejection', (reason) => {
    handleError(new Error(`Unhandled rejection: ${reason}`));
  });

  // Set up message handler
  setupMessageHandler();

  // Your worker's main logic goes here
  log('Worker initialized and ready');
  
  // Example of periodic task
  const interval = setInterval(() => {
    if (parentPort) {
      parentPort.postMessage({
        type: 'status',
        data: { uptime: process.uptime(), memory: process.memoryUsage() }
      });
    }
  }, 30000);

  // Clean up on exit
  const cleanup = () => {
    clearInterval(interval);
    log('Worker cleaning up...');
    // Add any cleanup logic here
    process.exit(0);
  };

  process.on('SIGTERM', cleanup);
  process.on('SIGINT', cleanup);
}

// Start the worker
init().catch(handleError);
