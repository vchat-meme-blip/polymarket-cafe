import { io, Socket } from 'socket.io-client';
import { useUser } from '../state';
import { useArenaStore } from '../state/arena';
import { useAutonomyStore } from '../state/autonomy';
import { SOCKET_URL } from '../config.js';
import { Interaction } from '../state/arena.js';

class SocketService {
  private socket: Socket | null = null;

  connect() {
    if (this.socket && this.socket.connected) {
      return;
    }

    // The URL now dynamically points to the correct server
    this.socket = io(SOCKET_URL, {
      transports: ['websocket'],
    });

    this.socket.on('connect', () => {
      console.log('[Socket.IO] Connected to server.');
      // Authenticate with the server to join a private room
      const handle = useUser.getState().handle;
      if (handle) {
        this.socket?.emit('authenticate', handle);
      }
    });

    this.socket.on('disconnect', () => {
      console.log('[Socket.IO] Disconnected from server.');
    });

    this.registerListeners();
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  private registerListeners() {
    if (!this.socket) return;
    
    this.socket.on('agentMoved', (data: { agentId: string; roomId: string | null }) => {
        console.log('[Socket.IO] Received agentMoved:', data);
        useArenaStore.getState().moveAgentFromSocket(data.agentId, data.roomId);
    });

    // OPTIMIZED LISTENER: The payload now includes agentIds, preventing an inefficient client-side lookup.
    this.socket.on('newConversationTurn', (data: { roomId: string; turn: Interaction, agentIds: [string, string] }) => {
        console.log('[Socket.IO] Received newConversationTurn:', data);
        if (data.agentIds && data.agentIds.length === 2) {
            const [agent1Id, agent2Id] = data.agentIds;
            useArenaStore.getState().addConversationTurnFromSocket(agent1Id, agent2Id, data.turn);
        } else {
            console.warn('[Socket.IO] Received conversation turn for a room that does not have 2 agents.', data);
        }
    });

    this.socket.on('newIntel', (data: { intel: any }) => {
        console.log('[Socket.IO] Received newIntel for me:', data);
        // The server now sends intel only to the intended user, so no ownerHandle check is needed here.
        useAutonomyStore.getState().addIntelFromSocket(data.intel);
    });
  }
}

export const socketService = new SocketService();
