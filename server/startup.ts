/// <reference types="node" />

import './load-env.js';
import http from 'http';
import express, { Request as ExpressRequest, Response as ExpressResponse, NextFunction } from 'express';
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

  const app = express();
  const server = http.createServer(app);
  const apiKeyManager = new ApiKeyManager();

  // Configure express middleware
  app.use(helmet({
    contentSecurityPolicy: false, 
  }));
  app.use(cors({
    origin: process.env.NODE_ENV === 'production' 
      ? ['https://polycafe.life', 'https://www.polycafe.life']
      : '*',
    credentials: true
  }));
  app.use(compression());
  app.use(express.json({ limit: '10mb' }));

  // Initialize WebSocket server
  webSocketService.init(server);
  const io = webSocketService.getIO();
  if (!io) {
    console.error('[Startup] Failed to initialize WebSocket server');
    process.exit(1);
  }

  // Worker management
  const workers: Array<{
    name: string;
    instance: Worker;
    tickInterval: NodeJS.Timeout | null;
  }> = [];
  
  const tickIntervals: NodeJS.Timeout[] = [];
  
  const workerConfigs = [
    { name: 'arena', path: './workers/arena.worker.js', interval: 10000 },
    { name: 'autonomy', path: './workers/autonomy.worker.js', interval: 15000 },
    { name: 'dashboard', path: './workers/dashboard.worker.js', interval: 30000 },
    { name: 'market-watcher', path: './workers/market-watcher.worker.js', interval: 60000 },
    { name: 'monitoring', path: './workers/monitoring.worker.js', interval: 30000 },
    { name: 'resolution', path: './workers/resolution.worker.js', interval: 60000 }
  ];

  // Initialize workers
  for (const config of workerConfigs) {
    try {
      console.log(`[Startup] Starting ${config.name} worker...`);
      
      const worker = createWorker(config.path, {
        workerData: {
          workerName: config.name,
          nodeEnv: process.env.NODE_ENV || 'development'
        }
      });

      // Handle worker messages
      worker.on('message', (message: any) => {
        if (message?.type === 'log') {
          console.log(`[Worker ${config.name}]`, message.data);
        }
      });

      // Handle worker errors
      worker.on('error', (error: Error) => {
        console.error(`[Worker ${config.name}] Error:`, error);
      });

      // Handle worker exit
      worker.on('exit', (code: number) => {
        console.log(`[Worker ${config.name}] Exited with code ${code}`);
        if (code !== 0) {
          console.error(`[Worker ${config.name}] Unexpected exit, attempting to restart...`);
          // TODO: Implement proper worker restart logic
        }
      });

      // Set up tick interval for the worker
      const tickInterval = setInterval(() => {
        if (!worker.threadId) {
          console.warn(`[Worker ${config.name}] Worker thread ID not available, skipping tick`);
          return;
        }
        worker.postMessage({ 
          type: 'tick', 
          timestamp: Date.now() 
        });
      }, config.interval);

      // Store worker and its interval
      const workerInfo = {
        name: config.name,
        instance: worker,
        tickInterval
      };
      
      workers.push(workerInfo);
      tickIntervals.push(tickInterval);
      
      console.log(`[Startup] Started ${config.name} worker (Thread ID: ${worker.threadId})`);
      
    } catch (error) {
      console.error(`[Startup] Failed to start ${config.name} worker:`, error);
      // Don't crash the server if a worker fails to start
      // The application might still be able to function without some workers
    }
  }

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

  // Set up message handlers for each worker
  workers.forEach(({ instance, name }) => {
    if (instance) {
      instance.on('message', workerMessageHandler(instance, name));
      
      // Add worker instance to request object for API routes
      app.use((req: ExpressRequest, res: ExpressResponse, next: NextFunction) => {
        (req as any)[`${name.toLowerCase()}Worker`] = instance;
        next();
      });
    } else {
      console.warn(`[Startup] Worker ${name} instance is not available`);
    }
  });

  app.use('/api', apiRouter);
  
  const clientDistPath = path.join(projectRoot, '..', '..', 'dist', 'client');
  console.log(`[Server] Serving static files from: ${clientDistPath}`);
  
  if (!fs.existsSync(path.join(clientDistPath, 'index.html'))) {
    console.error(`[ERROR] Client build not found at ${clientDistPath}. Please run 'npm run build:client'`);
  }
  
  app.use(express.static(clientDistPath));
  
  // FIX: Removed explicit types from route handler to rely on type inference, resolving method existence errors on `res`.
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'), (err) => {
      if (err) {
        console.error(`[ERROR] Failed to serve index.html: ${err.message}`);
        res.status(500).send('Error loading the application');
      }
    });
  });

  const port = parseInt(process.env.PORT || '3001', 10);
  const host = process.env.HOST || '0.0.0.0';
  
  // Handle server errors
  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.syscall !== 'listen') {
      throw error;
    }

    const bind = typeof port === 'string' ? 'Pipe ' + port : 'Port ' + port;

    // Handle specific listen errors with friendly messages
    switch (error.code) {
      case 'EACCES':
        console.error(bind + ' requires elevated privileges');
        process.exit(1);
        break;
      case 'EADDRINUSE':
        console.error(bind + ' is already in use');
        process.exit(1);
        break;
      default:
        throw error;
    }
  });

  // Start listening
  server.listen(port, host, () => {
    console.log(`[Server] HTTP and WebSocket server running on http://${host}:${port}`);
    console.log(`[Server] Node.js ${process.version}`);
    console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`[Server] WebSocket path: ${io.path()}`);
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('[Server] Received shutdown signal. Cleaning up...');
    
    // Clear all intervals
    workers.forEach(worker => {
      if (worker.tickInterval) {
        clearInterval(worker.tickInterval);
      }
      worker.instance.postMessage({ type: 'shutdown' });
      worker.instance.terminate();
    });

    // Close WebSocket connections
    if (io) {
      io.close(() => {
        console.log('[WebSocket] All connections closed');
      });
    }

    // Close MongoDB connection
    try {
      await mongoose.connection.close();
      console.log('MongoDB connection closed');
    } catch (error) {
      console.error('Error closing MongoDB connection:', error);
    }

    // Exit the process
    process.exit(0);
  };

  // Handle signals
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    // Don't exit immediately to allow for cleanup
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
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