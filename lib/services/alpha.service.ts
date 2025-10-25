/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { Agent, MarketIntel, BettingIntel } from '../../lib/types/index.js';
import { aiService } from '../services/ai.service.js';
import { polymarketService } from '../services/polymarket.service.js';

class AlphaService {
  public async discoverAndAnalyzeMarkets(agent: Agent): Promise<Partial<BettingIntel> | null> {
    const { markets: trendingMarkets } = await polymarketService.getLiveMarkets(10);
    if (trendingMarkets.length === 0) {
        console.log(`[AlphaService] No trending markets found for ${agent.name} to analyze.`);
        return null;
    }

    const market = trendingMarkets[Math.floor(Math.random() * trendingMarkets.length)];
    console.log(`[AlphaService] Agent ${agent.name} is researching market: "${market.title}"`);

    // Use the new, powerful research function
    const researchFindings = await aiService.conductResearchOnMarket(agent, market);
    if (!researchFindings) {
        console.log(`[AlphaService] AI failed to conduct research for market "${market.title}".`);
        return null;
    }

    const newIntel: Partial<BettingIntel> = {
      ownerAgentId: agent.id,
      market: market.title,
      isTradable: Math.random() > 0.5, // 50% chance to make intel tradable
      createdAt: Date.now(),
      pnlGenerated: { amount: 0, currency: 'USD' },
      ownerHandle: agent.ownerHandle,
      ...researchFindings, // Spread the content, sourceUrls, rawData, etc.
    };
    
    return newIntel;
  }
}

export const alphaService = new AlphaService();