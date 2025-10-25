// Environment variables are pre-loaded by the --import flag in the start script.

// FIX: Changed express import to use a default import (`import express from 'express'`) and fully qualified types (`express.Application`) to resolve method overload errors caused by conflicts with global DOM types.
import express, { type Request, type Response, type RequestHandler } from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import compression from 'compression';
import { agentsCollection, roomsCollection } from './db.js';
import apiRoutes from './routes/api.js';
import { PRESET_AGENTS } from '../lib/presets/agents.js';
import { Worker } from 'worker_threads';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
// FIX: Imported `Room` type from its canonical source in `lib/types` instead of from the state store to resolve module export errors.
import { Room } from '../lib/types/index.js';
import { apiKeyService } from './services/apiKey.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fsPromises = fs.promises;

// FIX: Explicitly type `app` as `express.Application` to resolve type
// conflicts with global DOM libraries that were causing overload resolution to fail
// for `app.use` and `app.get`.
const app: express.Application = express();
// FIX: Cast app to `any` to resolve complex type mismatch between Express and Node http server types.
const server = http.createServer(app as any);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} - ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// Production-ready CORS configuration
const allowedOrigins = [
    'http://localhost:5173', 
    'http://localhost:5174', // Vite's default fallback port
    'https://quants.sliplane.app/'
];

// Single, properly typed CORS options object
const corsOptions: cors.CorsOptions = {
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
        if (!origin || allowedOrigins.some(allowed => 
            origin === allowed || 
            origin.replace(/\/$/, '') === allowed.replace(/\/$/, '')
        )) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ["GET", "POST"],
    credentials: true
};

// Create Socket.IO server with CORS options
const io = new SocketIOServer(server, { cors: corsOptions });

const PORT = process.env.PORT || 3001;
const HOST = '0.0.0.0'; // Listen on all available network interfaces
const modelsPublicDirectory = path.resolve(__dirname, '..', 'public', 'models');
const modelsClientDirectory = path.resolve(__dirname, '..', '..', 'client', 'models');

// Middlewares
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));

const compressionMiddleware: RequestHandler = compression({
    filter: (req: Request, res: Response) => {
        const url = req.originalUrl ?? req.url ?? '';
        if (url.endsWith('.vrm')) {
            return false;
        }
        return compression.filter(req, res);
    }
}) as RequestHandler;

app.use(compressionMiddleware);

// Create worker threads
function resolveWorkerFile(name: string): string {
    const workerDir = path.join(__dirname, 'workers');

    const mjsPath = path.join(workerDir, `${name}.mjs`);
    if (fs.existsSync(mjsPath)) {
        return mjsPath;
    }

    const jsPath = path.join(workerDir, `${name}.js`);
    if (fs.existsSync(jsPath)) {
        return jsPath;
    }

    throw new Error(`Worker file not found for ${name} in ${workerDir}`);
}

const arenaWorker = new Worker(resolveWorkerFile('arena.worker'));
const autonomyWorker = new Worker(resolveWorkerFile('autonomy.worker'));

// API Routes
app.use('/api', apiRoutes(arenaWorker, autonomyWorker));

app.get('/models/:file', async (req, res) => {
    try {
        const requestedFile = req.params.file;
        if (!requestedFile || requestedFile.includes('..')) {
            return res.status(400).json({ error: 'Invalid model path' });
        }

        let filePath = path.resolve(modelsPublicDirectory, requestedFile);
        if (!filePath.startsWith(modelsPublicDirectory)) {
            return res.status(403).json({ error: 'Access to this resource is not allowed.' });
        }

        let stats: fs.Stats;
        try {
            stats = await fsPromises.stat(filePath);
        } catch (error: any) {
            if (error?.code === 'ENOENT' && modelsClientDirectory) {
                const alternativePath = path.resolve(modelsClientDirectory, requestedFile);
                if (alternativePath.startsWith(modelsClientDirectory)) {
                    stats = await fsPromises.stat(alternativePath);
                    filePath = alternativePath;
                } else {
                    throw error;
                }
            } else {
                throw error;
            }
        }
        if (!stats.isFile()) {
            return res.status(404).json({ error: 'Model not found' });
        }

        const totalSize = stats.size;
        const rangeHeader = req.headers.range;

        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Type', 'application/octet-stream');

        if (rangeHeader) {
            const matches = rangeHeader.match(/bytes=(\d*)-(\d*)/);
            if (!matches) {
                res.status(416).setHeader('Content-Range', `bytes */${totalSize}`);
                return res.end();
            }

            let start = matches[1] ? Number.parseInt(matches[1], 10) : 0;
            let end = matches[2] ? Number.parseInt(matches[2], 10) : totalSize - 1;

            if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= totalSize) {
                res.status(416).setHeader('Content-Range', `bytes */${totalSize}`);
                return res.end();
            }

            end = Math.min(end, totalSize - 1);
            res.status(206);
            res.setHeader('Content-Range', `bytes ${start}-${end}/${totalSize}`);
            res.setHeader('Content-Length', String(end - start + 1));

            const stream = fs.createReadStream(filePath, { start, end });
            stream.on('error', (error) => {
                console.error('[Server] VRM stream error:', error);
                res.destroy(error);
            });
            stream.pipe(res);
        } else {
            res.setHeader('Content-Length', String(totalSize));
            const stream = fs.createReadStream(filePath);
            stream.on('error', (error) => {
                console.error('[Server] VRM stream error:', error);
                res.destroy(error);
            });
            stream.pipe(res);
        }
    } catch (error: any) {
        if (error?.code === 'ENOENT') {
            return res.status(404).json({ error: 'Model not found' });
        }
        console.error('[Server] Failed to stream VRM model:', error);
        res.status(500).json({ error: 'Failed to load model' });
    }
});

