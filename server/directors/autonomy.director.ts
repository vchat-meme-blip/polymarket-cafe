import { agentsCollection, usersCollection, betsCollection, bettingIntelCollection } from '../db.js';
import { ObjectId } from 'mongodb';
import type { Agent, User, ActivityLogEntry } from '../../lib/types/shared.js';
import type { BettingIntelDocument } from '../../lib/types/mongodb.js';
import type { BettingIntel } from '../../lib/types/shared.js';
import { alphaService } from '../services/alpha.service.js';
import { notificationService } from '../services/notification.service.js';
import { aiService } from '../services/ai.service.js';
import { polymarketService } from '../services/polymarket.service.js';
import { apiKeyProvider } from '../services/apiKey.provider.js';
import OpenAI from 'openai';

type EmitToMainThread = (message: { type: string; event?: string; payload?: any; room?: string; worker?: string; message?: any; }) => void;

export class AutonomyDirector {
    private emitToMain?: EmitToMainThread;
    private isTicking = false;
    private agentStates: Map<string, { lastActionTime: number; isBusy: boolean }> = new Map();
    private systemPaused = false;
    private pauseUntil = 0;

    private currentUserOffset = 0;
    private readonly BATCH_SIZE = 10; 

    public initialize(emitCallback: EmitToMainThread) {
        this.emitToMain = emitCallback;
        console.log('[AutonomyDirector] Initialized.');
    }

    public handleSystemPause(until: number) {
        this.systemPaused = true;
        this.pauseUntil = until;
    }

    public handleSystemResume() {
        this.systemPaused = false;
    }
    
