/// <reference types="node" />

import { parentPort } from 'worker_threads';
import connectDB from '../db.js';
import { MonitoringDirector } from '../directors/monitoring.director.js';
import { apiKeyProvider } from '../services/apiKey.provider.js';

if (!parentPort) {
  throw new Error('This file must be run as a worker thread.');
}

const monitoringDirector = new MonitoringDirector();

async function main() {
  await connectDB();
  
  const emitToMain = (message: any) => {
    parentPort?.postMessage(message);
  };
  
  monitoringDirector.initialize(emitToMain);

  // We already checked that parentPort is not null at the start of the file
  const port = parentPort!; // Non-null assertion is safe here due to the check above
  
  port.on('message', (message: { type: string; payload: any; }) => {
    if (message.type === 'apiKeyResponse') {
      apiKeyProvider.handleMessage(message);
      return;
    }
    
    switch (message.type) {
      case 'tick':
        monitoringDirector.tick();
        break;
      default:
        console.warn(`[MonitoringWorker] Unknown message type: ${message.type}`);
    }
  });

  console.log('[MonitoringWorker] Worker started and listening for messages.');
}

main().catch(err => {
  console.error('[MonitoringWorker] Failed to start:', err);
});