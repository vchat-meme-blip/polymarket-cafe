import { agentsCollection, bettingIntelCollection, usersCollection } from '../db.js';
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
            const usersWithActiveAgents = await usersCollection.find({ currentAgentId: { $exists: true, $ne: null } }).toArray();

            for (const user of usersWithActiveAgents) {
                if (user.currentAgentId) {
                    const activeAgent = await agentsCollection.findOne({ id: user.currentAgentId });
                    if (activeAgent) {
                        await this.decideAndExecuteNextAction(activeAgent as Agent);
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

        const recentIntel = await bettingIntelCollection.find({ ownerAgentId: agent.id }).sort({ createdAt: -1 }).limit(1).toArray();
        if (recentIntel.length === 0) return;

        const intel = recentIntel[0];
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
        agentsCollection.findOne({ id: agentId }).then(agent => {
            if (agent) {
                this.executeResearch(agent as Agent);
            }
        });
    }
}