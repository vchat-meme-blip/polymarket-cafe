import { parentPort } from 'worker_threads';
import { connectDB } from '../db.js';
import { AutonomyDirector } from '../directors/autonomy.director.js';
import { apiKeyProvider } from '../services/apiKey.provider.js';

// System pause state
let systemPaused = false;
let pauseUntil = 0;

const autonomyDirector = new AutonomyDirector();

if (!parentPort) {
  throw new Error('This file must be run as a worker thread.');
}

async function main() {
  await connectDB();
  
    const emitToMain = (message: any) => {
    parentPort?.postMessage(message);
  };

  autonomyDirector.initialize(emitToMain);
  
    parentPort?.on('message', (message: { type: string; payload: any; }) => {
    if (message.type === 'apiKeyResponse') {
      apiKeyProvider.handleMessage(message);
    } else if (message.type === 'systemPause') {
      // Handle system pause
      systemPaused = true;
      pauseUntil = message.payload.until;
      console.log(`[AutonomyWorker] System paused until ${new Date(pauseUntil).toISOString()}`);
    } else if (message.type === 'systemResume') {
      // Handle system resume
      systemPaused = false;
      console.log('[AutonomyWorker] System resumed');
    } else if (message.type === 'researchForAgent') {
      autonomyDirector.researchForAgent(message.payload.agentId);
    } else if (message.type === 'tick') {
      // Only process tick if system is not paused
      if (systemPaused && Date.now() < pauseUntil) {
        console.log(`[AutonomyWorker] Ignoring tick - system paused until ${new Date(pauseUntil).toISOString()}`);
        return;
      }
      autonomyDirector.tick();
    } else {
      console.warn('[AutonomyWorker] Received unknown message type for director:', message.type);
    }
  });

  console.log('[AutonomyWorker] Worker started and listening for messages.');
}

main().catch(err => {
  console.error('[AutonomyWorker] Failed to start:', err);
  // FIX: Removed explicit `import process from 'process'` to resolve type conflicts. This allows TypeScript to correctly use the global Node.js `process` object type, which includes the `exit` method and fixes the runtime error.
  process.exit(1);
});