import type { TrackedToken } from '../types/shared.js';
import { TokenStatus } from '../types/shared.js';

// Type definitions for clarity
type ExecuteQueryFunc = (query: string, variables?: any) => Promise<any>;

interface OHLCData {
    timestamp: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

interface TrenchRunnerAnalysis {
    isTrenchRunner: boolean;
    score: number;
    token: TrackedToken;
}

class OHLCAnalyzer {
    private cache = new Map<string, { data: any, timestamp: number }>();
    private executeQuery: ExecuteQueryFunc;

    constructor(executeQuery: ExecuteQueryFunc) {
        this.executeQuery = executeQuery;
    }

    private getIntervalMinutes(timeframe: '1h' | '4h' | '24h'): number {
        const map = { '1h': 60, '4h': 240, '24h': 1440 };
        return map[timeframe] || 60;
    }

    private getTimeframeMs(timeframe: '1h' | '4h' | '24h'): number {
         const map = { '1h': 3600000, '4h': 14400000, '24h': 86400000 };
        return map[timeframe] || 3600000;
    }

    private processOHLCData(rawData: any[]): OHLCData[] {
        if (!rawData) return [];
        return rawData.map(candle => ({
            timestamp: candle.Block.Time,
            open: parseFloat(candle.open) || 0,
            high: parseFloat(candle.high) || 0,
            low: parseFloat(candle.low) || 0,
            close: parseFloat(candle.close) || 0,
            volume: parseFloat(candle.volume) || 0,
        }));
    }

    async fetchOHLCData(tokenAddress: string, timeframe: '1h' | '4h' | '24h' = '1h', intervals = 48): Promise<OHLCData[]> {
        const cacheKey = `ohlc_${tokenAddress}_${timeframe}_${intervals}`;
        const cached = this.cache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < 300000) { // 5 min cache
            return cached.data;
        }

        const intervalMinutes = this.getIntervalMinutes(timeframe);
        const sinceTime = new Date(Date.now() - this.getTimeframeMs(timeframe) * intervals).toISOString();

        const query = `
        query TokenOHLC($token: String!, $since: ISO8601DateTime!, $interval: Int!) {
            solana {
                dexTrades(
                    options: {asc: "Block_Time_interval"}
                    baseCurrency: {is: $token}
                    time: {since: $since}
                    exchangeName: {in: ["Raydium", "Orca", "Meteora"]}
                ) {
                    Block_Time_interval: block {
                        timestamp {
                            time(interval: {unit: minute, count: $interval})
                        }
                    }
                    open: price(calculate: open)
                    close: price(calculate: close)
                    high: price(calculate: max)
                    low: price(calculate: min)
                    volume: tradeAmount(in: USD, calculate: sum)
                }
            }
        }`;
        
        const data = await this.executeQuery(query, { token: tokenAddress, since: sinceTime, interval: intervalMinutes });
        const ohlcData = this.processOHLCData(data?.solana?.dexTrades);
        
        this.cache.set(cacheKey, { data: ohlcData, timestamp: Date.now() });
        return ohlcData;
    }
}


export class TrenchRunnerDetector {
    private executeQuery: ExecuteQueryFunc;
    private ohlcAnalyzer: OHLCAnalyzer;
    private criteria = {
        minVolume24h: 500000,      // $500k volume
        maxPriceDumpPercent: 60,    // Max 60% dump
        minPostGradHours: 1,        // Check after 1h post-grad
        maxPostGradHours: 48,       // Only check up to 48h post-grad
    };

    constructor(executeQuery: ExecuteQueryFunc) {
        this.executeQuery = executeQuery;
        this.ohlcAnalyzer = new OHLCAnalyzer(executeQuery);
    }

    private async getRecentGraduations(limit: number = 50): Promise<TrackedToken[]> {
        const query = `
        query RecentGrads($since: ISO8601DateTime!, $till: ISO8601DateTime!) {
            solana {
                dexTrades(
                    options: {desc: "block.timestamp.time", limit: ${limit}}
                    exchangeName: {in: ["Raydium", "Orca"]}
                    pair_created_at: {since: $since, till: $till}
                ) {
                    baseCurrency { address name symbol }
                    pair { created_timestamp }
                }
            }
        }`;
        const since = new Date(Date.now() - this.criteria.maxPostGradHours * 60 * 60 * 1000).toISOString();
        const till = new Date(Date.now() - this.criteria.minPostGradHours * 60 * 60 * 1000).toISOString();
        const data = await this.executeQuery(query, { since, till });

        return (data?.solana?.dexTrades || []).map((t: any) => ({
            mintAddress: t.baseCurrency.address,
            name: t.baseCurrency.name,
            symbol: t.baseCurrency.symbol,
            pairCreatedAt: new Date(t.pair.created_timestamp).getTime(),
        } as TrackedToken));
    }

