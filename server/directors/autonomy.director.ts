import { agentsCollection, bettingIntelCollection, usersCollection } from '../db.js';
import mongoose from 'mongoose';
import { Agent, BettingIntel } from '../../lib/types/index.js';
import { alphaService } from '../services/alpha.service.js';
import { notificationService } from '../services/notification.service.js';
import { aiService } from '../services/ai.service.js';
import { ObjectId } from 'mongodb';

type EmitToMainThread = (message: { type: string; event?: string; payload?: any; room?: string; worker?: string; message?: any; }) => void;

export class AutonomyDirector {
    private emitToMain?: EmitToMainThread;
    private isTicking = false;
    private agentStates: Map<string, { lastActionTime: number; isBusy: boolean }> = new Map();

    public initialize(emitCallback: EmitToMainThread) {
        this.emitToMain = emitCallback;
        console.log('[AutonomyDirector] Initialized.');
    }

    public async tick() {
        if (this.isTicking) return;
        this.isTicking = true;
        console.log('[AutonomyDirector] Starting autonomy tick...');
        
        try {
            // First, find all users with currentAgentId
            const allUsers = await usersCollection.find({}).toArray();
            // Then filter in JavaScript to ensure type safety
            const usersWithActiveAgents = allUsers.filter(user => 
                user.currentAgentId && typeof user.currentAgentId === 'string'
            );

            for (const user of usersWithActiveAgents) {
                if (user.currentAgentId) {
                    // Create a filter that works with both string ID and ObjectId
                    const filter: any = { $or: [] };
                    
                    // Add string ID condition
                    if (user.currentAgentId) {
                        filter.$or.push({ id: user.currentAgentId });
                    }
                    
                    // Add ObjectId condition if valid
                    if (user.currentAgentId && mongoose.Types.ObjectId.isValid(user.currentAgentId)) {
                        filter.$or.push({ _id: new mongoose.Types.ObjectId(user.currentAgentId) });
                    }
                    
                    // Only run the query if we have valid conditions
                    if (filter.$or.length > 0) {
                        const agentDoc = await agentsCollection.findOne(filter);
                        if (agentDoc) {
                            // Convert the MongoDB document to our Agent type
                            const agent: Agent = {
                                id: agentDoc.id,
                                name: agentDoc.name || 'Unnamed Agent',
                                personality: agentDoc.personality || '',
                                instructions: agentDoc.instructions || '',
                                voice: agentDoc.voice || 'default',
                                topics: Array.isArray(agentDoc.topics) ? agentDoc.topics : [],
                                wishlist: Array.isArray(agentDoc.wishlist) ? agentDoc.wishlist : [],
                                reputation: typeof agentDoc.reputation === 'number' ? agentDoc.reputation : 0,
                                isShilling: !!agentDoc.isShilling,
                                shillInstructions: agentDoc.shillInstructions || '',
                                modelUrl: agentDoc.modelUrl || '',
                                bettingHistory: [], // Initialize as empty array since we don't need the actual bets here
                                currentPnl: typeof agentDoc.currentPnl === 'number' ? agentDoc.currentPnl : 0,
                                bettingIntel: agentDoc.bettingIntel?.map((id: any) => id.toString()) || [], // Convert ObjectId to string
                                marketWatchlists: agentDoc.marketWatchlists?.map((id: any) => id.toString()) || [], // Convert ObjectId to string
                                boxBalance: typeof agentDoc.boxBalance === 'number' ? agentDoc.boxBalance : 0,
                                portfolio: agentDoc.portfolio || {},
                                isProactive: typeof agentDoc.isProactive === 'boolean' ? agentDoc.isProactive : true,
                                trustedRoomIds: Array.isArray(agentDoc.trustedRoomIds) ? agentDoc.trustedRoomIds : [],
                                operatingHours: agentDoc.operatingHours || '',
                                mode: agentDoc.mode || 'Safe',
                                templateId: agentDoc.templateId,
                                copiedFromId: agentDoc.copiedFromId,
                                createdAt: agentDoc.createdAt?.getTime() || Date.now(),
                                updatedAt: agentDoc.updatedAt?.getTime() || Date.now(),
                                lastActiveAt: agentDoc.lastActiveAt?.getTime() || Date.now(),
                            };
                            await this.decideAndExecuteNextAction(agent);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('[AutonomyDirector] Error during tick:', error);
        } finally {
            this.isTicking = false;
        }
    }

    private async decideAndExecuteNextAction(agent: Agent) {
        const agentState = this.agentStates.get(agent.id) || { lastActionTime: 0, isBusy: false };
        const ACTION_COOLDOWN = 5 * 60 * 1000; // 5 minutes

        if (agentState.isBusy || Date.now() - agentState.lastActionTime < ACTION_COOLDOWN) {
            return;
        }

        agentState.isBusy = true;
        this.agentStates.set(agent.id, agentState);

        try {
            const actionRoll = Math.random();

            if (actionRoll < 0.6) { // 60% chance to research
                console.log(`[AutonomyDirector] Action for ${agent.name}: RESEARCH_MARKET`);
                await this.executeResearch(agent);
            } else if (actionRoll < 0.9) { // 30% chance to go to cafe
                console.log(`[AutonomyDirector] Action for ${agent.name}: GO_TO_CAFE`);
                await this.executeGoToCafe(agent);
            } else { // 10% chance to engage user
                console.log(`[AutonomyDirector] Action for ${agent.name}: ENGAGE_USER`);
                await this.executeEngageUser(agent);
            }

        } finally {
            agentState.isBusy = false;
            agentState.lastActionTime = Date.now();
            this.agentStates.set(agent.id, agentState);
        }
    }

    private async executeResearch(agent: Agent) {
        const newIntel = await alphaService.discoverAndAnalyzeMarkets(agent);
        if (newIntel && agent.ownerHandle) {
            const intelWithId = { ...newIntel, id: `bettingintel-${new ObjectId().toHexString()}` };
            const { insertedId } = await bettingIntelCollection.insertOne(intelWithId as any);
            const savedIntel = await bettingIntelCollection.findOne({ _id: insertedId });
            
            this.emitToMain?.({
                type: 'socketEmit',
                event: 'newIntel',
                payload: { intel: savedIntel },
                room: agent.ownerHandle
            });

            const message = `🔬 Your agent, ${agent.name}, has completed its research and discovered new intel on the market: "${savedIntel!.market}"`;
            await notificationService.logAndSendNotification({
                userId: agent.ownerHandle,
                agentId: agent.id,
                type: 'agentResearch',
                message,
            });
        }
    }

    private async executeGoToCafe(agent: Agent) {
        this.emitToMain?.({
            type: 'forwardToWorker',
            worker: 'arena',
            message: { type: 'moveAgentToCafe', payload: { agentId: agent.id } }
        });
        
        if (agent.ownerHandle) {
            const message = `☕️ Your agent, ${agent.name}, is heading to the Intel Exchange to look for alpha.`;
             await notificationService.logAndSendNotification({
                userId: agent.ownerHandle,
                agentId: agent.id,
// FIX: Corrected typo from 'agentEngagements' to 'agentEngagement' to match the Notification type definition.
                type: 'agentEngagement',
                message,
            });
        }
    }
    
    private async executeEngageUser(agent: Agent) {
        if (!agent.ownerHandle) return;

        // Create a query that works with both string and ObjectId
        const query: any = { 
            $or: [
                { ownerAgentId: agent.id },
                { ownerAgentId: new mongoose.Types.ObjectId(agent.id) }
            ]
        };
        
        const recentIntel = await bettingIntelCollection
            .find(query)
            .sort({ createdAt: -1 })
            .limit(1)
            .toArray();
        if (recentIntel.length === 0) return;

        const intelDoc = recentIntel[0];
        // Map the document to our BettingIntel type
        const intel: BettingIntel = {
            id: intelDoc._id.toString(),
            ownerAgentId: intelDoc.ownerAgentId.toString(),
            market: intelDoc.market,
            content: intelDoc.content,
            sourceDescription: intelDoc.sourceDescription,
            isTradable: Boolean(intelDoc.isTradable),
            createdAt: intelDoc.createdAt ? intelDoc.createdAt.getTime() : Date.now(),
            pnlGenerated: intelDoc.pnlGenerated || { amount: 0, currency: 'USD' },
            sourceAgentId: intelDoc.sourceAgentId?.toString(),
            pricePaid: intelDoc.pricePaid,
            bountyId: intelDoc.bountyId?.toString(),
            ownerHandle: intelDoc.ownerHandle,
            sourceUrls: intelDoc.sourceUrls || []
        };
        
        const engagementMessage = await aiService.generateProactiveEngagementMessage(agent, intel);

        if (engagementMessage) {
            const message = `💡 Your agent, ${agent.name}, has a thought: "${engagementMessage}"`;
            await notificationService.logAndSendNotification({
                userId: agent.ownerHandle,
                agentId: agent.id,
                type: 'agentEngagement',
                message,
            });
        }
    }

    public startResearch(agentId: string) {
        console.log(`[AutonomyDirector] Manual research trigger for agent ${agentId}.`);
        agentsCollection.findOne({ id: agentId }).then(agentDoc => {
            if (agentDoc) {
                // Convert the MongoDB document to our Agent type with all required fields
                const agent: Agent = {
                    id: agentDoc.id,
                    name: agentDoc.name || 'Unnamed Agent',
                    personality: agentDoc.personality || '',
                    instructions: agentDoc.instructions || '',
                    voice: agentDoc.voice || 'default',
                    topics: Array.isArray(agentDoc.topics) ? agentDoc.topics : [],
                    wishlist: Array.isArray(agentDoc.wishlist) ? agentDoc.wishlist : [],
                    reputation: typeof agentDoc.reputation === 'number' ? agentDoc.reputation : 0,
                    isShilling: !!agentDoc.isShilling,
                    shillInstructions: agentDoc.shillInstructions || '',
                    modelUrl: agentDoc.modelUrl || '',
                    bettingHistory: [],
                    currentPnl: typeof agentDoc.currentPnl === 'number' ? agentDoc.currentPnl : 0,
                    bettingIntel: agentDoc.bettingIntel?.map((id: any) => id.toString()) || [], // Convert ObjectId to string
                    marketWatchlists: agentDoc.marketWatchlists?.map((id: any) => id.toString()) || [], // Convert ObjectId to string
                    boxBalance: typeof agentDoc.boxBalance === 'number' ? agentDoc.boxBalance : 0,
                    portfolio: agentDoc.portfolio || {},
                    isProactive: typeof agentDoc.isProactive === 'boolean' ? agentDoc.isProactive : true,
                    trustedRoomIds: Array.isArray(agentDoc.trustedRoomIds) ? agentDoc.trustedRoomIds : [],
                    operatingHours: agentDoc.operatingHours || '',
                    mode: agentDoc.mode || 'Safe',
                    templateId: agentDoc.templateId,
                    copiedFromId: agentDoc.copiedFromId,
                    createdAt: agentDoc.createdAt?.getTime() || Date.now(),
                    updatedAt: agentDoc.updatedAt?.getTime() || Date.now(),
                    lastActiveAt: agentDoc.lastActiveAt?.getTime() || Date.now(),
                };
                this.executeResearch(agent);
            }
        });
    }
}