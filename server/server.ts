/// <reference types="node" />

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

import apiRouter from './routes/api.js';
import { db, seedDatabase } from './db.js';
import { ApiKeyManager } from './services/apiKey.service.js';
import { webSocketService } from './services/websocket.service.js';

declare global {
  namespace Express {
    interface Request {
      arenaWorker?: NodeWorker;
      resolutionWorker?: NodeWorker;
      autonomyWorker?: NodeWorker;
      marketWatcherWorker?: NodeWorker;
    }
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app: Express = express();
const server = http.createServer(app);

if (process.env.NODE_ENV !== 'test') {
  webSocketService.init(server);
}

export { server, webSocketService };

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
        'script-src-elem': [
          "'self'",
          "https://aistudiocdn.com",
          "'unsafe-inline'"
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
      },
    },
  }) as any
);
app.disable('x-powered-by');

const corsOptions: cors.CorsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, success?: boolean) => void) => {
    if (!origin || allowedOrigins.some(o => origin.startsWith(o))) {
      return callback(null, true);
    }
    const msg = `CORS policy: ${origin} not allowed`;
    console.warn('[CORS] Blocked request from origin:', origin);
    return callback(new Error(msg));
  },
  credentials: true,
};

app.use(cors(corsOptions) as any);
app.options('*', cors(corsOptions) as any);

app.use(express.json({ limit: '10mb' }) as any);
app.use(express.urlencoded({ extended: true }) as any);

let arenaWorker: NodeWorker;
let resolutionWorker: NodeWorker;
let autonomyWorker: NodeWorker;
let marketWatcherWorker: NodeWorker;
const apiKeyManager = new ApiKeyManager();

function createWorker(workerPath: string): NodeWorker {
  const resolvedPath = path.resolve(__dirname, workerPath);
  return new NodeWorker(resolvedPath);
}

function setupWorkers() {
    // Correct paths for production build
    arenaWorker = createWorker('./workers/arena.worker.mjs');
    resolutionWorker = createWorker('./workers/resolution.worker.mjs');
    autonomyWorker = createWorker('./workers/autonomy.worker.mjs');
    marketWatcherWorker = createWorker('./workers/market-watcher.worker.mjs');

  const workers = { arena: arenaWorker, resolution: resolutionWorker, autonomy: autonomyWorker, marketWatcher: marketWatcherWorker };
  const io = webSocketService.getIO();

  Object.entries(workers).forEach(([name, worker]) => {
    worker.on('message', (message: any) => {
        if (message.type === 'socketEmit' && io) {
            if (message.room) {
            io.to(message.room).emit(message.event, message.payload);
            } else {
            io.emit(message.event, message.payload);
            }
        }
    });
    worker.on('error', (err) => console.error(`Worker error (${name}):`, err));
    worker.on('exit', (code) => {
      if (code !== 0) console.error(`Worker (${name}) stopped with exit code ${code}`);
    });
  });
}
setupWorkers();

const attachWorkers: RequestHandler = (req, res, next) => {
  req.arenaWorker = arenaWorker;
  req.resolutionWorker = resolutionWorker;
  req.autonomyWorker = autonomyWorker;
  req.marketWatcherWorker = marketWatcherWorker;
  next();
};
app.use(attachWorkers as any);
app.use('/api', apiRouter);

if (isProduction) {
  const clientBuildPath = path.join(__dirname, '..', 'client');
  app.use(express.static(clientBuildPath) as any);
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
}

export async function startServer() {
  const PORT = process.env.PORT || 3001;
  const HOST = process.env.HOST || '0.0.0.0';
  
  return new Promise<void>((resolve, reject) => {
    server.listen(Number(PORT), HOST, async () => {
      try {
        console.log(`[Server] Server listening on http://${HOST}:${PORT}`);
        
        // FIX: Moved seeding logic inside the listen callback to ensure DB is connected.
        // It now gets the collection directly from the live connection.
        try {
            if (db.connection.db) {
                const agentsCollection = db.connection.db.collection('agents');
                const agentCount = await agentsCollection.countDocuments({ ownerHandle: { $exists: false } });
                if (agentCount === 0) {
                    await seedDatabase();
                    console.log('[Server] Seeded initial data into the database.');
                }
            } else {
                 console.error('[Server] Database not available for seeding.');
            }
        } catch (e) {
            console.error('[Server] Failed to seed database:', e);
        }
        
        // Setup worker intervals
        setInterval(() => arenaWorker.postMessage({ type: 'tick' }), 10000);
        setInterval(() => resolutionWorker.postMessage({ type: 'tick' }), 5 * 60 * 1000);
        setInterval(() => autonomyWorker.postMessage({ type: 'tick' }), 3 * 60 * 1000);
        setInterval(() => marketWatcherWorker.postMessage({ type: 'tick' }), 60 * 1000);
        
        resolve();
      } catch (error) {
        reject(error);
      }
    }).on('error', reject);
  });
}
