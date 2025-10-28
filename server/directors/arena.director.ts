import mongoose from 'mongoose';
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
            const agentId = agent._id.toString();
            this.agents.set(agentId, {
                ...agent,
                id: agentId,
                // Ensure all IDs are strings in the agent object
                currentRoomId: agent.currentRoomId?.toString(),
                bettingHistory: agent.bettingHistory?.map((id: any) => id.toString()) || [],
                bets: agent.bets?.map((id: any) => id.toString()) || []
            } as Agent);
            this.agentLocations.set(agentId, null); // Assume all are wandering initially
        });

        // Load all rooms and populate agent locations
        const allRooms = await roomsCollection.find({}).toArray();
        allRooms.forEach(room => {
            const roomId = room._id.toString();
            const roomData: Room = {
                ...room,
                id: roomId,
                hostId: room.hostId?.toString() || null,
                agentIds: room.agentIds.map((id: any) => id.toString()),
                bannedAgentIds: room.bannedAgentIds?.map((id: any) => id.toString()) || [],
                // Convert any other ObjectId fields as needed
                ...(room.ownerHandle && { ownerHandle: room.ownerHandle }),
                ...(room.roomBio && { roomBio: room.roomBio }),
                ...(room.twitterUrl && { twitterUrl: room.twitterUrl }),
                ...(room.rules && { rules: room.rules })
            };
            
            this.rooms.set(roomId, roomData);
            
            room.agentIds.forEach((agentId: any) => {
                const agentIdStr = agentId.toString();
                this.agentLocations.set(agentIdStr, roomId);
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
        } catch (error) {
            console.error(`[ArenaDirector] Error in processConversation for room ${room?.id}:`, error);
        } finally {
            this.setThinking(speaker.id, false);
        }
    }

    private async processWanderingAgents() {
        try {
            // Get all wandering agents (those not currently in a room)
            const wanderingAgents = cafeService.findWanderingAgents(this.agents, this.agentLocations);
            if (wanderingAgents.length === 0) {
                return; // No wandering agents to process
            }

            console.log(`[ArenaDirector] Processing ${wanderingAgents.length} wandering agents`);
            
            // Phase 1: Try to place wandering agents in existing rooms with space
            for (const agent of [...wanderingAgents]) { // Create a copy to safely modify the array
                try {
                    // Skip if agent is currently thinking
                    if (this.thinkingAgents.has(agent.id)) {
                        continue;
                    }

                    // 50% chance to try joining an existing room, 50% to create a new one
                    if (Math.random() < 0.5) {
                        // Find all available rooms (with space, no active offer, not owned)
                        const availableRooms = Array.from(this.rooms.values()).filter(room => 
                            room && 
                            room.agentIds && 
                            room.agentIds.length < 4 && 
                            !room.activeOffer &&
                            !room.isOwned
                        );
                        
                        if (availableRooms.length > 0) {
                            // Pick a random available room
                            const targetRoom = availableRooms[Math.floor(Math.random() * availableRooms.length)];
                            if (targetRoom && targetRoom.id) {
                                await this.moveAgent(agent.id, targetRoom.id);
                                console.log(`[ArenaDirector] Agent ${agent.name} joined room ${targetRoom.id}`);
                                continue; // Successfully placed this agent
                            }
                        }
                    }

                    // If we get here, either we decided to create a new room or couldn't find a suitable room
                    console.log(`[ArenaDirector] Creating new room for wandering agent ${agent.name}`);
                    await this.createAndHostRoom(agent.id, true);
                    
                } catch (error) {
                    console.error(`[ArenaDirector] Error processing wandering agent ${agent?.id}:`, error);
                    continue;
                }
            }

            // Phase 2: Try to pair up remaining wandering agents in empty public rooms
            const remainingWanderers = wanderingAgents.filter(agent => 
                !this.agentLocations.get(agent.id) && !this.thinkingAgents.has(agent.id)
            );
            
            if (remainingWanderers.length >= 2) {
                // Find all empty public rooms
                const emptyPublicRooms = Array.from(this.rooms.values())
                    .filter(room => 
                        room && 
                        room.agentIds && 
                        room.agentIds.length === 0 && 
                        !room.isOwned
                    );
                
                // Try to pair up agents in empty rooms
                while (remainingWanderers.length >= 2 && emptyPublicRooms.length > 0) {
                    const agent1 = remainingWanderers.shift()!;
                    const agent2 = remainingWanderers.shift()!;
                    const targetRoom = emptyPublicRooms.shift()!;
                    
                    try {
                        await this.moveAgent(agent1.id, targetRoom.id);
                        await this.moveAgent(agent2.id, targetRoom.id);
                        console.log(`[ArenaDirector] Paired ${agent1.name} and ${agent2.name} in room ${targetRoom.id}`);
                    } catch (error) {
                        console.error(`[ArenaDirector] Error pairing agents in room ${targetRoom.id}:`, error);
                        // Put agents back in the queue if pairing failed
                        remainingWanderers.unshift(agent2, agent1);
                    }
                }
                
                // If we still have pairs of agents left but no rooms, create new ones
                while (remainingWanderers.length >= 2) {
                    const agent1 = remainingWanderers.shift()!;
                    const agent2 = remainingWanderers.shift()!;
                    
                    try {
                        // Create a new room with the first agent as host
                        const roomId = await this.createAndHostRoom(agent1.id, true);
                        if (roomId) {
                            // Move the second agent into the new room
                            await this.moveAgent(agent2.id, roomId);
                            console.log(`[ArenaDirector] Created new room for ${agent1.name} and ${agent2.name}`);
                        }
                    } catch (error) {
                        console.error(`[ArenaDirector] Error creating new room for pair:`, error);
                        remainingWanderers.unshift(agent2, agent1);
                        break; // Stop if we can't create rooms
                    }
                }
            }
            
            console.log(`[ArenaDirector] Finished processing wandering agents`);
            
        } catch (error) {
            console.error('[ArenaDirector] Error in processWanderingAgents:', error);
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
                    await roomsCollection.updateOne(
                        { id: roomId },
                        { $addToSet: { bannedAgentIds: new mongoose.Types.ObjectId(agentId) } }
                    );
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
        if (!mongoose.Types.ObjectId.isValid(agentId)) {
            console.error(`[ArenaDirector] Invalid agent ID format: ${agentId}`);
            return;
        }
        
        const fromRoomId = this.agentLocations.get(agentId);
        let agentObjId;
        
        try {
            agentObjId = new ObjectId(agentId);
        } catch (error) {
            console.error(`[ArenaDirector] Failed to create ObjectId for agent ${agentId}:`, error);
            return;
        }

        // Remove from old room if they were in one
        if (fromRoomId) {
            const fromRoom = this.rooms.get(fromRoomId);
            if (fromRoom) {
                fromRoom.agentIds = fromRoom.agentIds.filter(id => id !== agentId);
                
                if (fromRoom.agentIds.length === 0 && !fromRoom.isOwned) {
                    // Delete empty, non-owned rooms from memory and DB
                    this.rooms.delete(fromRoomId);
                    this.conversations.delete(fromRoomId);
                    try {
                        await roomsCollection.deleteOne({ _id: new ObjectId(fromRoomId) });
                    } catch (error) {
                        console.error(`[ArenaDirector] Error deleting room ${fromRoomId}:`, error);
                    }
                } else {
                    // If room becomes empty but is owned, just clear host if host left.
                    if (fromRoom.agentIds.length === 0) {
                        fromRoom.hostId = null;
                        fromRoom.activeOffer = null; // Clear offer when room is empty
                    } else if (fromRoom.hostId === agentId) {
                        fromRoom.hostId = fromRoom.agentIds[0];
                    }
                    this.rooms.set(fromRoomId, fromRoom);
                    
                    // Convert agentIds to ObjectId for database operation
                    const agentIdsAsObjectIds = fromRoom.agentIds
                        .filter(id => mongoose.Types.ObjectId.isValid(id))
                        .map(id => new ObjectId(id));
                        
                    let hostIdObj = null;
                    if (fromRoom.hostId && mongoose.Types.ObjectId.isValid(fromRoom.hostId)) {
                        hostIdObj = new ObjectId(fromRoom.hostId);
                    }
                    
                    await roomsCollection.updateOne(
                        { _id: new ObjectId(fromRoomId) }, 
                        { 
                            $set: { 
                                agentIds: agentIdsAsObjectIds, 
                                hostId: hostIdObj,
                                activeOffer: fromRoom.activeOffer 
                            } 
                        }
                    );
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
                
                // Convert agentIds to ObjectId for database operation
                const agentIdsAsObjectIds = toRoom.agentIds.map(id => new ObjectId(id));
                const hostIdObj = toRoom.hostId ? new ObjectId(toRoom.hostId) : null;
                
                await roomsCollection.updateOne(
                    { _id: new ObjectId(toRoomId) }, 
                    { 
                        $set: { 
                            agentIds: agentIdsAsObjectIds,
                            hostId: hostIdObj
                        } 
                    }
                );
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
        const intel = await bettingIntelCollection.findOne({ 
            _id: new ObjectId(args.intel_id), 
            ownerAgentId: new ObjectId(seller.id), 
            isTradable: true 
        });
        
        if (!intel) {
            console.warn(`[ArenaDirector] ${seller.name} tried to offer non-existent or non-tradable intel ${args.intel_id}.`);
            return;
        }

        const newOffer: Offer = {
            fromId: seller.id,
            toId: buyer.id,
            type: 'intel',
            intelId: intel._id.toString(),
            market: intel.market,
            price: args.price,
            status: 'pending',
        };
        
        room.activeOffer = newOffer;
        this.rooms.set(room.id, room);
        
        await roomsCollection.updateOne(
            { _id: new ObjectId(room.id) }, 
            { $set: { activeOffer: newOffer } }
        );

        this.emitToMain?.({ 
            type: 'socketEmit', 
            event: 'roomUpdated', 
            payload: { room } 
        });
    }

    private async handleAcceptOffer(buyer: Agent, seller: Agent, room: Room, args: { offer_id: string }) {
        const offer = room.activeOffer;
        if (!offer) {
            console.warn(`[ArenaDirector] No active offer to accept in room ${room.id}`);
            return;
        }

        // Convert string IDs to ObjectId for database operations
        const buyerId = new ObjectId(buyer.id);
        const sellerId = new ObjectId(seller.id);
        const intelId = new ObjectId(offer.intelId);
        const roomId = new ObjectId(room.id);

        // Get the original intel
        const originalIntel = await bettingIntelCollection.findOne({ _id: intelId });
        if (!originalIntel) {
            console.warn(`[ArenaDirector] Intel ${offer.intelId} not found`);
            return;
        }

        // Create a new intel record for the buyer
        const newIntelForBuyer = {
            ...originalIntel,
            _id: new ObjectId(),
            ownerAgentId: buyerId,
            ownerHandle: buyer.ownerHandle,
            sourceAgentId: sellerId,
            pricePaid: offer.price,
            isTradable: false,
            createdAt: new Date(),
            pnlGenerated: { amount: 0, currency: 'USD' },
            updatedAt: new Date()
        };

        // Insert the new intel record for the buyer
        const { insertedId } = await bettingIntelCollection.insertOne(newIntelForBuyer);
        const savedIntel = await bettingIntelCollection.findOne({ _id: insertedId });

        if (savedIntel && buyer.ownerHandle) {
            // Notify the buyer's owner of the new intel
            this.emitToMain?.({
                type: 'socketEmit',
                event: 'newIntel',
                payload: { intel: savedIntel },
                room: buyer.ownerHandle
            });
        }

        // Update PNL for both agents
        await agentsCollection.bulkWrite([
            { 
                updateOne: { 
                    filter: { _id: sellerId }, 
                    update: { $inc: { currentPnl: offer.price } } 
                } 
            },
            { 
                updateOne: { 
                    filter: { _id: buyerId }, 
                    update: { $inc: { currentPnl: -offer.price } } 
                } 
            }
        ]);
        
        // Update intel PNL for the original piece of intel
        await bettingIntelCollection.updateOne(
            { _id: intelId }, 
            { $inc: { 'pnlGenerated.amount': offer.price } }
        );

        // Create trade record
        const trade: TradeRecord = {
            fromId: seller.id,
            toId: buyer.id,
            type: 'intel',
            market: offer.market || 'unknown',
            intelId: offer.intelId,
            price: offer.price,
            timestamp: Date.now(),
            roomId: roomId.toString()
        };

        // Clear the offer
        room.activeOffer = null;
        this.rooms.set(room.id, room);
        await roomsCollection.updateOne(
            { _id: roomId }, 
            { $set: { activeOffer: null } }
        );

        // Emit events
        this.emitToMain?.({ 
            type: 'socketEmit', 
            event: 'tradeExecuted', 
            payload: { trade } 
        });
        
        this.emitToMain?.({ 
            type: 'socketEmit', 
            event: 'roomUpdated', 
            payload: { room } 
        });

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
                systemPaused: this.systemPaused,
            }
        });
    }
}