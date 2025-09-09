
import axios from 'axios';
import type { TrackedToken } from '../types/shared.js';
import { TokenStatus } from '../types/shared.js';

// Interface based on DexScreener's API response for a pair
interface DexScreenerPair {
    url: string;
    pairAddress: string;
    chainId: string;
    baseToken: {
        address: string;
        name: string;
        symbol: string;
    };
    priceUsd?: string;
    priceChange?: {
        h24: number;
    };
    liquidity?: {
        usd?: number;
    };
    volume?: {
        h24: number;
    };
    marketCap?: number;
    pairCreatedAt?: number;
    info?: {
        imageUrl?: string;
        websites?: { url: string }[];
        socials?: { type: string; url: string }[];
    };
}

class DexScreenerService {
    private api = axios.create({
        baseURL: 'https://api.dexscreener.com/latest/dex',
    });

    // This formatter is based on the user's request and adapted for the direct API response
    private formatPairToTrackedToken(pair: DexScreenerPair): TrackedToken {
        const socials: TrackedToken['socials'] = {};
        if (pair.info?.socials) {
            for (const social of pair.info.socials) {
                if (social.type === 'twitter' || social.type === 'telegram') {
                    socials[social.type] = social.url;
                }
            }
        }
        if (pair.info?.websites && pair.info.websites.length > 0) {
            socials.website = pair.info.websites[0].url;
        }

        return {
            mintAddress: pair.baseToken.address,
            symbol: pair.baseToken.symbol,
            name: pair.baseToken.name,
            imageUrl: pair.info?.imageUrl,
            status: TokenStatus.GRADUATED, // Assume graduated if on a main DEX
            priceUsd: pair.priceUsd ? parseFloat(pair.priceUsd) : undefined,
            priceChange24h: pair.priceChange?.h24,
            marketCap: pair.marketCap,
            fdv: pair.marketCap, // Using marketCap as a proxy for FDV if not directly available
            volume24h: pair.volume?.h24,
            liquidityUsd: pair.liquidity?.usd,
            pairCreatedAt: pair.pairCreatedAt,
            socials: socials,
            marketCapHistory: [], // These would require historical data calls
            volumeHistory: [],
            lastChecked: new Date(),
        };
    }
    
    public async getTokenDetailsBySymbolOrAddress(query: string): Promise<TrackedToken> {
        try {
            console.log(`[DexScreenerService] Searching for query: ${query}`);
            const response = await this.api.get<{ pairs: DexScreenerPair[] | null }>(`/search`, { params: { q: query } });
            
            const pairs = response.data.pairs;
            if (!pairs || pairs.length === 0) {
                throw new Error(`No pairs found on DexScreener for query "${query}"`);
            }

            // Filter for Solana pairs and find the one with the most liquidity
            const solanaPairs = pairs.filter(p => p.chainId === 'solana');
             if (solanaPairs.length === 0) {
                throw new Error(`No Solana pairs found on DexScreener for query "${query}"`);
            }

            solanaPairs.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
            const topPair = solanaPairs[0];

            console.log(`[DexScreenerService] Found top pair ${topPair.pairAddress} for query "${query}"`);
            return this.formatPairToTrackedToken(topPair);

        } catch (error) {
            console.error(`[DexScreenerService] Error fetching token details for "${query}":`, error);
            if (axios.isAxiosError(error)) {
                console.error('DexScreener API response:', error.response?.data);
            }
            throw new Error(`Failed to get token details from DexScreener for "${query}".`);
        }
    }
}

export const dexscreenerService = new DexScreenerService();
