/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import {
  Intel,
  MarketData,
  SecurityAnalysis,
  SocialSentiment,
} from '../types/index.js';
import { GoogleGenAI } from '@google/genai';
import { solscanService } from './solscan.service.js';

class AlphaService {
  public async discoverNewTokens(): Promise<{ mintAddress: string; name: string; symbol: string }[]> {
    const latestTokens = await solscanService.getLatestTokens(10);
    if (!latestTokens) return [];
    
    return latestTokens.map(token => ({
      mintAddress: token.address,
      name: token.name,
      symbol: token.symbol,
    }));
  }

  public async scoutTokenByQuery(query: string): Promise<Partial<Intel>> {
    const tokenDetails = await solscanService.fetchTokenDetails(query);
    if (!tokenDetails) {
        throw new Error(`Could not find token details for "${query}" on Solscan.`);
    }
    return this.performFullIntelAnalysis(tokenDetails);
  }

  public async performFullIntelAnalysis(solscanData: any): Promise<Partial<Intel>> {
    const marketData: MarketData = {
      mintAddress: solscanData.tokenAddress,
      name: solscanData.name,
      priceUsd: solscanData.priceUsd,
      marketCap: solscanData.marketCap,
      liquidityUsd: solscanData.liquidityUsd,
      priceChange24h: solscanData.priceChange24h,
    };

    // Solscan doesn't provide this data, so we keep it mocked for now.
    const securityAnalysis: SecurityAnalysis = {
      isHoneypot: Math.random() > 0.9,
      isContractRenounced: Math.random() > 0.5,
      holderConcentration: { top10Percent: Math.random() * 25 },
    };

    // Solscan doesn't provide this data, so we keep it mocked for now.
    const socialSentiment: SocialSentiment = {
      overallSentiment: ['Bullish', 'Bearish', 'Neutral'][Math.floor(Math.random() * 3)] as any,
      tweets: [
        { author: '@CryptoChad', text: `This $${solscanData.symbol} is about to go parabolic! 🚀`, sentiment: 'BULLISH' },
        { author: '@SmartTrader', text: `Watching the chart on $${solscanData.symbol}, looks like a good entry.`, sentiment: 'NEUTRAL' },
      ],
    };

    return {
      id: `intel-${solscanData.tokenAddress}`,
      token: solscanData.symbol,
      marketData,
      securityAnalysis,
      socialSentiment,
    };
  }

  public async synthesizeIntelWithAI(intel: Partial<Intel>, apiKey: string): Promise<string> {
    // FIX: Add a check for a valid API key before initializing the client.
    if (!apiKey) {
      console.error(`[AlphaService] Attempted to synthesize intel for ${intel.token} without an API key.`);
      return "AI analysis requires a valid API key. Please configure it in your settings.";
    }
    const ai = new GoogleGenAI({ apiKey });
    const prompt = `
      You are a crypto analyst. Synthesize the following data into a short, one-sentence "Vibe Check" for the token ${intel.token}.
      Be concise and direct. Example: "Bullish sentiment and strong volume, but watch for high holder concentration."
      
      Data:
      - Market Cap: $${intel.marketData?.marketCap?.toLocaleString()}
      - 24h Price Change: ${intel.marketData?.priceChange24h?.toFixed(2)}%
      - Liquidity: $${intel.marketData?.liquidityUsd?.toLocaleString()}
      - Honeypot Risk: ${intel.securityAnalysis?.isHoneypot ? 'Yes' : 'No'}
      - Top 10 Holders: ${intel.securityAnalysis?.holderConcentration.top10Percent.toFixed(1)}%
      - Social Sentiment: ${intel.socialSentiment?.overallSentiment}
    `;

    try {
      const response = await ai.models.generateContent({
        // FIX: Corrected model name from deprecated 'gemini-1.5-flash' to 'gemini-2.5-flash'.
        model: 'gemini-2.5-flash',
        contents: prompt,
      });
      // FIX: The `response.text` property can be undefined. Use nullish coalescing to prevent a runtime error on `.trim()`.
      return (response.text ?? '').trim();
    } catch (error) {
        console.error(`[AlphaService] Failed to synthesize intel with AI for ${intel.token}:`, error);
        return "AI analysis failed. Please check token data manually.";
    }
  }
}

export const alphaService = new AlphaService();