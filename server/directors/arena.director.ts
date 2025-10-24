import { agentsCollection, roomsCollection, bettingIntelCollection, tradeHistoryCollection, usersCollection } from '../db.js';
import { Agent, Room, Interaction, Offer, TradeRecord, BettingIntel } from '../../lib/types/index.js';
import { aiService } from '../services/ai.service.js';
import { cafeService } from '../services/cafe.service.js';
import { notificationService } from '../services/notification.service.js';
import pkg from 'lodash';
import { ObjectId } from 'mongodb';
const { shuffle } = pkg;

// Type for the callback function to emit messages to the main thread
type EmitToMainThread = (message: { type: 'socketEmit'; event: string; payload: any; room?: string }) => void;

// In-memory state for a single conversation
interface ConversationState {
    history: Interaction[];
    lastMessageTimestamp: number;
}

// Basic time string parser (e.g., "Weekdays 9-17 UTC")
// NOTE: This is a simplified parser for the demo. A production system would use a more robust library.
function isWithinOperatingHours(hoursString?: string): boolean {
    if (!hoursString) return true; // If no hours are set, they are always "open"

    const now = new Date();
    const currentDay = now.getUTCDay(); // 0=Sun, 6=Sat
    const currentHour = now.getUTCHours();

    const parts = hoursString.toLowerCase().split(' ');
    
    // Check for weekday/weekend
    if (parts.includes('weekdays') && (currentDay === 0 || currentDay === 6)) {
        return false;
    }
    if (parts.includes('weekends') && (currentDay > 0 && currentDay < 6)) {
        return false;
    }

    // Check for time range
    const timeRange = parts.find(p => p.includes('-'));
    if (timeRange) {
        const [start, end] = timeRange.split('-').map(Number);
        if (!isNaN(start) && !isNaN(end)) {
            if (start < end) { // e.g., 9-17
                return currentHour >= start && currentHour < end;
            } else { // e.g., 22-6 (overnight)
                return currentHour >= start || currentHour < end;
            }
        }
    }

    return true; // Default to open if parsing fails
}


export class ArenaDirector {
    private emitToMain?: EmitToMainThread;
    
    // In-memory simulation state
    private agents: Map<string, Agent> = new Map();
    private rooms: Map<string, Room> = new Map();
    private agentLocations: Map<string, string | null> = new Map();
    private conversations: Map<string, ConversationState> = new Map(); // Room ID -> Conversation
    private thinkingAgents: Set<string> = new Set();
    
    private isInitialized = false;
    private isTicking = false;
    private systemPaused = false;
    private pauseUntil = 0;

    public async initialize(emitCallback: EmitToMainThread) {
        this.emitToMain = emitCallback;
        console.log('[ArenaDirector] Initializing and loading state from DB...');

        // Load all agents
        const allAgents = await agentsCollection.find({}).toArray();
        allAgents.forEach(agent => {
            this.agents.set(agent.id, agent);
            this.agentLocations.set(agent.id, null); // Assume all are wandering initially
        });

        // Load all rooms and populate agent locations
        const allRooms = await roomsCollection.find({}).toArray();
        allRooms.forEach(room => {
            this.rooms.set(room.id, room);
            room.agentIds.forEach(agentId => {
                this.agentLocations.set(agentId, room.id);
            });
        });

        console.log(`[ArenaDirector] Initialized with ${this.agents.size} agents and ${this.rooms.size} rooms.`);
        this.isInitialized = true;
        this.emitWorldState();
    }
    
    public registerNewAgent(agent: Agent) {
        if (!this.agents.has(agent.id)) {
            this.agents.set(agent.id, agent);
            this.agentLocations.set(agent.id, null);
            console.log(`[ArenaDirector] Registered new agent: ${agent.name}`);
            this.emitWorldState();
        }
    }

    public handleSystemPause(until: number) {
        this.systemPaused = true;
        this.pauseUntil = until;
    }

    public handleSystemResume() {
        this.systemPaused = false;
    }

    public handleRoomUpdate(room: Room) {
        this.rooms.set(room.id, room);
        this.emitWorldState();
    }

    public async handleRoomDelete(roomId: string) {
        const room = this.rooms.get(roomId);
        if (room) {
            // Move any agents in the deleted room to a wandering state
            for (const agentId of room.agentIds) {
                await this.moveAgent(agentId, null);
            }
            this.rooms.delete(roomId);
            this.conversations.delete(roomId);
            this.emitWorldState();
        }
    }

