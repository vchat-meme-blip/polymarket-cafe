/// <reference types="node" />

import { parentPort } from 'worker_threads';
import connectDB from '../db.js';
import { ArenaDirector } from '../directors/arena.director.js';
import { apiKeyProvider } from '../services/apiKey.provider.js';

// System pause state
let systemPaused = false;
let pauseUntil = 0;

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

  parentPort?.on('message', (message: { type: string; payload: any; }) => {
    if (message.type === 'apiKeyResponse') {
      apiKeyProvider.handleMessage(message);
    } else if (message.type === 'systemPause') {
      // Handle system pause
      systemPaused = true;
      pauseUntil = message.payload.until;
      console.log(`[ArenaWorker] System paused until ${new Date(pauseUntil).toISOString()}`);
      
      // Forward to director
      arenaDirector.handleSystemPause(message.payload.until);
    } else if (message.type === 'systemResume') {
      // Handle system resume
      systemPaused = false;
      console.log('[ArenaWorker] System resumed');
      
      // Forward to director
      arenaDirector.handleSystemResume();
    } else {
      // Forward other messages to the director if system is not paused
      if (systemPaused && Date.now() < pauseUntil) {
        console.log(`[ArenaWorker] Ignoring message type '${message.type}' - system paused until ${new Date(pauseUntil).toISOString()}`);
        return;
      }
      
      switch (message.type) {
        case 'tick':
          arenaDirector.tick();
          break;
        case 'reinitialize':
          arenaDirector.initialize(emitToMain);
          break;
        case 'getWorldState':
          arenaDirector.getWorldState();
          break;
        case 'moveAgentToCafe':
          arenaDirector.moveAgentToCafe(message.payload.agentId);
          break;
        case 'recallAgent':
            arenaDirector.recallAgent(message.payload.agentId);
            break;
        case 'createAndHostRoom':
          arenaDirector.createAndHostRoom(message.payload.agentId);
          break;
        case 'registerNewAgent':
          arenaDirector.registerNewAgent(message.payload.agent);
          break;
        case 'roomUpdated':
          arenaDirector.handleRoomUpdate(message.payload.room);
          break;
        case 'roomDeleted':
          arenaDirector.handleRoomDelete(message.payload.roomId);
          break;
        case 'kickAgent':
            arenaDirector.kickAgent(message.payload);
            break;
        default:
          console.warn('[ArenaWorker] Received unknown message type for director:', message.type);
      }
    }
  });

  console.log('[ArenaWorker] Worker started and listening for messages.');
}

main().catch(err => {
  console.error('[ArenaWorker] Failed to start:', err);
});