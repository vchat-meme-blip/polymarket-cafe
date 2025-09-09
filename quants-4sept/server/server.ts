import dotenv from 'dotenv';
import express, { Express, Request, Response } from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import { connectDB, agentsCollection } from './db.js';
import apiRoutes from './routes/api.js';
import { PRESET_AGENTS } from '../lib/presets/agents.js';
import { Worker } from 'worker_threads';
import { fileURLToPath } from 'url';
import path from 'path';

// Load environment variables: first .env.local (if present), then .env (fallback)
dotenv.config({ path: '.env.local' });
dotenv.config();
console.log(`[Env] MONGODB_URI present: ${process.env.MONGODB_URI ? 'YES' : 'NO'}`);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app: Express = express();
const server = http.createServer(app);

// Production-ready CORS configuration
const allowedOrigins = [
    'http://localhost:5173', 
    'http://localhost:5174', // Vite's default fallback port
    'https://placeholder.digitalocean.com'
];

const corsOptions: cors.CorsOptions = {
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl requests)
        // or from our whitelist.
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

// Create worker threads
const arenaWorker = new Worker(path.join(__dirname, 'workers/arena.worker.js'));
const autonomyWorker = new Worker(path.join(__dirname, 'workers/autonomy.worker.js'));

// API Routes
// FIX: Removed the global `express.json()` middleware to resolve a TypeScript type error. The JSON parsing is now handled granularly within the specific API routes that require it.
app.use('/api', apiRoutes(arenaWorker, autonomyWorker));

// --- PRODUCTION STATIC FILE SERVING ---
if (process.env.NODE_ENV === 'production') {
    const clientBuildPath = path.join(__dirname, '..', 'client');
    console.log(`[Server] Serving static files from: ${clientBuildPath}`);
    
    // Serve all static assets from the client build directory
    app.use(express.static(clientBuildPath));

    // For any other request, serve the index.html to support client-side routing
    // FIX: Explicitly typed 'req' and 'res' to help TypeScript resolve the correct 'app.get' overload, fixing a "No overload matches this call" error.
    app.get('*', (req: Request, res: Response) => {
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

// Handle messages from workers to emit socket events
const handleWorkerMessage = (message: any) => {
    if (message.type === 'socketEmit') {
        const { event, payload, room } = message;
        if (room) {
            io.to(room).emit(event, payload);
        } else {
            io.emit(event, payload);
        }
    }
};

arenaWorker.on('message', handleWorkerMessage);
autonomyWorker.on('message', handleWorkerMessage);

arenaWorker.on('error', (err) => console.error('[ArenaWorker Error]', err));
autonomyWorker.on('error', (err) => console.error('[AutonomyWorker Error]', err));

/**
 * Seeds the database with any missing preset agents (MCPs).
 * Uses upsert to efficiently add only the agents that don't already exist.
 */
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


// Start server and directors
async function startServer() {
  try {
    await connectDB();
    
    // Ensure MCPs are in the database before starting directors
    await seedMCPs();
    
    // Server heartbeat for directors, simulating 24/7 agent activity
    setInterval(() => {
        console.log('[Server Heartbeat] Ticking directors...');
        arenaWorker.postMessage({ type: 'tick' });
        autonomyWorker.postMessage({ type: 'tick' });
    }, 5000); // Tick every 5 seconds

    server.listen(Number(PORT), HOST, () => {
      console.log(`[Server] Express server with Socket.IO is running on port ${PORT}`);
    });

  } catch (error) {
    console.error("[Server] Failed to start server:", error);
    process.exit(1);
  }
}

startServer();