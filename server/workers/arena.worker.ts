/// <reference types="node" />

import { parentPort, workerData, isMainThread } from 'worker_threads';
import path from 'path';
import { fileURLToPath } from 'url';
import connectDB from '../db.js';
import { ArenaDirector } from '../directors/arena.director.js';
import { apiKeyProvider } from '../services/apiKey.provider.js';

// Set worker name for logging
const WORKER_NAME = process.env.WORKER_NAME || 'arena.worker';
const NODE_ENV = process.env.NODE_ENV || 'production';

// Get directory name in ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Enhanced logging function
function log(message: string, data?: any, level: 'log' | 'warn' | 'error' = 'log') {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${WORKER_NAME}] ${message}`;
  const logData = data ? JSON.stringify(data, null, 2) : '';
  
  // Send to parent process if available
  if (parentPort) {
    try {
      parentPort.postMessage({ 
        type: 'log',
        level,
        timestamp,
        message,
        ...(data && { data })
      });
    } catch (error) {
      console.error(`[${WORKER_NAME}] Failed to send log to parent:`, error);
    }
  }
  
  // Log to console with appropriate level
  const logFn = console[level] || console.log;
  logFn(logMessage, logData);
}

// Enhanced error handling
function setupErrorHandlers() {
  // Uncaught exceptions
  process.on('uncaughtException', (error) => {
    log('Uncaught Exception', { 
      error: error.message,
      stack: error.stack,
      name: error.name 
    }, 'error');
    
    // Don't exit immediately to allow for cleanup
    // The process might be in an unstable state, so we should exit after cleanup
    setTimeout(() => process.exit(1), 1000);
  });

  // Unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    const errorInfo = reason instanceof Error 
      ? { message: reason.message, stack: reason.stack, name: reason.name }
      : reason;
      
    log('Unhandled Rejection', {
      reason: errorInfo,
      promise: promise.toString()
    }, 'error');
  });

  // Handle process signals
  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);
}

// Graceful shutdown handler
async function gracefulShutdown(signal: string) {
  log(`Received ${signal}, shutting down gracefully...`);
  
  try {
    // Perform cleanup here
    log('Performing cleanup...');
    // Add any necessary cleanup code
    
    log('Cleanup complete, exiting...');
    process.exit(0);
  } catch (error) {
    log('Error during shutdown', { 
      error: error instanceof Error ? error.message : String(error) 
    }, 'error');
    process.exit(1);
  }
}

// Validate environment
function validateEnvironment() {
  const requiredVars = ['MONGODB_URI', 'NEXTAUTH_SECRET', 'NEXTAUTH_URL'];
  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    log(`Missing required environment variables: ${missingVars.join(', ')}`, {}, 'error');
    return false;
  }
  
  return true;
}

// Main worker function
async function main() {
  log('Worker starting...', { 
    nodeEnv: NODE_ENV,
    workerData,
    pid: process.pid,
    cwd: process.cwd(),
    __dirname,
    __filename
  });

  if (!validateEnvironment()) {
    throw new Error('Missing required environment variables');
  }

  setupErrorHandlers();

  // Initialize director and state variables
  const arenaDirector = new ArenaDirector();
  let systemPaused = false;
  let pauseUntil = 0;

  log('Connecting to database...');
  try {
    await connectDB();
    log('Database connected successfully');
  } catch (error) {
    log('Failed to connect to database:', error);
    process.exit(1);
  }
  
  const emitToMain = (message: any) => {
    parentPort?.postMessage(message);
  };
  
  arenaDirector.initialize(emitToMain);

  parentPort?.on('message', (message: { type: string; payload: any; }) => {
    if (message.type === 'apiKeyResponse') {
      apiKeyProvider.handleMessage(message);
    } else if (message.type === 'systemPause') {
      // Handle system pause
      systemPaused = true;
      pauseUntil = message.payload.until;
      console.log(`[ArenaWorker] System paused until ${new Date(pauseUntil).toISOString()}`);
      
      // Forward to director
      // FIX: Corrected method call to match implementation in ArenaDirector.
      arenaDirector.handleSystemPause(message.payload.until);
    } else if (message.type === 'systemResume') {
      // Handle system resume
      systemPaused = false;
      console.log('[ArenaWorker] System resumed');
      
      // Forward to director
      // FIX: Corrected method call to match implementation in ArenaDirector.
      arenaDirector.handleSystemResume();
    } else {
      // Forward other messages to the director if system is not paused
      if (systemPaused && Date.now() < pauseUntil) {
        console.log(`[ArenaWorker] Ignoring message type '${message.type}' - system paused until ${new Date(pauseUntil).toISOString()}`);
        return;
      }
      
      switch (message.type) {
        case 'tick':
          arenaDirector.tick();
          break;
        case 'reinitialize':
          arenaDirector.initialize(emitToMain);
          break;
        // FIX: Corrected method call to match implementation in ArenaDirector.
        case 'getWorldState':
          arenaDirector.getWorldState();
          break;
        // FIX: Corrected method call to match implementation in ArenaDirector.
        case 'moveAgentToCafe':
          arenaDirector.moveAgentToCafe(message.payload.agentId);
          break;
        // FIX: Corrected method call to match implementation in ArenaDirector.
        case 'recallAgent':
            arenaDirector.recallAgent(message.payload.agentId);
            break;
        // FIX: Corrected method call to match implementation in ArenaDirector.
        case 'createAndHostRoom':
          arenaDirector.createAndHostRoom(message.payload.agentId);
          break;
        // FIX: Corrected method call to match implementation in ArenaDirector.
        case 'registerNewAgent':
          arenaDirector.registerNewAgent(message.payload.agent);
          break;
        // FIX: Corrected method call to match implementation in ArenaDirector.
        case 'roomUpdated':
          arenaDirector.handleRoomUpdate(message.payload.room);
          break;
        // FIX: Corrected method call to match implementation in ArenaDirector.
        case 'roomDeleted':
          arenaDirector.handleRoomDelete(message.payload.roomId);
          break;
        // FIX: Corrected method call to match implementation in ArenaDirector.
        case 'kickAgent':
            arenaDirector.kickAgent(message.payload);
            break;
        default:
          console.warn('[ArenaWorker] Received unknown message type for director:', message.type);
      }
    }
  });

  console.log('[ArenaWorker] Worker started and listening for messages.');
}

// Start the worker
main().catch(error => {
  log('Fatal error in worker:', error);
  process.exit(1);
});

// Handle termination signals
process.on('SIGTERM', () => {
  log('Received SIGTERM. Cleaning up...');
  process.exit(0);
});

process.on('SIGINT', () => {
  log('Received SIGINT. Cleaning up...');
  process.exit(0);
});

log('Worker initialization complete');