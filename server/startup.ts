/// <reference types="node" />

import './load-env.js';
import http from 'http';
// FIX: Changed express import to resolve type conflicts. `import express from 'express'` is the standard way to import express and resolves type issues.
// FIX: Corrected express import to bring types `Request`, `Response`, and `NextFunction` into scope.
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import { Worker } from 'worker_threads';
import mongoose from 'mongoose';
import { ObjectId } from 'mongodb';

import connectDB, { seedDatabase } from './db.js';
import apiRouter from './routes/api.js';
import { webSocketService } from './services/websocket.service.js';
import { createWorker } from './worker-loader.js';
import fs from 'fs';
import { ApiKeyManager } from './services/apiKey.service.js';
import { usersCollection } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

export async function startServer() {
  if (!process.env.MONGODB_URI) {
    console.error('[FATAL] MONGODB_URI is not set.');
    process.exit(1);
  }

  await connectDB();
  await seedDatabase();

  // FIX: Changed app instantiation from `express.default()` to `express()` to match the corrected default import.
  const app = express();
  const server = http.createServer(app);
  const apiKeyManager = new ApiKeyManager();

  app.use(helmet({
    contentSecurityPolicy: false, // In a real app, configure this properly
  }));
  app.use(cors());
  app.use(compression());
  app.use(express.json({ limit: '10mb' }));

  const workers: { name: string; instance: Worker; tickInterval: number }[] = [];
  
  const arenaWorker = createWorker('./workers/arena.worker.js');
  workers.push({ name: 'Arena', instance: arenaWorker, tickInterval: 10000 });

  const autonomyWorker = createWorker('./workers/autonomy.worker.js');
  workers.push({ name: 'Autonomy', instance: autonomyWorker, tickInterval: 60000 });
  
  const dashboardWorker = createWorker('./workers/dashboard.worker.js');
  workers.push({ name: 'Dashboard', instance: dashboardWorker, tickInterval: 30000 });

  const marketWatcherWorker = createWorker('./workers/market-watcher.worker.js');
  workers.push({ name: 'MarketWatcher', instance: marketWatcherWorker, tickInterval: 60000 });

  const resolutionWorker = createWorker('./workers/resolution.worker.js');
  workers.push({ name: 'Resolution', instance: resolutionWorker, tickInterval: 5 * 60000 });
  
  const monitoringWorker = createWorker('./workers/monitoring.worker.js');
  workers.push({ name: 'Monitoring', instance: monitoringWorker, tickInterval: 5 * 60000 });


  const workerMessageHandler = (worker: Worker, workerName: string) => async (message: any) => {
    switch (message.type) {
      case 'socketEmit':
        webSocketService.broadcastToRoom(message.room, message.event, message.payload);
        break;
      
      case 'requestApiKey': {
        const { agentId, requestId } = message.payload;
        let key: string | null = null;

        // System requests get a key from the server pool
        if (agentId && agentId.startsWith('system-')) {
            key = apiKeyManager.getKey();
        } 
        // Agent-specific requests try the user's key first
        else if (agentId) {
            const agent = await usersCollection.findOne({ currentAgentId: new ObjectId(agentId) });
            key = agent?.userApiKey || apiKeyManager.getKey();
        } 
        // Generic requests get a key from the server pool
        else {
            key = apiKeyManager.getKey();
        }

        const allKeysOnCooldown = !key && apiKeyManager.areAllKeysOnCooldown();
        worker.postMessage({ type: 'apiKeyResponse', payload: { key, requestId, agentId, allKeysOnCooldown } });
        break;
      }
        
      case 'reportRateLimit':
        apiKeyManager.reportRateLimit(message.payload.key, message.payload.durationSeconds);
        break;

      case 'forwardToWorker':
        const targetWorker = workers.find(w => w.name.toLowerCase() === message.worker.toLowerCase());
        if (targetWorker) {
          targetWorker.instance.postMessage(message.message);
        } else {
          console.warn(`[Main] Tried to forward message to non-existent worker: ${message.worker}`);
        }
        break;
      
      case 'checkAllKeysCooldown':
        worker.postMessage({
            type: 'allKeysCooldownResponse',
            payload: {
                requestId: message.payload.requestId,
                allKeysOnCooldown: apiKeyManager.areAllKeysOnCooldown()
            }
        });
        break;

      default:
        console.warn(`[Main] Unknown message type from ${workerName}: ${message.type}`);
    }
  };

  workers.forEach(({ instance, name }) => {
    instance.on('message', workerMessageHandler(instance, name));
    // FIX: Update types to use express namespace.
    // FIX: Replaced `express.Request` etc. with imported `Request` types to fix handler signature.
    app.use((req: Request, res: Response, next: NextFunction) => {
      (req as any)[`${name.toLowerCase()}Worker`] = instance;
      next();
    });
  });

  const tickIntervals = workers.map(({ instance, tickInterval }) => 
    setInterval(() => instance.postMessage({ type: 'tick' }), tickInterval)
  );

  app.use('/api', apiRouter);
  
  // Serve static files from the correct client build directory
  const clientDistPath = path.join(projectRoot, '..', '..', 'dist', 'client');
  console.log(`[Server] Serving static files from: ${clientDistPath}`);
  
  // Check if client files exist
  if (!fs.existsSync(path.join(clientDistPath, 'index.html'))) {
    console.error(`[ERROR] Client build not found at ${clientDistPath}. Please run 'npm run build:client'`);
  }
  
  app.use(express.static(clientDistPath));
  
  // Handle SPA routing - serve index.html for all other routes
  // FIX: Replaced `express.Request` and `express.Response` with imported types to fix handler signature and resolve property errors.
  app.get('*', (req: Request, res: Response) => {
    res.sendFile(path.join(clientDistPath, 'index.html'), (err) => {
      if (err) {
        console.error(`[ERROR] Failed to serve index.html: ${err.message}`);
        res.status(500).send('Error loading the application');
      }
    });
  });

  const PORT = process.env.PORT || 3001;
  webSocketService.init(server);
  server.listen(PORT, () => {
    console.log(`[Server] HTTP and WebSocket server running on http://localhost:${PORT}`);
  });
  
  const stop = async () => {
    console.log('[Server] Stopping server...');
    tickIntervals.forEach(clearInterval);
    await Promise.all(workers.map(w => w.instance.terminate()));
    server.close();
    await mongoose.connection.close();
    console.log('[Server] Shutdown complete.');
  };

  return { stop };
}