/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import axios from 'axios';
import { MarketIntel } from '../../lib/types/index.js';

const GAMMA_API = 'https://gamma-api.polymarket.com';
const DATA_API = 'https://data-api.polymarket.com';

const CATEGORY_TAG_MAP: Record<string, number> = {
    'Sports': 1,
    'Crypto': 2,
    'Politics': 3,
    'News': 5,
    'Trump': 4,
    'Tech': 9,
    'Culture': 24,
    'Business': 22,
};

/**
 * Maps a raw market and event object from the Polymarket API to our internal MarketIntel type.
 */
function mapMarket(market: any, event: any): MarketIntel | null {
    if (!market || !market.id || !market.question) {
        return null;
    }

    let parsedOutcomes: { name: string; price: number }[] = [];
    try {
        const outcomeNames = JSON.parse(market.outcomes || '[]');
        const outcomePrices = JSON.parse(market.outcomePrices || '[]');
        
        if (Array.isArray(outcomeNames) && Array.isArray(outcomePrices) && outcomeNames.length === outcomePrices.length) {
            parsedOutcomes = outcomeNames.map((name: string, index: number) => ({
                name,
                price: parseFloat(outcomePrices[index]) || 0,
            }));
        }
    } catch (e) {
        console.error(`[PolymarketService] Failed to parse outcomes for market ${market.id}:`, e);
    }
    
    // Fallback for older binary structure if parsing fails but prices are available
    if (parsedOutcomes.length === 0 && market.outcomePrices) {
        try {
            const outcomePrices = JSON.parse(market.outcomePrices);
            const yesPrice = parseFloat(outcomePrices?.[0] ?? '0.5');
            const noPrice = 1 - yesPrice;
            parsedOutcomes = [
                { name: 'Yes', price: isNaN(yesPrice) ? 0.5 : yesPrice },
                { name: 'No', price: isNaN(noPrice) ? 0.5 : noPrice },
            ];
        } catch (e) {
             // Fallback if prices are not parsable
             parsedOutcomes = [ { name: 'Yes', price: 0.5 }, { name: 'No', price: 0.5 }];
        }
    }

    const yesOutcome = parsedOutcomes.find(o => o.name === 'Yes');
    const noOutcome = parsedOutcomes.find(o => o.name === 'No');

    return {
        id: `polymarket-${market.id}`,
        eventId: event.id?.toString(),
        title: market.question,
        platform: 'Polymarket',
        marketUrl: `https://polymarket.com/event/${event.slug}/${market.slug}`,
        eventSlug: event.slug,
        marketSlug: market.slug,
        outcomes: parsedOutcomes,
        odds: {
            yes: yesOutcome ? yesOutcome.price : 0,
            no: noOutcome ? noOutcome.price : 0,
        },
        volume: parseFloat(market.volume ?? '0'),
        liquidity: parseFloat(market.liquidity ?? '0'),
        endsAt: market.endDate ? new Date(market.endDate).getTime() : Date.now() + (30 * 24 * 60 * 60 * 1000),
        imageUrl: market.image || event.image,
        description: market.description,
        category: market.category || event.category,
        active: market.active,
        closed: market.closed,
        tags: event.tags?.map((t: any) => t.label) || [],
    };
}


class PolymarketService {
  private async fetchFromApi(baseUrl: string, endpoint: string, params: Record<string, any>): Promise<any> {
    try {
      const { data } = await axios.get(`${baseUrl}/${endpoint}`, {
        params,
        timeout: 10000 // 10 second timeout
      });
      console.log(`[PolymarketService] API call to ${endpoint} with params ${JSON.stringify(params)} successful.`);
      return data;
    } catch (error) {
       if (axios.isAxiosError(error)) {
        console.error(`[PolymarketService] API call to ${endpoint} failed: ${error.message} (Status: ${error.response?.status})`, error.response?.data);
      } else if (error instanceof Error) {
        console.error(`[PolymarketService] Failed during API call to ${endpoint}:`, error.message);
      }
      return null;
    }
  }
  
