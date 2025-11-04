import OpenAI from 'openai';
import mongoose from 'mongoose';
const { Types } = mongoose;

// FIX: Add User type import
import { Agent, Interaction, MarketIntel, Room, TradeRecord, BettingIntel, User } from '../../lib/types/index.js';
import { apiKeyProvider } from './apiKey.provider.js';
import { agentsCollection, bettingIntelCollection, notificationsCollection } from '../db.js';
import { polymarketService } from './polymarket.service.js';
import { kalshiService } from './kalshi.service.js';
import { firecrawlService } from './firecrawl.service.js';
// FIX: Add createSystemInstructions import
import { createSystemInstructions } from '../../lib/prompts.js';

class AiService {
  // FIX: Add missing 'getDirectMessageResponse' method
  async getDirectMessageResponse(
    agent: Agent,
    user: User,
    message: string,
    history: Interaction[],
    apiKey: string
  ): Promise<Interaction> {
    const openai = new OpenAI({ apiKey });
    const systemPrompt = createSystemInstructions(agent, user, false);

    // FIX: Explicitly type the role to satisfy OpenAI's ChatCompletionMessageParam type.
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...history.map((turn) => {
        const role: 'assistant' | 'user' = turn.agentId === agent.id ? 'assistant' : 'user';
        return {
          role,
          content: turn.text,
        };
      }),
      { role: 'user', content: message },
    ];

