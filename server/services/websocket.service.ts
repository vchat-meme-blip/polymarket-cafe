import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';

class WebSocketService {
  private static instance: WebSocketService;
  private io: SocketIOServer | null = null;
  private connections: Map<string, Socket> = new Map();
  private connectionCounts: Map<string, number> = new Map();
  private readonly MAX_CONNECTIONS_PER_IP = 5;
  private readonly RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
  private readonly MAX_EVENTS_PER_WINDOW = 30;
  private eventCounts: Map<string, { count: number; resetAt: number }> = new Map();
  private isInitialized = false;

  public static getInstance(): WebSocketService {
    if (!WebSocketService.instance) {
      WebSocketService.instance = new WebSocketService();
    }
    return WebSocketService.instance;
  }

  private constructor() {}

  init(server: HttpServer) {
    if (this.isInitialized) {
      console.log('[WebSocket] WebSocket server already initialized');
      return;
    }

    console.log('[WebSocket] Initializing WebSocket server...');
    this.isInitialized = true;
    this.io = new SocketIOServer(server, {
      path: '/socket.io/', // FIX: Explicitly set the path
      cors: {
        origin: (origin, callback) => {
          const allowedOrigins = [
            'https://polycafe.life',
            'https://www.polycafe.life',
            'https://polymarket-cafe.sliplane.app',
            ...(process.env.NODE_ENV !== 'production' ? [
              'http://localhost:3000',
              'http://localhost:5173'
            ] : [])
          ];

          if (!origin || allowedOrigins.some(o => origin.startsWith(o))) {
            callback(null, true);
          } else {
            console.warn('[WebSocket] Blocked connection from origin:', origin);
            callback(new Error('Not allowed by CORS'));
          }
        },
        methods: ['GET', 'POST'],
        credentials: true
      },
      transports: ['websocket', 'polling']
    });

    this.io.on('connection', (socket) => {
      const clientIp = socket.handshake.headers['x-forwarded-for'] || 
                      socket.conn.remoteAddress;
      
      if (!clientIp) {
        console.warn('[WebSocket] Could not determine client IP, disconnecting');
        return socket.disconnect(true);
      }

      const ip = Array.isArray(clientIp) ? clientIp[0] : clientIp.split(',')[0].trim();
      const connectionCount = this.connectionCounts.get(ip) || 0;

      if (connectionCount >= this.MAX_CONNECTIONS_PER_IP) {
        console.warn(`[WebSocket] Too many connections from IP: ${ip}`);
        return socket.disconnect(true);
      }

      const connectionId = socket.id;
      this.connections.set(connectionId, socket);
      this.connectionCounts.set(ip, connectionCount + 1);

      console.log(`[WebSocket] Client connected: ${connectionId} (${ip})`);

      socket.on('disconnect', () => {
        this.connections.delete(connectionId);
        const count = (this.connectionCounts.get(ip) || 1) - 1;
        if (count <= 0) {
          this.connectionCounts.delete(ip);
        } else {
          this.connectionCounts.set(ip, count);
        }
        console.log(`[WebSocket] Client disconnected: ${connectionId} (${ip})`);
      });

      socket.use((event, next) => {
        const now = Date.now();
        const key = `${ip}:${event[0]}`; 
        const rateLimit = this.eventCounts.get(key);

        if (rateLimit && rateLimit.resetAt > now) {
          if (rateLimit.count >= this.MAX_EVENTS_PER_WINDOW) {
            console.warn(`[WebSocket] Rate limit exceeded for ${key}`);
            return next(new Error('Rate limit exceeded'));
          }
          rateLimit.count += 1;
        } else {
          this.eventCounts.set(key, {
            count: 1,
            resetAt: now + this.RATE_LIMIT_WINDOW_MS
          });
        }
        next();
      });

      socket.on('error', (error) => {
        console.error(`[WebSocket] Error from ${connectionId}:`, error);
      });
    });

    setInterval(() => {
      const now = Date.now();
      for (const [key, value] of this.eventCounts.entries()) {
        if (value.resetAt <= now) {
          this.eventCounts.delete(key);
        }
      }
    }, this.RATE_LIMIT_WINDOW_MS);
  }

  broadcastToRoom(roomId: string, event: string, data: any) {
    this.io?.to(roomId).emit(event, data);
  }

  getIO(): SocketIOServer | null {
    return this.io;
  }
}

export const webSocketService = WebSocketService.getInstance();