  async searchMarkets(query: string, category?: string, page: number = 1, limit: number = 40): Promise<{ markets: MarketIntel[], hasMore: boolean }> {
    const useSearchEndpoint = !!query;
    const endpoint = useSearchEndpoint ? 'public-search' : 'events';
    
    const params: any = {
        closed: false,
    };

    if (useSearchEndpoint) {
        params.q = query;
        // CORRECTED PARAMETER: use `tag` instead of `events_tag`
        if (category && category !== 'All' && category !== 'Breaking') {
            params.tag = category;
        }
        // CORRECTED PARAMETER: use `limit` instead of `limit_per_type`
        params.limit = limit;
        params.page = page;
        params.sort = 'volume';
        params.ascending = false;
    } else { // Using /events endpoint for browsing
        params.limit = limit;
        params.offset = (page - 1) * limit;

        if (category && category !== 'All' && category !== 'Breaking') {
            const tagId = CATEGORY_TAG_MAP[category];
            if (tagId) {
                params.tag_id = tagId; // /events endpoint uses tag_id
            } else {
                 console.warn(`[PolymarketService] Category "${category}" not found in tag map. Fetching all markets.`);
            }
        }
        params.sort = 'creation_date';
        params.ascending = false;
    }
    
    // The 'Breaking' category is a special case that sorts by newest event ID
    if (category === 'Breaking' && !useSearchEndpoint) {
        params.sort = 'id';
        delete params.tag_id;
    }

    const data = await this.fetchFromApi(GAMMA_API, endpoint, params);

    const events = (useSearchEndpoint ? data?.events : data) || [];
    if (!Array.isArray(events)) {
        return { markets: [], hasMore: false };
    }

    const markets: MarketIntel[] = [];
    for (const event of events) {
      if (event.markets && Array.isArray(event.markets)) {
        for (const market of event.markets) {
          const mapped = mapMarket(market, event);
          if (mapped) {
            markets.push(mapped);
          }
        }
      }
    }

    const hasMore = useSearchEndpoint ? (data?.pagination?.hasMore ?? false) : (events.length === limit);
    return { markets, hasMore };
  }

  async getLiveMarkets(limit = 50, category?: string, page: number = 1): Promise<{ markets: MarketIntel[], hasMore: boolean }> {
    return this.searchMarkets('', category, page, limit);
  }

  async getLiquidityOpportunities(limit = 20): Promise<MarketIntel[]> {
    const data = await this.fetchFromApi(GAMMA_API, 'markets', {
        // CORRECTED PARAMETER TYPE: Explicitly use string 'false'
        closed: 'false',
        limit: 200, 
    });

    if (!data || !Array.isArray(data)) {
        console.warn('[PolymarketService] Invalid or empty response from /markets for liquidity opportunities.');
        return [];
    }
    
    const marketsWithRewards = data.filter((market: any) => 
        market.clobRewards && 
        Array.isArray(market.clobRewards) &&
        market.clobRewards.length > 0 &&
        market.clobRewards[0].rewardsDailyRate > 0
    );

    marketsWithRewards.sort((a: any, b: any) => {
        const rateA = a.clobRewards?.[0]?.rewardsDailyRate || 0;
        const rateB = b.clobRewards?.[0]?.rewardsDailyRate || 0;
        return rateB - rateA;
    });

    const mappedMarkets = marketsWithRewards
        .map((market: any) => mapMarket(market, market.event || {}))
        .filter((m): m is MarketIntel => m !== null);

    return mappedMarkets.slice(0, limit);
  }

  async getMarketComments(entityId: string, entityType: 'Event' | 'Market' = 'Event'): Promise<any[]> {
    const numericId = parseInt(entityId, 10);
    if (isNaN(numericId)) {
        console.warn(`[PolymarketService] Invalid entity ID for comments: ${entityId}`);
        return [];
    }

    const data = await this.fetchFromApi(GAMMA_API, 'comments', {
        // CORRECTED PARAMETERS:
        entity_id: numericId,
        entity_type: entityType,
        limit: 50,
        order: 'createdAt',
        ascending: false,
    });
    return data || [];
  }

  async getWalletPositions(walletAddress: string): Promise<any[]> {
    try {
      const { data } = await axios.get(`${DATA_API}/positions`, {
        params: { user: walletAddress },
        timeout: 10000
      });
      return data || [];
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error(`[PolymarketService] API call to data-api positions failed:`, error.message);
      } else if (error instanceof Error) {
        console.error(`[PolymarketService] Failed during API call to data-api positions:`, error.message);
      }
      return [];
    }
  }
}

export const polymarketService = new PolymarketService();
