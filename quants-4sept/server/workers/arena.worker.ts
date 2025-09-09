import { parentPort } from 'worker_threads';
import { connectDB } from '../db.js';
import { ArenaDirector } from '../directors/arena.director.js';
// FIX: Import 'process' to provide correct types for process.exit and fix related errors.
import process from 'process';

if (!parentPort) {
  throw new Error('This file must be run as a worker thread.');
}

const arenaDirector = new ArenaDirector();

async function main() {
  await connectDB();
  
  const emitToMain = (message: any) => {
    parentPort?.postMessage(message);
  };
  
  arenaDirector.initialize(emitToMain);

  parentPort?.on('message', (message) => {
    switch (message.type) {
      case 'tick':
        arenaDirector.tick();
        break;
      case 'moveAgentToCafe':
        arenaDirector.moveAgentToCafe(message.payload.agentId);
        break;
      case 'createAndHostRoom':
        arenaDirector.createAndHostRoom(message.payload.agentId);
        break;
      case 'registerNewAgent':
        arenaDirector.registerNewAgent(message.payload.agent);
        break;
      default:
        console.warn('[ArenaWorker] Received unknown message type:', message.type);
    }
  });

  console.log('[ArenaWorker] Worker started and listening for messages.');
}

main().catch(err => {
  console.error('[ArenaWorker] Failed to start:', err);
  process.exit(1);
});