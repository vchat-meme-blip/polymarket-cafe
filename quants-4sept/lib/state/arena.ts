/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { create } from 'zustand';
import { subscribeWithSelector, persist, createJSONStorage } from 'zustand/middleware';
import { Agent } from '../presets/agents.js';
import { useAgent } from '../state.js';
import { useAutonomyStore } from './autonomy.js';

export type Room = {
  id: string;
  agentIds: string[];
  hostId: string | null; // The first agent to enter the room
  topics: string[];
  warnFlags: number;
  rules: string[];
  activeOffer: {
    fromAgentId: string;
    token: string;
    price: number;
  } | null;
  vibe?: string;
};

export type Interaction = {
  agentId: string;
  agentName: string;
  text: string;
  timestamp: number;
};

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
  lastTradeDetails: { roomId: string; fromId: string; toId: string; timestamp: number } | null;
  thinkingAgents: Set<string>;
  hydrate: (data: ServerHydrationData) => void;
  // Actions initiated by client UI
  moveAgentToRoom: (agentId: string, roomId: string) => void;
  removeAgentFromRoom: (agentId: string) => void;
  // Actions initiated by socket events
  moveAgentFromSocket: (agentId: string, roomId: string | null) => void;
  addConversationTurnFromSocket: (agent1Id: string, agent2Id: string, interaction: Interaction) => void;

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
  setLastTradeDetails: (details: { roomId: string; fromId: string; toId: string; timestamp: number }) => void;
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
  const fromRoomId = state.agentLocations[agentId];
  let newRooms = [...state.rooms];
  let newAgentLocations = { ...state.agentLocations };
  const newJoinTimestamps = { ...state.joinTimestamps };

  if (fromRoomId) {
    const fromRoom = newRooms.find(r => r.id === fromRoomId);
    if (fromRoom) {
      const newAgentIds = fromRoom.agentIds.filter(id => id !== agentId);
      const updatedFromRoom = {
        ...fromRoom,
        agentIds: newAgentIds,
        topics: calculateRoomTopics(newAgentIds),
        hostId:
          newAgentIds.length === 0
            ? null
            : fromRoom.hostId === agentId
              ? newAgentIds[0]
              : fromRoom.hostId,
        warnFlags: newAgentIds.length > 0 ? fromRoom.warnFlags : 0,
      };
      newRooms = newRooms.map(r =>
        r.id === fromRoomId ? updatedFromRoom : r,
      );
    }
    delete newJoinTimestamps[agentId];
  }

  if (toRoomId) {
    const toRoom = newRooms.find(r => r.id === toRoomId);
    if (toRoom && toRoom.agentIds.length < 2 && !toRoom.agentIds.includes(agentId)) {
      const newAgentIds = [...toRoom.agentIds, agentId];
      const updatedToRoom = {
        ...toRoom,
        agentIds: newAgentIds,
        topics: calculateRoomTopics(newAgentIds),
        hostId: toRoom.hostId === null ? agentId : toRoom.hostId,
      };
      newRooms = newRooms.map(r => (r.id === toRoomId ? updatedToRoom : r));
      newJoinTimestamps[agentId] = Date.now();
    } else {
        toRoomId = null;
    }
  }
  
  newAgentLocations[agentId] = toRoomId;

  const userAgentId = useAgent.getState().current.id;
  if (agentId === userAgentId) {
    useAutonomyStore.getState().setActivity(toRoomId ? 'IN_CAFE' : 'IDLE');
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
        thinkingAgents: new Set(),

        hydrate: (data) => set(state => {
          const agentLocations: Record<string, string | null> = {};
          const agentReputations: Record<string, number> = {};
          
          const allAgents = [...useAgent.getState().availablePersonal, ...useAgent.getState().availablePresets];
          allAgents.forEach((agent: Agent) => {
              agentLocations[agent.id] = null;
              agentReputations[agent.id] = agent.reputation || 100;
          });
          
          return {
            rooms: data.rooms,
            agentLocations,
            agentReputations,
          }
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
            const newConversations = structuredClone(state.agentConversations);
            if (!newConversations[agent1Id]) newConversations[agent1Id] = {};
            if (!newConversations[agent1Id][agent2Id]) newConversations[agent1Id][agent2Id] = [];
            if (!newConversations[agent2Id]) newConversations[agent2Id] = {};
            if (!newConversations[agent2Id][agent1Id]) newConversations[agent2Id][agent1Id] = [];
            
            newConversations[agent1Id][agent2Id].push(interaction);
            newConversations[agent2Id][agent1Id].push(interaction);
            
            const maxHistory = 50;
            if (newConversations[agent1Id][agent2Id].length > maxHistory) {
              newConversations[agent1Id][agent2Id] = newConversations[agent1Id][agent2Id].slice(-maxHistory);
            }
            if (newConversations[agent2Id][agent1Id].length > maxHistory) {
              newConversations[agent2Id][agent1Id] = newConversations[agent2Id][agent1Id].slice(-maxHistory);
            }

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
          set(state => ({
            rooms: state.rooms.map(r =>
              r.id === roomId
                ? { ...r, activeOffer: { fromAgentId, token, price } }
                : r,
            ),
          })),

        clearOffer: roomId =>
          set(state => ({
            rooms: state.rooms.map(r =>
              r.id === roomId ? { ...r, activeOffer: null } : r,
            ),
          })),

        setLastTradeDetails: (details) => set({ lastTradeDetails: details }),
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
        name: 'chatterbox-arena-storage',
        storage: createJSONStorage(() => localStorage),
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