    private evaluatePriceSignal(ohlcData: OHLCData[]): { score: number, reason: string } {
        if (ohlcData.length < 2) return { score: 0, reason: "Not enough price data." };

        const hasMajorDump = ohlcData.some((candle, i) => {
            if (i === 0) return false;
            const prevHigh = ohlcData[i - 1].high;
            const dumpPercent = ((prevHigh - candle.low) / prevHigh) * 100;
            return dumpPercent >= this.criteria.maxPriceDumpPercent;
        });

        if (hasMajorDump) {
            return { score: 0, reason: `Price dumped > ${this.criteria.maxPriceDumpPercent}%.` };
        }

        const startPrice = ohlcData[0].open;
        const endPrice = ohlcData[ohlcData.length - 1].close;
        if (endPrice > startPrice) {
            return { score: 40, reason: "Stable or positive price action." };
        }

        return { score: 20, reason: "No major dumps, but price is flat or down." };
    }

    private evaluateVolumeSignal(volume24h: number): { score: number, reason: string } {
        if (volume24h >= this.criteria.minVolume24h) {
            return { score: 40, reason: `Volume > $${this.criteria.minVolume24h / 1000}k.` };
        }
        return { score: 0, reason: `Volume is below threshold.` };
    }

    private async analyzeTrenchRunnerPotential(token: TrackedToken): Promise<TrenchRunnerAnalysis> {
        const [ohlcData, tradesData] = await Promise.all([
            this.ohlcAnalyzer.fetchOHLCData(token.mintAddress, '1h'),
            this.getTradeMetrics(token.mintAddress, token.pairCreatedAt!)
        ]);

        const priceSignal = this.evaluatePriceSignal(ohlcData);
        const volumeSignal = this.evaluateVolumeSignal(tradesData.volume24h);
        
        let score = priceSignal.score + volumeSignal.score;

        // Bonus for very high volume or holder count
        if (tradesData.volume24h > 1000000) score += 10;
        if (tradesData.uniqueBuyers > 1000) score += 10;
        
        return {
            isTrenchRunner: score >= 60,
            score: Math.min(100, score),
            token: {
                ...token,
                volume24h: tradesData.volume24h,
                status: TokenStatus.GRADUATED,
                category: 'Trench Runners',
                lastChecked: new Date(),
                marketCapHistory: [],
                volumeHistory: [],
            }
        };
    }

    private async getTradeMetrics(tokenAddress: string, pairCreatedAt: number): Promise<{ volume24h: number, uniqueBuyers: number }> {
        const query = `
        query TradeMetrics($token: String!, $since: ISO8601DateTime!) {
          solana {
            dexTrades(
              time: {since: $since}
              baseCurrency: {is: $token}
              exchangeName: {in: ["Raydium", "Orca", "Meteora"]}
            ) {
              volume24h: tradeAmount(in: USD, calculate: sum)
              uniqueBuyers: uniq(of: "buy_currency_owner")
            }
          }
        }`;
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const data = await this.executeQuery(query, { token: tokenAddress, since });
        return {
            volume24h: data?.solana?.dexTrades[0]?.volume24h || 0,
            uniqueBuyers: data?.solana?.dexTrades[0]?.uniqueBuyers || 0
        };
    }

    public async detectTrenchRunners(): Promise<TrackedToken[]> {
        console.log("[TrenchRunnerDetector] Scanning for Trench Runners...");
        const recentGrads = await this.getRecentGraduations();
        console.log(`[TrenchRunnerDetector] Found ${recentGrads.length} recent graduations to analyze.`);

        const analysisPromises = recentGrads.map(token => this.analyzeTrenchRunnerPotential(token));
        const results = await Promise.allSettled(analysisPromises);
        
        const trenchRunners = results
            .filter(res => res.status === 'fulfilled' && res.value.isTrenchRunner)
            .map(res => (res as PromiseFulfilledResult<TrenchRunnerAnalysis>).value)
            .map(analysis => ({
                ...analysis.token,
                trenchScore: analysis.score,
            }))
            .sort((a, b) => (b.trenchScore || 0) - (a.trenchScore || 0));

        console.log(`[TrenchRunnerDetector] Found ${trenchRunners.length} Trench Runners.`);
        return trenchRunners;
    }
}