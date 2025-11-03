/// <reference types="node" />

// FIX: Changed express import style to resolve middleware type overload errors.
// Importing types as values ensures they are correctly resolved by TypeScript, fixing issues with `app.use` and `res.sendFile`.
import express, {
  Express,
  Request,
  Response,
  NextFunction,
  RequestHandler,
  ErrorRequestHandler,
} from 'express';
import { Worker as NodeWorker } from 'worker_threads';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';

// Import routes and services
import apiRouter from './routes/api.js';
import { usersCollection, agentsCollection, roomsCollection } from './db.js';
import { ApiKeyManager } from './services/apiKey.service.js';
import { seedMcpAgents } from './db.js';

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
const app: Express = express();
const server = http.createServer(app);

// Initialize WebSocket service
import { webSocketService } from './services/websocket.service.js';

// Initialize WebSocket service only if not in test environment
if (process.env.NODE_ENV !== 'test') {
  webSocketService.init(server);
}

export { server, webSocketService };

// --- Configuration ---
const isProduction = process.env.NODE_ENV === 'production';
const productionDomains = ['polycafe.life', 'polymarket-cafe.sliplane.app'];
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

// 1. Security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        'default-src': ["'self'", 'https:'],
        'connect-src': [
          "'self'",
          'https://*.sliplane.app',
          'wss://*.sliplane.app',
          'wss://*.polycafe.life',
          'blob:',
          'data:',
          'https://api.elevenlabs.io'
        ],
        'media-src': [
          "'self'",
          'blob:',
          'data:',
          'https://*.sliplane.app',
          'https://*.polycafe.life'
        ],
        'script-src': [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'"
        ],
        'script-src-elem': [
          "'self'",
          "https://aistudiocdn.com",
          "'sha256-jc7G1mO6iumy5+mUBzbiKkcDtWD3pvyxBCrV8DgQQe0='",
          "'sha256-f7e2FzTlLBcKV18x7AY/5TeX5EoQtT0BZxrV1/f1odI='"
        ],
        'style-src': [
          "'self'",
          "'unsafe-inline'",
          "https://fonts.googleapis.com",
          "https://fonts.bunny.net"
        ],
        'font-src': [
          "'self'",
          'data:',
          'https://fonts.gstatic.com',
          'https://fonts.bunny.net'
        ],
        'img-src': [
          "'self'",
          'data:',
          'blob:',
          'https://polymarket-upload.s3.us-east-2.amazonaws.com',
          'https://assets.coingecko.com',
          'https://*.sliplane.app',
          'https://*.polycafe.life'
        ],
        'worker-src': [
          "'self'",
          'blob:'
        ],
        'object-src': ["'none'"],
        'frame-ancestors': ["'none'"],
        'frame-src': [
          "'self'",
          'blob:',
          'data:'
        ],
        'child-src': [
          "'self'",
          'blob:'
        ]
      },
    },
  }) as any
);
app.disable('x-powered-by');

// 2. CORS configuration
const corsOptions: cors.CorsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, success?: boolean) => void) => {
    if (!origin) {
      // Allow requests with no origin (like mobile apps or curl requests)
      return callback(null, true);
    }
    
    // Check against allowed origins
    if (allowedOrigins.some(o => origin.startsWith(o))) {
      return callback(null, true);
    }
    
    // Allow subdomains in production
    if (isProduction && (
      origin.endsWith('.sliplane.app') || 
      origin.endsWith('.polycafe.life') ||
      origin === 'https://polycafe.life' ||
      origin === 'https://www.polycafe.life'
    )) {
      return callback(null, true);
    }
    
    const msg = `CORS policy: ${origin} not allowed`;
    console.warn('[CORS] Blocked request from origin:', origin);
    return callback(new Error(msg));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-user-handle', 'x-requested-with'],
  exposedHeaders: ['Content-Length', 'X-Request-Id']
};

app.use(cors(corsOptions) as any);
app.options('*', cors(corsOptions) as any);

