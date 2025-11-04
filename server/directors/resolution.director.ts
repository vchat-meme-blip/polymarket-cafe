import { betsCollection, agentsCollection, bettingIntelCollection } from '../db.js';
import { polymarketService } from '../services/polymarket.service.js';
import { ObjectId } from 'mongodb';

export class ResolutionDirector {
  private isTicking = false;

  constructor() {
    console.log('[ResolutionDirector] Initialized.');
  }

  public async tick() {
    if (this.isTicking) {
        console.log('[ResolutionDirector] Tick already in progress.');
        return;
    }
    this.isTicking = true;
    console.log('[ResolutionDirector] Starting bet resolution tick...');

    try {
        const pendingBets = await betsCollection.find({ status: 'pending' }).toArray();
        if (pendingBets.length === 0) {
            console.log('[ResolutionDirector] No pending bets to resolve.');
            this.isTicking = false;
            return;
        }

        const resolvedMarketsResponse = await polymarketService.getLiveMarkets(100);
        const resolvedMarkets = resolvedMarketsResponse.markets;
        const resolvedMarketMap = new Map(resolvedMarkets.map(m => [m.id, m]));

        const bulkBetUpdates = [];
        const bulkAgentPnlUpdates = new Map<string, number>();
        const bulkIntelPnlUpdates = new Map<string, number>();

        for (const bet of pendingBets) {
            const market = resolvedMarketMap.get(bet.marketId);
            if (!market || (market.active && !market.closed)) {
                continue; // Market not resolved yet
            }

            const winningOutcome = market.odds.yes === 1 ? 'yes' : 'no';
            const betWon = bet.outcome === winningOutcome;
            
            const pnl = betWon 
                ? (1 - bet.price) * bet.amount
                : -bet.price * bet.amount;

            bulkBetUpdates.push({
                updateOne: {
                    filter: { _id: bet._id },
                    update: { $set: { status: 'resolved', pnl } }
                }
            });

            const agentIdStr = bet.agentId.toString();
            const sourceIntelIdStr = bet.sourceIntelId?.toString();

            const currentAgentPnl = bulkAgentPnlUpdates.get(agentIdStr) || 0;
            bulkAgentPnlUpdates.set(agentIdStr, currentAgentPnl + pnl);

            if (sourceIntelIdStr && pnl > 0) {
                const currentIntelPnl = bulkIntelPnlUpdates.get(sourceIntelIdStr) || 0;
                bulkIntelPnlUpdates.set(sourceIntelIdStr, currentIntelPnl + pnl);
            }
        }

        if (bulkBetUpdates.length > 0) {
            await betsCollection.bulkWrite(bulkBetUpdates as any);
            console.log(`[ResolutionDirector] Resolved ${bulkBetUpdates.length} bets.`);
        }

        for (const [agentId, pnlChange] of bulkAgentPnlUpdates.entries()) {
            await agentsCollection.updateOne({ _id: new ObjectId(agentId) }, { $inc: { currentPnl: pnlChange } });
        }

        for (const [intelId, pnlChange] of bulkIntelPnlUpdates.entries()) {
            await bettingIntelCollection.updateOne({ _id: new ObjectId(intelId) }, { $inc: { 'pnlGenerated.amount': pnlChange } });
        }

    } catch (error) {
        console.error('[ResolutionDirector] Error during resolution tick:', error);
    } finally {
        this.isTicking = false;
        console.log('[ResolutionDirector] Finished bet resolution tick.');
    }
  }
}