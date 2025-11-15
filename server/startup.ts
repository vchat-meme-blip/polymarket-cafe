/// <reference types="node" />

import './load-env.js';
import http from 'http';
// FIX: Explicitly import Express types to avoid overload resolution errors.
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'url';
// FIX: Import Worker directly to ensure type resolution in global declaration.
import { Worker } from 'worker_threads';
import mongoose from 'mongoose';
// FIX: Import WithId from mongodb to resolve type error.
import { ObjectId, WithId } from 'mongodb';

import connectDB, { seedDatabase } from './db.js';
// FIX: Use named import for the router to fix module resolution errors.
import { router as apiRouter } from './routes/api.js';
import { webSocketService } from './services/websocket.service.js';
import { createWorker } from './worker-loader.js';
import fs from 'fs';
import { ApiKeyManager } from './services/apiKey.service.js';
import { usersCollection } from './db.js';

declare global {
  namespace Express {
    interface Request {
      arenaWorker?: Worker;
      autonomyWorker?: Worker;
      dashboardWorker?: Worker;
      marketWatcherWorker?: Worker;
      resolutionWorker?: Worker;
      monitoringWorker?: Worker;
    }
  }
}


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('Starting server from:', __filename);

export async function startServer() {
  if (!process.env.MONGODB_URI) {
    console.error('[FATAL] MONGODB_URI is not set.');
    process.exit(1);
  }

  await connectDB();
  await seedDatabase();

  const app = express();
  const server = http.createServer(app);
  const apiKeyManager = new ApiKeyManager();

  app.use(helmet({
    contentSecurityPolicy: false, 
  }));
  app.use(cors());
  app.use(compression());
  app.use(express.json({ limit: '10mb' }));

  const workerMessageHandler = (worker: Worker, workerName: string) => async (message: any) => {
    switch (message.type) {
      case 'socketEmit':
        webSocketService.broadcastToRoom(message.room, message.event, message.payload);
        break;
      
      case 'requestApiKey': {
        const { agentId, requestId } = message.payload;
        let key: string | null = null;

        if (agentId && agentId.startsWith('system-')) {
            key = apiKeyManager.getKey();
        } 
        else if (agentId) {
            const agentObjectId = mongoose.Types.ObjectId.isValid(agentId) ? new ObjectId(agentId) : null;
            // FIX: Correctly type the `user` object after fetching from the database to include the optional `userApiKey` property, resolving a TypeScript error related to the missing property.
            const user = agentObjectId ? await usersCollection.findOne({ currentAgentId: agentObjectId }) as (WithId<import('../lib/types/index.js').UserDocument> & { userApiKey?: string | null }) | null : null;
            key = user?.userApiKey || apiKeyManager.getKey();
        } 
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
  
  const arenaWorker = createWorker('./workers/arena.worker.js');
  const autonomyWorker = createWorker('./workers/autonomy.worker.js');
  const dashboardWorker = createWorker('./workers/dashboard.worker.js');
  const marketWatcherWorker = createWorker('./workers/market-watcher.worker.js');
  const resolutionWorker = createWorker('./workers/resolution.worker.js');
  const monitoringWorker = createWorker('./workers/monitoring.worker.js');

  const workers = [
    { name: 'Arena', instance: arenaWorker, tickInterval: 10000 },
    { name: 'Autonomy', instance: autonomyWorker, tickInterval: 60000 },
    { name: 'Dashboard', instance: dashboardWorker, tickInterval: 30000 },
    { name: 'MarketWatcher', instance: marketWatcherWorker, tickInterval: 60000 },
    { name: 'Resolution', instance: resolutionWorker, tickInterval: 5 * 60000 },
    { name: 'Monitoring', instance: monitoringWorker, tickInterval: 5 * 60000 },
  ];
  
  const tickIntervals: ReturnType<typeof setInterval>[] = [];

  // Set up message handlers and tick intervals
  workers.forEach(({ instance, name, tickInterval }) => {
    instance.on('message', workerMessageHandler(instance, name));
    tickIntervals.push(setInterval(() => {
        instance.postMessage({ type: 'tick' });
    }, tickInterval));
  });

  // FIX: Explicitly import and use Express types to resolve overload errors and apply Request type augmentation.
  app.use((req: Request, res: Response, next: NextFunction) => {
    req.arenaWorker = arenaWorker;
    req.autonomyWorker = autonomyWorker;
    req.dashboardWorker = dashboardWorker;
    req.marketWatcherWorker = marketWatcherWorker;
    req.resolutionWorker = resolutionWorker;
    req.monitoringWorker = monitoringWorker;
    next();
  });

  app.use('/api', apiRouter);
  
  const clientDistPath = path.resolve(__dirname, '..', '..', 'client');
  console.log(`[Server] Serving static files from: ${clientDistPath}`);
  
  if (!fs.existsSync(path.join(clientDistPath, 'index.html'))) {
    console.error(`[ERROR] Client build not found at ${clientDistPath}. Please run 'npm run build:client'`);
  }
  
  app.use(express.static(clientDistPath));
  
  // FIX: Use imported Request and Response types to fix method not found errors.
  app.get('*', (req: Request, res: Response) => {
    res.sendFile(path.join(clientDistPath, 'index.html'), (err) => {
      if (err) {
        console.error(`[ERROR] Failed to serve index.html: ${err.message}`);
        res.status(500).send('Error loading the application');
      }
    });
  });

  const PORT = process.env.PORT || 3001;
  const HOST = process.env.HOST || '0.0.0.0';
  
  const startServerWithRetry = (port: number, maxRetries = 3, retryCount = 0) => {
    const onError = (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        if (retryCount < maxRetries) {
          console.warn(`[Server] Port ${port} is in use, retrying (${retryCount + 1}/${maxRetries})...`);
          setTimeout(() => {
            server.close(() => {
              startServerWithRetry(port, maxRetries, retryCount + 1);
            });
          }, 2000);
        } else {
          console.error(`[Server] Failed to start: Port ${port} is in use after ${maxRetries} retries`);
          process.exit(1);
        }
      } else {
        console.error('[Server] Failed to start:', error);
        process.exit(1);
      }
    };

    server.on('error', onError);
    
    server.listen(port, HOST, () => {
      server.off('error', onError);
      
      // Determine protocol based on environment
      const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
      const wsProtocol = process.env.NODE_ENV === 'production' ? 'wss' : 'ws';
      
      // Determine host based on environment
      const host = process.env.NODE_ENV === 'production'
        ? process.env.VITE_PUBLIC_APP_URL || 'polycafe.life'
        : (HOST === '0.0.0.0' ? 'localhost' : HOST);
      
      // Log server URLs
      console.log(`[Server] HTTP and WebSocket server running on ${protocol}://${host}:${port}`);
      console.log(`[Server] WebSocket URL: ${wsProtocol}://${host}:${port}/socket.io/`);
    });
  };

  webSocketService.init(server);
  
  startServerWithRetry(Number(PORT));
  
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