    public async tick() {
        if (!this.isInitialized || this.isTicking || (this.systemPaused && Date.now() < this.pauseUntil)) {
            return;
        }
        this.isTicking = true;

        try {
            // Process agent schedules for owned rooms
            await this.processAgentSchedules();

            // Process conversations in existing rooms
            for (const room of this.rooms.values()) {
                if (room.agentIds.length === 2) {
                    await this.processConversation(room);
                }
            }

            // Process wandering agents
            await this.processWanderingAgents();

        } catch (error) {
            console.error('[ArenaDirector] Error during tick:', error);
        } finally {
            this.isTicking = false;
            // Always emit the latest state at the end of a tick
            this.emitWorldState();
        }
    }

    private async processAgentSchedules() {
        const ownedRooms = Array.from(this.rooms.values()).filter(r => r.isOwned && r.ownerHandle);
        for (const room of ownedRooms) {
            const hostAgent = Array.from(this.agents.values()).find(a => a.ownerHandle === room.ownerHandle); // Simplified: assumes one agent per user
            if (!hostAgent) continue;

            const isAgentInRoom = this.agentLocations.get(hostAgent.id) === room.id;
            const shouldBeInRoom = isWithinOperatingHours(hostAgent.operatingHours);

            if (shouldBeInRoom && !isAgentInRoom) {
                console.log(`[ArenaDirector] Agent ${hostAgent.name} is starting their shift. Moving to owned room ${room.id}.`);
                await this.moveAgent(hostAgent.id, room.id);
            } else if (!shouldBeInRoom && isAgentInRoom) {
                console.log(`[ArenaDirector] Agent ${hostAgent.name} is ending their shift. Leaving owned room ${room.id}.`);
                await this.moveAgent(hostAgent.id, null);
            }
        }
    }

    private async processConversation(room: Room) {
        const conversationState = this.conversations.get(room.id) || { history: [], lastMessageTimestamp: 0 };
        const CONVERSATION_COOLDOWN = 10 * 1000; // 10 seconds

        if (Date.now() - conversationState.lastMessageTimestamp < CONVERSATION_COOLDOWN) {
            return;
        }

        const [agent1, agent2] = room.agentIds.map(id => this.agents.get(id)).filter(Boolean) as Agent[];
        if (!agent1 || !agent2) return;

        // Determine who speaks next (simple turn-taking)
        const lastSpeakerId = conversationState.history[conversationState.history.length - 1]?.agentId;
        const [speaker, listener] = (lastSpeakerId === agent1.id) ? [agent2, agent1] : [agent1, agent2];
        const initialPrompt = conversationState.history.length === 0 ? `You meet ${listener.name}. Start a conversation.` : undefined;

        this.setThinking(speaker.id, true);

        try {
            const { text, endConversation, toolCalls } = await aiService.getConversationTurn(speaker, listener, conversationState.history, room, initialPrompt);

            // Handle tool calls first
            if (toolCalls && toolCalls.length > 0) {
                for (const toolCall of toolCalls) {
                    // FIX: Added a type guard to ensure toolCall is of type 'function' before accessing 'function' property, resolving a TypeScript error where the type was not being narrowed correctly.
                    if (toolCall.type === 'function') {
                        if (toolCall.function.name === 'create_intel_offer') {
                            await this.handleCreateOffer(speaker, listener, room, JSON.parse(toolCall.function.arguments));
                        }
                        if (toolCall.function.name === 'accept_offer') {
                            await this.handleAcceptOffer(speaker, listener, room, JSON.parse(toolCall.function.arguments));
                        }
                    }
                }
            }

            const newTurn: Interaction = {
                agentId: speaker.id,
                agentName: speaker.name,
                text,
                timestamp: Date.now(),
            };

            conversationState.history.push(newTurn);
            conversationState.lastMessageTimestamp = Date.now();
            this.conversations.set(room.id, conversationState);

            this.emitToMain?.({
                type: 'socketEmit',
                event: 'newConversationTurn',
                payload: { roomId: room.id, turn: newTurn, room }
            });

            if (endConversation) {
                const leavingAgent = Math.random() < 0.5 ? speaker : listener;
                await this.moveAgent(leavingAgent.id, null);
                console.log(`[ArenaDirector] ${leavingAgent.name} left room ${room.id} after conversation ended.`);
            }
        } finally {
            this.setThinking(speaker.id, false);
        }
    }
    
