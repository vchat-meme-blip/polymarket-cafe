/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { create } from 'zustand';
import { subscribeWithSelector, persist, createJSONStorage } from 'zustand/middleware';
// FIX: Import types from canonical source
import { Agent, Room, Interaction, TradeRecord } from '../types/index.js';
// FIX: Fix import for `useAgent` by changing the path from `../state.js` to `../state/index.js`.
import { useAgent } from '../state/index.js';
import { useAutonomyStore } from './autonomy.js';

// A unique identifier for the user in conversation logs.
export const USER_ID = 'user';

// The data structure received from the server's bootstrap endpoint
interface ServerHydrationData {
    rooms: Room[];
    conversations: Interaction[];
}

export type ArenaState = {
  rooms: Room[];
  agentLocations: Record<string, string | null>; // { agentId: roomId | null }
  agentReputations: Record<string, number>; // { agentId: score }
  agentConversations: Record<string, Record<string, Interaction[]>>; // { agent1Id: { agent2Id: [...] } }
  joinTimestamps: Record<string, number>; // { agentId: timestamp }
  activeChat: Record<string, { agentId: string; text: string } | null>;
  joinRequests: Record<string, string | null>; // { roomId: requestingAgentId | null }
  thinkingAgents: Set<string>;
  activeConversations: Record<string, number>; // { roomId: lastMessageTimestamp }
  lastSyncTimestamp: number; // When the last worldState sync happened
  tradeHistory: TradeRecord[];
  lastTradeDetails: TradeRecord | null;
  systemPaused: boolean;
  hydrate: (data?: ServerHydrationData) => void;
  // Actions initiated by client UI
  moveAgentToRoom: (agentId: string, roomId: string) => void;
  removeAgentFromRoom: (agentId: string) => void;
  // Actions initiated by socket events
  moveAgentFromSocket: (agentId: string, roomId: string | null) => void;
  addConversationTurnFromSocket: (agent1Id: string, agent2Id: string, interaction: Interaction) => void;
  updateRoomFromSocket: (room: Room) => void;
  addRoom: (room: Room) => void;
  recordActivityInRoom: (roomId: string) => void;
  // FIX: Add systemPaused to the syncWorldState signature.
  syncWorldState: (worldState: { rooms: Room[], agentLocations: Record<string, string | null>, thinkingAgents: string[], systemPaused?: boolean }) => void;
  recordTrade: (trade: TradeRecord) => void;
  setLastTradeDetails: (trade: TradeRecord | null) => void;
  removeRoom: (roomId: string) => void;

  kickAgentFromRoom: (agentToKickId: string, roomId: string) => void;
  addConversationTurn: (
    agent1Id: string,
    agent2Id: string,
    interaction: Interaction,
  ) => void;
  setActiveChat: (roomId:string, agentId: string, text: string) => void;
  clearActiveChat: (roomId: string) => void;
  createJoinRequest: (roomId: string, requestingAgentId: string) => void;
  resolveJoinRequest: (roomId: string, accepted: boolean) => void;
  incrementWarnFlag: (roomId: string) => void;
  setRoomRules: (roomId: string, rules: string[]) => void;
  setRoomVibe: (roomId: string, vibe: string) => void;
  updateReputation: (agentId: string, change: number) => void;
  setThinkingAgent: (agentId: string, isThinking: boolean) => void;
  createAndJoinRoom: (agentId: string) => void;
  _ensureRoomExists: (roomId: string) => void;
};

function calculateRoomTopics(agentIds: string[]): string[] {
  const topics = new Set<string>();
  agentIds.forEach(id => {
    const agent = useAgent.getState().availablePersonal.find(a => a.id === id) || useAgent.getState().availablePresets.find(a => a.id === id);
    agent?.topics.forEach((topic: string) => topics.add(topic));
  });
  return Array.from(topics);
}

const DEFAULT_ROOM_RULES = [
    'All intel trades are final.',
    'No spamming or off-topic discussions.',
    'Host reserves the right to kick members for rule violations.',
    'Be respectful, even during shrewd negotiations.'
];

