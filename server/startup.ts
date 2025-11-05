/// <reference types="node" />

import './load-env.js';
import http from 'http';
// FIX: Add explicit types for Express request handlers to resolve overload errors.
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import { Worker } from 'worker_threads';

// FIX: Add missing imports for `mongoose` and `ObjectId`.
import mongoose from 'mongoose';
import { ObjectId } from 'mongodb';

import connectDB, { seedDatabase } from './db.js';
import apiRouter from './routes/api.js';
import { webSocketService } from './services/websocket.service.js';
import { createWorker } from './worker-loader.js';
import { ApiKeyManager } from './services/apiKey.service.js';
import { usersCollection } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// FIX: Define the missing `projectRoot` constant.
const projectRoot = path.join(__dirname, '..');

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

  // --- Middleware ---
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        'script-src': ["'self'", "'unsafe-inline'", 'https://aistudiocdn.com'],
        'connect-src': ["'self'", 'ws:', 'wss:', 'https://gamma-api.polymarket.com', 'https://data-api.polymarket.com', 'https://clob.polymarket.com'],
        'img-src': ["'self'", 'data:', 'https:', 'https://polymarket-upload.s3.us-east-2.amazonaws.com'],
      },
    },
  }));
  app.use(cors({
    origin: (origin, callback) => {
      const allowed = [
        'http://localhost:3000',
        'http://localhost:5173',
      ];
      if (!origin || allowed.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true
  }));
  app.use(compression());
  app.use(express.json({ limit: '10mb' }));

  // --- Worker Setup ---
  const workers: { name: string; instance: Worker; tickInterval: number }[] = [];
  
  const arenaWorker = createWorker('./workers/arena.worker');
  workers.push({ name: 'Arena', instance: arenaWorker, tickInterval: 10000 });

  const autonomyWorker = createWorker('./workers/autonomy.worker');
  workers.push({ name: 'Autonomy', instance: autonomyWorker, tickInterval: 60000 });
  
  const dashboardWorker = createWorker('./workers/dashboard.worker');
  workers.push({ name: 'Dashboard', instance: dashboardWorker, tickInterval: 30000 });

  const marketWatcherWorker = createWorker('./workers/market-watcher.worker');
  workers.push({ name: 'MarketWatcher', instance: marketWatcherWorker, tickInterval: 60000 });

  const resolutionWorker = createWorker('./workers/resolution.worker');
  workers.push({ name: 'Resolution', instance: resolutionWorker, tickInterval: 5 * 60000 });

  // --- Inter-Worker Communication Bus ---
  const workerMessageHandler = (worker: Worker, workerName: string) => async (message: any) => {
    switch (message.type) {
      case 'socketEmit':
        webSocketService.broadcastToRoom(message.room, message.event, message.payload);
        break;
      
      case 'requestApiKey': {
        const { agentId, requestId } = message.payload;
        const user = await usersCollection.findOne({ currentAgentId: agentId ? new ObjectId(agentId) : undefined });
        const key = user?.userApiKey || apiKeyManager.getKey();
        const allKeysOnCooldown = !key && apiKeyManager.areAllKeysOnCooldown();
        worker.postMessage({ type: 'apiKeyResponse', payload: { key, requestId, agentId, allKeysOnCooldown } });
        break;
      }
        
      case 'reportRateLimit':
        apiKeyManager.reportRateLimit(message.payload.key, message.payload.durationSeconds);
        break;

      case 'forwardToWorker':
        const targetWorker = workers.find(w => w.name.toLowerCase() === message.worker.toLowerCase());
        targetWorker?.instance.postMessage(message.message);
        break;

      default:
        console.warn(`[Main] Unknown message type from ${workerName}: ${message.type}`);
    }
  };

  workers.forEach(({ instance, name }) => {
    instance.on('message', workerMessageHandler(instance, name));
    // FIX: Add explicit types to middleware function to resolve overload errors.
    app.use((req: Request, res: Response, next: NextFunction) => {
      (req as any)[`${name.toLowerCase()}Worker`] = instance;
      next();
    });
  });

  // --- Director Tick Loop ---
  const tickIntervals = workers.map(({ instance, tickInterval }) => 
    setInterval(() => instance.postMessage({ type: 'tick' }), tickInterval)
  );

  // --- API & Static Serving ---
  app.use('/api', apiRouter);
  const clientDistPath = path.join(projectRoot, 'dist', 'client');
  app.use(express.static(clientDistPath));
  // FIX: Add explicit types to request handler to resolve overload errors.
  app.get('*', (req: Request, res: Response) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });

  // --- Start Server ---
  const PORT = process.env.PORT || 3001;
  webSocketService.init(server);
  server.listen(PORT, () => {
    console.log(`[Server] HTTP and WebSocket server running on http://localhost:${PORT}`);
  });
  
  // Return a stop function for graceful shutdown
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