    private async processWanderingAgents() {
        let wanderingAgents = shuffle(cafeService.findWanderingAgents(this.agents, this.agentLocations));
        if (wanderingAgents.length === 0) return;

        // Phase 1: Strategic moves based on trusted rooms
        const agentsWithStrategy = wanderingAgents.filter((a: Agent) => a.trustedRoomIds && a.trustedRoomIds.length > 0);
        const remainingWanderers: Agent[] = [];

        for (const agent of agentsWithStrategy) {
            const potentialRooms = shuffle(
                (agent.trustedRoomIds || [])
                    .map((id: string) => this.rooms.get(id))
                    .filter((r: Room | undefined): r is Room => !!r && r.agentIds.length === 1 && !r.bannedAgentIds?.includes(agent.id))
            );

            const targetRoom = potentialRooms[0];
            if (targetRoom) {
                console.log(`[ArenaDirector] Strategic move: ${agent.name} is joining trusted room ${targetRoom.id}.`);
                await this.moveAgent(agent.id, targetRoom.id);
            } else {
                remainingWanderers.push(agent);
            }
        }
        wanderingAgents = [...remainingWanderers, ...wanderingAgents.filter((a: Agent) => !a.trustedRoomIds || a.trustedRoomIds.length === 0)];

        // Phase 2: Fill public & owned rooms that have one person.
        const singleOccupantRooms = shuffle(Array.from(this.rooms.values()).filter(r => r.agentIds.length === 1));
        while (wanderingAgents.length > 0 && singleOccupantRooms.length > 0) {
            const agentToPlace = wanderingAgents.shift()!;
            const roomToFill = singleOccupantRooms.shift()!;
            // Check if agent is banned from this room
            if (roomToFill.bannedAgentIds?.includes(agentToPlace.id)) {
                singleOccupantRooms.push(roomToFill); // Put room back in pool
                continue;
            }

            console.log(`[ArenaDirector] Wandering agent ${agentToPlace.name} is joining room ${roomToFill.id}.`);
            await this.moveAgent(agentToPlace.id, roomToFill.id);
        }

        // Phase 3: Pair up remaining wanderers in empty public rooms or create new ones.
        const emptyPublicRooms = shuffle(Array.from(this.rooms.values()).filter(r => r.agentIds.length === 0 && !r.isOwned));
        while (wanderingAgents.length >= 2) {
            const agent1 = wanderingAgents.shift()!;
            const agent2 = wanderingAgents.shift()!;

            const targetRoom = emptyPublicRooms.shift();
            if (targetRoom) {
                console.log(`[ArenaDirector] Pairing wandering agents ${agent1.name} and ${agent2.name} in empty room ${targetRoom.id}.`);
                await this.moveAgent(agent1.id, targetRoom.id);
                await this.moveAgent(agent2.id, targetRoom.id);
            } else {
                const totalAgents = this.agents.size;
                const maxRooms = Math.ceil(totalAgents / 1.8);
                if (this.rooms.size < maxRooms) {
                    console.log(`[ArenaDirector] Creating new public room for ${agent1.name}.`);
                    const newRoomId = await this.createAndHostRoom(agent1.id, true);
                    if (newRoomId) {
                        console.log(`[ArenaDirector] Agent ${agent2.name} joining newly created room ${newRoomId}.`);
                        await this.moveAgent(agent2.id, newRoomId);
                    }
                } else {
                    wanderingAgents.unshift(agent2, agent1);
                    break;
                }
            }
        }
    }

    public getWorldState() {
        this.emitWorldState();
    }

    public async moveAgentToCafe(agentId: string) {
        await this.moveAgent(agentId, null); // Move to wandering state
        await this.processWanderingAgents(); // Immediately try to place them
    }