const _moveAgent = (
  state: ArenaState,
  agentId: string,
  toRoomId: string | null,
): ArenaState => {
  let newRooms = [...state.rooms];
  let newAgentLocations = { ...state.agentLocations };
  const newJoinTimestamps = { ...state.joinTimestamps };

  // --- ROBUST CLEANUP ---
  // Unconditionally remove the agent from ANY room they might be in to prevent duplication.
  newRooms = newRooms.map(room => {
    if (room.agentIds.includes(agentId)) {
      const newAgentIds = room.agentIds.filter(id => id !== agentId);
      return {
        ...room,
        agentIds: newAgentIds,
        topics: calculateRoomTopics(newAgentIds),
        // If the host leaves, reassign. If the room is now empty, clear the host.
        hostId: newAgentIds.length > 0
            ? (room.hostId === agentId ? newAgentIds[0] : room.hostId)
            : null,
      };
    }
    return room;
  });
  delete newJoinTimestamps[agentId];


  if (toRoomId) {
    const toRoomIndex = newRooms.findIndex(r => r.id === toRoomId);
    if (toRoomIndex !== -1) {
        const toRoom = newRooms[toRoomIndex];
        if (toRoom.agentIds.length < 2 && !toRoom.agentIds.includes(agentId)) {
            const newAgentIds = [...toRoom.agentIds, agentId];
            const updatedToRoom = {
                ...toRoom,
                agentIds: newAgentIds,
                topics: calculateRoomTopics(newAgentIds),
                hostId: toRoom.hostId === null ? agentId : toRoom.hostId,
            };
            newRooms[toRoomIndex] = updatedToRoom;
            newJoinTimestamps[agentId] = Date.now();
            newAgentLocations[agentId] = toRoomId;
        } else {
             console.warn(`[Arena] Agent ${agentId} cannot join full or existing room ${toRoomId}. Making wander.`);
             newAgentLocations[agentId] = null; // Agent cannot join, so they are wandering.
        }
    }
  } else {
      newAgentLocations[agentId] = null; // Explicitly set to wandering if toRoomId is null
  }
  
  const userAgentId = useAgent.getState().current.id;
  if (agentId === userAgentId) {
    useAutonomyStore.getState().setActivity(newAgentLocations[agentId] ? 'IN_CAFE' : 'IDLE');
  }

  return { ...state, rooms: newRooms, agentLocations: newAgentLocations, joinTimestamps: newJoinTimestamps };
};

