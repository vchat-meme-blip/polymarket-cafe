import { io, Socket } from 'socket.io-client';

type MessageHandler = (data: any) => void;

export class WebSocketService {
  private socket: Socket | null = null;
  private messageHandlers: Map<string, MessageHandler[]> = new Map();
  private connectionPromise: Promise<Socket> | null = null;
  private readonly MAX_RETRIES = 5;
  private retryCount = 0;
  private retryDelay = 1000; // Start with 1 second
  private maxRetryDelay = 30000; // Max 30 seconds
  private connectionUrl: string;
  private isConnected = false;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // Use wss:// for secure connections, fallback to ws:// for development
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    this.connectionUrl = `${protocol}//${host}`;
  }

  private initializeSocket(): Socket {
    const socket = io(this.connectionUrl, {
      reconnection: true,
      reconnectionAttempts: this.MAX_RETRIES,
      reconnectionDelay: this.retryDelay,
      reconnectionDelayMax: this.maxRetryDelay,
      timeout: 10000,
      transports: ['websocket', 'polling'],
      autoConnect: true,
      withCredentials: true,
    } as any);

    socket.on('connect', () => {
      console.log('[WebSocket] Connected');
      this.isConnected = true;
      this.retryCount = 0;
      this.retryDelay = 1000; // Reset delay on successful connection
    });

    socket.on('disconnect', (reason) => {
      this.isConnected = false;
      console.log(`[WebSocket] Disconnected: ${reason}`);
      
      if (reason === 'io server disconnect') {
        // Server intentionally disconnected, try to reconnect after delay
        this.scheduleReconnect();
      }
    });

    socket.on('connect_error', (error) => {
      console.error('[WebSocket] Connection error:', error.message);
      this.retryCount++;
      
      // Exponential backoff with jitter
      const delay = Math.min(
        this.retryDelay * Math.pow(2, this.retryCount) + Math.random() * 1000,
        this.maxRetryDelay
      );
      
      console.log(`[WebSocket] Will attempt to reconnect in ${Math.round(delay / 1000)} seconds...`);
      this.scheduleReconnect(delay);
    });

    // Handle incoming messages
    socket.onAny((event, ...args) => {
      const handlers = this.messageHandlers.get(event) || [];
      handlers.forEach(handler => {
        try {
          handler(args[0]);
        } catch (error) {
          console.error(`[WebSocket] Error in handler for ${event}:`, error);
        }
      });
    });

    return socket;
  }

  private scheduleReconnect(delay = this.retryDelay) {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    
    this.reconnectTimeout = setTimeout(() => {
      if (!this.isConnected) {
        console.log('[WebSocket] Attempting to reconnect...');
        this.connect();
      }
    }, delay);
  }

  public async connect(): Promise<Socket> {
    if (this.socket?.connected) {
      return this.socket;
    }

    if (!this.connectionPromise) {
      this.connectionPromise = new Promise((resolve, reject) => {
        const socket = this.initializeSocket();
        
        const onConnect = () => {
          socket.off('connect', onConnect);
          socket.off('connect_error', onError);
          resolve(socket);
        };
        
        const onError = (error: Error) => {
          socket.off('connect', onConnect);
          socket.off('connect_error', onError);
          reject(error);
        };
        
        socket.once('connect', onConnect);
        socket.once('connect_error', onError);
        
        this.socket = socket;
      });
    }

    return this.connectionPromise;
  }

  public disconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    
    this.connectionPromise = null;
    this.isConnected = false;
  }

  public on(event: string, handler: MessageHandler): () => void {
    if (!this.messageHandlers.has(event)) {
      this.messageHandlers.set(event, []);
    }
    
    const handlers = this.messageHandlers.get(event)!;
    handlers.push(handler);
    
    // Return cleanup function
    return () => {
      const index = handlers.indexOf(handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
      
      if (handlers.length === 0) {
        this.messageHandlers.delete(event);
      }
    };
  }

  public off(event: string, handler: MessageHandler): void {
    const handlers = this.messageHandlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
      
      if (handlers.length === 0) {
        this.messageHandlers.delete(event);
      }
    }
  }

  public emit(event: string, data: any): void {
    if (this.socket?.connected) {
      this.socket.emit(event, data);
    } else {
      console.warn(`[WebSocket] Cannot emit ${event}: Not connected`);
    }
  }

  public joinRoom(roomId: string): void {
    if (this.socket?.connected) {
      this.socket.emit('join', { roomId });
    }
  }

  public leaveRoom(roomId: string): void {
    if (this.socket?.connected) {
      this.socket.emit('leave', { roomId });
    }
  }
}

export const webSocketService = new WebSocketService();