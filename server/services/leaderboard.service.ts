/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { agentsCollection, betsCollection, bettingIntelCollection } from '../db.js';
import { Agent } from '../../lib/types/index.js';

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
    const agents = await agentsCollection.find().toArray();
    
    const leaderboard: PnlLeaderboardEntry[] = agents.map(agent => {
        const totalBets = agent.bettingHistory?.length || 0;
        const winningBets = agent.bettingHistory?.filter(b => b.pnl && b.pnl > 0).length || 0;

        return {
            agentId: agent.id,
            agentName: agent.name,
            agentModelUrl: agent.modelUrl,
            totalPnl: agent.currentPnl || 0,
            totalBets: totalBets,
            winRate: totalBets > 0 ? winningBets / totalBets : 0,
        };
    });

    return leaderboard.sort((a, b) => b.totalPnl - a.totalPnl);
  }

  async getIntelLeaderboard(): Promise<IntelLeaderboardEntry[]> {
    const intelPnlAggregation = await bettingIntelCollection.aggregate([
        // Group by the agent who owns the intel
        {
            $group: {
                _id: "$ownerAgentId",
                totalIntelPnl: { $sum: "$pnlGenerated.amount" },
                intelPiecesSold: { $sum: 1 } // or another field to count sales
            }
        },
        // Join with the agents collection to get agent details
        {
            $lookup: {
                from: "agents",
                localField: "_id",
                foreignField: "id",
                as: "agentDetails"
            }
        },
        // Unwind the agentDetails array
        {
            $unwind: "$agentDetails"
        },
        // Project the final shape
        {
            $project: {
                _id: 0,
                agentId: "$_id",
                agentName: "$agentDetails.name",
                agentModelUrl: "$agentDetails.modelUrl",
                totalIntelPnl: 1,
                intelPiecesSold: 1
            }
        },
        // Sort by the generated PNL
        {
            $sort: {
                totalIntelPnl: -1
            }
        }
    ]).toArray();

    return intelPnlAggregation as IntelLeaderboardEntry[];
  }
}

export const leaderboardService = new LeaderboardService();
