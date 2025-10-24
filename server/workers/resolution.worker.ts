/// <reference types="node" />

import { parentPort } from 'worker_threads';
import { connectDB } from '../db.js';
import { ResolutionDirector } from '../directors/resolution.director.js';

if (!parentPort) {
  throw new Error('This file must be run as a worker thread.');
}

const resolutionDirector = new ResolutionDirector();

async function main() {
  await connectDB();
  
  parentPort?.on('message', (message: { type: string; payload: any; }) => {
    switch (message.type) {
        case 'tick':
            resolutionDirector.tick();
            break;
        default:
            console.warn('[ResolutionWorker] Received unknown message type:', message.type);
    }
  });

  console.log('[ResolutionWorker] Worker started and listening for messages.');
}

main().catch(err => {
  console.error('[ResolutionWorker] Failed to start:', err);
});
