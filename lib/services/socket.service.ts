import { io, Socket } from 'socket.io-client';
import { useUser, useSystemLogStore } from '../state/index.js';
import { SOCKET_URL } from '../config.js';

class SocketService {
  private socket: Socket | null = null;

  connect() {
    if (this.socket && this.socket.connected) {
      return;
    }

    this.socket = io(SOCKET_URL, {
      transports: ['websocket'],
    } as any);

    this.socket.on('connect', () => {
      useSystemLogStore.getState().addLog({ type: 'system', message: 'Connected to server.' });
      const handle = useUser.getState().handle;
      if (handle) {
        this.socket?.emit('authenticate', handle);
        console.log(`[SocketService] Emitted authenticate for: ${handle}`);
      }
    });

    this.socket.on('disconnect', () => {
      useSystemLogStore.getState().addLog({ type: 'system', message: 'Disconnected from server.' });
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  public on(event: string, listener: (...args: any[]) => void) {
    this.socket?.on(event, listener);
  }

  public off(event: string, listener: (...args: any[]) => void) {
    this.socket?.off(event, listener);
  }
}

export const socketService = new SocketService();