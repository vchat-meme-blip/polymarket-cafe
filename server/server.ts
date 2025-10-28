/// <reference types="node" />

// FIX: Import Request, Response, and NextFunction types from express to fix middleware and request/response typing issues.
// FIX: Import the Express type to explicitly type the app instance, resolving a cascade of type errors.
import express, { Express, Request, Response, NextFunction } from 'express';
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

// --- App & Server Initialization ---
// FIX: Explicitly type the Express app to resolve middleware and request/response type inference issues.
export const app: Express = express();
const server = http.createServer(app);
export { server };

// --- Configuration ---
const isProduction = process.env.NODE_ENV === 'production';
const productionDomains = ['polymarket-cafe.sliplane.app', 'polymarketcafe.sliplane.app'];
const devOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://192.168.10.135:5173'
];
const prodOrigins = productionDomains.map(domain => `https://${domain}`);
const allowedOrigins = isProduction ? prodOrigins : [...devOrigins, ...prodOrigins];

if (!isProduction) {
  console.log('[Server] Running in development mode');
  console.log('[Server] Allowed CORS origins:', allowedOrigins);
}

// --- Middleware Setup ---

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        'default-src': ["'self'"],
        'connect-src': ["'self'", 'https://*.sliplane.app', 'wss://*.sliplane.app', 'blob:'],
        'script-src-elem': ["'self'", "https://aistudiocdn.com", "'sha256-jc7G1mO6iumy5+mUBzbiKkcDtWD3pvyxBCrV8DgQQe0='", "'sha256-f7e2FzTlLBcKV18x7AY/5TeX5EoQtT0BZxrV1/f1odI='"],
        'style-src': ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://fonts.bunny.net"],
        'font-src': ["'self'", "https://fonts.gstatic.com", "https://fonts.bunny.net"],
        'img-src': ["'self'", "data:", "https://polymarket-upload.s3.us-east-2.amazonaws.com", "https://assets.coingecko.com"],
        'worker-src': ["'self'", "blob:"],
        'object-src': ["'none'"],
        'frame-ancestors': ["'none'"],
      },
    },
  })
);
app.disable('x-powered-by');

// CORS configuration
const corsOptions: cors.CorsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, success?: boolean) => void) => {
    if (!origin) return callback(null, true);
    // Allow all sliplane.app subdomains in production for flexibility
    if (isProduction && origin.endsWith('.sliplane.app')) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    
    const msg = `CORS policy: ${origin} not allowed`;
    console.warn('[CORS] Blocked request from origin:', origin);
    return callback(new Error(msg));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-user-handle', 'x-requested-with'],
  exposedHeaders: ['Content-Length', 'X-Request-Id']
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));


// --- Worker Setup ---
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
setupWorkers(); // Initialize workers before setting up routes

// Middleware to attach workers to requests
const attachWorkers = (req: Request, res: Response, next: NextFunction) => {
  req.arenaWorker = arenaWorker;
  req.resolutionWorker = resolutionWorker;
  req.dashboardWorker = dashboardWorker;
  req.autonomyWorker = autonomyWorker;
  req.marketWatcherWorker = marketWatcherWorker;
  next();
};
app.use(attachWorkers);


// --- API Routes ---
// This MUST be registered before the static file serving middleware.
app.use('/api', apiRouter);


// --- Production Static File Serving & SPA Fallback ---
if (isProduction) {
  const clientBuildPath = path.join(__dirname, '..', '..', 'client');
  
  // Serve static files (JS, CSS, images, etc.)
  app.use(express.static(clientBuildPath));

  // For any other GET request that doesn't match an API route or a static file,
  // send the main index.html file. This is the catch-all for client-side routing.
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
}


// --- Socket.IO Setup ---
const socketConfig: any = {
  cors: corsOptions,
  allowEIO3: true,
  transports: (process.env.WS_TRANSPORTS || 'websocket,polling').split(','),
  path: process.env.WS_PATH || '/socket.io/',
  serveClient: false,
  connectTimeout: 30000,
  pingTimeout: 25000,
  pingInterval: 20000,
};
const io = new SocketIOServer(server, socketConfig);
export { io };

io.engine.on("connection_error", (err) => {
  console.error('[Socket.IO] Connection error:', err.message);
  console.error('Error details:', err);
});

io.on('connection', (socket) => {
  const clientAddress = socket.handshake.address;
  const clientOrigin = socket.handshake.headers.origin || 'unknown';
  
  console.log(`[Socket.IO] New connection from ${clientAddress} (Origin: ${clientOrigin})`);
  
  socket.on('authenticate', async (handle: string) => {
    try {
      const user = await usersCollection.findOne({ handle });
      if (user) {
        const rooms = Array.from(socket.rooms).filter(room => room !== socket.id);
        rooms.forEach(room => socket.leave(room));
        
        await socket.join(handle);
        console.log(`[Socket.IO] User ${handle} authenticated and joined room ${handle}`);
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


// --- Error Handling ---
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  if (err && err.message && err.message.includes('CORS policy')) {
    return res.status(403).json({ error: 'Not allowed by CORS' });
  }
  console.error('[Server] Unhandled error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  if (process.env.NODE_ENV !== 'production') {
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// --- Server Start Logic ---
export async function startServer() {
  const PORT = process.env.PORT || 3001;
  const HOST = process.env.HOST || '0.0.0.0';
  
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