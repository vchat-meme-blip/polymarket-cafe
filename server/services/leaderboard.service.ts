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
    
    // First, get all bets for all agents to avoid N+1 queries
    const agentIds = agents.map(a => a._id);
    const allBets = await betsCollection.find({
        agentId: { $in: agentIds }
    }).toArray();
    
    // Group bets by agentId for quick lookup
    const betsByAgent = allBets.reduce((acc, bet) => {
        const agentIdStr = bet.agentId.toString();
        if (!acc[agentIdStr]) {
            acc[agentIdStr] = [];
        }
        acc[agentIdStr].push(bet);
        return acc;
    }, {} as Record<string, any[]>);
    
    const leaderboard: PnlLeaderboardEntry[] = agents.map(agent => {
        const agentBets = betsByAgent[agent._id.toString()] || [];
        const totalBets = agentBets.length;
        const winningBets = agentBets.filter(b => b.pnl && b.pnl > 0).length;

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
