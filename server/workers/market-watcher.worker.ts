/// <reference types="node" />

import { parentPort } from 'worker_threads';
import connectDB from '../db.js';
import { MarketWatcherDirector } from '../directors/market-watcher.director.js';

if (!parentPort) {
  throw new Error('This file must be run as a worker thread.');
}

const marketWatcherDirector = new MarketWatcherDirector();

async function main() {
  await connectDB();
  
  parentPort?.on('message', (message: { type: string; payload: any; }) => {
    switch (message.type) {
        case 'tick':
            marketWatcherDirector.tick();
            break;
        default:
            console.warn('[MarketWatcherWorker] Received unknown message type:', message.type);
    }
  });

  console.log('[MarketWatcherWorker] Worker started and listening for messages.');
}

main().catch(err => {
  console.error('[MarketWatcherWorker] Failed to start:', err);
});