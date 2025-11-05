/// <reference types="node" />

import './load-env.js';
import http from 'http';
// FIX: Changed import to a default import to avoid type collisions with global types (e.g., Response).
// This resolves type errors with Express middleware and response methods like `sendFile`.
import express from 'express';
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

  const app = express();
  const server = http.createServer(app);
  const apiKeyManager = new ApiKeyManager();

  app.use(helmet({
    contentSecurityPolicy: false, 
  }));
  app.use(cors());
  app.use(compression());
  app.use(express.json({ limit: '10mb' }));

  const isDev = process.env.NODE_ENV !== 'production';
  const workers: { name: string; instance: Worker; tickInterval: number }[] = [];
  
  const createAndManageWorker = (name: string, tickInterval: number): Worker => {
    const workerFilename = `./workers/${name}.worker.${isDev ? 'ts' : 'js'}`;
    const workerUrl = new URL(workerFilename, import.meta.url);
    
    console.log(`[Startup] Creating worker "${name}" from URL: ${workerUrl}`);
    
    const worker = new Worker(workerUrl, {
      execArgv: isDev ? ['--import', 'tsx'] : undefined,
    });

    workers.push({ name, instance: worker, tickInterval });
    return worker;
  };

  const arenaWorker = createAndManageWorker('arena', 10000);
  const autonomyWorker = createAndManageWorker('autonomy', 60000);
  const dashboardWorker = createAndManageWorker('dashboard', 30000);
  const marketWatcherWorker = createAndManageWorker('market-watcher', 60000);
  const resolutionWorker = createAndManageWorker('resolution', 5 * 60000);

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
    // FIX: Use explicit express types for request, response, and next to avoid type collisions.
    app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
      (req as any)[`${name.toLowerCase()}Worker`] = instance;
      next();
    });
  });

  const tickIntervals = workers.map(({ instance, tickInterval }) => 
    setInterval(() => instance.postMessage({ type: 'tick' }), tickInterval)
  );

  app.use('/api', apiRouter);
  const clientDistPath = path.join(projectRoot, 'dist', 'client');
  app.use(express.static(clientDistPath));
  // FIX: Use explicit express types for request and response to fix 'sendFile' error.
  app.get('*', (req: express.Request, res: express.Response) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
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
