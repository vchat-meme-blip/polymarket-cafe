/// <reference types="node" />

// FIX: Explicitly import Request, Response, and NextFunction to resolve type errors
// with module augmentation and middleware signatures.
import express, { Request, Response, NextFunction } from 'express';
import { Worker as NodeWorker } from 'worker_threads';
import { createWorker } from './worker-loader.js';

// FIX: Replaced global augmentation with module augmentation for 'express-serve-static-core'.
// This is the recommended way to augment Express's Request object and resolves all
// related type errors for req properties, app.use(), app.get(), and res.sendFile().
// The global augmentation is now in `src/vite-env.d.ts` and should be picked up.

import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import * as fs from 'fs';

import apiRouter from './routes/api.js';
import { usersCollection, agentsCollection } from './db.js';
import { ApiKeyManager } from './services/apiKey.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: "*", // Be more restrictive in production
    methods: ["GET", "POST"]
  }
});

let arenaWorker: NodeWorker;
let resolutionWorker: NodeWorker;
let dashboardWorker: NodeWorker;
let autonomyWorker: NodeWorker;
let marketWatcherWorker: NodeWorker;
const apiKeyManager = new ApiKeyManager();

function setupWorkers() {
  try {
    console.log('[Server] Initializing workers...');
    
    // Worker configurations
    const workerConfigs = [
      { name: 'arena', file: 'arena.worker' },
      { name: 'resolution', file: 'resolution.worker' },
      { name: 'dashboard', file: 'dashboard.worker' },
      { name: 'autonomy', file: 'autonomy.worker' },
      { name: 'marketWatcher', file: 'market-watcher.worker' }
    ];
    
    // Create all workers
    const workers = new Map<string, NodeWorker>();
    
    for (const { name, file } of workerConfigs) {
      try {
        // In production, look for .mjs files, in development use .ts
        const workerPath = process.env.NODE_ENV === 'production' 
          ? `./dist/server/workers/${file}.mjs`
          : `./workers/${file}.ts`;
          
        console.log(`[Server] Creating worker: ${name} from ${workerPath}`);
        
        const worker = createWorker(workerPath, {
          workerData: {
            workerName: name,
            isProduction: process.env.NODE_ENV === 'production'
          }
        });
        
        workers.set(name, worker);
        
        // Set up event handlers for each worker
        worker.on('online', () => {
          console.log(`[Worker ${name}] Started successfully`);
          
          // Notify worker it's ready
          worker.postMessage({ type: 'workerReady' });
        });
        
        worker.on('error', (error: Error) => {
          console.error(`[Worker ${name}] Error:`, error);
        });
        
        worker.on('exit', (code: number) => {
          if (code !== 0) {
            console.error(`[Worker ${name}] Stopped with exit code ${code}`);
            // Consider restarting the worker after a delay
            setTimeout(() => {
              console.log(`[Worker ${name}] Attempting to restart...`);
              setupWorkers();
            }, 5000);
          }
        });
        
        // Set up message handlers for each worker
        worker.on('message', (message: any) => {
          if (!message || typeof message !== 'object') return;
          
          // Handle socket.io message forwarding
          if (message.type === 'socketEmit') {
            if (message.room) {
              io.to(message.room).emit(message.event, message.payload);
            } else {
              io.emit(message.event, message.payload);
            }
          }
          // Handle worker-to-worker communication
          else if (message.type === 'forwardToWorker') {
            const targetWorker = workers.get(message.worker);
            if (targetWorker) {
              targetWorker.postMessage(message.message);
            } else {
              console.warn(`[Server] Received forward request for unknown worker: ${message.worker}`);
            }
          }
          // Handle API key management
          else if (message.type === 'requestApiKey') {
            const key = apiKeyManager.getKey();
            worker.postMessage({
              type: 'apiKeyResponse',
              payload: {
                key,
                requestId: message.payload?.requestId,
                agentId: message.payload?.agentId,
                allKeysOnCooldown: key === null && apiKeyManager.areAllKeysOnCooldown()
              }
            });
          }
          // Handle rate limit reporting
          else if (message.type === 'reportRateLimit') {
            if (message.payload?.key) {
              apiKeyManager.reportRateLimit(
                message.payload.key, 
                message.payload.durationSeconds || 60
              );
            }
          }
          // Handle cooldown status checks
          else if (message.type === 'checkAllKeysCooldown') {
            worker.postMessage({
              type: 'allKeysCooldownResponse',
              payload: {
                requestId: message.payload?.requestId,
                allKeysOnCooldown: apiKeyManager.areAllKeysOnCooldown()
              }
            });
          }
        });
      } catch (error) {
        console.error(`[Worker ${name}] Failed to initialize:`, error);
        // Don't throw here, try to continue with other workers
      }
    }
    
    // Assign to module-level variables
    arenaWorker = workers.get('arena')!;
    resolutionWorker = workers.get('resolution')!;
    dashboardWorker = workers.get('dashboard')!;
    autonomyWorker = workers.get('autonomy')!;
    marketWatcherWorker = workers.get('marketWatcher')!;
    
    // Verify all workers were created
    const missingWorkers = workerConfigs
      .filter(({ name }) => !workers.has(name))
      .map(({ name }) => name);
      
    if (missingWorkers.length > 0) {
      console.error(`[Server] Failed to initialize workers: ${missingWorkers.join(', ')}`);
      if (process.env.NODE_ENV === 'production') {
        // In production, exit if critical workers are missing
        const criticalWorkers = ['arena', 'dashboard'];
        if (criticalWorkers.some(worker => missingWorkers.includes(worker))) {
          process.exit(1);
        }
      }
    }
    
    console.log('[Server] Worker initialization complete');
  } catch (error) {
    console.error('[Server] Fatal error initializing workers:', error);
    process.exit(1);
  }
}

