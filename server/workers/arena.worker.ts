/// <reference types="node" />

import { parentPort, workerData } from 'worker_threads';
import connectDB from '../db.js';
import { ArenaDirector } from '../directors/arena.director.js';
import { apiKeyProvider } from '../services/apiKey.provider.js';

// Set worker name for logging
const WORKER_NAME = process.env.WORKER_NAME || 'arena.worker';

// Global error handler
process.on('uncaughtException', (error) => {
  console.error(`[${WORKER_NAME}] Uncaught Exception:`, error);
  // Don't exit on uncaught exceptions to allow for cleanup
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(`[${WORKER_NAME}] Unhandled Rejection at:`, promise, 'reason:', reason);
});

// Helper function to send logs to parent
function log(message: string, data?: any) {
  if (parentPort) {
    parentPort.postMessage({ 
      type: 'log', 
      data: `[${WORKER_NAME}] ${message}`,
      timestamp: new Date().toISOString(),
      ...(data && { details: data })
    });
  }
  console.log(`[${WORKER_NAME}] ${message}`, data || '');
}

log('Worker starting...', { 
  nodeEnv: process.env.NODE_ENV,
  workerData: workerData 
});

// System pause state
let systemPaused = false;
let pauseUntil = 0;

if (!parentPort) {
  throw new Error('This file must be run as a worker thread.');
}

const arenaDirector = new ArenaDirector();

async function main() {
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