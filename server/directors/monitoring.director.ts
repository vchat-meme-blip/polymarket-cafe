

import { agentsCollection } from '../db.js';
// FIX: Added 'Agent' to the import from '../../lib/types/index.js'.
import { Agent, AgentTask, ActivityLogEntry } from '../../lib/types/index.js';
import { polymarketService } from '../services/polymarket.service.js';
import { notificationService } from '../services/notification.service.js';
// FIX: Imported 'ObjectId' from 'mongodb' to resolve the type error.
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

        try {
            const monitoringTasks = await agentsCollection.aggregate([
                { $unwind: "$tasks" },
                { $match: { "tasks.type": "continuous_monitoring", "tasks.status": "in_progress" } },
                { $replaceRoot: { newRoot: "$tasks" } }
            ]).toArray() as AgentTask[];

            for (const task of monitoringTasks) {
                await this.executeTask(task);
            }
        } catch (error) {
            console.error('[MonitoringDirector] Error during tick:', error);
        } finally {
            this.isTicking = false;
        }
    }

    private async executeTask(task: AgentTask) {
        try {
            const { monitoringTarget, targetIdentifier } = task.parameters;
            
            if (monitoringTarget === 'market_odds' || monitoringTarget === 'liquidity') {
                await this.monitorMarket(task);
            } else if (monitoringTarget === 'whale_wallet') {
                await this.monitorWhaleWallet(task);
            } else if (monitoringTarget === 'breaking_markets') {
                // This is now handled reactively by the MarketWatcherDirector creating intel.
                // This director could be extended to check for that new intel.
            }
        } catch (error) {
            console.error(`[MonitoringDirector] Failed to execute task ${task.id}:`, error);
        }
    }
    
    private async monitorMarket(task: AgentTask) {
        const marketSlug = task.parameters.targetIdentifier;
        if (!marketSlug) return;

        const { markets } = await polymarketService.searchMarkets(marketSlug);
        const market = markets.find(m => (m as any).slug === marketSlug);
        if (!market) return;
        
        const newSnapshot = {
            timestamp: Date.now(),
            yesPrice: market.odds.yes,
            noPrice: market.odds.no,
            liquidity: market.liquidity,
            volume: market.volume,
        };

        await this.updateTaskWithNewSnapshot(task, newSnapshot, `Snapshot captured for market ${marketSlug}.`);
    }

    private async monitorWhaleWallet(task: AgentTask) {
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
            
            // Log activity for the agent
            const agent = await agentsCollection.findOne({ "tasks.id": task.id });
            if (agent && agent.ownerHandle) {
                this._logActivity({ ...agent, id: agent._id.toString() } as any, 'trade', updateMessage);
            }
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
        const updateResult = await agentsCollection.updateOne(
            { "tasks.id": task.id },
            {
                $push: {
                    "tasks.$.dataSnapshots": { $each: [snapshot], $slice: -100 }, // Keep last 100 snapshots
                    "tasks.$.updates": {
                        $each: [{ timestamp: Date.now(), message: updateMessage }],
                        $slice: -50 // Keep last 50 updates
                    }
                },
                $set: { "tasks.$.updatedAt": Date.now() }
            } as any
        );

        if (updateResult.modifiedCount > 0) {
            const agent = await agentsCollection.findOne({ "tasks.id": task.id });
            const updatedTask = agent?.tasks?.find((t: any) => t.id === task.id);
            if (agent && updatedTask) {
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