// FIX: Use explicitly imported Request, Response, and NextFunction types.
const attachWorkers = (req: Request, res: Response, next: NextFunction) => {
  req.arenaWorker = arenaWorker;
  req.resolutionWorker = resolutionWorker;
  req.dashboardWorker = dashboardWorker;
  req.autonomyWorker = autonomyWorker;
  req.marketWatcherWorker = marketWatcherWorker;
  next();
};

export async function startServer() {
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  setupWorkers();

  app.use(attachWorkers);
  app.use('/api', apiRouter);

  // Serve static files in production
  if (process.env.NODE_ENV === 'production') {
    // Possible client paths in order of preference
    const possibleClientPaths = [
      path.join(__dirname, '..', 'client'),          // /dist/server/../client
      path.join(__dirname, '..', '..', 'client'),    // /dist/server/../../client
      path.join(process.cwd(), 'dist', 'client'),    // /app/dist/client
      path.join(process.cwd(), 'client')             // /app/client
    ];
    
    // Find the first existing client directory
    let clientPath = '';
    for (const clientPathOption of possibleClientPaths) {
      try {
        if (fs.existsSync(clientPathOption) && fs.statSync(clientPathOption).isDirectory()) {
          clientPath = clientPathOption;
          console.log(`[Server] Serving client files from: ${clientPath}`);
          break;
        }
      } catch (err) {
        console.warn(`[Server] Error checking client path ${clientPathOption}:`, err);
      }
    }
    
    if (!clientPath) {
      console.error('[Server] Could not find client directory');
    } else {
      // Serve static files from the client directory
      app.use(express.static(clientPath));
      
      // Serve index.html for all other routes (client-side routing)
      app.get('*', (req: Request, res: Response) => {
        const indexPath = path.join(clientPath, 'index.html');
        if (fs.existsSync(indexPath)) {
          res.sendFile(indexPath);
        } else {
          res.status(404).send('Client files not found');
        }
      });
    }
  }

  io.on('connection', async (socket) => {
    console.log(`[Server] A user connected via socket.`);
    socket.on('authenticate', async (handle) => {
      const user = await usersCollection.findOne({ handle });
      if (user) {
        socket.join(handle);
        console.log(`[Socket] User ${handle} authenticated and joined their room.`);
      }
    });
    socket.on('disconnect', () => {
      console.log(`[Server] User disconnected.`);
    });
  });
  
  const PORT = process.env.PORT || 3001;
  const HOST = process.env.HOST || '0.0.0.0';
  server.listen(Number(PORT), HOST, async () => {
    console.log(`[Server] Server listening on http://${HOST}:${PORT}`);
    console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`[Server] Database: ${process.env.MONGODB_URI ? 'Configured' : 'Not Configured'}`);

    try {
        const { PRESET_AGENTS } = await import('../lib/presets/agents.js');
        const mcpOps = PRESET_AGENTS.map(agent => ({
            updateOne: {
                filter: { id: agent.id },
                update: { $setOnInsert: agent },
                upsert: true
            }
        }));
        if (mcpOps.length > 0) {
            await agentsCollection.bulkWrite(mcpOps as any);
            console.log('[Server] Seeded MCPs into the database.');
        }
    } catch (e) {
        console.error('[Server] Failed to seed MCPs:', e);
    }
    
    setInterval(() => arenaWorker.postMessage({ type: 'tick' }), 5000); // Arena is fast-paced
    setInterval(() => resolutionWorker.postMessage({ type: 'tick' }), 5 * 60 * 1000); // 5min for resolution
    setInterval(() => dashboardWorker.postMessage({ type: 'tick' }), 30 * 1000); // 30s for dashboard agent
    setInterval(() => autonomyWorker.postMessage({ type: 'tick' }), 3 * 60 * 1000); // 3 minutes for autonomy
    setInterval(() => marketWatcherWorker.postMessage({ type: 'tick' }), 60 * 1000); // 1 minute for new market checks
  });
}