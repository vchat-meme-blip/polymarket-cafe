/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { agentsCollection, betsCollection, bettingIntelCollection } from '../db.js';

export type PnlLeaderboardEntry = {
    agentId: string;
    agentName: string;
    agentModelUrl: string;
    totalPnl: number;
    totalBets: number;
    winRate: number; // As a decimal
};

export type IntelLeaderboardEntry = {
    agentId: string;
    agentName: string;
    agentModelUrl: string;
    totalIntelPnl: number;
    intelPiecesSold: number;
};

class LeaderboardService {
  async getPnlLeaderboard(): Promise<PnlLeaderboardEntry[]> {
    const agents = await agentsCollection.find({}).sort({ currentPnl: -1 }).limit(50).toArray();
    
    const leaderboard: PnlLeaderboardEntry[] = await Promise.all(agents.map(async (agent) => {
        const totalBets = await betsCollection.countDocuments({ agentId: agent._id });
        const winningBets = await betsCollection.countDocuments({ agentId: agent._id, pnl: { $gt: 0 } });

        return {
            agentId: agent.id,
            agentName: agent.name,
            agentModelUrl: agent.modelUrl,
            totalPnl: agent.currentPnl || 0,
            totalBets: totalBets,
            winRate: totalBets > 0 ? winningBets / totalBets : 0,
        };
    }));

    return leaderboard;
  }

  async getIntelLeaderboard(): Promise<IntelLeaderboardEntry[]> {
    const intelPnlAggregation = await agentsCollection.aggregate([
        {
            $project: {
                id: 1,
                name: 1,
                modelUrl: 1,
                intelPnl: 1,
            }
        },
        { $sort: { intelPnl: -1 } },
        { $limit: 50 },
        {
            $lookup: {
                from: 'tradehistory',
                localField: 'id',
                foreignField: 'fromId',
                as: 'sales'
            }
        },
        {
            $project: {
                agentId: '$id',
                agentName: '$name',
                agentModelUrl: '$modelUrl',
                totalIntelPnl: '$intelPnl',
                intelPiecesSold: { $size: '$sales' }
            }
        }
    ]).toArray();

    return intelPnlAggregation as IntelLeaderboardEntry[];
  }
}

export const leaderboardService = new LeaderboardService();