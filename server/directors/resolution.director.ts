import { betsCollection, agentsCollection, bettingIntelCollection } from '../db.js';
import { polymarketService } from '../services/polymarket.service.js';
import { Bet, MarketIntel } from '../../lib/types/index.js';

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

        // FIX: Destructure 'markets' from the response object.
        const { markets: resolvedMarkets } = await polymarketService.getLiveMarkets(100); // Fetch recently closed markets
        const resolvedMarketMap = new Map(resolvedMarkets.map(m => [m.id, m]));

        const bulkBetUpdates = [];
        const bulkAgentPnlUpdates = new Map<string, number>();
        const bulkIntelPnlUpdates = new Map<string, number>();

        for (const bet of pendingBets) {
            const market = resolvedMarketMap.get(bet.marketId);
            // FIX: Correctly typed `market` allows accessing `active` and `closed` properties without error.
            if (!market || (market.active && !market.closed)) {
                continue; // Market not resolved yet
            }

            // Determine winning outcome. Polymarket uses 1 for 'Yes' and 0 for 'No' on resolution.
            // FIX: Correctly typed `market` allows accessing `odds` property without error.
            const winningOutcome = market.odds.yes === 1 ? 'yes' : 'no';
            const betWon = bet.outcome === winningOutcome;
            
            // Calculate PNL
            // If won, profit is (1 - price) * amount. If lost, loss is -price * amount.
            // Price is stored as 0-100 cents, so divide by 100.
            const pnl = betWon 
                ? (1 - bet.price) * bet.amount
                : -bet.price * bet.amount;

            // Prepare bet update
            bulkBetUpdates.push({
                updateOne: {
                    filter: { _id: bet._id },
                    update: { $set: { status: 'resolved', pnl: pnl } }
                }
            });

            // Convert ObjectId to string for Map keys
            const agentIdStr = bet.agentId.toString();
            const sourceIntelIdStr = bet.sourceIntelId?.toString();

            // Aggregate PNL updates for agents
            const currentAgentPnl = bulkAgentPnlUpdates.get(agentIdStr) || 0;
            bulkAgentPnlUpdates.set(agentIdStr, currentAgentPnl + pnl);

            // Aggregate PNL updates for intel attribution
            if (sourceIntelIdStr && pnl > 0) {
                const currentIntelPnl = bulkIntelPnlUpdates.get(sourceIntelIdStr) || 0;
                bulkIntelPnlUpdates.set(sourceIntelIdStr, currentIntelPnl + pnl);
            }
        }

        // Execute bulk updates if there are any
        if (bulkBetUpdates.length > 0) {
            await betsCollection.bulkWrite(bulkBetUpdates as any);
            console.log(`[ResolutionDirector] Resolved ${bulkBetUpdates.length} bets.`);
        }

        for (const [agentId, pnlChange] of bulkAgentPnlUpdates.entries()) {
            await agentsCollection.updateOne({ id: agentId }, { $inc: { currentPnl: pnlChange } });
        }

        for (const [intelId, pnlChange] of bulkIntelPnlUpdates.entries()) {
            await bettingIntelCollection.updateOne({ id: intelId }, { $inc: { 'pnlGenerated.amount': pnlChange } });
        }

    } catch (error) {
        console.error('[ResolutionDirector] Error during resolution tick:', error);
    } finally {
        this.isTicking = false;
        console.log('[ResolutionDirector] Finished bet resolution tick.');
    }
  }
}