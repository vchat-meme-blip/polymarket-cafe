import { usersCollection, agentsCollection, betsCollection, bettingIntelCollection } from '../db.js';
import { User, Agent } from '../../lib/types/index.js';
import { polymarketService } from '../services/polymarket.service.js';
import { kalshiService } from '../services/kalshi.service.js';
import { aiService } from '../services/ai.service.js';
import { apiKeyProvider } from '../services/apiKey.provider.js';
import OpenAI from 'openai';

type EmitToMainThread = (message: { type: 'socketEmit'; event: string; payload: any; room?: string }) => void;

export class DashboardAgentDirector {
    private emitToMain?: EmitToMainThread;
    private agentStates: Map<string, { lastActionTime: number; isBusy: boolean }> = new Map();
    private readonly ACTION_COOLDOWN = 2 * 60 * 1000; // 2 minutes

    public initialize(emitCallback: EmitToMainThread) {
        this.emitToMain = emitCallback;
        console.log('[DashboardDirector] Initialized.');
    }

    public async tick() {
        try {
            const users = await usersCollection.find({ currentAgentId: { $exists: true, $ne: null as any } }).toArray();
            for (const user of users) {
                await this.processAgentAutonomy(user);
            }
        } catch (error) {
            console.error('[DashboardDirector] Error during tick:', error);
        }
    }

    private async processAgentAutonomy(user: User) {
        if (!user.currentAgentId || !user.handle) return;
        
        const agentState = this.agentStates.get(user.currentAgentId) || { lastActionTime: 0, isBusy: false };
        if (agentState.isBusy || Date.now() - agentState.lastActionTime < this.ACTION_COOLDOWN) {
            return;
        }

        const agent = await agentsCollection.findOne({ id: user.currentAgentId });
        if (!agent || !agent.isProactive) return; // Check the new isProactive flag

        agentState.isBusy = true;
        this.agentStates.set(agent.id, agentState);

        try {
            // Weighted random action selection
            const actionRoll = Math.random();
            if (actionRoll < 0.5) { // 50% chance to check markets
                await this.checkTrendingMarkets(user, agent);
            } else if (actionRoll < 0.8) { // 30% chance to review intel
                await this.reviewIntel(user, agent);
            } else { // 20% chance to review portfolio
                await this.reviewPortfolio(user, agent);
            }
        } catch (error) {
            console.error(`[DashboardDirector] Error processing autonomy for agent ${agent.name}:`, error);
        } finally {
            agentState.isBusy = false;
            agentState.lastActionTime = Date.now();
            this.agentStates.set(agent.id, agentState);
        }
    }

    private async checkTrendingMarkets(user: User, agent: Agent) {
        // FIX: Destructure 'markets' from the response object.
        const { markets } = await polymarketService.getLiveMarkets(5);
        if (markets.length === 0) return;

        const interestingMarket = markets[Math.floor(Math.random() * markets.length)];

        const prompt = `As ${agent.name}, your personality is "${agent.personality}". You just noticed a trending prediction market: "${interestingMarket.title}" with Yes odds at ${Math.round(interestingMarket.odds.yes * 100)}¢. Briefly, in one or two sentences, give a proactive, interesting, or insightful comment about it to your user, ${user.name}.`;
        
        const message = await this.generateProactiveMessage(agent, prompt, user.userApiKey);
        if (message) {
            this.sendProactiveMessage(user.handle!, agent, message);
        }
    }

    private async reviewIntel(user: User, agent: Agent) {
        const recentIntel = await bettingIntelCollection.find({ ownerAgentId: agent.id }).sort({ createdAt: -1 }).limit(1).toArray();
        if (recentIntel.length === 0) return;
        
        const intel = recentIntel[0];
        const prompt = `As ${agent.name}, your personality is "${agent.personality}". You just remembered some intel you have about the market "${intel.market}": "${intel.content}". Briefly, in one or two sentences, bring this up to your user, ${user.name}, in a natural way.`;

        const message = await this.generateProactiveMessage(agent, prompt, user.userApiKey);
        if (message) {
            this.sendProactiveMessage(user.handle!, agent, message);
        }
    }

    private async reviewPortfolio(user: User, agent: Agent) {
        const pendingBets = await betsCollection.find({ ownerHandle: user.handle, status: 'pending' }).toArray();
        if (pendingBets.length === 0) return;

        const betToReview = pendingBets[Math.floor(Math.random() * pendingBets.length)];
        const prompt = `As ${agent.name}, your personality is "${agent.personality}". You are reviewing an active bet for your user, ${user.name}: A ${betToReview.amount} USD bet on "${betToReview.outcome}" for a market with ID ${betToReview.marketId}. Briefly, in one or two sentences, give them an update or ask if they've reconsidered their position.`;
        
        const message = await this.generateProactiveMessage(agent, prompt, user.userApiKey);
        if (message) {
            this.sendProactiveMessage(user.handle!, agent, message);
        }
    }

    private async generateProactiveMessage(agent: Agent, prompt: string, userApiKey: string | null): Promise<string | null> {
        try {
            const apiKey = userApiKey || (process.env.OPENAI_API_KEYS || '').split(',')[0];
            if (!apiKey) return null;

            const openai = new OpenAI({ apiKey });
            const completion = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: prompt }],
            });

            return completion.choices[0].message.content?.trim() ?? null;
        } catch (error) {
            console.error(`[DashboardDirector] Failed to generate proactive message for ${agent.name}:`, error);
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
}