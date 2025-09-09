import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useArenaStore } from '../lib/state/arena';
import { Agent, Room } from '../lib/types';
import { apiService } from '../lib/services/api.service';
import { useAgent, useUI, useUser } from '../lib/state';

const SERVER_URL = 'http://localhost:3001'; // Your server URL

export function useCafeSocket() {
  const [socket, setSocket] = useState<Socket | null>(null);
          
      const { 
    syncWorldState, 
    setThinkingAgent, 
    addConversationTurn, 
    addRoom, 
    removeRoom, 
    recordActivityInRoom,
    updateRoomFromSocket,
    setLastTradeDetails 
  } = useArenaStore();

  useEffect(() => {
    const newSocket = io(SERVER_URL);
    setSocket(newSocket);

    console.log('[CafeSocket] Connecting to server...');

        newSocket.on('connect', () => {
      console.log('[CafeSocket] Successfully connected to server with ID:', newSocket.id);
                  const userHandle = useUser.getState().handle;
      if (userHandle) {
        console.log(`[CafeSocket] Authenticating as ${userHandle} and bootstrapping data...`);
        newSocket.emit('authenticate', userHandle);
        apiService.bootstrap(userHandle);
      }
    });

    newSocket.on('disconnect', (reason) => {
      console.log(`[CafeSocket] Disconnected from server: ${reason || 'unknown reason'}`);
    });

        newSocket.on('roomCreated', (data: { roomId: string; agents: Agent[] }) => {
      console.log('[CafeSocket] Received roomCreated:', data);
      const newRoom: Room = {
        id: data.roomId,
        agentIds: data.agents.map(a => a.id),
        hostId: data.agents[0]?.id || null, // Simple assumption
        topics: [], // Not tracked in cafe service
        warnFlags: 0,
        rules: [],
        activeOffer: null,
        vibe: 'General Chat ☕️',
      };
      addRoom(newRoom);
    });

        newSocket.on('newConversationTurn', (data: { roomId: string; turn: any }) => {
      console.log('[CafeSocket] Received newConversationTurn:', data);
      const room = useArenaStore.getState().rooms.find(r => r.id === data.roomId);
      if (room) {
        const otherAgentId = room.agentIds.find(id => id !== data.turn.agentId);
        if (otherAgentId) {
          addConversationTurn(data.turn.agentId, otherAgentId, data.turn);
          recordActivityInRoom(data.roomId);
        }
      }
    });

            newSocket.on('worldState', (worldState) => {
      console.log('[CafeSocket] Received worldState update');
      // Use worldState as the authoritative source of truth for the entire application state
      syncWorldState(worldState);
    });
    
    // Request a fresh worldState from the server every 10 seconds to ensure UI consistency
    const worldStateInterval = setInterval(() => {
      if (newSocket.connected) {
        console.log('[CafeSocket] Requesting worldState refresh');
        newSocket.emit('requestWorldState');
      }
    }, 10000);

    newSocket.on('agentThinking', (data: { agentId: string; isThinking: boolean }) => {
      setThinkingAgent(data.agentId, data.isThinking);
    });

        newSocket.on('roomDestroyed', (data: { roomId: string }) => {
      console.log('[CafeSocket] Received roomDestroyed:', data);
      removeRoom(data.roomId);
    });

    newSocket.on('roomUpdated', (updatedRoom: Room) => {
      console.log('[CafeSocket] Received roomUpdated:', updatedRoom);
      updateRoomFromSocket(updatedRoom);
    });
    
    newSocket.on('tradeCompleted', (data: { roomId: string; fromId: string; toId: string; token: string; price: number }) => {
      console.log('[CafeSocket] Received tradeCompleted:', data);
      setLastTradeDetails({
        roomId: data.roomId,
        fromId: data.fromId,
        toId: data.toId,
        timestamp: Date.now(),
        token: data.token,
        price: data.price
      });
    });

    // Cleanup on component unmount
    return () => {
      console.log('[CafeSocket] Disconnecting...');
      clearInterval(worldStateInterval);
      newSocket.disconnect();
    };
  // We're using functions from useArenaStore which have stable references
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return socket;
}
