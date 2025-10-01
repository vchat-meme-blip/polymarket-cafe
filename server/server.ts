// Environment variables are pre-loaded by the --import flag in the start script.

// FIX: Changed express import to use the default export and explicitly import types to prevent conflicts with global DOM types.
import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import { agentsCollection, roomsCollection } from './db.js';
import apiRoutes from './routes/api.js';
import { PRESET_AGENTS } from '../lib/presets/agents.js';
import { Worker } from 'worker_threads';
import { fileURLToPath } from 'url';
import path from 'path';
// FIX: Imported `Room` type from its canonical source in `lib/types` instead of from the state store to resolve module export errors.
import { Room } from '../lib/types/index.js';
import { apiKeyService } from './services/apiKey.service.js';
// FIX: Import 'process' to provide correct types for process.exit and resolve TypeScript error.
import process from 'process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// FIX: Explicitly type `app` as `express.Application` to resolve type
// conflicts with global DOM libraries that were causing overload resolution to fail
// for `app.use` and `app.get`.
// FIX: Use express.Application to avoid type conflicts with global DOM types.
const app: express.Application = express();
// FIX: Cast app to `any` to resolve complex type mismatch between Express and Node http server types.
const server = http.createServer(app as any);

// Production-ready CORS configuration
const allowedOrigins = [
    'http://localhost:5173', 
    'http://localhost:5174', // Vite's default fallback port
    'https://placeholder.digitalocean.com'
];

const corsOptions: cors.CorsOptions = {
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    }
};


const io = new SocketIOServer(server, {
  cors: corsOptions
});

const PORT = process.env.PORT || 3001;
const HOST = '0.0.0.0'; // Listen on all available network interfaces

// Middlewares
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));

// Create worker threads
const arenaWorker = new Worker(path.join(__dirname, 'workers/arena.worker.js'));
const autonomyWorker = new Worker(path.join(__dirname, 'workers/autonomy.worker.js'));

// API Routes
app.use('/api', apiRoutes(arenaWorker, autonomyWorker));

// Health Check Endpoint
app.get('/api/health', (req: express.Request, res: express.Response) => {
  res.status(200).json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage()
  });
});

// --- PRODUCTION STATIC FILE SERVING ---
if (process.env.NODE_ENV === 'production') {
    const clientBuildPath = path.join(__dirname, '..', 'dist', 'client');
    // FIX: Explicitly providing the path parameter '/' helps TypeScript resolve the correct `app.use` overload, resolving the "is not assignable to parameter of type 'PathParams'" error.
    app.use('/', express.static(clientBuildPath));
    console.log(`[Server] Serving static files from: ${clientBuildPath}`);
    
    // FIX: Explicitly typing req and res with imported express types is necessary to resolve ambiguity with global DOM types.
    // FIX: Use express.Request and express.Response to avoid type conflicts.
    app.get('*', (req: express.Request, res: express.Response) => {
        // FIX: The 'sendFile' method exists on the Express Response object. Explicitly typing 'res' resolves this error.
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
            pauseTimer = setTimeout(() => {
                if (Date.now() >= pauseUntil) {
                    pauseTimer = null;
                    resumeSystem();
                }
            }, duration);
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
    process.exit(1);
  }
}
