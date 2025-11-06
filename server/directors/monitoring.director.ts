
import { agentsCollection } from '../db.js';
import { Agent, AgentTask, ActivityLogEntry } from '../../lib/types/index.js';
import { polymarketService } from '../services/polymarket.service.js';
import { notificationService } from '../services/notification.service.js';
import { ObjectId } from 'mongodb';

type EmitToMainThread = (message: { type: string; event?: string; payload?: any; room?: string; worker?: string; message?: any; }) => void;

export class MonitoringDirector {
    private emitToMain?: EmitToMainThread;
    private isTicking = false;

    public initialize(emitCallback: EmitToMainThread) {
        this.emitToMain = emitCallback;
        console.log('[MonitoringDirector] Initialized.');
    }

    public async tick() {
        if (this.isTicking) {
            return;
        }
        this.isTicking = true;
        console.log('[MonitoringDirector] Tick processing...');

        try {
            // Find all agents that have at least one active continuous monitoring task
            const agentsWithMonitoringTasks = await agentsCollection.find({
                "tasks.type": "continuous_monitoring",
                "tasks.status": "in_progress"
            }).toArray();

            for (const agentDoc of agentsWithMonitoringTasks) {
                const agent = { ...agentDoc, id: agentDoc._id.toString() } as unknown as Agent;
                const tasks = (agent as any).tasks || [];
                const monitoringTasks = tasks.filter(
                    (t: AgentTask) => t.type === 'continuous_monitoring' && t.status === 'in_progress'
                );

                for (const task of monitoringTasks) {
                    await this.executeTask(agent, task);
                }
            }
        } catch (error) {
            console.error('[MonitoringDirector] Error during tick:', error);
        } finally {
            this.isTicking = false;
        }
    }

    private async executeTask(agent: Agent, task: AgentTask) {
        try {
            const { monitoringTarget } = task.parameters;
            
            if (monitoringTarget === 'market_odds' || monitoringTarget === 'liquidity') {
                await this.monitorMarket(agent, task);
            } else if (monitoringTarget === 'whale_wallet') {
                await this.monitorWhaleWallet(agent, task);
            }
        } catch (error) {
            console.error(`[MonitoringDirector] Failed to execute task ${task.id} for agent ${agent.id}:`, error);
            await this.updateTaskWithError(task.id, `Failed to execute task: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    
    private async monitorMarket(agent: Agent, task: AgentTask) {
        const marketSlug = task.parameters.targetIdentifier;
        if (!marketSlug) return;

        const { markets } = await polymarketService.searchMarkets(marketSlug, undefined, 1, 1);
        const market = markets[0];
        if (!market || (market as any).slug !== marketSlug) {
            await this.updateTaskWithError(task.id, `Market with slug "${marketSlug}" not found.`);
            return;
        }
        
        const newSnapshot = {
            timestamp: Date.now(),
            yesPrice: market.odds.yes,
            noPrice: market.odds.no,
            liquidity: market.liquidity,
            volume: market.volume,
        };

        await this.updateTaskWithNewSnapshot(task, newSnapshot, `Snapshot captured for market ${marketSlug}.`);
    }

    private async monitorWhaleWallet(agent: Agent, task: AgentTask) {
        const walletAddress = task.parameters.targetIdentifier;
        if (!walletAddress) return;
        
        const currentPositions = await polymarketService.getWalletPositions(walletAddress);
        const lastSnapshot = task.dataSnapshots?.[task.dataSnapshots.length - 1];
        const lastPositions = lastSnapshot?.positions || [];
        
        const newTrades = this.diffPositions(lastPositions, currentPositions);

        if (newTrades.length > 0) {
            const newSnapshot = {
                timestamp: Date.now(),
                positions: currentPositions
            };
            const updateMessage = `Detected ${newTrades.length} new/changed position(s) for wallet ${walletAddress.slice(0, 6)}...`;
            await this.updateTaskWithNewSnapshot(task, newSnapshot, updateMessage);
            this._logActivity(agent, 'trade', updateMessage);
        }
    }
    
    private diffPositions(oldPositions: any[], newPositions: any[]): any[] {
        const oldPosMap = new Map(oldPositions.map(p => [p.conditionId, p]));
        const changes: any[] = [];
        for (const newPos of newPositions) {
            const oldPos = oldPosMap.get(newPos.conditionId);
            if (!oldPos || oldPos.size !== newPos.size) {
                changes.push({
                    market: newPos.title,
                    outcome: newPos.outcome,
                    oldSize: oldPos?.size || 0,
                    newSize: newPos.size,
                });
            }
        }
        return changes;
    }
    
    private async updateTaskWithNewSnapshot(task: AgentTask, snapshot: any, updateMessage: string) {
        const agent = await agentsCollection.findOne({ "tasks.id": task.id });
        if (!agent) return;

        const updateResult = await agentsCollection.updateOne(
            { _id: agent._id, "tasks.id": task.id },
            {
                $push: {
                    "tasks.$.dataSnapshots": { $each: [snapshot], $slice: -100 },
                    "tasks.$.updates": { $each: [{ timestamp: Date.now(), message: updateMessage }], $slice: -50 }
                },
                $set: { "tasks.$.updatedAt": Date.now() }
            } as any
        );

        if (updateResult.modifiedCount > 0 && agent.ownerHandle) {
            const updatedAgent = await agentsCollection.findOne({ _id: agent._id });
            const updatedTask = (updatedAgent as any)?.tasks.find((t: AgentTask) => t.id === task.id);
            if (updatedTask) {
                this.emitToMain?.({ type: 'socketEmit', event: 'taskUpdated', payload: updatedTask, room: agent.ownerHandle });
            }
        }
    }

    private async updateTaskWithError(taskId: string, errorMessage: string) {
        const agent = await agentsCollection.findOne({ "tasks.id": taskId });
        if (!agent) return;

        const updateResult = await agentsCollection.updateOne(
            { _id: agent._id, "tasks.id": taskId },
            {
                $set: { 
                    "tasks.$.status": 'completed', // Or a new 'error' status
                    "tasks.$.updatedAt": Date.now() 
                },
                $push: {
                    "tasks.$.updates": { $each: [{ timestamp: Date.now(), message: `Error: ${errorMessage}` }], $slice: -50 }
                }
            } as any
        );
         if (updateResult.modifiedCount > 0 && agent.ownerHandle) {
            const updatedAgent = await agentsCollection.findOne({ _id: agent._id });
            const updatedTask = (updatedAgent as any)?.tasks.find((t: AgentTask) => t.id === taskId);
            if (updatedTask) {
                this.emitToMain?.({ type: 'socketEmit', event: 'taskUpdated', payload: updatedTask, room: agent.ownerHandle });
            }
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
}