    try {
      const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: messages,
      });

      const responseText =
        completion.choices[0].message.content?.trim() ?? '...';

      const agentMessage: Interaction = {
        agentId: agent.id,
        agentName: agent.name,
        text: responseText,
        timestamp: Date.now(),
      };

      return agentMessage;
    } catch (error) {
      console.error(
        `[AiService] OpenAI completion failed for direct message with ${agent.name}:`,
        error
      );
      if (error instanceof OpenAI.APIError && error.status === 429) {
        apiKeyProvider.reportRateLimit(apiKey, 60);
      }
      // Return a generic error message
      return {
        agentId: agent.id,
        agentName: agent.name,
        text: "I'm having some trouble connecting right now. Let's talk later.",
        timestamp: Date.now(),
      };
    }
  }
    
  async getConversationTurn(
    currentAgent: Agent,
    otherAgent: Agent,
    history: Interaction[],
    room: Room,
    initialPrompt?: string
  ): Promise<{ text: string; endConversation: boolean; toolCalls?: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[] }> {
    const apiKey = await apiKeyProvider.getKeyForAgent(currentAgent.id);
    if (!apiKey) {
      console.error(`[AiService] No API key for agent ${currentAgent.name}, ending conversation.`);
      return { text: "I have to go.", endConversation: true };
    }
    const openai = new OpenAI({ apiKey });

    const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [{
        type: 'function',
        function: {
            name: 'end_conversation',
            description: 'End the current conversation if it has reached a natural conclusion or is going nowhere.',
            parameters: { type: 'object', properties: {} }
        }
    }];
    
    let systemPrompt = `You are ${currentAgent.name}. Your personality: "${currentAgent.personality}". Your goals: "${currentAgent.instructions}". You are talking to ${otherAgent.name}. Their personality: "${otherAgent.personality}". 
    
    IMPORTANT: Your primary goal is to have a natural, multi-turn conversation. DO NOT use the 'end_conversation' tool unless at least 3-4 exchanges have occurred or the other agent is unresponsive. Keep your responses concise and in character.`;
    
    systemPrompt += `\nYou are in a room with the vibe: '${room.vibe}'. Your personal topics of interest are: ${currentAgent.topics.join(', ')}. You are on the lookout for intel related to your wishlist: ${currentAgent.wishlist.join(', ')}. Try to steer the conversation towards these topics if it feels natural.`;

    if (room.rules && room.rules.length > 0) {
        systemPrompt += ` The room rules are: ${room.rules.join(', ')}.`;
    }

    if (room.isOwned && room.hostId) {
        const isHost = room.hostId === currentAgent.id;
        const host = isHost ? currentAgent : otherAgent;
        const guest = isHost ? otherAgent : currentAgent;
        
        if (isHost) {
            const hostTradableIntel = await bettingIntelCollection.find({ 
                ownerAgentId: new Types.ObjectId(host.id), 
                isTradable: true 
            }).toArray();
            if (hostTradableIntel.length > 0) {
                systemPrompt += ` This is your owned intel storefront. Your primary goal is to monetize your betting intel by selling it to ${guest.name}. You have the following intel to sell: ${hostTradableIntel.map(i => `(ID: ${i._id}) on ${i.market}`).join(', ')}. Use the 'create_intel_offer' tool to make a formal offer.`;
                tools.push({
                    type: 'function',
                    function: {
                        name: 'create_intel_offer',
                        description: "Create a formal, tradable offer for a piece of your intel.",
                        parameters: {
                            type: 'object',
                            properties: {
                                intel_id: { type: 'string', description: 'The ID of the intel you want to sell.' },
                                price: { type: 'number', description: 'The price you are asking for in BOX tokens.' },
                            },
                            required: ['intel_id', 'price'],
                        }
                    }
                });
            } else {
                systemPrompt += ` This is your owned intel storefront, but you currently have no tradable intel. Your goal is to engage ${guest.name} in conversation to learn what they're looking for.`;
            }
        } else { // Is Guest
            systemPrompt += ` You are in an intel storefront hosted by ${host.name}. Their purpose is to sell betting intel.`;
            if (room.activeOffer) {
                systemPrompt += ` There is an active offer on the table for intel on "${room.activeOffer.market}" for ${room.activeOffer.price} BOX. You can choose to accept it using the 'accept_offer' tool, or continue negotiating.`;
                tools.push({
                    type: 'function',
                    function: {
                        name: 'accept_offer',
                        description: 'Accept the currently active intel offer in the room.',
                        parameters: {
                            type: 'object',
                            properties: {
                                offer_id: { type: 'string', description: 'The ID of the intel being offered (e.g., the intelId from the offer).' }
                            },
                            required: ['offer_id']
                        }
                    }
                });
            }
        }
    }


    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
    ];
    
    history.forEach(turn => {
        messages.push({
            role: turn.agentId === currentAgent.id ? 'assistant' : 'user',
            name: turn.agentName.replace(/\s+/g, '_'),
            content: turn.text,
        });
    });

    if (history.length === 0 && initialPrompt) {
        messages.push({ role: 'user', name: otherAgent.name.replace(/\s+/g, '_'), content: initialPrompt });
    }

    try {
      const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: messages,
        tools: tools,
        tool_choice: 'auto',
      });
      
      const choice = completion.choices[0];
      const toolCalls = choice.message.tool_calls;

      if (toolCalls) {
          // FIX: Add a type guard (tc.type === 'function') before accessing tc.function to prevent errors when other tool types are present.
          const endConversationCall = toolCalls.find(tc => tc.type === 'function' && tc.function.name === 'end_conversation');
          if (endConversationCall) {
              return { text: choice.message.content || "It was nice talking to you. Goodbye.", endConversation: true, toolCalls: [endConversationCall] };
          }
      }

      return { 
          text: choice.message.content || "...", 
          endConversation: false,
          toolCalls: toolCalls || undefined
      };
    } catch (error) {
        console.error(`[AiService] OpenAI completion failed for ${currentAgent.name}:`, error);
        if (error instanceof OpenAI.APIError && error.status === 429 && apiKey) {
            apiKeyProvider.reportRateLimit(apiKey, 60);
        }
        return { text: "I'm not feeling well, I need to go.", endConversation: true };
    }
  }

  async conductResearchOnMarket(agent: Agent, market: MarketIntel): Promise<Partial<BettingIntel> | null> {
    if (!firecrawlService.isConfigured()) {
      console.warn(`[AiService] Research skipped for ${agent.name}: Firecrawl service not configured.`);
      return null;
    }

    const apiKey = await apiKeyProvider.getKeyForAgent(agent.id);
    if (!apiKey) {
      console.error(`[AiService] No API key for agent ${agent.name} for research.`);
      return null;
    }
    const openai = new OpenAI({ apiKey });

    try {
      // Step 1: Generate Search Query
      const queryGenPrompt = `You are an expert financial analyst. Generate a concise, effective search query to find the most relevant, recent information about the following prediction market. The query should be suitable for a web search engine.

Market: "${market.title}"
Description: "${market.description}"

Return ONLY the search query.`;
      
      const queryGenCompletion = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [{ role: 'user', content: queryGenPrompt }],
      });
      const searchQuery = queryGenCompletion.choices[0].message.content?.trim();
      if (!searchQuery) {
        console.warn(`[AiService] Could not generate search query for market: ${market.title}`);
        return null;
      }
      console.log(`[AiService] Generated search query for "${market.title}": "${searchQuery}"`);

      // Step 2: Search and Scrape
      const searchResults = await firecrawlService.search(searchQuery);
      const scrapedData = searchResults.filter(r => r.markdown && r.url);

      if (scrapedData.length === 0) {
        console.log(`[AiService] Firecrawl returned no scraped content for query: "${searchQuery}"`);
        return null;
      }
      
      const researchContext = scrapedData.map(result => `
## Source: ${result.url}
${result.markdown}
      `).join('\n\n---\n\n');

      // Step 3: Summarize Findings
      const summaryPrompt = `You are ${agent.name}, an expert prediction market analyst with this personality: "${agent.personality}".
Analyze the provided research material from multiple web sources regarding the market: "${market.title}".

Synthesize all the information into a concise, actionable piece of "alpha" or a contrarian insight. Your response should be a single, insightful paragraph. Do not mention the sources in your summary. Focus on the conclusion you draw from the data.

Research Material:
${researchContext}
      `;
      
      const summaryCompletion = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [{ role: 'user', content: summaryPrompt }],
      });
      
      const intelContent = summaryCompletion.choices[0].message.content?.trim();
      if (!intelContent) {
        console.warn(`[AiService] Could not generate summary for market: ${market.title}`);
        return null;
      }

      return {
        content: intelContent,
        sourceUrls: scrapedData.map(r => r.url),
        rawResearchData: scrapedData.map(r => ({ url: r.url, markdown: r.markdown })),
        sourceDescription: 'Autonomous Web Research'
      };

    } catch (error) {
      console.error(`[AiService] Full research process failed for market "${market.title}":`, error);
       if (error instanceof OpenAI.APIError && error.status === 429 && apiKey) {
            apiKeyProvider.reportRateLimit(apiKey, 60);
        }
      return null;
    }
  }

  async generateIntelForMarket(agent: Agent, market: MarketIntel): Promise<string | null> {
    const apiKey = await apiKeyProvider.getKeyForAgent(agent.id);
    if (!apiKey) {
      console.error(`[AiService] No API key for agent ${agent.name} for intel generation.`);
      return null;
    }
    const openai = new OpenAI({ apiKey });

    const systemPrompt = `You are ${agent.name}, an expert prediction market analyst with this personality: "${agent.personality}".`;
    const userPrompt = `Analyze the following prediction market and provide a concise, actionable piece of "alpha" or a contrarian insight. Your response should be a single, insightful sentence.
    
    Market: "${market.title}"
    Yes Odds: ${Math.round(market.odds.yes * 100)}¢
    No Odds: ${Math.round(market.odds.no * 100)}¢
    Platform: ${market.platform}
    `;

    try {
      const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
      });
      return completion.choices[0].message.content?.trim() ?? null;
    } catch (error) {
      console.error(`[AiService] OpenAI completion failed for intel generation on "${market.title}":`, error);
       if (error instanceof OpenAI.APIError && error.status === 429 && apiKey) {
            apiKeyProvider.reportRateLimit(apiKey, 60);
        }
      return null;
    }
  }
  
  async analyzeMarket(agent: Agent, market: MarketIntel, comments?: any[]): Promise<string> {
    const apiKey = await apiKeyProvider.getKeyForAgent(agent.id);
    if (!apiKey) throw new Error("API key not available for this agent.");

    const openai = new OpenAI({ apiKey });
    
    const systemPrompt = `You are ${agent.name}, an AI copilot for prediction markets. Your personality is: "${agent.personality}".`;
    let userPrompt = `My user is looking at the following market. Provide a brief, in-character analysis (2-3 sentences) based on the data provided.
    
    Market: "${market.title}"
    Description: ${market.description}
    Yes Odds: ${Math.round(market.odds.yes * 100)}¢
    Ends At: ${new Date(market.endsAt).toLocaleString()}
    `;

    if (comments && comments.length > 0) {
        const commentSnippets = comments.slice(0, 5).map(c => `- ${c.profile.pseudonym}: "${c.body}"`).join('\n');
        userPrompt += `\n\nAlso consider the latest public sentiment from user comments:\n${commentSnippets}\nSummarize the general sentiment and factor it into your final analysis.`;
    }
    
    try {
      const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ],
      });
      return completion.choices[0].message.content?.trim() ?? "I'm not sure what to make of this one.";
    } catch (error) {
        console.error(`[AiService] analyzeMarket failed for ${agent.name}:`, error);
        if (error instanceof OpenAI.APIError && error.status === 429 && apiKey) {
            apiKeyProvider.reportRateLimit(apiKey, 30);
        }
        throw new Error("Failed to get analysis from the AI.");
    }
  }

  async suggestBet(query: string, agentId: string) {
    const agent = await agentsCollection.findOne({ id: agentId });
    if (!agent) throw new Error("Agent not found");

    const apiKey = await apiKeyProvider.getKeyForAgent(agent.id);
    if (!apiKey) throw new Error("API key not available for this agent.");

    const openai = new OpenAI({ apiKey });
    
    const [polymarketResults, kalshiResults, agentIntel] = await Promise.all([
        polymarketService.searchMarkets(query),
        kalshiService.searchMarkets(query),
        bettingIntelCollection.find({ ownerAgentId: new Types.ObjectId(agentId) }).toArray()
    ]);

    const markets: MarketIntel[] = [...polymarketResults.markets, ...kalshiResults];

    const systemPrompt = `
      You are ${agent.name}, an AI copilot for prediction markets.
      Your personality: "${agent.personality}".

      Analyze the user's query and the provided market data. Provide a single, actionable bet suggestion.
      If the suggestion is based on intel you have, you MUST include the "sourceIntelId".
      
      Respond in JSON format with the following structure:
      {
        "analysis": "Your detailed reasoning for the suggestion, in character.",
        "suggestion": {
            "marketId": "The ID of the market you are recommending a bet on.",
            "outcome": "'yes' or 'no'.",
            "amount": A suggested bet amount in USD (e.g., 100),
            "price": The odds for the suggested outcome (0-1),
            "sourceIntelId": "The ID of the intel from your knowledge base that influenced this decision, if any."
        }
      }
    `;

    const userPrompt = `
      User query: "${query}"

      Available Markets:
      ${JSON.stringify(markets.slice(0, 10), null, 2)}

      Your Private Intel:
      ${JSON.stringify(agentIntel, null, 2)}
    `;

    try {
      const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ],
        response_format: { type: "json_object" }
      });
      
      const responseContent = completion.choices[0].message.content;
      if (!responseContent) throw new Error("Empty response from AI");

      const parsedResponse = JSON.parse(responseContent);
      
      // Pass the markets considered back to the client
      parsedResponse.markets = markets.slice(0, 5);
      
      return parsedResponse;

    } catch (error) {
      console.error(`[AiService] suggestBet failed for ${agent.name}:`, error);
       if (error instanceof OpenAI.APIError && error.status === 429 && apiKey) {
            apiKeyProvider.reportRateLimit(apiKey, 30);
        }
      throw new Error("Failed to get a bet suggestion from the AI.");
    }
  }
  
  async generateDailySummary(activities: { trades: TradeRecord[], intel: BettingIntel[] }): Promise<string | null> {
    const apiKey = await apiKeyProvider.getKeyForAgent('system-summary');
    if (!apiKey) {
      console.error(`[AiService] No API key available for generating daily summary.`);
      return null;
    }
    const openai = new OpenAI({ apiKey });
    
    const prompt = `
      You are an assistant who summarizes an AI agent's daily activity.
      Based on the following recent trades and authored intel, write a short, one-paragraph summary of the agent's day.
      Focus on key activities and outcomes. Be concise and write in a professional, report-like tone.

      Recent Trades:
      ${activities.trades.length > 0 ? JSON.stringify(activities.trades) : "No trades today."}

      Recent Authored Intel:
      ${activities.intel.length > 0 ? JSON.stringify(activities.intel.map(i => ({ market: i.market, content: i.content }))) : "No new intel authored today."}
    `;

    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
      });
      return completion.choices[0].message.content?.trim() ?? null;
    } catch (error) {
       console.error(`[AiService] Failed to generate daily summary:`, error);
       if (error instanceof OpenAI.APIError && error.status === 429 && apiKey) {
            apiKeyProvider.reportRateLimit(apiKey, 60);
        }
      return "Failed to generate summary due to an internal error.";
    }
  }

  async generateProactiveEngagementMessage(agent: Agent, intel: BettingIntel): Promise<string | null> {
    const apiKey = await apiKeyProvider.getKeyForAgent(agent.id);
    if (!apiKey) return null;

    const openai = new OpenAI({ apiKey });
    const prompt = `You are ${agent.name}, an AI agent with this personality: "${agent.personality}".
    You recently found this piece of intel: "${intel.content}" regarding the market "${intel.market}".
    
    Formulate a short, engaging question or thought to send to your user based on this intel.
    Your message should be conversational and proactive, as if you're a real partner. Keep it to a single sentence.
    
    Example: "Just a thought on that ETH market: have you considered the impact of the recent staking numbers?"
    `;

    try {
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
        });
        return completion.choices[0].message.content?.trim() ?? null;
    } catch (error) {
        console.error(`[AiService] Failed to generate proactive engagement message for ${agent.name}:`, error);
        if (error instanceof OpenAI.APIError && error.status === 429 && apiKey) {
            apiKeyProvider.reportRateLimit(apiKey, 60);
        }
        return null;
    }
  }
}
export const aiService = new AiService();