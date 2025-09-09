import { io, Socket } from 'socket.io-client';
import { useUser, useSystemLogStore, useAgent } from '../state';
import { useArenaStore } from '../state/arena';
import { useAutonomyStore } from '../state/autonomy';
import { SOCKET_URL } from '../config.js';
// FIX: Imported `Interaction` and `Room` types from their canonical source in `lib/types` instead of from the state store to resolve module export errors.
import { Interaction, Room } from '../types/index.js';

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
        const agentName = useAgent.getState().availablePresets.find(a => a.id === data.agentId)?.name || data.agentId;
        const message = data.roomId 
            ? `Agent ${agentName} moved to Room ${data.roomId}.`
            : `Agent ${agentName} is now wandering the Café.`;
        useSystemLogStore.getState().addLog({ type: 'move', message });
        useArenaStore.getState().moveAgentFromSocket(data.agentId, data.roomId);
    });

    // OPTIMIZED LISTENER: The payload now includes agentIds, preventing an inefficient client-side lookup.
    this.socket.on('newConversationTurn', (data: { roomId: string; turn: Interaction, agentIds: [string, string] }) => {
        // FIX: Re-enabled browser console logging for debugging agent conversations.
        console.log('[Socket.IO] Received newConversationTurn:', data);
        const message = `${data.turn.agentName} in Room ${data.roomId}: "${data.turn.text.slice(0, 50)}..."`;
        useSystemLogStore.getState().addLog({ type: 'conversation', message });
        if (data.agentIds && data.agentIds.length === 2) {
            const [agent1Id, agent2Id] = data.agentIds;
            useArenaStore.getState().addConversationTurnFromSocket(agent1Id, agent2Id, data.turn);
        } else {
            console.warn('[Socket.IO] Received conversation turn for a room that does not have 2 agents.', data);
        }
    });

    this.socket.on('newIntel', (data: { intel: any }) => {
        const message = `New intel discovered for $${data.intel.token} for user ${data.intel.ownerHandle}.`;
        useSystemLogStore.getState().addLog({ type: 'intel', message });
        // The server now sends intel only to the intended user, so no ownerHandle check is needed here.
        useAutonomyStore.getState().addIntelFromSocket(data.intel);
    });

    this.socket.on('roomUpdated', (data: { room: Room }) => {
        const message = `Room ${data.room.id} state updated. Offer: ${data.room.activeOffer ? data.room.activeOffer.token : 'None'}`;
        useSystemLogStore.getState().addLog({ type: 'system', message });
        useArenaStore.getState().updateRoomFromSocket(data.room);
    });
  }
}

export const socketService = new SocketService();