/// <reference types="node" />

import { parentPort } from 'worker_threads';
import connectDB from '../db.js';
import { AutonomyDirector } from '../directors/autonomy.director.js';
import { apiKeyProvider } from '../services/apiKey.provider.js';

if (!parentPort) {
  throw new Error('This file must be run as a worker thread.');
}

const autonomyDirector = new AutonomyDirector();
let systemPaused = false;
let pauseUntil = 0;

async function main() {
  await connectDB();
  
  const emitToMain = (message: any) => {
    parentPort?.postMessage(message);
  };
  
  autonomyDirector.initialize(emitToMain);

  // Add null check before using parentPort
  if (parentPort) {
    parentPort.on('message', (message: { type: string; payload: any; }) => {
      if (message.type === 'apiKeyResponse') {
        apiKeyProvider.handleMessage(message);
        return;
      }
      if (message.type === 'systemPause') {
        systemPaused = true;
        pauseUntil = message.payload.until;
        autonomyDirector.handleSystemPause(pauseUntil);
        return;
      }
      if (message.type === 'systemResume') {
          systemPaused = false;
          autonomyDirector.handleSystemResume();
          return;
      }

      if (systemPaused && Date.now() < pauseUntil) {
          console.log(`[AutonomyWorker] Ignoring message type '${message.type}' - system paused.`);
          return;
      }

      switch (message.type) {
        case 'tick':
          autonomyDirector.tick();
          break;
        // FIX: Corrected method call to match the implementation in AutonomyDirector.
        case 'startResearch':
          autonomyDirector.startResearch(message.payload.agentId);
          break;
        default:
          console.warn(`[AutonomyWorker] Unknown message type: ${message.type}`);
      }
    });
  }
}

main().catch(err => {
  console.error('[AutonomyWorker] Failed to start:', err);
});
