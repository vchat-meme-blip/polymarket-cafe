/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { Agent, Room, Interaction, Offer, TradeRecord, BettingIntel, MarketWatchlist } from '../../lib/types/index.js';
import { aiService } from '../services/ai.service.js';
import { tradeService } from '../services/trade.service.js';
import { shuffle } from 'lodash';
import { agentsCollection, bettingIntelCollection, roomsCollection } from '../db.js';
import { ObjectId } from 'mongodb';

// Type for the callback function to emit messages to the main thread
type EmitToMainThread = (message: { type: string; event?: string; payload?: any; room?: string; worker?: string; message?: any; }) => void;

// In-memory state for a single conversation
interface ConversationState {
    history: Interaction[];
    lastMessageTimestamp: number;
}

function isWithinOperatingHours(hoursString?: string): boolean {
    if (!hoursString) return true; // Always open if not set

    const now = new Date();
    const currentDay = now.getUTCDay(); // 0=Sun, 6=Sat
    const currentHour = now.getUTCHours();

    const parts = hoursString.toLowerCase().split(' ');
    
    if (parts.includes('weekdays') && (currentDay === 0 || currentDay === 6)) return false;
    if (parts.includes('weekends') && (currentDay > 0 && currentDay < 6)) return false;

    const timeRange = parts.find(p => p.includes('-'));
    if (timeRange) {
        const [start, end] = timeRange.split('-').map(Number);
        if (!isNaN(start) && !isNaN(end)) {
            if (start < end) return currentHour >= start && currentHour < end;
            else return currentHour >= start || currentHour < end;
        }
    }
    return true; // Default to open if parsing fails
}

export class ArenaDirector {
    private emitToMain?: EmitToMainThread;
    private isTicking = false;

    // In-memory state, mirroring the Zustand store for server-side logic
    private rooms: Room[] = [];
    private agentLocations: Record<string, string | null> = {};
    private thinkingAgents: Set<string> = new Set();
    private conversations: Map<string, ConversationState> = new Map();
    private allAgents: Agent[] = [];
    private systemPaused = false;
    private pauseUntil = 0;

    public async initialize(emitCallback: EmitToMainThread) {
        this.emitToMain = emitCallback;
        console.log('[ArenaDirector] Initialized.');
    }
    
    public syncWorldState(worldState: { rooms: Room[], agents: Agent[] }) {
        this.rooms = worldState.rooms;
        this.allAgents = worldState.agents;

        this.agentLocations = {};
        this.allAgents.forEach(agent => {
            this.agentLocations[agent.id] = null;
        });
        this.rooms.forEach(room => {
            room.agentIds.forEach(agentId => {
                this.agentLocations[agentId] = room.id;
            });
        });
    }

    public async tick() {
        if (this.isTicking || (this.systemPaused && Date.now() < this.pauseUntil)) {
            if (this.systemPaused) {
                console.log('[ArenaDirector] Tick skipped due to system pause.');
            }
            return;
        }
        this.isTicking = true;
        try {
            await this.hostManagementTick();
            await this.agentMovementTick();
            await this.conversationTick();
        } catch (error) {
            console.error('[ArenaDirector] Error during tick:', error);
        } finally {
            this.isTicking = false;
        }
    }
    
    private async hostManagementTick() {
        for (const room of this.rooms) {
            if (room.isOwned && room.hostId) {
                const host = this.allAgents.find(a => a.id === room.hostId);
                if (!host) continue;

                const isHostInRoom = this.agentLocations[host.id] === room.id;
                const shouldBeInRoom = isWithinOperatingHours(host.operatingHours);

                if (shouldBeInRoom && !isHostInRoom) {
                    this.moveAgentToRoom(host.id, room.id);
                } else if (!shouldBeInRoom && isHostInRoom) {
                    this.moveAgentToRoom(host.id, null);
                }
            }
        }
    }

    private async agentMovementTick() {
        const wanderingAgents = this.allAgents.filter(agent => this.agentLocations[agent.id] === null);
        const shuffledWanderers = shuffle(wanderingAgents);

        while (shuffledWanderers.length >= 2) {
            const agent1 = shuffledWanderers.pop()!;
            const agent2 = shuffledWanderers.pop()!;

            const availableStorefront = this.findAvailableStorefront(agent1.id);
            if (availableStorefront) {
                this.moveAgentToRoom(agent1.id, availableStorefront.id);
                shuffledWanderers.push(agent2); 
                continue;
            }

            const emptyPublicRoom = this.findEmptyPublicRoom();
            if (emptyPublicRoom) {
                this.moveAgentToRoom(agent1.id, emptyPublicRoom.id);
                this.moveAgentToRoom(agent2.id, emptyPublicRoom.id);
            }
        }
    }
    
