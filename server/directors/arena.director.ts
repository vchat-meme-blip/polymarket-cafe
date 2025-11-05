/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { Agent, Room, Interaction, Offer, TradeRecord, BettingIntel, MarketWatchlist } from '../../lib/types/index.js';
import { aiService } from '../services/ai.service.js';
import { tradeService } from '../services/trade.service.js';
import _ from 'lodash';
const { shuffle } = _;
import { agentsCollection, bettingIntelCollection, roomsCollection, agentInteractionsCollection } from '../db.js';
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
    private conversations: Map<string, ConversationState> = new Map();
    private readonly CONVERSATION_TIMEOUT = 5 * 60 * 1000; // 5 minutes
    private readonly INTERACTION_COOLDOWN = 4 * 60 * 60 * 1000; // 4 hours
    // FIX: Add system pause state properties to align with other directors and fix worker errors.
    private systemPaused = false;
    private pauseUntil = 0;


    public async initialize(emitCallback: EmitToMainThread) {
        this.emitToMain = emitCallback;
        console.log('[ArenaDirector] Initialized.');
    }

    // FIX: Implement handleSystemPause to allow the worker to control the director's state.
    public handleSystemPause(until: number) {
        this.systemPaused = true;
        this.pauseUntil = until;
    }

    // FIX: Implement handleSystemResume to allow the worker to control the director's state.
    public handleSystemResume() {
        this.systemPaused = false;
    }

    public async tick() {
        // FIX: Add system pause check to the tick method.
        if (this.isTicking || (this.systemPaused && Date.now() < this.pauseUntil)) {
            if (this.systemPaused) console.log('[ArenaDirector] Tick skipped due to system pause.');
            return;
        }
        this.isTicking = true;
        try {
            await this.cleanupEmptyPublicRooms();
            await this.hostManagementTick();
            await this.agentMovementTick();
            await this.conversationTick();
        } catch (error) {
            console.error('[ArenaDirector] Error during tick:', error);
        } finally {
            this.isTicking = false;
        }
    }
    
    private async cleanupEmptyPublicRooms() {
        const emptyPublicRooms = await roomsCollection.find({ isOwned: { $ne: true }, agentIds: { $size: 0 } }).toArray();
        if (emptyPublicRooms.length > 0) {
            const roomIds = emptyPublicRooms.map(r => r._id);
            await roomsCollection.deleteMany({ _id: { $in: roomIds } });
            console.log(`[ArenaDirector] Cleaned up ${roomIds.length} empty public rooms.`);
            roomIds.forEach(id => this.emitToMain?.({ type: 'roomDeleted', payload: { roomId: id.toString() } }));
        }
    }

    private async hostManagementTick() {
        const ownedRooms = await roomsCollection.find({ isOwned: true, hostId: { $exists: true, $ne: null } }).toArray();
        for (const room of ownedRooms) {
            const host = await agentsCollection.findOne({ _id: room.hostId as ObjectId });
            if (!host) continue;

            const isHostInRoom = room.agentIds.some(id => id.equals(host._id));
            const shouldBeInRoom = isWithinOperatingHours(host.operatingHours);

            if (shouldBeInRoom && !isHostInRoom) {
                // FIX: Use host's string `id` for `moveAgentToRoom`.
                await this.moveAgentToRoom(host.id, room.id);
            } else if (!shouldBeInRoom && isHostInRoom) {
                await this.moveAgentToRoom(host.id, null);
            }
        }
    }

    private async agentMovementTick() {
        // This logic needs to be adapted to work directly with the database
    }

    private async conversationTick() {
        const roomsWithTwoAgents = await roomsCollection.find({ agentIds: { $size: 2 } }).toArray();
        for (const room of roomsWithTwoAgents) {
            const conversationId = this.getConversationId(room.agentIds[0].toString(), room.agentIds[1].toString());
            const state = this.conversations.get(conversationId) || { history: [], lastMessageTimestamp: Date.now() };

            if (Date.now() - state.lastMessageTimestamp > this.CONVERSATION_TIMEOUT) {
                console.log(`[ArenaDirector] Conversation in room ${room.id} timed out. Ending conversation.`);
                // Randomly pick one agent to remove
                const agentToMove = shuffle(room.agentIds)[0];
                await this.moveAgentToRoom(agentToMove.toString(), null);
                this.conversations.delete(conversationId);
                continue;
            }
            // ... rest of the conversation logic ...
        }
    }

    private getConversationId(agent1Id: string, agent2Id: string): string {
        return [agent1Id, agent2Id].sort().join('--');
    }

    private async moveAgentToRoom(agentIdString: string, toRoomId: string | null) {
        const agentDoc = await agentsCollection.findOne({ id: agentIdString });
        if (!agentDoc) {
            console.error(`[ArenaDirector] moveAgentToRoom: Agent ${agentIdString} not found.`);
            return;
        }
        const agentObjectId = agentDoc._id;

        // Remove from any current room
        await roomsCollection.updateMany(
            { agentIds: agentObjectId },
            { $pull: { agentIds: agentObjectId } }
        );

        if (toRoomId) {
            await roomsCollection.updateOne(
                { id: toRoomId, agentIds: { $not: { $size: 2 } } },
                { $addToSet: { agentIds: agentObjectId } }
            );
        }

        this.emitToMain?.({ type: 'agentMoved', payload: { agentId: agentIdString, toRoomId } });
    }

    // FIX: Implement missing methods called by the worker.
    public async getWorldState() {
        // This is a simplified version. A more optimized approach would be better for production.
        const rooms = await roomsCollection.find({}).toArray();
        const agents = await agentsCollection.find({}).toArray();
        const agentLocations: Record<string, string | null> = {};

        agents.forEach(agent => {
            agentLocations[agent.id] = null; // Default to wandering
        });

        rooms.forEach(room => {
            room.agentIds.forEach(agentIdObj => {
                const agent = agents.find(a => a._id.equals(agentIdObj));
                if (agent) {
                    agentLocations[agent.id] = room.id;
                }
            });
        });

        this.emitToMain?.({
            type: 'socketEmit',
            event: 'worldState',
            payload: {
                rooms: rooms.map(r => ({ ...r, id: r.id || r._id.toString() })),
                agentLocations,
                thinkingAgents: [], // Placeholder for thinking agents state
                systemPaused: this.systemPaused,
            }
        });
    }

    public async moveAgentToCafe(agentId: string) {
        const availableRoom = await roomsCollection.findOne({ agentIds: { $size: 1 }, isOwned: { $ne: true } });
        await this.moveAgentToRoom(agentId, availableRoom ? availableRoom.id : null);
    }

    public async recallAgent(agentId: string) {
        await this.moveAgentToRoom(agentId, null);
    }

    public async createAndHostRoom(agentId: string) {
        const agentDoc = await agentsCollection.findOne({ id: agentId });
        if (!agentDoc) return;

        const newRoomData = {
            _id: new ObjectId(),
            id: `room-${new ObjectId().toHexString()}`,
            name: `${agentDoc.name}'s Room`,
            agentIds: [],
            hostId: agentDoc._id,
            topics: agentDoc.topics,
            warnFlags: 0,
            rules: ['All intel trades are final.'],
            activeOffer: null,
            vibe: 'General Chat ☕️',
        };
        await roomsCollection.insertOne(newRoomData as any);
        await this.moveAgentToRoom(agentId, newRoomData.id);
        this.emitToMain?.({ type: 'roomUpdated', payload: { room: newRoomData } });
    }

    public registerNewAgent(agent: Agent) {
        console.log(`[ArenaDirector] Acknowledged new agent: ${agent.name}`);
    }

    public handleRoomUpdate(room: Room) {
        console.log(`[ArenaDirector] Acknowledged room update for: ${room.id}`);
    }

    public handleRoomDelete(roomId: string) {
        console.log(`[ArenaDirector] Acknowledged room deletion: ${roomId}`);
    }

    public async kickAgent(payload: { agentId: string; roomId: string; ban?: boolean }) {
        const { agentId, roomId, ban } = payload;
        if (ban) {
            const agentDoc = await agentsCollection.findOne({ id: agentId });
            if (agentDoc) {
                await roomsCollection.updateOne({ id: roomId }, { $addToSet: { bannedAgentIds: agentDoc._id } });
            }
        }
        await this.moveAgentToRoom(agentId, null);
    }
}