export const useArenaStore = create(
  subscribeWithSelector(
    persist<ArenaState>(
      (set, get) => ({
        rooms: [],
        agentLocations: {},
        agentReputations: {},
        agentConversations: {},
        joinTimestamps: {},
        activeChat: {},
        joinRequests: {},
        thinkingAgents: new Set(),
        activeConversations: {},
        lastSyncTimestamp: Date.now(),
        tradeHistory: [],
        lastTradeDetails: null,
        systemPaused: false,

        hydrate: (data) => set(state => {
          if (!data || !Array.isArray(data.rooms)) {
            return state;
          }

          const newState = { ...state, ...data };

          const agentLocations: Record<string, string | null> = {};
          const agentReputations: Record<string, number> = {};
          
          const allAgents = [...useAgent.getState().availablePersonal, ...useAgent.getState().availablePresets];
          allAgents.forEach((agent: Agent) => {
              agentLocations[agent.id] = null;
              agentReputations[agent.id] = agent.reputation || 100;
          });
          
          data.rooms.forEach(room => {
            room.agentIds.forEach(agentId => {
              agentLocations[agentId] = room.id;
            });
          });

          return { 
            ...newState, 
            agentLocations, 
            agentReputations 
          };
        }),

        moveAgentToRoom: (agentId, roomId) => {
          // TODO: In a real app, this would be an API call to the server
          set(state => _moveAgent(state, agentId, roomId));
        },

        removeAgentFromRoom: agentId => {
          // TODO: In a real app, this would be an API call to the server
          set(state => _moveAgent(state, agentId, null));
        },

        // New action for server-pushed updates
        moveAgentFromSocket: (agentId, roomId) => {
          set(state => _moveAgent(state, agentId, roomId));
        },
        addConversationTurnFromSocket: (agent1Id, agent2Id, interaction) => {
            get().addConversationTurn(agent1Id, agent2Id, interaction);
        },
        // Unified room update function that handles both updates and additions
        updateRoomFromSocket: (updatedRoom) => set(state => {
          // Check if the room already exists
          const roomExists = state.rooms.some(r => r.id === updatedRoom.id);
          
          if (roomExists) {
            // Update existing room
            return {
              rooms: state.rooms.map(r => r.id === updatedRoom.id ? { ...r, ...updatedRoom } : r),
              // Update the activeConversations timestamp for this room to ensure UI updates
              activeConversations: { 
                ...state.activeConversations, 
                [updatedRoom.id!]: Date.now() 
              }
            };
          } else {
            // Add new room
            return { 
              rooms: [...state.rooms, updatedRoom],
              // Initialize activeConversations for this room
              activeConversations: { 
                ...state.activeConversations, 
                [updatedRoom.id!]: Date.now() 
              }
            };
          }
        }),
        
        // Keep addRoom for backward compatibility, but delegate to updateRoomFromSocket
        addRoom: (newRoom) => {
          get().updateRoomFromSocket(newRoom);
        },

        syncWorldState: (worldState) => set(state => {
          // Preserve conversation history and other client-side state that isn't included in worldState
          const mergedState = {
            ...state,
            rooms: worldState.rooms,
            agentLocations: worldState.agentLocations,
            thinkingAgents: new Set(worldState.thinkingAgents),
            systemPaused: worldState.systemPaused || false,
            // Track when the last sync happened
            lastSyncTimestamp: Date.now()
          };
          
          // Update activeConversations based on the latest room activity
          // This ensures the UI shows the correct active conversations
          const updatedActiveConversations = { ...state.activeConversations };
          worldState.rooms.forEach(room => {
            // If this room isn't in activeConversations or has newer activity, update it
            if (!updatedActiveConversations[room.id!]) {
              updatedActiveConversations[room.id!] = Date.now();
            }
          });
          
          mergedState.activeConversations = updatedActiveConversations;
          return mergedState;
        }),
        recordActivityInRoom: (roomId: string) => set(state => ({
          activeConversations: { ...state.activeConversations, [roomId]: Date.now() },
        })),
        recordTrade: (trade) => set(state => ({
            tradeHistory: [trade, ...state.tradeHistory].slice(0, 100),
        })),
        setLastTradeDetails: (trade) => set({ lastTradeDetails: trade }),
        removeRoom: (roomId) => set(state => ({
          rooms: state.rooms.filter(r => r.id !== roomId)
        })),
        kickAgentFromRoom: (agentToKickId, roomId) => {
          console.log(`[KICK_LOG] Kicking agent ${agentToKickId} from room ${roomId}`);
          get().removeAgentFromRoom(agentToKickId);
        },
        addConversationTurn: (agent1Id, agent2Id, interaction) => {
          const key1 = agent1Id;
          const key2 = agent2Id;
    
          set(state => {
            const conversations = { ...state.agentConversations };
            if (!conversations[key1]) conversations[key1] = {};
            if (!conversations[key2]) conversations[key2] = {};
    
            if (!conversations[key1][key2]) conversations[key1][key2] = [];
            if (!conversations[key2][key1]) conversations[key2][key1] = [];
            
            const newHistory = [...conversations[key1][key2], interaction].slice(-50); // Keep last 50
    
            conversations[key1][key2] = newHistory;
            conversations[key2][key1] = newHistory;
    
            return { agentConversations: conversations };
          });
        },
        setActiveChat: (roomId, agentId, text) => set(state => ({
          activeChat: { ...state.activeChat, [roomId]: { agentId, text } },
        })),
        clearActiveChat: (roomId) => set(state => {
          const newActiveChat = { ...state.activeChat };
          delete newActiveChat[roomId];
          return { activeChat: newActiveChat };
        }),
        createJoinRequest: (roomId, requestingAgentId) => set(state => ({
          joinRequests: { ...state.joinRequests, [roomId]: requestingAgentId },
        })),
        resolveJoinRequest: (roomId, accepted) => {
          const requestingAgentId = get().joinRequests[roomId];
          set(state => ({
            joinRequests: { ...state.joinRequests, [roomId]: null },
          }));
          if (accepted && requestingAgentId) {
            get().moveAgentToRoom(requestingAgentId, roomId);
          }
        },
        incrementWarnFlag: (roomId) => set(state => ({
          rooms: state.rooms.map(r => r.id === roomId ? { ...r, warnFlags: r.warnFlags + 1 } : r),
        })),
        setRoomRules: (roomId, rules) => set(state => ({
          rooms: state.rooms.map(r => r.id === roomId ? { ...r, rules } : r),
        })),
        setRoomVibe: (roomId, vibe) => set(state => ({
          rooms: state.rooms.map(r => r.id === roomId ? { ...r, vibe } : r),
        })),
        updateReputation: (agentId, change) => set(state => ({
          agentReputations: {
            ...state.agentReputations,
            [agentId]: (state.agentReputations[agentId] || 100) + change,
          },
        })),
        setThinkingAgent: (agentId, isThinking) => set(state => {
          const newThinkingAgents = new Set(state.thinkingAgents);
          if (isThinking) {
            newThinkingAgents.add(agentId);
          } else {
            newThinkingAgents.delete(agentId);
          }
          return { thinkingAgents: newThinkingAgents };
        }),
        createAndJoinRoom: (agentId: string) => {
          const newRoomId = `room-${Math.random().toString(36).substring(2, 7)}`;
          const newRoom: Room = {
            id: newRoomId,
            agentIds: [],
            hostId: null,
            topics: [],
            warnFlags: 0,
            rules: DEFAULT_ROOM_RULES,
            activeOffer: null,
            vibe: 'General Chat ☕️'
          };
          set(state => ({ rooms: [...state.rooms, newRoom] }));
          get().moveAgentToRoom(agentId, newRoomId);
        },
        _ensureRoomExists: (roomId) => {
          if (!get().rooms.some(r => r.id === roomId)) {
            const newRoom: Room = {
              id: roomId,
              agentIds: [],
              hostId: null,
              topics: [],
              warnFlags: 0,
              rules: DEFAULT_ROOM_RULES,
              activeOffer: null,
              vibe: 'General Chat ☕️'
            };
            set(state => ({ rooms: [...state.rooms, newRoom] }));
          }
        },
      }),
      {
        name: 'quants-arena-storage',
        storage: createJSONStorage(() => localStorage, {
          replacer: (key, value) => {
            if (value instanceof Set) {
              return {
                dataType: 'Set',
                value: Array.from(value),
              };
            }
            return value;
          },
          // FIX: Cast `value` to `any` to safely access custom properties `dataType` and `value` during JSON deserialization, resolving TypeScript errors.
          reviver: (key, value) => {
            if (typeof value === 'object' && value !== null && (value as any).dataType === 'Set') {
              return new Set((value as any).value);
            }
            return value;
          },
        }),
      },
    ),
  ),
);