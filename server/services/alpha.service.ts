/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { Agent, MarketIntel, BettingIntel } from '../../lib/types/index.js';
import { aiService } from '../services/ai.service.js';
import { polymarketService } from '../services/polymarket.service.js';
import { firecrawlService } from './firecrawl.service.js';
import { apiKeyProvider } from './apiKey.provider.js';
import OpenAI from 'openai';

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

  public async researchTopic(agent: Agent, topic: string): Promise<{ summary: string; sources: { title: string; url: string; }[] } | null> {
    if (!firecrawlService.isConfigured()) {
      console.warn(`[AlphaService] Research skipped for ${agent.name}: Firecrawl service not configured.`);
      return null;
    }

    const apiKey = await apiKeyProvider.getKeyForAgent(agent.id);
    if (!apiKey) {
      console.error(`[AiService] No API key for agent ${agent.name} for research.`);
      return null;
    }
    const openai = new OpenAI({ apiKey });

    try {
      // Step 1: Search and Scrape (using the topic as the query)
      const searchResults = await firecrawlService.search(topic);
      const scrapedData = searchResults.filter(r => r.markdown && r.url);

      if (scrapedData.length === 0) {
        return { summary: `Could not find any web results for "${topic}".`, sources: [] };
      }
      
      const researchContext = scrapedData.map(result => `## Source: ${result.url}\n${result.markdown}`).join('\n\n---\n\n');

      // Step 2: Summarize Findings
      const summaryPrompt = `You are ${agent.name}, an expert analyst. Your personality: "${agent.personality}".
Analyze the provided research material about "${topic}".

Synthesize all the information into a concise, actionable summary. Your response should be a well-structured report.

Research Material:
${researchContext.slice(0, 15000)}
      `; // Truncate context to avoid token limits
      
      const summaryCompletion = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [{ role: 'user', content: summaryPrompt }],
      });
      
      const summary = summaryCompletion.choices[0].message.content?.trim();
      if (!summary) {
        return { summary: 'AI failed to generate a summary from the research material.', sources: scrapedData.map(r => ({ title: r.title, url: r.url })) };
      }

      return {
        summary,
        sources: scrapedData.map(r => ({ title: r.title, url: r.url })),
      };

    } catch (error) {
      console.error(`[AlphaService] Research process failed for topic "${topic}":`, error);
      if (error instanceof OpenAI.APIError && error.status === 429 && apiKey) {
           apiKeyProvider.reportRateLimit(apiKey, 60);
      }
      return null;
    }
  }
}

export const alphaService = new AlphaService();