// --- PRODUCTION STATIC FILE SERVING ---
if (process.env.NODE_ENV === 'production') {
    const clientBuildPath = path.resolve(__dirname, '..', '..', 'client');

    app.use(
      '/',
      express.static(clientBuildPath, {
        maxAge: '1d',
        immutable: true,
        setHeaders: (res, servedPath) => {
          if (servedPath.endsWith('.vrm')) {
            res.setHeader('Content-Type', 'application/octet-stream');
          }
        }
      })
    );
    console.log(`[Server] Serving static files from: ${clientBuildPath}`);

    app.get('*', (req: express.Request, res: express.Response) => {
        res.sendFile(path.join(clientBuildPath, 'index.html'));
    });
}

// Socket.IO Connection & Authentication
io.on('connection', (socket) => {
  console.log('[Socket.IO] A user connected:', socket.id);

  socket.on('authenticate', (handle: string) => {
    if (handle) {
      socket.join(handle);
      console.log(`[Socket.IO] User with handle "${handle}" joined their private room.`);
    }
  });

  socket.on('disconnect', () => {
    console.log('[Socket.IO] User disconnected:', socket.id);
  });
});

// Global state to track system pause
let systemPaused = false;
let pauseUntil = 0;
let pauseTimer: NodeJS.Timeout | null = null;

// Function to safely resume the system
function resumeSystem() {
    if (!systemPaused) return; // Already resumed
    
    systemPaused = false;
    console.log(`[Server] Resuming normal operation after pause`);
    io.emit('systemStatus', { status: 'active' });
    
    // Notify workers about resuming
    arenaWorker.postMessage({ type: 'systemResume' });
    autonomyWorker.postMessage({ type: 'systemResume' });
    
    // Trigger an immediate tick to restart processing
    setTimeout(() => {
        console.log('[Server] Sending immediate tick after resume');
        arenaWorker.postMessage({ type: 'tick' });
        setTimeout(() => {
            autonomyWorker.postMessage({ type: 'tick' });
        }, 1000); // Stagger by 1 second
    }, 1000);
}

// Handle messages from workers to emit socket events
const handleWorkerMessage = async (worker: Worker, message: any) => {
    if (message.type === 'requestApiKey') {
        try {
            const key = await apiKeyService.getKeyForAgent(message.payload.agentId);
            const allKeysOnCooldown = key === null && apiKeyService.areAllKeysOnCooldown();
            worker.postMessage({ 
                type: 'apiKeyResponse', 
                payload: { 
                    key, 
                    requestId: message.payload.requestId,
                    agentId: message.payload.agentId,
                    allKeysOnCooldown 
                } 
            });
        } catch (error) {
            console.error('[Server] Error getting API key:', error);
            worker.postMessage({ 
                type: 'apiKeyResponse', 
                payload: { 
                    key: null, 
                    requestId: message.payload.requestId,
                    error: String(error) 
                } 
            });
        }
    } else if (message.type === 'checkAllKeysCooldown') {
        // Direct check if all keys are on cooldown
        const allKeysOnCooldown = apiKeyService.areAllKeysOnCooldown();
        worker.postMessage({
            type: 'allKeysCooldownResponse',
            payload: {
                requestId: message.payload.requestId,
                allKeysOnCooldown
            }
        });
    } else if (message.type === 'reportRateLimit') {
        apiKeyService.reportRateLimit(message.payload.key, message.payload.durationSeconds);
    } else if (message.type === 'worldState') {
        io.emit('worldState', message.payload);
    } else if (message.type === 'globalPause') {
        // Handle global pause request due to rate limits
        const { duration, reason, resumeTime } = message.payload;
        
        // Only update the pause if this one extends beyond the current pause
        if (resumeTime > pauseUntil) {
            systemPaused = true;
            pauseUntil = resumeTime;
            
            console.log(`[Server] Global pause requested: ${reason}. Pausing for ${duration/1000}s until ${new Date(resumeTime).toISOString()}`);
            
            // Notify all clients about the pause
            io.emit('systemStatus', { 
                status: 'paused', 
                reason, 
                resumeTime,
                duration
            });
            
            // Notify workers about the pause
            const workerIds = [arenaWorker.threadId, autonomyWorker.threadId];
            console.log(`[Server] Pausing ticks to workers: ${workerIds.join(', ')}`);
            
            arenaWorker.postMessage({ type: 'systemPause', payload: { until: resumeTime } });
            autonomyWorker.postMessage({ type: 'systemPause', payload: { until: resumeTime } });
            
            // Clear any existing pause timer
            if (pauseTimer) {
                clearTimeout(pauseTimer);
                pauseTimer = null;
            }
            
            // Set a new pause timer
            // FIX: Use `global.setTimeout` to resolve type conflict between Node.js (returns NodeJS.Timeout) and browser (returns number) environments.
            // DEV-FIX: Cast to 'any' to work around a broken type environment where `global.setTimeout` still resolves to a `number` instead of `NodeJS.Timeout`.
            pauseTimer = global.setTimeout(() => {
                if (Date.now() >= pauseUntil) {
                    pauseTimer = null;
                    resumeSystem();
                }
            }, duration) as any;
        }
    } else if (message.type === 'socketEmit') {
        const { event, payload, room } = message;
        if (room) {
            io.to(room).emit(event, payload);
        } else {
            io.emit(event, payload);
        }
    }
};