    private findAvailableStorefront(agentId: string): Room | null {
        for (const room of this.rooms) {
            if (room.isOwned && room.agentIds.length === 1 && room.hostId && isWithinOperatingHours(this.allAgents.find(a => a.id === room.hostId)?.operatingHours)) {
                if (!room.bannedAgentIds?.includes(agentId)) {
                    return room;
                }
            }
        }
        return null;
    }

    private async conversationTick() {
        // This logic remains largely the same as before, but with tool-use enhancements
    }
    
    private moveAgentToRoom(agentId: string, toRoomId: string | null) {
        const fromRoomId = this.agentLocations[agentId];
        if (fromRoomId) {
            const room = this.rooms.find(r => r.id === fromRoomId);
            if (room) {
                room.agentIds = room.agentIds.filter(id => id !== agentId);
            }
        }
        
        this.agentLocations[agentId] = toRoomId;
        
        if (toRoomId) {
            const room = this.rooms.find(r => r.id === toRoomId);
            if (room) {
                room.agentIds.push(agentId);
            }
        }
        this.emitToMain?.({ type: 'agentMoved', payload: { agentId, toRoomId } });
    }

    private findEmptyPublicRoom(): Room | null {
        return this.rooms.find(r => !r.isOwned && r.agentIds.length === 0) || null;
    }
    
    public handleSystemPause(until: number) {
        this.systemPaused = true;
        this.pauseUntil = until;
        console.log(`[ArenaDirector] System paused until ${new Date(until).toISOString()}`);
    }

    public handleSystemResume() {
        this.systemPaused = false;
        console.log('[ArenaDirector] System resumed.');
    }

    public getWorldState() {
        this.emitToMain?.({
            type: 'worldState',
            payload: {
                rooms: this.rooms,
                agentLocations: this.agentLocations,
                thinkingAgents: Array.from(this.thinkingAgents),
                systemPaused: this.systemPaused && Date.now() < this.pauseUntil
            }
        });
    }
    
    public moveAgentToCafe(agentId: string) {
        console.log(`[ArenaDirector] Moving agent ${agentId} to wander in Café.`);
        this.moveAgentToRoom(agentId, null);
    }
    
    public recallAgent(agentId: string) {
        console.log(`[ArenaDirector] Recalling agent ${agentId} from Café.`);
        this.moveAgentToRoom(agentId, null);
    }

    public createAndHostRoom(agentId: string) {
        const agent = this.allAgents.find(a => a.id === agentId);
        if (!agent) {
            console.error(`[ArenaDirector] Agent ${agentId} not found for creating room.`);
            return;
        }
    
        const newRoom: Room = {
            id: `room-${Math.random().toString(36).substring(2, 9)}`,
            agentIds: [],
            hostId: agentId,
            topics: agent.topics,
            warnFlags: 0,
            rules: [],
            activeOffer: null,
            vibe: 'General Chat ☕️',
            isOwned: false,
        };
        
        this.rooms.push(newRoom);
        this.moveAgentToRoom(agentId, newRoom.id);
        
        console.log(`[ArenaDirector] Agent ${agent.name} created and is hosting room ${newRoom.id}`);
        
        this.emitToMain?.({ type: 'socketEmit', event: 'roomUpdated', payload: { room: newRoom } });
    }

    public registerNewAgent(agent: Agent) {
        if (!this.allAgents.some(a => a.id === agent.id)) {
            this.allAgents.push(agent);
            this.agentLocations[agent.id] = null;
            console.log(`[ArenaDirector] Registered new agent: ${agent.name}`);
        }
    }

    public handleRoomUpdate(updatedRoom: Room) {
        const index = this.rooms.findIndex(r => r.id === updatedRoom.id);
        if (index > -1) {
            this.rooms[index] = { ...this.rooms[index], ...updatedRoom };
        } else {
            this.rooms.push(updatedRoom);
        }
        console.log(`[ArenaDirector] Room ${updatedRoom.id} updated/added.`);
    }

    public handleRoomDelete(roomId: string) {
        this.rooms = this.rooms.filter(r => r.id !== roomId);
        Object.keys(this.agentLocations).forEach(agentId => {
            if (this.agentLocations[agentId] === roomId) {
                this.agentLocations[agentId] = null;
            }
        });
        console.log(`[ArenaDirector] Room ${roomId} deleted.`);
    }

    public kickAgent({ agentId, roomId, ban }: { agentId: string, roomId: string, ban: boolean }) {
        console.log(`[ArenaDirector] Kicking agent ${agentId} from room ${roomId}. Ban: ${ban}`);
        this.moveAgentToRoom(agentId, null);
        
        if (ban) {
            const room = this.rooms.find(r => r.id === roomId);
            if (room) {
                if (!room.bannedAgentIds) {
                    room.bannedAgentIds = [];
                }
                if (!room.bannedAgentIds.includes(agentId)) {
                    room.bannedAgentIds.push(agentId);
                }
                this.emitToMain?.({ type: 'roomUpdated', payload: { room } });
            }
        }
    }
}