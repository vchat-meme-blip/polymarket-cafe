import axios from 'axios';
import type { TrackedToken, DevWalletActivity, RugRiskProfile } from '../types/shared.js';
import { TokenStatus } from '../types/shared.js';
import { TrenchRunnerDetector } from './trench-runner.detector.js';

const DEFAULT_ENDPOINT = 'https://graphql.bitquery.io';
const TRIAL_ENDPOINT = 'https://streaming.bitquery.io/graphql';

function getEndpoint(): string {
  // Allow .env override or a boolean switch
  const envEndpoint = (process.env.BITQUERY_API_ENDPOINT || '').trim();
  const useTrial = (process.env.BITQUERY_USE_TRIAL || '').toLowerCase() === 'true';
  if (envEndpoint) return envEndpoint;
  if (useTrial) return TRIAL_ENDPOINT;
  return DEFAULT_ENDPOINT;
}
// Helper to read the API key at runtime (avoids module init ordering issues)
function getBitqueryApiKey(): string {
  const key =
    process.env.BITQUERY_API_KEY ||
    process.env.VITE_BITQUERY_API_KEY ||
    process.env.NEXT_PUBLIC_BITQUERY_API_KEY ||
    '';
  return (key || '').trim();
}

const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL_MS = 30 * 1000; // 30 second cache

class BitQueryService {
    private api = axios.create({
        baseURL: getEndpoint(),
        headers: {
            'Content-Type': 'application/json',
            // BitQuery accepts X-API-KEY; some setups use Authorization: Bearer
            'X-API-KEY': getBitqueryApiKey(),
            'Authorization': `Bearer ${getBitqueryApiKey()}`,
        }
    });

    // The Trench Runner Detector is now a modular part of this service
    private trenchRunnerDetector: TrenchRunnerDetector;

    constructor() {
        // Pass the executeQuery method to the detector so it can run its own queries
        this.trenchRunnerDetector = new TrenchRunnerDetector(this.executeQuery.bind(this));

        // Always set fresh API key headers per request (in case env changes or token rotates)
        this.api.interceptors.request.use((config) => {
            const key = getBitqueryApiKey();
            const endpoint = getEndpoint();
            config.baseURL = endpoint;
            config.headers = config.headers || {};
            if (key) {
                (config.headers as any)['X-API-KEY'] = key;
                (config.headers as any)['Authorization'] = `Bearer ${key}`;
            } else {
                // Ensure we don't send empty auth headers when testing trial
                delete (config.headers as any)['X-API-KEY'];
                delete (config.headers as any)['Authorization'];
            }
            return config;
        });
    }

    private async executeQuery(query: string, variables: any = {}): Promise<any> {
        const cacheKey = `${query.substring(0, 100)}:${JSON.stringify(variables)}`;
        const cached = cache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
            console.log(`[BitQueryService] Returning cached data for key: ${cacheKey}`);
            return cached.data;
        }

