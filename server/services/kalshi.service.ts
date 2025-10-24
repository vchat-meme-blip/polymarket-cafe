
import axios from 'axios';
import { MarketIntel } from '../../lib/types/index.js';

const KALSHI_API_BASE = 'https://api.elections.kalshi.com/trade-api/v2';

class KalshiService {
  async searchMarkets(query: string): Promise<MarketIntel[]> {
    try {
      // The public elections endpoint doesn't support a search query, 
      // so we fetch all open events and filter by title client-side.
      const { data } = await axios.get(`${KALSHI_API_BASE}/events`, {
        params: { 
            with_nested_markets: true,
            status: 'open',
        }
      });
      
      if (!data || !Array.isArray(data.events)) {
        console.warn('[KalshiService] Received invalid data from /events endpoint.');
        return [];
      }

      const allMarkets: MarketIntel[] = [];
      for (const event of data.events) {
          if (event.markets && Array.isArray(event.markets)) {
              for (const market of event.markets) {
                  // Filter by query if one is provided
                  if (query && !market.title.toLowerCase().includes(query.toLowerCase())) {
                      continue;
                  }

                  const mapped = this.mapMarket(market, event);
                  if (mapped) {
                      allMarkets.push(mapped);
                  }
              }
          }
      }

      return allMarkets;
    } catch (error) {
      // As requested, log the error but don't stop the process. Return an empty array.
      if (axios.isAxiosError(error)) {
        console.error(`[KalshiService] Failed to fetch markets: ${error.message}`);
      } else {
        console.error(`[KalshiService] An unexpected error occurred while fetching markets:`, error);
      }
      return [];
    }
  }

  private mapMarket(market: any, event: any): MarketIntel | null {
      if (!market.ticker || !market.title) {
          return null;
      }

      const yesPrice = market.yes_ask ? market.yes_ask / 100 : 0.5;
      const noPrice = 1 - yesPrice;

      return {
        id: `kalshi-${market.ticker}`,
        eventId: event.id?.toString(),
        title: market.title,
        platform: 'Kalshi',
        marketUrl: `https://kalshi.com/markets/${market.ticker}`,
        outcomes: [
            { name: 'Yes', price: yesPrice },
            { name: 'No', price: noPrice },
        ],
        odds: {
          yes: yesPrice,
          no: noPrice,
        },
        volume: market.volume_24h || 0,
        liquidity: market.liquidity || 0,
        endsAt: new Date(market.expiration_time).getTime(),
        imageUrl: event.image_url, // Use event image
        description: market.rules_primary,
        category: event.category,
        active: market.status === 'open',
        closed: market.status === 'closed' || market.status === 'settled',
        tags: [event.series_ticker].filter(Boolean)
      };
  }
}

export const kalshiService = new KalshiService();