    public async kickAgent(payload: { agentId: string, roomId: string, ban?: boolean }) {
        const { agentId, roomId, ban } = payload;
        const currentRoomId = this.agentLocations.get(agentId);

        if (currentRoomId === roomId) {
            console.log(`[ArenaDirector] Kicking agent ${agentId} from room ${roomId}. Ban: ${!!ban}`);
            await this.moveAgent(agentId, null);
            
            if (ban) {
                const room = this.rooms.get(roomId);
                if (room) {
                    room.bannedAgentIds = [...(room.bannedAgentIds || []), agentId];
                    this.rooms.set(roomId, room);
                    await roomsCollection.updateOne({ id: roomId }, { $addToSet: { bannedAgentIds: agentId } });
                    this.emitToMain?.({ type: 'socketEmit', event: 'roomUpdated', payload: { room } });
                }
            }
        } else {
            console.warn(`[ArenaDirector] Cannot kick agent ${agentId} from room ${roomId}. Agent is in room ${currentRoomId}.`);
        }
    }

    public async createAndHostRoom(agentId: string, silent = false): Promise<string | null> {
        const agent = this.agents.get(agentId);
        if (!agent) return null;
    
        const newRoom = await cafeService.createRoom(agent);
        this.rooms.set(newRoom.id, newRoom);
        await this.moveAgent(agentId, newRoom.id);
        if (!silent) {
            console.log(`[ArenaDirector] Agent ${agent.name} created and hosted room ${newRoom.id}.`);
        }
        return newRoom.id;
    }

    private async moveAgent(agentId: string, toRoomId: string | null) {
        const fromRoomId = this.agentLocations.get(agentId);

        // Remove from old room if they were in one
        if (fromRoomId) {
            const fromRoom = this.rooms.get(fromRoomId);
            if (fromRoom) {
                fromRoom.agentIds = fromRoom.agentIds.filter(id => id !== agentId);
                
                if (fromRoom.agentIds.length === 0 && !fromRoom.isOwned) {
                    // Delete empty, non-owned rooms from memory and DB
                    this.rooms.delete(fromRoomId);
                    this.conversations.delete(fromRoomId);
                    await roomsCollection.deleteOne({ id: fromRoom.id });
                } else {
                    // If room becomes empty but is owned, just clear host if host left.
                    if (fromRoom.agentIds.length === 0) {
                        fromRoom.hostId = null;
                        fromRoom.activeOffer = null; // Clear offer when room is empty
                    } else if (fromRoom.hostId === agentId) {
                        fromRoom.hostId = fromRoom.agentIds[0];
                    }
                    this.rooms.set(fromRoomId, fromRoom);
                    await roomsCollection.updateOne({ id: fromRoom.id }, { $set: { agentIds: fromRoom.agentIds, hostId: fromRoom.hostId, activeOffer: fromRoom.activeOffer } });
                }
            }
        }

        // Add to new room
        if (toRoomId) {
            const toRoom = this.rooms.get(toRoomId);
            if (toRoom && toRoom.agentIds.length < 2 && !toRoom.agentIds.includes(agentId)) {
                toRoom.agentIds.push(agentId);
                this.agentLocations.set(agentId, toRoomId);
                this.rooms.set(toRoomId, toRoom);
                await roomsCollection.updateOne({ id: toRoom.id }, { $set: { agentIds: toRoom.agentIds } });
            } else {
                this.agentLocations.set(agentId, null);
            }
        } else {
            this.agentLocations.set(agentId, null);
        }
        
        this.emitToMain?.({ type: 'socketEmit', event: 'agentMoved', payload: { agentId, roomId: this.agentLocations.get(agentId) || null } });
        this.emitWorldState();
    }
    
    private async handleCreateOffer(seller: Agent, buyer: Agent, room: Room, args: { intel_id: string; price: number }) {
        const intel = await bettingIntelCollection.findOne({ id: args.intel_id, ownerAgentId: seller.id, isTradable: true });
        if (!intel) {
            console.warn(`[ArenaDirector] ${seller.name} tried to offer non-existent or non-tradable intel ${args.intel_id}.`);
            return;
        }

        const newOffer: Offer = {
            fromId: seller.id,
            toId: buyer.id,
            type: 'intel',
            intelId: intel.id,
            market: intel.market,
            price: args.price,
            status: 'pending',
        };
        
        room.activeOffer = newOffer;
        this.rooms.set(room.id, room);
        await roomsCollection.updateOne({ id: room.id }, { $set: { activeOffer: newOffer } });

        this.emitToMain?.({ type: 'socketEmit', event: 'roomUpdated', payload: { room } });
    }