        const key = getBitqueryApiKey();
        if (!key) {
            throw new Error('BitQuery API key is not configured. Set BITQUERY_API_KEY (or VITE_BITQUERY_API_KEY) in .env.local at project root and restart the server.');
        }
        try {
            let endpoint = getEndpoint();
            const response = await this.api.post('', { query, variables }, { baseURL: endpoint });
            const result = response.data;
            if (result.errors) {
                console.error("BitQuery Error Response:", result.errors);
                throw new Error('BitQuery GraphQL returned errors.');
            }
            cache.set(cacheKey, { data: result.data, timestamp: Date.now() });
            return result.data;
        } catch (error) {
            console.error(`[BitQueryService] GraphQL query failed for key ${cacheKey}:`, error);
            if (axios.isAxiosError(error)) {
                console.error("BitQuery Error Response:", error.response?.data);
                if (error.response?.status === 401) {
                    const masked = getBitqueryApiKey().slice(0, 6) + '…';
                    console.error(`[BitQueryService] 401 Unauthorized. Check that your key is valid, not expired, and matches your BitQuery plan. Using key (masked): ${masked}`);
                }
                // Auto-fallback to trial endpoint once for 401/402 if not already using it
                const usingTrial = (getEndpoint() === TRIAL_ENDPOINT);
                if ((error.response?.status === 401 || error.response?.status === 402) && !usingTrial) {
                    console.warn('[BitQueryService] Falling back to trial endpoint due to auth/billing error...');
                    try {
                        const trialResp = await this.api.post('', { query, variables }, { baseURL: TRIAL_ENDPOINT, headers: {} });
                        const result = trialResp.data;
                        if (result.errors) {
                            console.error('BitQuery Trial Error Response:', result.errors);
                            throw new Error('BitQuery Trial GraphQL returned errors.');
                        }
                        cache.set(cacheKey, { data: result.data, timestamp: Date.now() });
                        return result.data;
                    } catch (trialErr) {
                        console.error('[BitQueryService] Trial endpoint also failed:', (trialErr as any).response?.status, (trialErr as any).response?.data);
                    }
                }
            }
            throw new Error('Failed to execute BitQuery GraphQL query.');
        }
    }

    private formatBitqueryToken(trade: any, category: string): TrackedToken {
         const marketCap = trade.market_cap || trade.base_marketcap || 0;
        return {
            mintAddress: trade.baseCurrency.address,
            symbol: trade.baseCurrency.symbol,
            name: trade.baseCurrency.name,
            status: marketCap > 69000 ? TokenStatus.GRADUATED : TokenStatus.PRE_GRADUATION,
            category: category,
            priceUsd: trade.price,
            marketCap: marketCap,
            volume24h: trade.volume24h,
            pairCreatedAt: trade.pair?.created_timestamp ? new Date(trade.pair.created_timestamp).getTime() : Date.now(),
            lastChecked: new Date(),
            marketCapHistory: [],
            volumeHistory: [],
        };
    }
    
    // --- TOOL-MAPPED SERVICE METHODS ---

    public async getNewTokens(limit: number = 5): Promise<TrackedToken[]> {
        const query = `
        query NewTokens($since: ISO8601DateTime!) {
          solana {
            dexTrades(
              options: {desc: "pair.created_timestamp", limit: 20}
              time: {since: $since}
              exchangeName: {is: "pump"}
            ) {
              pair { created_timestamp }
              baseCurrency { address name symbol }
              market_cap: first(of: base_sells, get: market_cap)
            }
          }
        }`;
        const variables = { since: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString() };
        const data = await this.executeQuery(query, variables);
        return (data?.solana?.dexTrades || []).slice(0, limit).map((t: any) => this.formatBitqueryToken(t, 'Recently Graduated'));
    }

    public async getBonkProspects(limit: number = 10): Promise<TrackedToken[]> {
        const query = `
        query BonkProspects($time_1h_ago: ISO8601DateTime!, $time_5min_ago: ISO8601DateTime!) {
            solana {
                dexTrades(
                    options: {desc: "block.timestamp.time", limit: 100}
                    time: {since: $time_1h_ago}
                    exchangeName: {is: "pump"}
                ) {
                    baseCurrency { address, name, symbol }
                    base_marketcap: maximum(of: base_sells, get: market_cap)
                    volume5min: buyAmount(in: USD, calculate: sum, time: {since: $time_5min_ago})
                    volume1h: buyAmount(in: USD, calculate: sum)
                    uniqueBuyers5min: uniq(of: "buy_currency_owner", time: {since: $time_5min_ago})
                    uniqueBuyers1h: uniq(of: "buy_currency_owner")
                    buyVolume: buyAmount(in: USD, calculate: sum)
                    sellVolume: sellAmount(in: USD, calculate: sum)
                }
            }
        }`;

        const variables = {
            time_1h_ago: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
            time_5min_ago: new Date(Date.now() - 5 * 60 * 1000).toISOString()
        };

        const data = await this.executeQuery(query, variables);
        const trades = data?.solana?.dexTrades || [];

        return trades
            .map((trade: any) => {
                const volumeAcceleration = trade.volume5min > 100 ? (trade.volume5min * 12) / (trade.volume1h || 1) : 0;
                const buyerGrowth = trade.uniqueBuyers1h > 0 ? (trade.uniqueBuyers5min * 12) / (trade.uniqueBuyers1h || 1) : 0;
                const buyPressure = trade.buyVolume / ((trade.buyVolume + trade.sellVolume) || 1);
                const marketCap = trade.base_marketcap || 0;
                
                const graduationProbability = (volumeAcceleration * 0.2) + (buyerGrowth * 0.25) + (buyPressure * 0.3) + ((marketCap / 69000) * 0.25);

                const remainingMCap = Math.max(0, 69000 - marketCap);
                const projectedVolume1h = trade.volume1h * volumeAcceleration;
                let eta = "4+ hours";
                if (marketCap >= 69000) eta = "Graduating";
                else if (projectedVolume1h > 0 && remainingMCap > 0) {
                    const hoursToGrad = remainingMCap / projectedVolume1h;
                    if (hoursToGrad < 0.5) eta = "< 30 mins";
                    else if (hoursToGrad < 1) eta = "30-60 mins";
                    else if (hoursToGrad < 2) eta = "1-2 hours";
                    else if (hoursToGrad < 4) eta = "2-4 hours";
                }

                return {
                    ...this.formatBitqueryToken(trade, 'Bonk Prospects'),
                    graduationProbability: Math.min(99, Math.round(graduationProbability * 100)),
                    estimatedTimeToGraduation: eta,
                    volumeMomentum: volumeAcceleration,
                } as TrackedToken;
            })
            .filter((p: TrackedToken) => (p.graduationProbability ?? 0) >= 60 && (p.marketCap ?? 0) > 20000 && (p.marketCap ?? 0) < 69000)
            .sort((a: TrackedToken, b: TrackedToken) => (b.graduationProbability ?? 0) - (a.graduationProbability ?? 0))
            .slice(0, limit);
    }

    public async detectVolumeSpikes(limit: number = 5): Promise<TrackedToken[]> {
        const query = `
        query BonkVolumeSpikes($time_1h_ago: ISO8601DateTime!, $time_15min_ago: ISO8601DateTime!) {
            solana {
                dexTrades(
                    options: { desc: "spikeMultiplier", limit: 50 }
                    time: {since: $time_1h_ago}
                    exchangeName: {is: "pump"}
                ) {
                    baseCurrency { address name symbol }
                    volume15min: tradeAmount(in: USD, calculate: sum, time: {since: $time_15min_ago})
                    volume1h: tradeAmount(in: USD, calculate: sum)
                    spikeMultiplier: expression(value: "(volume15min * 4) / volume1h")
                    base_marketcap: maximum(of: base_sells, get: market_cap)
                }
            }
        }`;
        const variables = {
            time_1h_ago: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
            time_15min_ago: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
        };
        const data = await this.executeQuery(query, variables);
        
        return (data?.solana?.dexTrades || [])
            .filter((t: any) => t.volume1h > 1000 && t.spikeMultiplier > 3 && (t.base_marketcap || 0) < 69000)
            .map((trade: any) => {
                 const name = trade.baseCurrency.name || '';
                 const symbol = trade.baseCurrency.symbol || '';
                 const nameRelevance = name.toLowerCase().includes('bonk') ? 50 : 0;
                 const symbolRelevance = symbol.toLowerCase().includes('bonk') ? 30 : 0;
                 const bonkRelevance = Math.round(nameRelevance + symbolRelevance);

                return {
                    ...this.formatBitqueryToken(trade, 'Volume Spikes'),
                    spikeMultiplier: parseFloat(trade.spikeMultiplier.toFixed(2)),
                    bonkRelevance,
                }
            })
            .slice(0, limit);
    }
    
    public async getBondingCurveTokens(limit: number = 10): Promise<TrackedToken[]> {
        const query = `
        query BondingCurveTokens($since: ISO8601DateTime!) {
            solana {
                dexTrades(
                    options: {desc: "trades", limit: 50}
                    time: {since: $since}
                    exchangeName: {is: "pump"}
                ) {
                    trades: count
                    baseCurrency { address, name, symbol }
                    base_marketcap: maximum(of: base_sells, get: market_cap)
                    volume24h: tradeAmount(in: USD, calculate: sum)
                }
            }
        }`;
        const variables = { since: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString() };
        const data = await this.executeQuery(query, variables);
        const tokens = (data?.solana?.dexTrades || [])
            .filter((t: any) => (t.base_marketcap || 0) < 69000)
            .slice(0, limit);
        return tokens.map((t: any) => this.formatBitqueryToken(t, 'Bonding Curve'));
    }
    
    public async getTopGraduatedTokens(limit: number = 5): Promise<TrackedToken[]> {
        const query = `
        query TopGraduated($since: ISO8601DateTime!) {
          solana {
            dexTrades(
              options: {desc: "volume24h", limit: 20}
              exchangeName: {in: ["Raydium", "Orca"]}
              pair_created_at: {since: $since}
            ) {
              volume24h: tradeAmount(in: USD, calculate: sum)
              pair { created_timestamp }
              baseCurrency { address, name, symbol }
              market_cap: first(of: base_sells, get: market_cap)
            }
          }
        }`;
        const variables = { since: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() };
        const data = await this.executeQuery(query, variables);
        return (data?.solana?.dexTrades || []).slice(0, limit).map((t: any) => this.formatBitqueryToken(t, 'Recently Graduated'));
    }

    public async getTrendingTokens(limit: number = 10): Promise<TrackedToken[]> {
        const query = `
        query Trending($since: ISO8601DateTime!) {
          solana {
            dexTrades(
              options: {desc: "volume24h", limit: 20}
              time: {since: $since}
              exchangeName: {in: ["Raydium", "Orca", "Meteora"]}
            ) {
              volume24h: tradeAmount(in: USD, calculate: sum)
              pair { created_timestamp }
              baseCurrency { address, name, symbol }
              market_cap: first(of: base_sells, get: market_cap)
              price: price(calculate: weighted)
            }
          }
        }`;
        const variables = { since: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() };
        const data = await this.executeQuery(query, variables);
        return (data?.solana?.dexTrades || []).slice(0, limit).map((t: any) => this.formatBitqueryToken(t, 'Trending'));
    }

    public async getBonkHeroes(limit: number = 5): Promise<TrackedToken[]> {
        const query = `
        query Heroes($before: ISO8601DateTime!) {
          solana {
            dexTrades(
              options: {desc: "volume24h", limit: 50}
              exchangeName: {in: ["Raydium", "Orca", "Meteora"]}
              pair_created_at: {before: $before}
            ) {
              market_cap: first(of: base_sells, get: market_cap)
              volume24h: tradeAmount(in: USD, calculate: sum)
              pair { created_timestamp }
              baseCurrency { address, name, symbol }
              price: price(calculate: weighted)
            }
          }
        }`;
        // Find tokens older than 3 days to ensure they are established
        const variables = { before: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString() };
        const data = await this.executeQuery(query, variables);
        
        // Filter for tokens that have achieved a significant milestone
        const tokens = (data?.solana?.dexTrades || [])
            .filter((t: any) => 
                (t.volume24h || 0) > 1000000 && // Milestone: >$1M in 24h volume
                (t.market_cap || 0) > 500000    // Ensure it's not a micro-cap with a fluke spike
            )
            .slice(0, limit);

        return tokens.map((t: any) => this.formatBitqueryToken(t, 'Bonk Heroes'));
    }

    public async analyzeTokenSecurity(tokenAddress: string): Promise<RugRiskProfile> {
        const query = `
        query TokenSecurityAnalysis($tokenAddress: String!) {
          solana {
            tokenHolders: balanceUpdates(
              options: {desc: "value", limit: 10}
              currency: {is: $tokenAddress}
            ) {
              value
            }
            tokenSupply: transfers(
              currency: {is: $tokenAddress}
              options: {limit: 1, desc: "block.timestamp.time"}
            ) {
              currency { totalSupply }
            }
            liquidity: dexTrades(
              options: {limit: 1, desc: "block.timestamp.time"}
              baseCurrency: {is: $tokenAddress}
              exchangeName: {in: ["Raydium", "Orca", "Meteora"]}
            ) {
              market_cap: first(of: base_sells, get: market_cap)
              liquidity: first(of: base_sells, get: liquidity)
            }
          }
        }`;
        const data = await this.executeQuery(query, { tokenAddress });
        const solanaData = data.solana;
        const top10Holders = solanaData.tokenHolders || [];
        const totalSupply = solanaData.tokenSupply[0]?.currency?.totalSupply;
        const liquidityInfo = solanaData.liquidity[0];

        if (!totalSupply || !liquidityInfo || !liquidityInfo.market_cap || !liquidityInfo.liquidity) {
            throw new Error("Could not retrieve full security data for analysis.");
        }

        const top10Holdings = top10Holders.reduce((sum: number, holder: any) => sum + parseFloat(holder.value), 0);
        const holderConcentration = (top10Holdings / parseFloat(totalSupply)) * 100;
        const liquidityRatio = (parseFloat(liquidityInfo.liquidity) / parseFloat(liquidityInfo.market_cap)) * 100;

        return {
            holderConcentration: parseFloat(holderConcentration.toFixed(2)),
            liquidityRatio: parseFloat(liquidityRatio.toFixed(2)),
        };
    }

    public async findTokenCreator(tokenAddress: string): Promise<string | null> {
        const query = `
        query FindTokenCreator($tokenAddress: String!) {
          solana {
            instructions(
              options: {desc: "block.timestamp.time", limit: 1}
              transaction: {success: true}
              any: [{mint: {is: $tokenAddress}}, {account: {is: $tokenAddress}}]
              programId: {is: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"}
              instructionType: {is: "initializeMint"}
            ) {
              transaction { signers }
            }
          }
        }`;
        const data = await this.executeQuery(query, { tokenAddress });
        return data.solana.instructions[0]?.transaction.signers[0] || null;
    }
    
    public async trackDevWalletActivity(devWallet: string, tokenAddress: string): Promise<DevWalletActivity[]> {
        const query = `
        query DevTokenTransfers($devWallet: String!, $tokenAddress: String!, $since: ISO8601DateTime!) {
          solana {
            transfers(
              options: {desc: "block.timestamp.time", limit: 20}
              time: {since: $since}
              sender: {is: $devWallet}
              currency: {is: $tokenAddress}
              amount: {gt: 0}
            ) {
              block { timestamp { time } }
              receiver { address }
              amount
            }
          }
        }`;
        const variables = { devWallet, tokenAddress, since: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() };
        const data = await this.executeQuery(query, variables);
        const transfers = data.solana.transfers || [];
        
        const activities: DevWalletActivity[] = [];
        for (const tx of transfers) {
            const recipientSells = await this.getRecipientSells(tx.receiver.address, tokenAddress, tx.block.timestamp.time);
            if (recipientSells.length > 0) {
                const totalSold = recipientSells.reduce((sum: number, sell: any) => sum + sell.tradeAmount, 0);
                activities.push({
                    type: 'SUSPICIOUS_SELL',
                    timestamp: recipientSells[0].block.timestamp.time,
                    description: `Sent ${tx.amount.toFixed(2)} tokens to ${tx.receiver.address.slice(0, 6)}..., which sold ${totalSold.toFixed(2)} tokens shortly after.`,
                    risk: 'High',
                    details: { from: devWallet, to: tx.receiver.address, amount: tx.amount, sells: recipientSells }
                });
            } else {
                 activities.push({
                    type: 'TOKEN_TRANSFER',
                    timestamp: tx.block.timestamp.time,
                    description: `Transferred ${tx.amount.toFixed(2)} tokens to ${tx.receiver.address.slice(0, 6)}...`,
                    risk: 'Medium',
                    details: { from: devWallet, to: tx.receiver.address, amount: tx.amount }
                });
            }
        }
        return activities;
    }
    
    private async getRecipientSells(walletAddress: string, tokenAddress: string, afterTime: string): Promise<any[]> {
         const beforeTime = new Date(new Date(afterTime).getTime() + 1 * 60 * 60 * 1000).toISOString(); // 1 hour window
         const query = `
         query RecipientSells($wallet: String!, $token: String!, $afterTime: ISO8601DateTime!, $beforeTime: ISO8601DateTime!) {
            solana {
                dexTrades(
                    options: {limit: 10, desc: "block.timestamp.time"}
                    time: {between: [$afterTime, $beforeTime]}
                    seller: {is: $wallet}
                    baseCurrency: {is: $token}
                ) {
                    block { timestamp { time } }
                    tradeAmount(in: USD)
                }
            }
        }`;
        const variables = { wallet: walletAddress, token: tokenAddress, afterTime, beforeTime };
        const data = await this.executeQuery(query, variables);
        return data.solana.dexTrades || [];
    }

    // --- MODULAR TRENCH RUNNER DETECTION ---
    public async detectTrenchRunners(limit: number = 5): Promise<TrackedToken[]> {
        // This method now delegates to the specialized detector module
        const runners = await this.trenchRunnerDetector.detectTrenchRunners();
        return runners.slice(0, limit);
    }
}

export const bitqueryService = new BitQueryService();
