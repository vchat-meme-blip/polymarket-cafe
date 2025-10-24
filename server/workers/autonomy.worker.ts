/// <reference types="node" />

import { parentPort } from 'worker_threads';
import { connectDB } from '../db.js';
import { AutonomyDirector } from '../directors/autonomy.director.js';

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

  parentPort.on('message', (message: { type: string; payload: any; }) => {
    switch (message.type) {
      case 'tick':
        autonomyDirector.tick();
        break;
      case 'startResearch':
        autonomyDirector.startResearch(message.payload.agentId);
        break;
      default:
        console.warn('[AutonomyWorker] Received unknown message type:', message.type);
    }
  });

  console.log('[AutonomyWorker] Worker started and listening for messages.');
}

main().catch(err => {
  console.error('[AutonomyWorker] Failed to start:', err);
});