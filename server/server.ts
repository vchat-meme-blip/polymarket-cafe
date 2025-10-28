/// <reference types="node" />

import express, { Request, Response, NextFunction } from 'express';
import { Worker as NodeWorker } from 'worker_threads';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';

// Import routes and services
import apiRouter from './routes/api.js';
import { usersCollection, agentsCollection } from './db.js';
import { ApiKeyManager } from './services/apiKey.service.js';

// Module augmentation for Express Request
// FIX: Switched to `declare global` to augment the Express.Request interface. This is a more robust method that avoids module resolution issues with 'express-serve-static-core' which can occur in complex build setups.
declare global {
  namespace Express {
    interface Request {
      arenaWorker?: NodeWorker;
      resolutionWorker?: NodeWorker;
      dashboardWorker?: NodeWorker;
      autonomyWorker?: NodeWorker;
      marketWatcherWorker?: NodeWorker;
    }
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure allowed origins based on environment
const isProduction = process.env.NODE_ENV === 'production';
const productionDomains = [
  'polymarketcafe.sliplane.app',
  'polymarket-cafe.sliplane.app'
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

// Create Express app and HTTP server
export const app = express();
const server = http.createServer(app);

export { server };

// Security headers
app.use(helmet());
app.disable('x-powered-by');

// CORS configuration
const corsOptions: cors.CorsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, success?: boolean) => void) => {
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

// Apply CORS middleware
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Socket.IO configuration
const socketConfig: any = {
  cors: {
    origin: (origin: string | undefined, callback: (err: Error | null, success?: boolean) => void) => {
      // Allow all subdomains of sliplane.app in production
      if (isProduction && origin && origin.endsWith('.sliplane.app')) {
        return callback(null, true);
      }
      
      // Check against allowed origins
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      
      console.warn('[Socket.IO] Blocked connection from origin:', origin);
      return callback(new Error('Not allowed by CORS'));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["x-user-handle", "content-type", "authorization"],
    credentials: true
  },
  allowEIO3: true,
  transports: (process.env.WS_TRANSPORTS || 'websocket,polling').split(','),
  path: process.env.WS_PATH || '/socket.io/',
  serveClient: false,
  connectTimeout: 30000,
  pingTimeout: 25000,
  pingInterval: 20000,
};

// In development, allow all origins for easier testing
if (!isProduction) {
  console.log('[Socket.IO] Running in development mode - allowing all origins');
  socketConfig.cors = {
    origin: true,
    credentials: true
  };
}

// Create Socket.IO server instance
const io = new SocketIOServer(server, socketConfig);

// Add connection state change logging
io.engine.on("connection_error", (err) => {
  console.error('[Socket.IO] Connection error:', err.message);
  console.error('Error details:', err);
});

// Handle WebSocket connections
io.on('connection', (socket) => {
  const clientAddress = socket.handshake.address;
  const clientOrigin = socket.handshake.headers.origin || 'unknown';
  
  console.log(`[Socket.IO] New connection from ${clientAddress} (Origin: ${clientOrigin})`);
  
  // Handle authentication
  socket.on('authenticate', async (handle: string) => {
    try {
      const user = await usersCollection.findOne({ handle });
      if (user) {
        // Leave any existing rooms
        const rooms = Array.from(socket.rooms).filter(room => room !== socket.id);
        rooms.forEach(room => socket.leave(room));
        
        // Join the user's room
        await socket.join(handle);
        console.log(`[Socket.IO] User ${handle} authenticated and joined room ${handle}`);
        
        // Send a confirmation message
        socket.emit('authenticated', { success: true, handle });
      } else {
        console.log(`[Socket.IO] Authentication failed: User ${handle} not found`);
        socket.emit('authentication_error', { error: 'User not found' });
      }
    } catch (error) {
      console.error(`[Socket.IO] Authentication error for ${handle}:`, error);
      socket.emit('authentication_error', { error: 'Internal server error' });
    }
  });
  
  socket.on('disconnect', (reason: string) => {
    console.log(`[Socket.IO] Client ${socket.id} disconnected: ${reason}`);
  });
  
  socket.on('error', (error: Error) => {
    console.error(`[Socket.IO] Error from client ${socket.id}:`, error);
  });
});

// Worker setup
let arenaWorker: NodeWorker;
let resolutionWorker: NodeWorker;
let dashboardWorker: NodeWorker;
let autonomyWorker: NodeWorker;
let marketWatcherWorker: NodeWorker;
const apiKeyManager = new ApiKeyManager();

function createWorker(workerPath: string): NodeWorker {
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
  // Workers will be terminated by the process exit handler
  req.resolutionWorker = resolutionWorker;
  req.dashboardWorker = dashboardWorker;
  req.autonomyWorker = autonomyWorker;
  req.marketWatcherWorker = marketWatcherWorker;
  next();
};

// CORS error handling middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  if (err && err.message && err.message.includes('CORS policy')) {
    return res.status(403).json({ error: 'Not allowed by CORS' });
  }
  next(err);
});

