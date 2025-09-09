import { parentPort } from 'worker_threads';
import { connectDB } from '../db.js';
import { AutonomyDirector } from '../directors/autonomy.director.js';
// FIX: Import 'process' to provide correct types for process.exit and fix related errors.
import process from 'process';

if (!parentPort) {
  throw new Error('This file must be run as a worker thread.');
}

const autonomyDirector = new AutonomyDirector();

async function main() {
  await connectDB();
  
  const emitToMain = (message: any) => {
    parentPort?.postMessage(message);
  };
  
  autonomyDirector.initialize(emitToMain);

  parentPort?.on('message', (message) => {
    if (message.type === 'tick') {
      autonomyDirector.tick();
    } else {
        console.warn('[AutonomyWorker] Received unknown message type:', message.type);
    }
  });

  console.log('[AutonomyWorker] Worker started and listening for messages.');
}

main().catch(err => {
  console.error('[AutonomyWorker] Failed to start:', err);
  process.exit(1);
});