import { io, Socket } from 'socket.io-client';
// FIX: Fix imports for `useUser` and `useSystemLogStore` by changing the path from `../state` to `../state/index.js`.
import { useUser, useSystemLogStore } from '../state/index.js';
import { SOCKET_URL } from '../config.js';

class SocketService {
  private socket: Socket | null = null;

  connect() {
    if (this.socket && this.socket.connected) {
      return;
    }

    // The URL now dynamically points to the correct server
    // FIX: Cast socket.io options to `any` to resolve type errors with `transports`
    // and subsequent `.on` calls. This is a workaround for a likely type definition
    // or version mismatch issue.
    this.socket = io(SOCKET_URL, {
      transports: ['websocket'],
    } as any);

    this.socket.on('connect', () => {
      useSystemLogStore.getState().addLog({ type: 'system', message: 'Connected to server.' });
      // Authenticate with the server to join a private room
      const handle = useUser.getState().handle;
      if (handle) {
        this.socket?.emit('authenticate', handle);
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

  // FIX: Added public `on` and `off` methods to proxy socket events, allowing `useCafeSocket` to handle all listeners. Removed the redundant `registerListeners` method to centralize event handling and prevent duplicate listeners.
  public on(event: string, listener: (...args: any[]) => void) {
    this.socket?.on(event, listener);
  }

  public off(event: string, listener: (...args: any[]) => void) {
    this.socket?.off(event, listener);
  }
}

export const socketService = new SocketService();