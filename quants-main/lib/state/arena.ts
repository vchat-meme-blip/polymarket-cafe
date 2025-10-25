/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { create } from 'zustand';
import { subscribeWithSelector, persist, createJSONStorage } from 'zustand/middleware';
import { Agent, Room, Interaction, TradeRecord } from '../types/index.js';
import { useAgent } from '../state.js';
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
  lastTradeDetails: TradeRecord | null;
  tradeHistory: TradeRecord[]; // History of all completed trades
  thinkingAgents: Set<string>;
  activeConversations: Record<string, number>; // { roomId: lastMessageTimestamp }
  lastSyncTimestamp: number; // When the last worldState sync happened
  hydrate: (data: ServerHydrationData) => void;
  // Actions initiated by client UI
  recordTrade: (tradeRecord: TradeRecord) => void;
  moveAgentToRoom: (agentId: string, roomId: string) => void;
  removeAgentFromRoom: (agentId: string) => void;
  // Actions initiated by socket events
  moveAgentFromSocket: (agentId: string, roomId: string | null) => void;
  addConversationTurnFromSocket: (agent1Id: string, agent2Id: string, interaction: Interaction) => void;
  updateRoomFromSocket: (room: Room) => void;
  addRoom: (room: Room) => void;
  recordActivityInRoom: (roomId: string) => void;
  syncWorldState: (worldState: { rooms: Room[], agentLocations: Record<string, string | null>, thinkingAgents: string[] }) => void;
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
  makeOffer: (
    roomId: string,
    fromAgentId: string,
    token: string,
    price: number,
  ) => void;
  clearOffer: (roomId: string) => void;
  setLastTradeDetails: (details: TradeRecord) => void;
  clearLastTradeDetails: () => void;
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
    // FIX: Retrieve agents directly from the useAgent store.
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
        lastTradeDetails: null,
        tradeHistory: [],
        thinkingAgents: new Set(),
        activeConversations: {},
        lastSyncTimestamp: Date.now(),

                hydrate: (data) => set(state => {
          // Create a new state object, merging the persisted state with fresh server data.
          // This ensures that transient client-side state (like conversation history)
          // is not lost on a page refresh.
          const newState = { ...state, ...data };

          const agentLocations: Record<string, string | null> = {};
          const agentReputations: Record<string, number> = {};
          
          const allAgents = [...useAgent.getState().availablePersonal, ...useAgent.getState().availablePresets];
          allAgents.forEach((agent: Agent) => {
              agentLocations[agent.id] = null;
              agentReputations[agent.id] = agent.reputation || 100;
          });
          
          // Accurately set initial agent locations based on hydrated room data
          data.rooms.forEach(room => {
            room.agentIds.forEach(agentId => {
              agentLocations[agentId] = room.id;
            });
          });

          // Return the fully merged and updated state.
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
                [updatedRoom.id]: Date.now() 
              }
            };
          } else {
            // Add new room
            return { 
              rooms: [...state.rooms, updatedRoom],
              // Initialize activeConversations for this room
              activeConversations: { 
                ...state.activeConversations, 
                [updatedRoom.id]: Date.now() 
              }
            };
          }
        }),
        
        // Keep addRoom for backward compatibility, but delegate to updateRoomFromSocket
        addRoom: (newRoom) => set(state => {
          // This is just a wrapper that calls updateRoomFromSocket internally
          // We still need to return the state to satisfy the TypeScript signature
          get().updateRoomFromSocket(newRoom);
          return state; // Return unchanged state as the actual update happens in updateRoomFromSocket
        }),

        syncWorldState: (worldState) => set(state => {
          // Preserve conversation history and other client-side state that isn't included in worldState
          const mergedState = {
            ...state,
            rooms: worldState.rooms,
            agentLocations: worldState.agentLocations,
            thinkingAgents: new Set(worldState.thinkingAgents),
            // Track when the last sync happened
            lastSyncTimestamp: Date.now()
          };
          
          // Update activeConversations based on the latest room activity
          // This ensures the UI shows the correct active conversations
          const updatedActiveConversations = { ...state.activeConversations };
          worldState.rooms.forEach(room => {
            // If this room isn't in activeConversations or has newer activity, update it
            if (!updatedActiveConversations[room.id]) {
              updatedActiveConversations[room.id] = Date.now();
            }
          });
          
          mergedState.activeConversations = updatedActiveConversations;
          
          return mergedState;
        }),

        recordActivityInRoom: (roomId) => set(state => ({
          activeConversations: { ...state.activeConversations, [roomId]: Date.now() },
        })),

        removeRoom: (roomId) => set(state => {
          // Find agents in this room and update their locations
          const agentsInRoom = Object.keys(state.agentLocations).filter(
            agentId => state.agentLocations[agentId] === roomId
          );

          const newAgentLocations = { ...state.agentLocations };
          agentsInRoom.forEach(agentId => {
            newAgentLocations[agentId] = null;
          });
          
          // Remove the room from activeConversations
          const newActiveConversations = { ...state.activeConversations };
          delete newActiveConversations[roomId];
          
          return {
            rooms: state.rooms.filter(r => r.id !== roomId),
            agentLocations: newAgentLocations,
            activeConversations: newActiveConversations,
            // Update lastSyncTimestamp to trigger UI updates
            lastSyncTimestamp: Date.now()
          };
        }),

        kickAgentFromRoom: (agentToKickId, roomId) => {
          set(state => {
            const room = state.rooms.find(r => r.id === roomId);
            if (!room || !room.hostId || room.hostId === agentToKickId) {
              return state;
            }
            get().updateReputation(agentToKickId, -10);
            return _moveAgent(state, agentToKickId, null);
          });
        },
        
                addConversationTurn: (agent1Id, agent2Id, interaction) =>
          set(state => {
            const newConversations = {
              ...state.agentConversations,
              [agent1Id]: {
                ...state.agentConversations[agent1Id],
                [agent2Id]: [...(state.agentConversations[agent1Id]?.[agent2Id] || []), interaction].slice(-50),
              },
              [agent2Id]: {
                ...state.agentConversations[agent2Id],
                [agent1Id]: [...(state.agentConversations[agent2Id]?.[agent1Id] || []), interaction].slice(-50),
              },
            };
            return { agentConversations: newConversations };
          }),

        setActiveChat: (roomId, agentId, text) =>
          set(state => ({
            activeChat: { ...state.activeChat, [roomId]: { agentId, text } },
          })),

        clearActiveChat: roomId =>
          set(state => ({ activeChat: { ...state.activeChat, [roomId]: null } })),

        createJoinRequest: (roomId, requestingAgentId) => {
          set(state => ({
            joinRequests: { ...state.joinRequests, [roomId]: requestingAgentId },
          }));
        },

        resolveJoinRequest: (roomId, accepted) => {
          const requestingAgentId = get().joinRequests[roomId];
          if (!requestingAgentId) return;

          set(state => {
            const newJoinRequests = { ...state.joinRequests };
            delete newJoinRequests[roomId];
            const stateWithClearedRequest = { ...state, joinRequests: newJoinRequests };
            return accepted ? _moveAgent(stateWithClearedRequest, requestingAgentId, roomId) : stateWithClearedRequest;
          });
        },

        incrementWarnFlag: roomId =>
          set(state => ({
            rooms: state.rooms.map(r =>
              r.id === roomId ? { ...r, warnFlags: r.warnFlags + 1 } : r,
            ),
          })),

                makeOffer: (roomId, fromAgentId, token, price) =>
          set(state => {
            const room = state.rooms.find(r => r.id === roomId);
            if (!room) return state; 

            const toAgentId = room.agentIds.find(id => id !== fromAgentId);
            if (!toAgentId) return state;

            return {
              rooms: state.rooms.map(r =>
                r.id === roomId
                  ? { ...r, activeOffer: { type: 'intel', fromAgentId, toAgentId, token, price } }
                  : r
              ),
            };
          }),

        clearOffer: roomId =>
          set(state => ({
            rooms: state.rooms.map(r =>
              r.id === roomId ? { ...r, activeOffer: null } : r,
            ),
          })),

        recordTrade: tradeRecord => {
          set(state => ({
            tradeHistory: [...state.tradeHistory, tradeRecord].slice(-100)
          }));
        },

        setLastTradeDetails: (tradeRecord) => {
            set(state => ({
                lastTradeDetails: tradeRecord,
                tradeHistory: [...state.tradeHistory, tradeRecord].slice(-100)
            }));
            console.log('[ArenaState] Added trade to history:', tradeRecord);
        },

        clearLastTradeDetails: () => set({ lastTradeDetails: null }),

        setRoomRules: (roomId, rules) => set(state => ({
            rooms: state.rooms.map(r => r.id === roomId ? {...r, rules} : r)
        })),
        
        setRoomVibe: (roomId, vibe) => set(state => ({
            rooms: state.rooms.map(r => r.id === roomId ? {...r, vibe} : r)
        })),

        updateReputation: (agentId, change) => set(state => ({
            agentReputations: {
                ...state.agentReputations,
                [agentId]: (state.agentReputations[agentId] || 100) + change,
            }
        })),

        setThinkingAgent: (agentId, isThinking) => set(state => {
            const newThinkingAgents = new Set(state.thinkingAgents);
            isThinking ? newThinkingAgents.add(agentId) : newThinkingAgents.delete(agentId);
            return { thinkingAgents: newThinkingAgents };
        }),

        createAndJoinRoom: (agentId) => {
          const emptyRoom = get().rooms.find(r => r.agentIds.length === 0);
          if (emptyRoom) {
             set(state => _moveAgent(state, agentId, emptyRoom.id));
          } else {
            const newRoomId = `room-${get().rooms.length + 1}`;
            get()._ensureRoomExists(newRoomId);
            set(state => _moveAgent(state, agentId, newRoomId));
          }
        },

        _ensureRoomExists: (roomId) => set(state => {
            if (state.rooms.some(r => r.id === roomId)) return state;
            const newRoom: Room = {
                id: roomId,
                agentIds: [], hostId: null, topics: [], warnFlags: 0,
                rules: DEFAULT_ROOM_RULES, activeOffer: null, vibe: 'General Chat ☕️',
            };
            return { rooms: [...state.rooms, newRoom] };
        }),

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
          reviver: (key, value) => {
            const valAsAny = value as any;
            if (typeof value === 'object' && value !== null && valAsAny.dataType === 'Set') {
              return new Set(valAsAny.value);
            }
            return value;
          },
        }),
      },
    ),
  ),
);

export function registerAgentInArena(agentId: string) {
  // FIX: Retrieve agents directly from the useAgent store.
  const allAgents = [...useAgent.getState().availablePersonal, ...useAgent.getState().availablePresets];
  const agent = allAgents.find(a => a.id === agentId);
  if (!agent) return;

  useArenaStore.setState(state => ({
    agentLocations: { ...state.agentLocations, [agentId]: null },
    agentReputations: { ...state.agentReputations, [agentId]: agent.reputation || 100 },
  }));
   console.log(`[Arena] Registered new agent "${agent.name}" in simulation state.`);
}