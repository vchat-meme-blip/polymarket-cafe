/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { agentsCollection, betsCollection, tradeHistoryCollection } from '../db.js';
import { ObjectId } from 'mongodb';

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
                _id: 1,
                id: 1,
                name: 1,
                modelUrl: 1,
                intelPnl: { $ifNull: ['$intelPnl', 0] } // BUG FIX: Ensure intelPnl defaults to 0
            }
        },
        { $sort: { intelPnl: -1 } },
        { $limit: 50 },
        {
            $lookup: {
                from: 'trade_history', // Correct collection name
                localField: '_id', // Use ObjectId for lookup
                foreignField: 'fromId',
                as: 'sales'
            }
        },
        {
            $project: {
                _id: 0,
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