// Export server and io instances for testing and module access
export { io };

// Global error handler for uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Don't crash the process in production
  if (process.env.NODE_ENV !== 'production') {
    process.exit(1);
  }
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

export async function startServer() {
  // Middleware setup
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Setup workers and routes
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

  // Socket.IO authentication and room joining
  io.on('connection', async (socket) => {
    console.log(`[Socket.IO] New connection from ${socket.id}`);
    
    socket.on('authenticate', async (handle) => {
      try {
        const user = await usersCollection.findOne({ handle });
        if (user) {
          // Leave any existing rooms
          const rooms = Array.from(socket.rooms).filter(room => room !== socket.id);
          rooms.forEach(room => socket.leave(room));
          
          // Join the user's room
          await socket.join(handle);
          console.log(`[Socket.IO] User ${handle} authenticated and joined room ${handle}`);
          
          // Send a confirmation message
          socket.emit('authenticated', { success: true, handle });
        } else {
          console.log(`[Socket.IO] Authentication failed: User ${handle} not found`);
          socket.emit('authentication_error', { error: 'User not found' });
        }
      } catch (error) {
        console.error(`[Socket.IO] Authentication error for ${handle}:`, error);
        socket.emit('authentication_error', { error: 'Internal server error' });
      }
    });
    
    socket.on('disconnect', (reason) => {
      console.log(`[Socket.IO] Client ${socket.id} disconnected: ${reason}`);
    });
    
    socket.on('error', (error) => {
      console.error(`[Socket.IO] Error from client ${socket.id}:`, error);
    });
  });
  
  const PORT = process.env.PORT || 3001;
  const HOST = process.env.HOST || '0.0.0.0';
  
  // Only start the server if it's not already listening
  if (!server.listening) {
    server.listen(Number(PORT), HOST, async () => {
      console.log(`[Server] Server listening on http://${HOST}:${PORT}`);
      console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`[Server] Database: ${process.env.MONGODB_URI ? 'Configured' : 'Not Configured'}`);
      console.log(`[Server] WebSocket path: ${socketConfig.path}`);
      console.log(`[Server] Allowed transports: ${socketConfig.transports.join(', ')}`);

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
      
      // Setup worker intervals
      setInterval(() => arenaWorker.postMessage({ type: 'tick' }), 5000); // Arena is fast-paced
      setInterval(() => resolutionWorker.postMessage({ type: 'tick' }), 5 * 60 * 1000); // 5min for resolution
      setInterval(() => dashboardWorker.postMessage({ type: 'tick' }), 30 * 1000); // 30s for dashboard agent
      setInterval(() => autonomyWorker.postMessage({ type: 'tick' }), 3 * 60 * 1000); // 3 minutes for autonomy
      setInterval(() => marketWatcherWorker.postMessage({ type: 'tick' }), 60 * 1000); // 1 minute for new market checks
    });
  } else {
    console.log('[Server] Server is already running');
  }
}