/// <reference types="node" />

import { startServer } from './startup.js';

let serverInstance: { stop: () => Promise<void> } | null = null;

async function main() {
  try {
    serverInstance = await startServer();
    console.log('[Server] Main process started successfully.');
  } catch (error) {
    console.error('[Server] Fatal error during startup:', error);
    process.exit(1);
  }
}

async function gracefulShutdown() {
  console.log('[Server] Received shutdown signal. Cleaning up...');
  if (serverInstance) {
    await serverInstance.stop();
  }
  process.exit(0);
}

// Handle shutdown signals
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

main();
