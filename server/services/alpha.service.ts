/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { Agent, MarketIntel, BettingIntel, AgentTask } from '../../lib/types/index.js';
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

    const researchFindings = await aiService.conductResearchOnMarket(agent, market);
    if (!researchFindings) {
        console.log(`[AlphaService] AI failed to conduct research for market "${market.title}".`);
        return null;
    }

    const newIntel: Partial<BettingIntel> = {
      ownerAgentId: agent.id,
      market: market.title,
      isTradable: Math.random() > 0.5,
      createdAt: Date.now(),
      pnlGenerated: { amount: 0, currency: 'USD' },
      ownerHandle: agent.ownerHandle,
      ...researchFindings,
    };
    
    return newIntel;
  }

  public async researchTopic(agent: Agent, topic: string): Promise<{ summary: string; sources: { title: string; url: string; }[] } | null> {
    if (!firecrawlService.isConfigured()) {
      console.warn(`[AlphaService] Research skipped for ${agent.name}: Firecrawl service not configured.`);
      return { summary: "Research could not be performed because the web scraping service is not configured on the server.", sources: [] };
    }

    // Use a system key for automated research tasks, as requested.
    const apiKey = await apiKeyProvider.getKeyForAgent('system-research');
    if (!apiKey) {
      console.error(`[AlphaService] No system API key available for research task on topic: "${topic}".`);
      return { summary: "Research could not be performed because no server API keys are available at the moment.", sources: [] };
    }
    const openai = new OpenAI({ apiKey });

    try {
      const searchResults = await firecrawlService.search(topic);
      const scrapedData = searchResults.filter(r => r.markdown && r.url);

      if (scrapedData.length === 0) {
        return { summary: `I couldn't find any relevant web results for "${topic}".`, sources: [] };
      }
      
      const researchContext = scrapedData.map(result => `## Source: ${result.url}\n${result.markdown}`).join('\n\n---\n\n');

      const summaryPrompt = `You are ${agent.name}, an expert analyst. Your personality: "${agent.personality}".
Analyze the provided research material about "${topic}".
Synthesize all the information into a concise, actionable summary. Your response should be a well-structured report.

Research Material:
${researchContext.slice(0, 15000)}
      `;
      
      const summaryCompletion = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [{ role: 'user', content: summaryPrompt }],
      });
      
      const summary = summaryCompletion.choices[0].message.content?.trim();
      if (!summary) {
        return { summary: 'The AI failed to generate a summary from the research material.', sources: scrapedData.map(r => ({ title: r.title, url: r.url })) };
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
      // Return a user-facing error summary
      return { summary: `An error occurred during the research process: ${error instanceof Error ? error.message : 'Unknown error'}.`, sources: [] };
    }
  }
}

export const alphaService = new AlphaService();
