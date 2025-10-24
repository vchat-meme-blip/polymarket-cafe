/// <reference types="node" />

// FIX: Explicitly import Request, Response, and NextFunction to resolve type errors
// with module augmentation and middleware signatures.
import express, { Request, Response, NextFunction } from 'express';
import { Worker as NodeWorker } from 'worker_threads';

// FIX: Replaced global augmentation with module augmentation for 'express-serve-static-core'.
// This is the recommended way to augment Express's Request object and resolves all
// related type errors for req properties, app.use(), app.get(), and res.sendFile().
declare module 'express-serve-static-core' {
  interface Request {
    arenaWorker?: NodeWorker;
    resolutionWorker?: NodeWorker;
    dashboardWorker?: NodeWorker;
    autonomyWorker?: NodeWorker;
    marketWatcherWorker?: NodeWorker;
  }
}

import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

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

function createWorker(workerPath: string) {
  const resolvedPath = path.resolve(__dirname, workerPath);
  return new NodeWorker(resolvedPath);
}

function setupWorkers() {
  arenaWorker = createWorker('./workers/arena.worker.mjs');
  resolutionWorker = createWorker('./workers/resolution.worker.mjs');
  dashboardWorker = createWorker('./workers/dashboard.worker.mjs');
  autonomyWorker = createWorker('./workers/autonomy.worker.mjs');
  marketWatcherWorker = createWorker('./workers/market-watcher.worker.mjs');

  const workers = { arena: arenaWorker, resolution: resolutionWorker, dashboard: dashboardWorker, autonomy: autonomyWorker, marketWatcher: marketWatcherWorker };

  Object.entries(workers).forEach(([name, worker]) => {
    worker.on('message', (message: any) => {
      if (message.type === 'socketEmit') {
        if (message.room) {
          io.to(message.room).emit(message.event, message.payload);
        } else {
          io.emit(message.event, message.payload);
        }
      } else if (message.type === 'forwardToWorker') {
        const targetWorker = workers[message.worker as keyof typeof workers];
        if (targetWorker) {
          targetWorker.postMessage(message.message);
        } else {
          console.warn(`[Server] Received forward request for unknown worker: ${message.worker}`);
        }
      } else if (message.type === 'requestApiKey') {
        const key = apiKeyManager.getKey();
        worker.postMessage({
          type: 'apiKeyResponse',
          payload: {
            key,
            requestId: message.payload.requestId,
            agentId: message.payload.agentId,
            allKeysOnCooldown: key === null && apiKeyManager.areAllKeysOnCooldown()
          }
        });
      } else if (message.type === 'reportRateLimit') {
        apiKeyManager.reportRateLimit(message.payload.key, message.payload.durationSeconds);
      } else if (message.type === 'checkAllKeysCooldown') {
        worker.postMessage({
          type: 'allKeysCooldownResponse',
          payload: {
            requestId: message.payload.requestId,
            allKeysOnCooldown: apiKeyManager.areAllKeysOnCooldown()
          }
        });
      }
    });

    worker.on('error', (err) => {
      console.error(`Worker error (${name}):`, err);
    });

    worker.on('exit', (code) => {
      if (code !== 0) {
        console.error(`Worker (${name}) stopped with exit code ${code}`);
      }
    });
  });
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

  if (process.env.NODE_ENV === 'production') {
    const clientPath = path.join(__dirname, '..', 'client');
    app.use(express.static(clientPath));
    // FIX: Use explicitly imported Request and Response types.
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.resolve(clientPath, 'index.html'));
    });
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