// 3. Body parsers
app.use(express.json({ limit: '10mb' }) as any);
app.use(express.urlencoded({ extended: true }) as any);


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
        const allOnCooldown = apiKeyManager.areAllKeysOnCooldown();

        if (key === null && allOnCooldown) {
            const PAUSE_DURATION_MS = 15000; // Pause for 15 seconds
            console.log(`[Server] All API keys are on cooldown. Initiating system-wide pause for ${PAUSE_DURATION_MS / 1000}s.`);
            
            const pauseUntil = Date.now() + PAUSE_DURATION_MS;

            // Broadcast pause to relevant workers
            arenaWorker.postMessage({ type: 'systemPause', payload: { until: pauseUntil } });
            autonomyWorker.postMessage({ type: 'systemPause', payload: { until: pauseUntil } });
            dashboardWorker.postMessage({ type: 'systemPause', payload: { until: pauseUntil } });

            // Schedule a resume broadcast
            setTimeout(() => {
                console.log('[Server] System-wide pause ended. Resuming operations.');
                arenaWorker.postMessage({ type: 'systemResume' });
                autonomyWorker.postMessage({ type: 'systemResume' });
                dashboardWorker.postMessage({ type: 'systemResume' });
            }, PAUSE_DURATION_MS);
        }

        worker.postMessage({
          type: 'apiKeyResponse',
          payload: {
            key,
            requestId: message.payload.requestId,
            agentId: message.payload.agentId,
            allKeysOnCooldown: allOnCooldown
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
setupWorkers();

// 4. Middleware to attach workers to requests
const attachWorkers: RequestHandler = (req, res, next) => {
  req.arenaWorker = arenaWorker;
  req.resolutionWorker = resolutionWorker;
  req.dashboardWorker = dashboardWorker;
  req.autonomyWorker = autonomyWorker;
  req.marketWatcherWorker = marketWatcherWorker;
  next();
};
app.use(attachWorkers as any);


// 5. API Routes - This MUST be registered before any static file serving.
app.use('/api', apiRouter);


// 6. Production Static File Serving & SPA Fallback
if (isProduction) {
  const clientBuildPath = path.join(__dirname, '..', '..', 'client');
  
  // Serve static files (JS, CSS, images, etc.)
  app.use(express.static(clientBuildPath) as any);

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
const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (err && err.message && err.message.includes('CORS policy')) {
    return res.status(403).json({ error: 'Not allowed by CORS' });
  }
  console.error('[Server] Unhandled error:', err);
  if (!res.headersSent) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
app.use(errorHandler as any);

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  if (process.env.NODE_ENV !== 'production') {
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle server shutdown
const cleanup = () => {
  console.log('Shutting down server...');
  
  // Close WebSocket server if it exists
  if (io) {
    console.log('Closing WebSocket server...');
    io.close();
  }
  
  // Close HTTP server
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });

  // Force close after 5 seconds
  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 5000);
};

// Handle various shutdown signals
process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);

// --- Server Start Logic ---
export async function startServer() {
  const PORT = process.env.PORT || 3001;
  const HOST = process.env.HOST || '0.0.0.0';
  
  return new Promise<void>((resolve, reject) => {
    if (!server.listening) {
      server.listen(Number(PORT), HOST, async () => {
        try {
          console.log(`[Server] Server listening on http://${HOST}:${PORT}`);
          console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);
          console.log(`[Server] Database: ${process.env.MONGODB_URI ? 'Configured' : 'Not Configured'}`);
          console.log(`[Server] WebSocket path: ${socketConfig.path}`);
          console.log(`[Server] Allowed transports: ${socketConfig.transports.join(', ')}`);

          // Centralized Seeding Logic
          try {
            const agentCount = await agentsCollection.countDocuments();
            if (agentCount === 0) {
              await seedMcpAgents();
              console.log('[Server] Seeded MCPs into the database.');
            }
          } catch (e) {
            console.error('[Server] Failed to seed database:', e);
          }
          
          // Setup worker intervals
          setInterval(() => arenaWorker.postMessage({ type: 'tick' }), 10000); // 10s
          setInterval(() => resolutionWorker.postMessage({ type: 'tick' }), 5 * 60 * 1000); // 5min
          setInterval(() => dashboardWorker.postMessage({ type: 'tick' }), 30 * 1000); // 30s
          setInterval(() => autonomyWorker.postMessage({ type: 'tick' }), 3 * 60 * 1000); // 3min
          setInterval(() => marketWatcherWorker.postMessage({ type: 'tick' }), 60 * 1000); // 1min
          
          resolve();
        } catch (error) {
          reject(error);
        }
      }).on('error', reject);
    } else {
      console.log('[Server] Server is already running');
      resolve();
    }
  });
}

// Start the server
startServer().catch(error => {
  console.error('Fatal error during server startup:', error);
  process.exit(1);
});