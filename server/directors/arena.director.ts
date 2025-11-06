/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { Agent, Room, Interaction, Offer, TradeRecord, BettingIntel, MarketWatchlist } from '../../lib/types/index.js';
import { aiService } from '../services/ai.service.js';
import { tradeService } from '../services/trade.service.js';
import pkg from 'lodash';
const { shuffle } = pkg;
import { agentsCollection, bettingIntelCollection, roomsCollection, agentInteractionsCollection } from '../db.js';
import { ObjectId } from 'mongodb';

// Type for the callback function to emit messages to the main thread
type EmitToMainThread = (message: { type: string; event?: string; payload?: any; room?: string; worker?: string; message?: any; }) => void;

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
    private thinkingAgents: Set<string> = new Set();
    private systemPaused = false;
    private pauseUntil = 0;

    public async initialize(emitCallback: EmitToMainThread) {
        this.emitToMain = emitCallback;
        console.log('[ArenaDirector] Initialized.');
    }
    
    // FIX: Add missing methods to 'ArenaDirector' to resolve worker thread errors.
    public handleSystemPause(until: number) {
        this.systemPaused = true;
        this.pauseUntil = until;
    }

    public handleSystemResume() {
        this.systemPaused = false;
    }

    public async getWorldState() {
        const allAgents = await agentsCollection.find({}).toArray();
        const allRooms = await roomsCollection.find({}).toArray();
        this.emitWorldState(allRooms, allAgents);
    }

    public registerNewAgent(agent: Agent) {
        console.log(`[ArenaDirector] Noted new agent: ${agent.name}`);
    }

    public handleRoomUpdate(room: Room) {
        this.emitToMain?.({ type: 'socketEmit', event: 'roomUpdated', payload: { room } });
    }

    public handleRoomDelete(roomId: string) {
        this.emitToMain?.({ type: 'socketEmit', event: 'roomDestroyed', payload: { roomId } });
    }

    public async tick() {
        if (this.isTicking || (this.systemPaused && Date.now() < this.pauseUntil)) {
            if (this.systemPaused) console.log('[ArenaDirector] Tick skipped due to system pause.');
            return;
        }
        this.isTicking = true;
        try {
            const allAgents = await agentsCollection.find({}).toArray();
            const allRooms = await roomsCollection.find({}).toArray();

            await this.processWanderingAgents(allAgents, allRooms);
            await this.processConversations(allAgents, allRooms);
            
            this.emitWorldState(await roomsCollection.find({}).toArray(), allAgents);

        } catch (error) {
            console.error('[ArenaDirector] Error during tick:', error);
        } finally {
            this.isTicking = false;
        }
    }

    private async processWanderingAgents(allAgents: any[], allRooms: any[]) {
        const agentLocations: Record<string, string | null> = {};
        allAgents.forEach(agent => { agentLocations[agent.id] = null; });
        allRooms.forEach(room => { room.agentIds.forEach((agentId: ObjectId) => { agentLocations[agentId.toString()] = room.id; }); });
        
        const wanderingAgents = shuffle(allAgents.filter(agent => !agentLocations[agent._id.toString()]));

        if (wanderingAgents.length < 2) return;

        let availableWanderers = [...wanderingAgents];
        
        const singleOccupantRooms = allRooms.filter(room => !room.isOwned && room.agentIds.length === 1);
        for (const room of singleOccupantRooms) {
            if (availableWanderers.length === 0) break;
            const joiner = availableWanderers.pop()!;
            await this.moveAgent(joiner._id.toString(), room.id);
        }

        let emptyPublicRooms = allRooms.filter(room => !room.isOwned && room.agentIds.length === 0);
        while (availableWanderers.length >= 2 && emptyPublicRooms.length > 0) {
            const agent1 = availableWanderers.pop()!;
            const agent2 = availableWanderers.pop()!;
            const targetRoom = emptyPublicRooms.pop()!;
            await this.moveAgent(agent1._id.toString(), targetRoom.id);
            await this.moveAgent(agent2._id.toString(), targetRoom.id);
        }
    }
    
    private async processConversations(allAgents: any[], allRooms: any[]) {
        const twoPersonRooms = allRooms.filter(room => room.agentIds.length === 2);
        
        for (const room of twoPersonRooms) {
            const conversationState = { lastMessageTimestamp: room.lastMessageTimestamp || 0 };
            const CONVERSATION_COOLDOWN = 15 * 1000; // 15 seconds

            if (Date.now() - conversationState.lastMessageTimestamp < CONVERSATION_COOLDOWN) {
                continue;
            }

            const [agent1Doc, agent2Doc] = room.agentIds.map((id: ObjectId) => allAgents.find(a => a._id.equals(id)));
            if (!agent1Doc || !agent2Doc) continue;
            
            const history = await agentInteractionsCollection.find({ roomId: room.id }).sort({ timestamp: 1 }).toArray();

            const lastSpeakerId = history.length > 0 ? history[history.length - 1].agentId : null;
            const [speakerDoc, listenerDoc] = (lastSpeakerId === agent1Doc.id) ? [agent2Doc, agent1Doc] : [agent1Doc, agent2Doc];

            const speaker = { ...speakerDoc, id: speakerDoc._id.toString() };
            const listener = { ...listenerDoc, id: listenerDoc._id.toString() };

            const initialPrompt = history.length === 0 ? `You meet ${listener.name}. Start a conversation.` : undefined;

            this.setThinking(speaker.id, true);

            try {
                const { text, endConversation, toolCalls } = await aiService.getConversationTurn(speaker, listener, history, room, initialPrompt);

                if (toolCalls) {
                    for (const toolCall of toolCalls) {
                         if (toolCall.type === 'function' && toolCall.function.name === 'create_intel_offer') {
                            await this.handleCreateOffer(speaker, listener, room, JSON.parse(toolCall.function.arguments));
                        }
                        if (toolCall.type === 'function' && toolCall.function.name === 'accept_offer') {
                            await this.handleAcceptOffer(speaker, listener, room);
                        }
                    }
                }

                const newTurn: Interaction = { agentId: speaker.id, agentName: speaker.name, text, timestamp: Date.now(), roomId: room.id };
                await agentInteractionsCollection.insertOne(newTurn as any);
                await roomsCollection.updateOne({ _id: room._id }, { $set: { lastMessageTimestamp: newTurn.timestamp } } as any);

                this.emitToMain?.({ type: 'socketEmit', event: 'newConversationTurn', payload: { roomId: room.id, turn: newTurn, room } });

                if (toolCalls?.some(tc => tc.type === 'function' && tc.function.name === 'end_conversation')) {
                    await this.moveAgent(speaker.id, null);
                }
            } finally {
                this.setThinking(speaker.id, false);
            }
        }
    }

    private async moveAgent(agentId: string, toRoomId: string | null) {
        const agentObjectId = new ObjectId(agentId);
        const agent = await agentsCollection.findOne({ _id: agentObjectId });
        if (!agent) return;

        const fromRoom = await roomsCollection.findOne({ agentIds: agentObjectId });

        // Remove from old room
        if (fromRoom) {
            await roomsCollection.updateOne({ _id: fromRoom._id }, { $pull: { agentIds: agentObjectId } } as any);
            if (fromRoom.agentIds.length - 1 === 0 && !fromRoom.isOwned) {
                await roomsCollection.deleteOne({ _id: fromRoom._id });
                await agentInteractionsCollection.deleteMany({ roomId: fromRoom.id });
                this.emitToMain?.({ type: 'socketEmit', event: 'roomDestroyed', payload: { roomId: fromRoom.id } });
            }
        }

        // Add to new room
        if (toRoomId) {
            await roomsCollection.updateOne({ id: toRoomId }, { $addToSet: { agentIds: agentObjectId } } as any);
        }
        
        this.emitToMain?.({ type: 'socketEmit', event: 'agentMoved', payload: { agentId, toRoomId } });
    }

    private async handleCreateOffer(seller: Agent, buyer: Agent, room: any, args: { intel_id?: string; watchlist_id?: string; price: number }) {
        const offer: Partial<Offer> = { fromId: seller.id, toId: buyer.id, price: args.price, status: 'pending', roomId: room.id };
        if (args.intel_id) {
            const intel = await bettingIntelCollection.findOne({ _id: new ObjectId(args.intel_id), ownerAgentId: new ObjectId(seller.id), isTradable: true });
            if (intel) {
                offer.type = 'intel';
                offer.intelId = intel._id.toString();
                offer.market = intel.market;
            }
        } else if (args.watchlist_id) {
            const sellerDoc = await agentsCollection.findOne({ _id: new ObjectId(seller.id) });
            const watchlist = (sellerDoc as any)?.marketWatchlists?.find((w: MarketWatchlist) => w.id === args.watchlist_id);
            if (watchlist && watchlist.isTradable) {
                offer.type = 'watchlist';
                offer.watchlistId = watchlist.id;
                offer.watchlistName = watchlist.name;
            }
        }

        if (!offer.type) {
            console.warn(`[ArenaDirector] Could not create offer, invalid arguments:`, args);
            // Clear any existing offer
            await roomsCollection.updateOne({ _id: room._id }, { $set: { activeOffer: null } } as any);
            this.emitToMain?.({ type: 'socketEmit', event: 'roomUpdated', payload: { room: { ...room, activeOffer: null } } });
            return;
        }

        // FIX: Cast the offer object to the full 'Offer' type to resolve the assignment error, after ensuring it's valid.
        await roomsCollection.updateOne({ _id: room._id }, { $set: { activeOffer: offer as Offer } } as any);
        this.emitToMain?.({ type: 'socketEmit', event: 'roomUpdated', payload: { room: { ...room, activeOffer: offer } } });
    }

    private async handleAcceptOffer(buyer: Agent, seller: Agent, room: any) {
        const offer = room.activeOffer;
        if (!offer || offer.toId !== buyer.id) return;
        
        try {
            const { trade, newAsset } = await tradeService.executeTrade(offer);
            
            await roomsCollection.updateOne({ _id: room._id }, { $set: { activeOffer: null } } as any);

            this.emitToMain?.({ type: 'socketEmit', event: 'tradeExecuted', payload: { trade } });
            this.emitToMain?.({ type: 'socketEmit', event: 'roomUpdated', payload: { room: { ...room, activeOffer: null } } });
            
            if (buyer.ownerHandle) {
                this.emitToMain?.({ type: 'socketEmit', event: 'newIntel', payload: { intel: newAsset }, room: buyer.ownerHandle });
            }
        } catch (error) {
            console.error(`[ArenaDirector] Trade execution failed:`, error);
        }
    }
    
    private emitWorldState(rooms: any[], agents: any[]) {
        const agentLocations: Record<string, string | null> = {};
        agents.forEach(agent => {
            const agentIdStr = agent._id.toString();
            let foundRoom = false;
            for (const room of rooms) {
                if (room.agentIds.some((id: ObjectId) => id.equals(agent._id))) {
                    agentLocations[agentIdStr] = room.id;
                    foundRoom = true;
                    break;
                }
            }
            if (!foundRoom) {
                agentLocations[agentIdStr] = null;
            }
        });

        this.emitToMain?.({
            type: 'socketEmit',
            event: 'worldState',
            payload: {
                rooms: rooms.map(r => ({...r, id: r.id || r._id.toString()})),
                agentLocations,
                thinkingAgents: Array.from(this.thinkingAgents),
                systemPaused: this.systemPaused && Date.now() < this.pauseUntil
            }
        });
    }

    private setThinking(agentId: string, isThinking: boolean) {
        isThinking ? this.thinkingAgents.add(agentId) : this.thinkingAgents.delete(agentId);
        this.emitToMain?.({ type: 'socketEmit', event: 'agentThinking', payload: { agentId, isThinking } });
    }

    public async moveAgentToCafe(agentId: string) { await this.moveAgent(agentId, null); }
    public async recallAgent(agentId: string) { await this.moveAgent(agentId, null); }
    public async kickAgent({ agentId, roomId }: { agentId: string, roomId: string }) { await this.moveAgent(agentId, null); }
    public async createAndHostRoom(agentId: string) {
        const agentDoc = await agentsCollection.findOne({ _id: new ObjectId(agentId) });
        if (!agentDoc) return;
        const agent = { ...agentDoc, id: agentDoc._id.toString() };

        const newRoom: Omit<Room, 'id'> & { _id: ObjectId } = {
            _id: new ObjectId(),
            agentIds: [], hostId: agent.id, topics: agent.topics, warnFlags: 0, rules: [],
            activeOffer: null, vibe: 'General Chat ☕️', isOwned: false
        };
        const { insertedId } = await roomsCollection.insertOne(newRoom as any);
        const savedRoom = await roomsCollection.findOne({ _id: insertedId });
        if (savedRoom) {
            const finalRoom = { ...savedRoom, id: savedRoom._id.toString() };
            this.emitToMain?.({ type: 'socketEmit', event: 'roomUpdated', payload: { room: finalRoom } });
            await this.moveAgent(agentId, finalRoom.id);
        }
    }
}