    private async retry<T>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
        try {
            return await fn();
        } catch (error) {
            console.error(`[AutonomyDirector] Retryable function failed. Retries left: ${retries - 1}. Error:`, error);
            if (retries > 1) {
                await new Promise(res => setTimeout(res, delay));
                return this.retry(fn, retries - 1, delay * 2);
            }
            throw error;
        }
    }

    public async tick() {
        if (this.isTicking || (this.systemPaused && Date.now() < this.pauseUntil)) {
             if (this.systemPaused) console.log('[AutonomyDirector] Tick skipped due to system pause.');
             return;
        }
        this.isTicking = true;
        
        try {
            const activeUserQuery = { currentAgentId: { $exists: true, $ne: null as any } };
            const totalUsers = await usersCollection.countDocuments(activeUserQuery);

            if (this.currentUserOffset >= totalUsers) {
                this.currentUserOffset = 0;
            }
            
            const usersWithActiveAgents = await usersCollection
                .find(activeUserQuery)
                .skip(this.currentUserOffset)
                .limit(this.BATCH_SIZE)
                .toArray();

            if (usersWithActiveAgents.length === 0 && totalUsers > 0) {
                this.currentUserOffset = 0;
            } else {
                this.currentUserOffset += usersWithActiveAgents.length;
            }

            for (const userDoc of usersWithActiveAgents) {
                const user: User = { ...userDoc, _id: userDoc._id.toString() } as unknown as User;
                if (!user.currentAgentId) continue;

                const agentId = typeof user.currentAgentId === 'string' ? new ObjectId(user.currentAgentId) : user.currentAgentId;
                const agentDoc = await agentsCollection.findOne({ _id: agentId });
                
                if (agentDoc && agentDoc.isProactive) {
                    const agent: Agent = {
                        ...(agentDoc as any),
                        id: agentDoc._id.toString(),
                        bettingHistory: [],
                        bettingIntel: [],
                        marketWatchlists: [],
                    };
                    await this.processAgentAutonomy(agent, user);
                }
            }
        } catch (error) {
            console.error('[AutonomyDirector] Error during tick:', error);
        } finally {
            this.isTicking = false;
        }
    }

    private _logActivity(agent: Agent, type: ActivityLogEntry['type'], message: string, triggeredNotification: boolean = false) {
        if (!agent.ownerHandle) return;

        const logEntry: ActivityLogEntry = {
            id: new ObjectId().toHexString(),
            timestamp: Date.now(),
            agentId: agent.id,
            agentName: agent.name,
            type,
            message,
            triggeredNotification,
        };
        
        this.emitToMain?.({
            type: 'socketEmit',
            event: 'newActivityLog',
            payload: logEntry,
            room: agent.ownerHandle,
        });
    }

    private async processAgentAutonomy(agent: Agent, user: User) {
        const state = this.agentStates.get(agent.id) || { lastActionTime: 0, isBusy: false };
        const AUTONOMY_COOLDOWN = 10 * 60 * 1000;

        if (state.isBusy || Date.now() - state.lastActionTime < AUTONOMY_COOLDOWN) {
            return;
        }

        this.setAgentBusy(agent.id, true);

        try {
            const actionRoll = Math.random();
            const ownerHandle = agent.ownerHandle;
            if (!ownerHandle) throw new Error("Agent has no owner handle.");

            if (actionRoll < 0.7) { // 70% Chance: Go to Café
                const message = `Decided to head to the Café to look for intel opportunities.`;
                this.emitToMain?.({
                    type: 'forwardToWorker',
                    worker: 'arena',
                    message: { type: 'moveAgentToCafe', payload: { agentId: agent.id } }
                });
                // FIX: Corrected notification type to match the allowed types in the Notification definition.
                const notified = await notificationService.logAndSendNotification({ userId: ownerHandle, type: 'autonomyCafe', message: `${agent.name} is heading to the Café.` });
                // FIX: The `_logActivity` function expects a boolean for `triggeredNotification`, but `notified` is a SendStatus object. Use `notified.sent` instead.
                this._logActivity(agent, 'cafe', message, notified.sent);
            } else if (actionRoll < 0.9) { // 20% chance: Proactive User Engagement
                const message = `Reviewing recent activity to find an insight for ${user.handle}.`;
                // FIX: Corrected notification type to match the allowed types in the Notification definition.
                const notified = await notificationService.logAndSendNotification({ userId: ownerHandle, type: 'autonomyEngage', message: `${agent.name} is formulating a new suggestion for you.` });
                // FIX: The `_logActivity` function expects a boolean for `triggeredNotification`, but `notified` is a SendStatus object. Use `notified.sent` instead.
                this._logActivity(agent, 'engagement', message, notified.sent);
                await this.proactiveEngagement(user, agent);
            } else { // 10% chance: Deep Research
                const message = `Starting autonomous deep research on a trending market.`;
                // FIX: Corrected notification type to match the allowed types in the Notification definition.
                const notified = await notificationService.logAndSendNotification({ userId: ownerHandle, type: 'autonomyResearch', message: `${agent.name} is starting a new research task.` });
                // FIX: The `_logActivity` function expects a boolean for `triggeredNotification`, but `notified` is a SendStatus object. Use `notified.sent` instead.
                this._logActivity(agent, 'research', message, notified.sent);

                const newIntel = await alphaService.discoverAndAnalyzeMarkets(agent);
                if (newIntel && agent.ownerHandle) {
                    const savedIntel = await this.saveIntel(newIntel as BettingIntel);
                    if (savedIntel) {
                        const successMessage = `Research complete! Discovered new intel on "${savedIntel.market}".`;
                        this._logActivity(agent, 'research', successMessage, true); // Always notify on success
                        await notificationService.logAndSendNotification({
                            userId: agent.ownerHandle,
                            agentId: agent.id,
                            type: 'agentResearch',
                            message: `🔬 Your agent, ${agent.name}, has new intel on "${savedIntel.market}".`,
                        });
                        this.emitToMain?.({ type: 'socketEmit', event: 'newIntel', payload: { intel: savedIntel }, room: agent.ownerHandle });
                    }
                }
            }
        } catch (error) {
            console.error(`[AutonomyDirector] Error during autonomy processing for agent ${agent.name}:`, error);
        } finally {
            this.setAgentBusy(agent.id, false);
        }
    }
    
    // FIX: Add missing startResearch method.
    public async startResearch(agentId: string) {
        const agentDoc = await agentsCollection.findOne({ id: agentId });
        if (!agentDoc) {
            console.error(`[AutonomyDirector] startResearch called for non-existent agent ${agentId}`);
            return;
        }

        const agent: Agent = { ...(agentDoc as any), id: agentDoc._id.toString() };
        const ownerHandle = agent.ownerHandle;
        if (!ownerHandle) return;

        this.setAgentBusy(agent.id, true);
        try {
            this._logActivity(agent, 'research', 'Manual research task started.');

            const newIntel = await alphaService.discoverAndAnalyzeMarkets(agent);
            if (newIntel && agent.ownerHandle) {
                const savedIntel = await this.saveIntel(newIntel as BettingIntel);
                if (savedIntel) {
                    const successMessage = `Research complete! Discovered new intel on "${savedIntel.market}".`;
                    this._logActivity(agent, 'research', successMessage, true);
                    await notificationService.logAndSendNotification({
                        userId: agent.ownerHandle,
                        agentId: agent.id,
                        type: 'agentResearch',
                        message: `🔬 Your agent, ${agent.name}, has new intel on "${savedIntel.market}".`,
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

    private async proactiveEngagement(user: User, agent: Agent) {
        if (!agent.isProactive || !agent.ownerHandle) return;

        const engagementRoll = Math.random();
        let engagementType = '';
        if (engagementRoll < 0.5) {
            engagementType = 'Checking trending markets.';
            await this.checkTrendingMarkets(user, agent);
        } else if (engagementRoll < 0.8) {
            engagementType = 'Reviewing recently acquired intel.';
            await this.reviewIntel(user, agent);
        } else {
            engagementType = 'Reviewing the current betting portfolio.';
            await this.reviewPortfolio(user, agent);
        }
        this._logActivity(agent, 'engagement', `Performing proactive engagement: ${engagementType}`);
    }

    private async checkTrendingMarkets(user: User, agent: Agent) {
        const { markets } = await polymarketService.getLiveMarkets(5, 'Breaking');
        if (markets.length === 0) return;

        const interestingMarket = markets[Math.floor(Math.random() * markets.length)];
        const prompt = `As ${agent.name}, your personality is "${agent.personality}". You just noticed a trending prediction market: "${interestingMarket.title}" with Yes odds at ${Math.round(interestingMarket.odds.yes * 100)}¢. Briefly, in one or two sentences, give a proactive, interesting, or insightful comment about it to your user, ${user.name}. Be conversational and engaging.`;
        
        const message = await this.generateProactiveMessage(agent, prompt);
        if (message) {
            this._logActivity(agent, 'engagement', `Sent proactive message about trending market "${interestingMarket.title}".`);
            this.sendProactiveMessage(user.handle!, agent, message);
        }
    }

    private async reviewIntel(user: User, agent: Agent) {
        const recentIntel = await bettingIntelCollection.find({ 
            ownerAgentId: new ObjectId(agent.id) 
        }).sort({ createdAt: -1 }).limit(1).toArray();
            
        if (recentIntel.length === 0) return;
        
        const intel = recentIntel[0];
        const prompt = `As ${agent.name}, your personality is "${agent.personality}". You are reviewing some intel you recently found about the market "${intel.market}": "${intel.content}". Briefly, in one or two sentences, bring this up to your user, ${user.name}, in a natural and interesting way. What's a good follow-up question you could ask them about it?`;

        const message = await this.generateProactiveMessage(agent, prompt);
        if (message) {
            this._logActivity(agent, 'engagement', `Sent proactive message reviewing intel on "${intel.market}".`);
            this.sendProactiveMessage(user.handle!, agent, message);
        }
    }

    private async reviewPortfolio(user: User, agent: Agent) {
        const pendingBets = await betsCollection.find({ ownerHandle: user.handle, status: 'pending' }).toArray();
        if (pendingBets.length === 0) return;

        const betToReview = pendingBets[Math.floor(Math.random() * pendingBets.length)];
        const prompt = `As ${agent.name}, your personality is "${agent.personality}". You are reviewing an active bet for your user, ${user.name}: A ${betToReview.amount} USD bet on "${betToReview.outcome}" for a market with ID ${betToReview.marketId}. Briefly, in one or two sentences, give them a fresh thought or ask an insightful question about this position.`;
        
        const message = await this.generateProactiveMessage(agent, prompt);
        if (message) {
            this._logActivity(agent, 'engagement', `Sent proactive message reviewing a bet on market ID ${betToReview.marketId}.`);
            this.sendProactiveMessage(user.handle!, agent, message);
        }
    }

    private async generateProactiveMessage(agent: Agent, prompt: string): Promise<string | null> {
        const apiKey = await apiKeyProvider.getKeyForAgent(agent.id);
        if (!apiKey) {
            console.warn(`[AutonomyDirector] No API key available for proactive message from agent ${agent.name}.`);
            return null;
        }
        
        const openai = new OpenAI({ apiKey });
        const createCompletion = () => openai.chat.completions.create({
            model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
        });

        try {
            const completion = await this.retry(createCompletion);
            return completion.choices[0].message.content?.trim() ?? null;
        } catch (error) {
            console.error(`[AutonomyDirector] Failed to generate proactive message for ${agent.name} after retries:`, error);
            if (error instanceof OpenAI.APIError && error.status === 429) {
                apiKeyProvider.reportRateLimit(apiKey, 60);
            }
            return null;
        }
    }

    private sendProactiveMessage(userHandle: string, agent: Agent, text: string) {
        this.emitToMain?.({
            type: 'socketEmit',
            event: 'proactiveMessage',
            payload: {
                agentId: agent.id,
                agentName: agent.name,
                text,
            },
            room: userHandle
        });
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
            await bettingIntelCollection.insertOne(document as any);
            return document.toShared();
        } catch (error) {
            console.error('Error saving intel:', error);
            return null;
        }
    }
}
