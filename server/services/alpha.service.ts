import { Agent, MarketIntel, BettingIntel, AgentTask } from '../../lib/types/index.js';
import { aiService } from '../services/ai.service.js';
import { polymarketService } from '../services/polymarket.service.js';
import { firecrawlService } from './firecrawl.service.js';
import { apiKeyProvider } from './apiKey.provider.js';
import OpenAI from 'openai';
import { usersCollection } from '../db.js';

class AlphaService {
  public async discoverAndAnalyzeMarkets(agent: Agent): Promise<BettingIntel | null> {
    const { markets: trendingMarkets } = await polymarketService.getLiveMarkets(10);
    if (trendingMarkets.length === 0) {
        console.log(`[AlphaService] No trending markets found for ${agent.name} to analyze.`);
        return null;
    }

    const market = trendingMarkets[Math.floor(Math.random() * trendingMarkets.length)];
    console.log(`[AlphaService] Agent ${agent.name} is researching market: "${market.title}"`);

    // Use the researchTopic method which is designed for system-level API key usage
    const researchResult = await this.researchTopic(agent, market.title);
    if (!researchResult || !researchResult.summary) {
        console.log(`[AlphaService] Research failed for market "${market.title}".`);
        return null;
    }

    let sellerWalletAddress = '';
    if (agent.ownerHandle) {
        const owner = await usersCollection.findOne({ handle: agent.ownerHandle });
        sellerWalletAddress = owner?.receivingWalletAddress || owner?.solanaWalletAddress || '';
    }

    const isTradable = Math.random() > 0.5;

    const newIntel: BettingIntel = {
      id: '', // placeholder, will be overwritten
      ownerAgentId: agent.id,
      market: market.title,
      content: researchResult.summary,
      sourceUrls: researchResult.sources.map(s => s.url),
      sourceDescription: 'Autonomous Web Research',
      isTradable: isTradable,
      price: isTradable ? Math.floor(Math.random() * 91) + 10 : 0, // Price from 10 to 100
      sellerWalletAddress: sellerWalletAddress,
      network: 'Solana', // Default network
      createdAt: Date.now(),
      pnlGenerated: { amount: 0, currency: 'USD' },
      ownerHandle: agent.ownerHandle,
    };
    
    return newIntel;
  }

  public async researchTopic(agent: Agent, topic: string): Promise<{ summary: string; sources: { title: string; url: string; }[] } | null> {
    if (!firecrawlService.isConfigured()) {
      console.warn(`[AlphaService] Research skipped for ${agent.name}: Firecrawl service not configured.`);
      return { summary: "Research could not be performed because the web scraping service is not configured on the server.", sources: [] };
    }

    // Use a system key for automated research tasks.
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
      return { summary: `An error occurred during the research process: ${error instanceof Error ? error.message : 'Unknown error'}.`, sources: [] };
    }
  }
}

export const alphaService = new AlphaService();