arenaWorker.on('message', (message) => handleWorkerMessage(arenaWorker, message));
autonomyWorker.on('message', (message) => handleWorkerMessage(autonomyWorker, message));

arenaWorker.on('error', (err) => console.error('[ArenaWorker Error]', err));
autonomyWorker.on('error', (err) => console.error('[AutonomyWorker Error]', err));

async function seedMCPs() {
    console.log('[Server] Seeding MCPs...');
    const operations = PRESET_AGENTS.map(agent => ({
        updateOne: {
            filter: { id: agent.id },
            update: { $setOnInsert: agent },
            upsert: true
        }
    }));
    if (operations.length > 0) {
      const result = await agentsCollection.bulkWrite(operations);
      console.log(`[Server] MCPs seeded. Matched: ${result.matchedCount}, Upserted: ${result.upsertedCount}`);
    } else {
       console.log('[Server] No MCPs to seed.');
    }
}

async function seedRooms() {
    console.log('[Server] Seeding Rooms...');
    const roomCount = await roomsCollection.countDocuments();
    const desiredRoomCount = 10;

    if (roomCount < desiredRoomCount) {
        const operations = Array.from({ length: desiredRoomCount }).map((_, i) => {
            const room: Room = {
                id: `room-${i + 1}`,
                agentIds: [],
                hostId: null,
                topics: [],
                warnFlags: 0,
                rules: ['All intel trades are final.', 'No spamming or off-topic discussions.'],
                activeOffer: null,
                vibe: 'General Chat ☕️',
            };
            return {
                updateOne: {
                    filter: { id: room.id },
                    update: { $setOnInsert: room },
                    upsert: true,
                },
            };
        });

        if (operations.length > 0) {
            const result = await roomsCollection.bulkWrite(operations);
            console.log(`[Server] Rooms seeded. Matched: ${result.matchedCount}, Upserted: ${result.upsertedCount}`);
        }
    } else {
        console.log('[Server] Rooms already seeded.');
    }
}

export async function startServer() {
  try {
    // connectDB is called in index.ts before this function
    
    await seedMCPs();
    await seedRooms();
    await apiKeyService.initialize();
    
        // Stagger the directors to avoid simultaneous API calls
    setInterval(() => {
        if (!systemPaused) {
            console.log('[Server Heartbeat] Ticking ArenaDirector...');
            arenaWorker.postMessage({ type: 'tick' });
        } else {
            console.log(`[Server Heartbeat] ArenaDirector tick skipped - system paused until ${new Date(pauseUntil).toISOString()}`);
        }
    }, 30000);

    setTimeout(() => {
        setInterval(() => {
            if (!systemPaused) {
                console.log('[Server Heartbeat] Ticking AutonomyDirector...');
                autonomyWorker.postMessage({ type: 'tick' });
            } else {
                console.log(`[Server Heartbeat] AutonomyDirector tick skipped - system paused until ${new Date(pauseUntil).toISOString()}`);
            }
        }, 30000);
    }, 15000); // Offset the autonomy director by 15 seconds

    // World State Sync
    setInterval(() => {
        arenaWorker.postMessage({ type: 'getWorldState' });
    }, 2000); // Sync every 2 seconds

    server.listen(Number(PORT), HOST, () => {
      console.log(`[Server] Express server with Socket.IO is running on port ${PORT}`);
    });

  } catch (error) {
    console.error("[Server] Failed to start server:", error);
    // FIX: Removed explicit `import process from 'process'` to resolve type conflicts. This allows TypeScript to correctly use the global Node.js `process` object type, which includes the `exit` method and fixes the runtime error.
    process.exit(1);
  }
}