/// <reference types="node" />

import './load-env.js';
import http from 'http';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import path from 'node:path';
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

// ES Modules compatible __filename and __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..', '..', '..');

// Log the current file and directory for debugging
console.log('Starting server from:', __filename);
console.log('Project root:', projectRoot);

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

  const workers: { name: string; instance: Worker; tickInterval: number }[] = [];
  const tickIntervals: ReturnType<typeof setInterval>[] = [];
  
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

  workers.forEach(({ instance, tickInterval }) => {
    tickIntervals.push(setInterval(() => {
        instance.postMessage({ type: 'tick' });
    }, tickInterval));
  });

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
            const agent = await usersCollection.findOne({ currentAgentId: new ObjectId(agentId) });
            key = agent?.userApiKey || apiKeyManager.getKey();
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

  workers.forEach(({ instance, name }) => {
    instance.on('message', workerMessageHandler(instance, name));
    // FIX: Add explicit types for req, res, and next to resolve overload error.
    app.use((req: Request, res: Response, next: NextFunction) => {
      (req as any)[`${name.toLowerCase()}Worker`] = instance;
      next();
    });
  });

  app.use('/api', apiRouter);
  
  const clientDistPath = path.join(projectRoot, 'dist', 'client');
  console.log(`[Server] Serving static files from: ${clientDistPath}`);
  
  if (!fs.existsSync(path.join(clientDistPath, 'index.html'))) {
    console.error(`[ERROR] Client build not found at ${clientDistPath}. Please run 'npm run build:client'`);
  }
  
  app.use(express.static(clientDistPath));
  
  // FIX: Add explicit types for req and res to resolve overload error.
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
  
  // Function to start the server with retry logic
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
      server.off('error', onError); // Remove error handler once server is running
      const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
      console.log(`[Server] HTTP and WebSocket server running on ${protocol}://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${port}`);
      console.log(`[Server] WebSocket URL: ws://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${port}/socket.io/`);
    });
  };

  // Initialize WebSocket service
  webSocketService.init(server);
  
  // Start the server with retry logic
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