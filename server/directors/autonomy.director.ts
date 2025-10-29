
import { agentsCollection, bettingIntelCollection, usersCollection } from '../db.js';
import { ObjectId } from 'mongodb';
import type { Agent } from '../../lib/types/shared.js';
import type { BettingIntelDocument } from '../../lib/types/mongodb.js';
import type { BettingIntel } from '../../lib/types/shared.js';
import { alphaService } from '../services/alpha.service.js';
import { notificationService } from '../services/notification.service.js';
import { aiService } from '../services/ai.service.js';

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
                    if (user.currentAgentId && ObjectId.isValid(user.currentAgentId)) {
                        filter.$or.push({ _id: new ObjectId(user.currentAgentId) });
                    }
                    
                    // Only run the query if we have valid conditions
                    if (filter.$or.length > 0) {
                        const agentDoc = await agentsCollection.findOne(filter);
                        if (agentDoc) {
                            // Convert the MongoDB document to our Agent type
                            const agent: Agent = {
                                ...(agentDoc as any),
                                id: agentDoc._id.toString(), // Ensure id is a string
                                bettingHistory: [], // bettingHistory needs to be populated if needed
                                bettingIntel: [], // bettingIntel needs to be populated if needed
                                marketWatchlists: [], // marketWatchlists needs to be populated if needed
                            };
                            await this.processAgentAutonomy(agent);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('[AutonomyDirector] Error during tick:', error);
        } finally {
            this.isTicking = false;
            console.log('[AutonomyDirector] Finished autonomy tick.');
        }
    }

    public async startResearch(agentId: string) {
        const agentDoc = await agentsCollection.findOne({ id: agentId });
        if (agentDoc) {
            // Convert agentDoc to Agent type
            const agent: Agent = {
                ...(agentDoc as any),
                id: agentDoc._id.toString(),
                bettingHistory: [], // bettingHistory needs to be populated if needed
                bettingIntel: [], // bettingIntel needs to be populated if needed
                marketWatchlists: [], // marketWatchlists needs to be populated if needed
            };
            this.setAgentBusy(agent.id, true);
            
            try {
                const newIntel = await alphaService.discoverAndAnalyzeMarkets(agent);
                if (newIntel && agent.ownerHandle) {
                    const savedIntel = await this.saveIntel(newIntel as BettingIntel);
                    
                    if(savedIntel) {
                        const message = `🔬 Research complete! Your agent, ${agent.name}, has new intel on "${savedIntel.market}".`;
                        await notificationService.logAndSendNotification({
                            userId: agent.ownerHandle,
                            agentId: agent.id,
                            type: 'agentResearch',
                            message,
                        });
                        this.emitToMain?.({ type: 'socketEmit', event: 'newIntel', payload: { intel: savedIntel }, room: agent.ownerHandle });
                    }
                }
            } catch (error) {
                console.error(`[AutonomyDirector] Error during manual research for agent ${agent.name}:`, error);
            } finally {
                this.setAgentBusy(agent.id, false);
            }
        }
    }

    private async processAgentAutonomy(agent: Agent) {
        const state = this.agentStates.get(agent.id) || { lastActionTime: 0, isBusy: false };
        const RESEARCH_COOLDOWN = 15 * 60 * 1000; // 15 minutes

        if (state.isBusy || Date.now() - state.lastActionTime < RESEARCH_COOLDOWN) {
            return;
        }

        console.log(`[AutonomyDirector] Processing autonomy for agent: ${agent.name}`);
        this.setAgentBusy(agent.id, true);

        try {
            const newIntel = await alphaService.discoverAndAnalyzeMarkets(agent);
            if (newIntel && agent.ownerHandle) {
                const savedIntel = await this.saveIntel(newIntel as BettingIntel);
                if (savedIntel) {
                    const message = `🔬 Your agent, ${agent.name}, autonomously discovered new intel on "${savedIntel.market}".`;
                    await notificationService.logAndSendNotification({
                        userId: agent.ownerHandle,
                        agentId: agent.id,
                        type: 'agentResearch',
                        message,
                    });
                    this.emitToMain?.({ type: 'socketEmit', event: 'newIntel', payload: { intel: savedIntel }, room: agent.ownerHandle });

                    // Proactive engagement
                    if (agent.isProactive) {
                        const user = await usersCollection.findOne({ handle: agent.ownerHandle });
                        // FIX: Corrected typo from 'agentEngagements' to 'agentEngagement' to match the Notification type definition.
                        if (user?.notificationSettings?.agentEngagements) {
                            const engagementMessage = await aiService.generateProactiveEngagementMessage(agent, savedIntel);
                            if (engagementMessage) {
                                await notificationService.logAndSendNotification({
                                    userId: agent.ownerHandle,
                                    agentId: agent.id,
                                    type: 'agentEngagement',
                                    message: engagementMessage
                                });
                            }
                        }
                    }
                }
            }
        } catch (error) {
            console.error(`[AutonomyDirector] Error during autonomy processing for agent ${agent.name}:`, error);
        } finally {
            this.setAgentBusy(agent.id, false);
        }
    }

    private setAgentBusy(agentId: string, isBusy: boolean) {
        const state = this.agentStates.get(agentId) || { lastActionTime: 0, isBusy: false };
        state.isBusy = isBusy;
        if (!isBusy) {
            state.lastActionTime = Date.now();
        }
        this.agentStates.set(agentId, state);
    }

    private async saveIntel(intel: BettingIntel): Promise<BettingIntel | null> {
        const newId = new ObjectId();
        const now = new Date();
        
        // Create the document with all required fields for BettingIntelDocument
        const document: Omit<BettingIntelDocument, 'toShared'> & { toShared(): BettingIntel } = {
            ...intel,
            _id: newId,
            ownerAgentId: new ObjectId(intel.ownerAgentId),
            sourceAgentId: intel.sourceAgentId ? new ObjectId(intel.sourceAgentId) : undefined,
            bountyId: intel.bountyId ? new ObjectId(intel.bountyId) : undefined,
            createdAt: new Date(intel.createdAt || now.getTime()),
            sourceUrls: intel.sourceUrls || [],
            rawResearchData: intel.rawResearchData || [],
            pnlGenerated: intel.pnlGenerated || { amount: 0, currency: 'USD' },
            toShared(): BettingIntel {
                return {
                    id: this._id.toHexString(),
                    ownerAgentId: this.ownerAgentId.toHexString(),
                    market: this.market,
                    content: this.content,
                    sourceDescription: this.sourceDescription,
                    isTradable: this.isTradable,
                    createdAt: this.createdAt.getTime(),
                    pnlGenerated: this.pnlGenerated,
                    sourceAgentId: this.sourceAgentId?.toHexString(),
                    pricePaid: this.pricePaid,
                    bountyId: this.bountyId?.toHexString(),
                    ownerHandle: this.ownerHandle,
                    sourceUrls: this.sourceUrls,
                    rawResearchData: this.rawResearchData
                };
            }
        };
        
        try {
            await bettingIntelCollection.insertOne(document as BettingIntelDocument);
            return document.toShared();
        } catch (error) {
            console.error('Error saving intel:', error);
            return null;
        }
    }
}
