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
import helmet from 'helmet';

import apiRouter from './routes/api.js';
import { usersCollection, agentsCollection } from './db.js';
import { ApiKeyManager } from './services/apiKey.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure allowed origins based on environment
const isProduction = process.env.NODE_ENV === 'production';
const productionDomains = [
  'polymarketcafe.sliplane.app',
  'polymarket-cafe.sliplane.app'  // Add all your production domains here
];

// Development origins
const devOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://192.168.10.135:5173'
];

// Production origins - convert domains to https
const prodOrigins = productionDomains.map(domain => `https://${domain}`);

// Combine origins based on environment
const allowedOrigins = isProduction ? prodOrigins : [...devOrigins, ...prodOrigins];

// Log allowed origins for debugging (only in development)
if (!isProduction) {
  console.log('[Server] Running in development mode');
  console.log('[Server] Allowed CORS origins:', allowedOrigins);
}

const app = express();
const server = http.createServer(app);

// Security headers
app.use(helmet());
app.disable('x-powered-by');

// CORS configuration
const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Allow all subdomains of sliplane.app in production
    if (isProduction && origin.endsWith('.sliplane.app')) {
      return callback(null, true);
    }
    
    // Check against allowed origins
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    const msg = `CORS policy: ${origin} not allowed`;
    console.warn('[CORS] Blocked request from origin:', origin);
    return callback(new Error(msg));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'x-user-handle',
    'x-requested-with'
  ],
  exposedHeaders: [
    'Content-Length',
    'X-Request-Id'
  ]
};

// Apply CORS with options
app.use(cors(corsOptions));

// Handle preflight requests
app.options('*', cors(corsOptions));

// Socket.IO with CORS
const io = new SocketIOServer(server, {
  cors: {
    origin: (origin, callback) => {
      // Allow all subdomains of sliplane.app in production
      if (isProduction && origin && origin.endsWith('.sliplane.app')) {
        return callback(null, origin);
      }
      
      // Check against allowed origins
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, origin);
      }
      
      console.warn('[Socket.IO] Blocked connection from origin:', origin);
      return callback(new Error('Not allowed by CORS'));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["x-user-handle", "content-type", "authorization"],
    credentials: true
  },
  allowEIO3: true,
  transports: ['websocket', 'polling'],
  // Enable debugging in development
  ...(!isProduction && { 
    cors: {
      origin: true, // Allow all in development for easier testing
      credentials: true
    }
  })
});

// Add connection state change logging
io.engine.on("connection_error", (err) => {
  console.error('[Socket.IO] Connection error:', err);
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

// CORS error handling middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  if (err.message.includes('CORS policy')) {
    return res.status(403).json({ error: 'Not allowed by CORS' });
  }
  next(err);
});

export async function startServer() {
  app.use(express.json({ limit: '10mb' }));

  setupWorkers();

  app.use(attachWorkers);
  app.use('/api', apiRouter);

  if (process.env.NODE_ENV === 'production') {
    const clientPath = path.join(__dirname, '..', '..', 'client');
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