    private async handleAcceptOffer(buyer: Agent, seller: Agent, room: Room, args: { offer_id: string }) {
        const offer = room.activeOffer;
        if (!offer || offer.intelId !== args.offer_id || offer.status !== 'pending') {
            console.warn(`[ArenaDirector] ${buyer.name} tried to accept an invalid or non-existent offer.`);
            return;
        }

        // Here you would check buyer's balance. For simulation, we assume they can afford it.
        
        const trade: TradeRecord = {
            fromId: seller.id,
            toId: buyer.id,
            type: 'intel',
            market: offer.market!,
            intelId: offer.intelId,
            price: offer.price,
            timestamp: Date.now(),
            roomId: room.id,
        };
        
        await tradeHistoryCollection.insertOne(trade as any);
        
        // --- Intel Transfer Logic ---
        const originalIntel = await bettingIntelCollection.findOne({ id: offer.intelId });
        if (originalIntel) {
            const newIntelForBuyer: Omit<BettingIntel, '_id'> = {
                ...originalIntel,
                id: `bettingintel-${new ObjectId().toHexString()}`, // New unique ID
                ownerAgentId: buyer.id,
                ownerHandle: buyer.ownerHandle,
                sourceAgentId: seller.id,
                pricePaid: offer.price,
                isTradable: false, // Purchased intel is not tradable by default
                createdAt: Date.now(),
                pnlGenerated: { amount: 0, currency: 'USD' }, // Reset PNL for the new owner
            };
            delete (newIntelForBuyer as any)._id; // Remove MongoDB specific field before insertion
            const { insertedId } = await bettingIntelCollection.insertOne(newIntelForBuyer as any);
            const savedIntel = await bettingIntelCollection.findOne({ _id: insertedId });
            
            // Notify the buyer's owner of the new intel
            if (buyer.ownerHandle) {
                 this.emitToMain?.({
                    type: 'socketEmit',
                    event: 'newIntel',
                    payload: { intel: savedIntel },
                    room: buyer.ownerHandle
                });
            }
        }
        // --- End Intel Transfer Logic ---

        // Update PNL for both agents
        await agentsCollection.bulkWrite([
            { updateOne: { filter: { id: seller.id }, update: { $inc: { currentPnl: offer.price } } } },
            { updateOne: { filter: { id: buyer.id }, update: { $inc: { currentPnl: -offer.price } } } }
        ]);
        
        // Update intel PNL for the original piece of intel
        await bettingIntelCollection.updateOne({ id: offer.intelId }, { $inc: { 'pnlGenerated.amount': offer.price } });

        // Clear the offer
        room.activeOffer = null;
        this.rooms.set(room.id, room);
        await roomsCollection.updateOne({ id: room.id }, { $set: { activeOffer: null } });

        this.emitToMain?.({ type: 'socketEmit', event: 'tradeExecuted', payload: { trade } });
        this.emitToMain?.({ type: 'socketEmit', event: 'roomUpdated', payload: { room } });

        // Send notifications
        await this.sendTradeNotifications(seller, buyer, trade);
    }

    private async sendTradeNotifications(seller: Agent, buyer: Agent, trade: TradeRecord) {
        if (seller.ownerHandle) {
            const message = `📈 SALE! Your agent, ${seller.name}, sold intel on "${trade.market}" to ${buyer.name} for ${trade.price} BOX.`;
            await notificationService.logAndSendNotification({
                userId: seller.ownerHandle,
                agentId: seller.id,
                type: 'agentTrade',
                message,
            });
        }

        if (buyer.ownerHandle) {
            const message = `📉 PURCHASE! Your agent, ${buyer.name}, bought intel on "${trade.market}" from ${seller.name} for ${trade.price} BOX.`;
            await notificationService.logAndSendNotification({
                userId: buyer.ownerHandle,
                agentId: buyer.id,
                type: 'agentTrade',
                message,
            });
        }
    }

    private setThinking(agentId: string, isThinking: boolean) {
        if (isThinking) {
            this.thinkingAgents.add(agentId);
        } else {
            this.thinkingAgents.delete(agentId);
        }
        this.emitToMain?.({
            type: 'socketEmit',
            event: 'agentThinking',
            payload: { agentId, isThinking }
        });
    }
    
    private emitWorldState() {
        this.emitToMain?.({
            type: 'socketEmit',
            event: 'worldState',
            payload: {
                rooms: Array.from(this.rooms.values()),
                agentLocations: Object.fromEntries(this.agentLocations),
                thinkingAgents: Array.from(this.thinkingAgents),
            }
        });
    }
}