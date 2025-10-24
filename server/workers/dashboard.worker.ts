/// <reference types="node" />

import { parentPort } from 'worker_threads';
import connectDB from '../db.js';
import { DashboardAgentDirector } from '../directors/dashboard.director.js';
import { apiKeyProvider } from '../services/apiKey.provider.js';

if (!parentPort) {
  throw new Error('This file must be run as a worker thread.');
}

const dashboardDirector = new DashboardAgentDirector();

async function main() {
  await connectDB();
  
  const emitToMain = (message: any) => {
    parentPort?.postMessage(message);
  };
  
  dashboardDirector.initialize(emitToMain);

  parentPort?.on('message', (message: { type: string; payload: any; }) => {
    if (message.type === 'apiKeyResponse') {
      apiKeyProvider.handleMessage(message);
    } else {
      switch (message.type) {
        case 'tick':
          dashboardDirector.tick();
          break;
        default:
          console.warn('[DashboardWorker] Received unknown message type:', message.type);
      }
    }
  });

  console.log('[DashboardWorker] Worker started and listening for messages.');
}

main().catch(err => {
  console.error('[DashboardWorker] Failed to start:', err);
});