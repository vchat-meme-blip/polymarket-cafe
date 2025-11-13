/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import OpenAI from 'openai';
import mongoose from 'mongoose';
const { Types } = mongoose;

import { Agent, Interaction, MarketIntel, Room, TradeRecord, BettingIntel, User, AgentTask } from '../../lib/types/index.js';
import { apiKeyProvider } from './apiKey.provider.js';
import { agentsCollection, bettingIntelCollection, notificationsCollection, usersCollection, newMarketsCacheCollection } from '../db.js';
import { polymarketService } from './polymarket.service.js';
import { kalshiService } from './kalshi.service.js';
import { firecrawlService } from './firecrawl.service.js';
import { createSystemInstructions } from '../../lib/prompts.js';

// Define the tools available to the agent
const agentTools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
    {
        type: 'function',
        function: {
            name: 'search_markets',
            description: 'Search for prediction markets on Polymarket based on a query or category.',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'The search query, e.g., "Trump".' },
                    category: { type: 'string', description: 'A specific category to filter by, e.g., "Sports".' }
                },
                required: ['query'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'propose_bet',
            description: "Propose a single, actionable bet to the user. This will display a formal bet slip in the user's UI.",
            parameters: {
                type: 'object',
                properties: {
                    marketId: { type: 'string', description: 'The unique ID of the market for the bet.' },
                    outcome: { type: 'string', description: "The outcome to bet on, typically 'Yes' or 'No'." },
                    amount: { type: 'number', description: 'The suggested bet amount in USD.' },
                    price: { type: 'number', description: 'The odds for the suggested outcome (from 0 to 1).' },
                    analysis: { type: 'string', description: 'Your detailed reasoning for this bet suggestion. This will be shown to the user.' },
                    sourceIntelId: { type: 'string', description: 'The ID of the intel from your knowledge base that influenced this decision, if any.' },
                },
                required: ['marketId', 'outcome', 'amount', 'price', 'analysis'],
            },
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_new_markets',
            description: "Retrieves a list of the most recently discovered 'Breaking' markets that the system has found.",
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'bookmark_and_monitor_market',
            description: "Bookmarks a market for the user and assigns the agent to monitor it for significant changes.",
            parameters: {
                type: 'object',
                properties: {
                    marketId: { type: 'string', description: 'The unique ID of the market to bookmark and monitor.' },
                    marketTitle: { type: 'string', description: 'The title of the market.' },
                },
                required: ['marketId', 'marketTitle'],
            },
        }
    },
    {
        type: 'function',
        function: {
            name: 'gesture',
            description: 'Perform a physical gesture or animation to add expression to your message. Use this sparingly to emphasize a point or show emotion.',
            parameters: {
                type: 'object',
                properties: {
                    animation_name: { 
                        type: 'string', 
                        description: 'The name of the gesture to perform.',
                        enum: ['cute', 'dance', 'elegant', 'greeting', 'peacesign', 'pose', 'shoot', 'spin', 'squat']
                    },
                },
                required: ['animation_name'],
            },
        },
    }
];


class AiService {
  private async retry<T>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
    let apiKey: string | null = null;
    try {
        return await fn();
    } catch (error) {
        if (error instanceof OpenAI.APIError && error.status === 429 && retries > 1) {
            console.warn(`[AiService] Rate limit hit. Retrying in ${delay / 1000}s...`);
            if (apiKey) {
              apiKeyProvider.reportRateLimit(apiKey, 60); // Report rate limit before retry
            }
            await new Promise(res => setTimeout(res, delay));
            return this.retry<T>(fn, retries - 1, delay * 2);
        }
        throw error;
    }
  }

  async getDirectMessageResponse(
    agent: Agent,
    user: User,
    message: string,
    history: Interaction[],
    apiKey: string
  ): Promise<Interaction> {
    const openai = new OpenAI({ apiKey });

    const agentIntelBank = await bettingIntelCollection.find({ ownerHandle: agent.ownerHandle }).toArray();
    const systemPrompt = createSystemInstructions(agent, user, false, agentIntelBank as any[]);

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...history.map((turn): OpenAI.Chat.Completions.ChatCompletionMessageParam => {
        const role: 'assistant' | 'user' = turn.agentId === agent.id ? 'assistant' : 'user';
        
        if (role === 'assistant' && turn.tool_calls && turn.tool_calls.length > 0) {
            const formattedToolCalls = turn.tool_calls.map(tc => ({
                id: tc.id,
                type: 'function' as const,
                function: {
                    name: tc.function.name,
                    arguments: tc.function.arguments,
                }
            }));
            return {
                role: 'assistant',
                content: turn.text || null,
                tool_calls: formattedToolCalls,
            };
        } else if (turn.agentId === 'tool') {
             return {
                role: 'tool',
                tool_call_id: (turn as any).tool_call_id,
                content: turn.text,
            };
        } else {
            return {
                role,
                content: turn.text || '',
            };
        }
      }),
      { role: 'user', content: message },
    ];

    try {
      const createCompletion = () => openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: messages,
        tools: agentTools,
        tool_choice: 'auto',
      });
      
      const response = await this.retry(createCompletion);

      const responseMessage = response.choices[0].message;
      const toolCalls = responseMessage.tool_calls;

      if (toolCalls) {
        messages.push(responseMessage); 

        for (const toolCall of toolCalls) {
          if (toolCall.type !== 'function') continue;
          const functionName = toolCall.function.name;
          const functionArgs = JSON.parse(toolCall.function.arguments);
          let functionResponse;

          if (functionName === 'search_markets') {
            const { markets } = await polymarketService.searchMarkets(functionArgs.query, functionArgs.category);
            functionResponse = { markets: markets.slice(0, 5) };
          } else if (functionName === 'get_new_markets') {
            const newMarkets = await newMarketsCacheCollection.find({}).sort({ detectedAt: -1 }).limit(10).toArray();
            // FIX: Cast 'm' to 'any' to access properties not defined on the base 'Document' type.
            functionResponse = { new_markets: newMarkets.map(m => ({ title: (m as any).title, url: (m as any).marketUrl })) };
          } else if (functionName === 'calculate_payout') {
            const profit = (functionArgs.amount / functionArgs.price) - functionArgs.amount;
            functionResponse = { profit: profit.toFixed(2) };
          } else {
             return {
                agentId: agent.id,
                agentName: agent.name,
                text: responseMessage.content || '',
                timestamp: Date.now(),
                tool_calls: toolCalls,
             };
          }
          
          messages.push({
            tool_call_id: toolCall.id,
            role: 'tool',
            content: JSON.stringify(functionResponse),
          });
        }
        
        const createSecondCompletion = () => openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: messages,
        });
        const secondResponse = await this.retry(createSecondCompletion);

        return {
            agentId: agent.id,
            agentName: agent.name,
            text: secondResponse.choices[0].message.content || '...',
            timestamp: Date.now(),
        };

      }

      const responseText = responseMessage.content?.trim() ?? '...';
      return { agentId: agent.id, agentName: agent.name, text: responseText, timestamp: Date.now() };

    } catch (error) {
      console.error(`[AiService] OpenAI completion failed for direct message with ${agent.name}:`, error);
      if (error instanceof OpenAI.APIError && error.status === 429) {
        apiKeyProvider.reportRateLimit(apiKey, 60);
      }
      return {
        agentId: agent.id, agentName: agent.name,
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
    let apiKey: string | null = null;
    try {
      apiKey = await apiKeyProvider.getKeyForAgent(currentAgent.id);
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

      try {
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
                              }
                          }
                      });
                  }
              }
          }
      } catch (dbError) {
          console.error('[AiService] Database error during prompt construction:', dbError);
          systemPrompt = `You are ${currentAgent.name}. Your personality: "${currentAgent.personality}". You are talking to ${otherAgent.name}. Their personality: "${otherAgent.personality}". Keep your responses concise and in character. A database error occurred, so you cannot access your intel right now.`;
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

      const createCompletion = () => openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: messages,
        tools: tools,
        tool_choice: 'auto',
      });
      const completion = await this.retry(createCompletion);
      
      const choice = completion.choices[0];
      const toolCalls = choice.message.tool_calls;

      if (toolCalls) {
          if (toolCalls.some(tc => tc.type === 'function' && tc.function.name === 'end_conversation')) {
              return { text: choice.message.content || "It was nice talking to you. Goodbye.", endConversation: true, toolCalls };
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

    let apiKey: string | null = null;
    try {
      apiKey = await apiKeyProvider.getKeyForAgent('system-research');
      if (!apiKey) {
        console.error(`[AiService] No system API key for autonomous research.`);
        return null;
      }
      const openai = new OpenAI({ apiKey });

      const queryGenPrompt = `You are an expert financial analyst. Generate a concise, effective search query to find the most relevant, recent information about the following prediction market. The query should be suitable for a web search engine.

Market: "${market.title}"
Description: "${market.description}"

Return ONLY the search query.`;
      
      const createQueryCompletion = () => openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [{ role: 'user', content: queryGenPrompt }],
      });
      const queryGenCompletion = await this.retry(createQueryCompletion);
      const searchQuery = queryGenCompletion.choices[0].message.content?.trim();
      if (!searchQuery) {
        console.warn(`[AiService] Could not generate search query for market: ${market.title}`);
        return null;
      }
      console.log(`[AiService] Generated search query for "${market.title}": "${searchQuery}"`);

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

      const summaryPrompt = `You are ${agent.name}, an expert prediction market analyst with this personality: "${agent.personality}".
Analyze the provided research material from multiple web sources regarding the market: "${market.title}".

Synthesize all the information into a concise, actionable piece of "alpha" or a contrarian insight. Your response should be a single, insightful paragraph. Do not mention the sources in your summary. Focus on the conclusion you draw from the data.

Research Material:
${researchContext}
      `;
      
      const createSummaryCompletion = () => openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [{ role: 'user', content: summaryPrompt }],
      });
      const summaryCompletion = await this.retry(createSummaryCompletion);
      
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
    let apiKey: string | null = null;
    try {
      apiKey = await apiKeyProvider.getKeyForAgent(agent.id);
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

      const createCompletion = () => openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
      });
      const completion = await this.retry(createCompletion);
      return completion.choices[0].message.content?.trim() ?? null;
    } catch (error) {
      console.error(`[AiService] OpenAI completion failed for intel generation on "${market.title}":`, error);
       if (error instanceof OpenAI.APIError && error.status === 429 && apiKey) {
            apiKeyProvider.reportRateLimit(apiKey, 30);
        }
      return null;
    }
  }
  
  async analyzeMarket(agent: Agent, market: MarketIntel, comments?: any[]): Promise<string> {
    let apiKey: string | null = null;
    try {
      apiKey = await apiKeyProvider.getKeyForAgent(agent.id);
      if (!apiKey) throw new Error("API key not available for this agent.");

      const openai = new OpenAI({ apiKey });
      
      const firecrawlData = firecrawlService.isConfigured() ? await firecrawlService.search(market.title) : [];
      const researchContext = firecrawlData.length > 0
          ? `\n\nHere is some real-time web research on this topic:\n` + firecrawlData.map(r => `Source: ${r.title}\nContent: ${r.markdown.slice(0, 1500)}...`).join('\n\n')
          : '';

      const systemPrompt = `You are ${agent.name}, an AI copilot for prediction markets. Your personality is: "${agent.personality}".`;
      let userPrompt = `My user is looking at the following market. Provide a brief, in-character analysis (2-3 sentences) based on all the data provided.
      
      Market: "${market.title}"
      Description: ${market.description}
      Yes Odds: ${Math.round(market.odds.yes * 100)}¢
      Ends At: ${new Date(market.endsAt).toLocaleString()}
      ${researchContext}
      `;

      if (comments && comments.length > 0) {
          const commentSnippets = comments.slice(0, 5).map(c => `- ${c.profile.pseudonym}: "${c.body}"`).join('\n');
          userPrompt += `\n\nAlso consider the latest public sentiment from user comments:\n${commentSnippets}\nSummarize the general sentiment and factor it into your final analysis.`;
      }
      
      const createCompletion = () => openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ],
      });
      const completion = await this.retry(createCompletion);
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
    let apiKey: string | null = null;
    try {
      const agent = await agentsCollection.findOne({ id: agentId });
      if (!agent) throw new Error("Agent not found");

      apiKey = await apiKeyProvider.getKeyForAgent(agent.id);
      if (!apiKey) throw new Error("API key not available for this agent.");

      const openai = new OpenAI({ apiKey });
      
      const [polymarketResults, kalshiResults, agentIntel] = await Promise.all([
          polymarketService.searchMarkets(query),
          kalshiService.searchMarkets(query),
          bettingIntelCollection.find({ ownerAgentId: new Types.ObjectId(agentId) }).toArray()
      ]);

      // FIX: Correctly access 'markets' property from polymarketResults and concatenate with kalshiResults array.
      const markets: MarketIntel[] = [...polymarketResults.markets, ...kalshiResults];

      const systemPrompt = `
        You are ${agent.name}, an AI copilot for prediction markets.
        Your personality: "${agent.personality}".

        Analyze the user's query and the provided market data. Provide a single, actionable bet suggestion.
        If the suggestion is based on intel you have, you MUST include the "sourceIntelId".
        
        You MUST use the "propose_bet" tool to formalize your suggestion.
      `;

      const userPrompt = `
        User query: "${query}"

        Available Markets:
        ${JSON.stringify(markets.slice(0, 10), null, 2)}

        Your Private Intel:
        ${JSON.stringify(agentIntel, null, 2)}
      `;

      const createCompletion = () => openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ],
        tools: agentTools,
        tool_choice: { type: 'function', function: { name: 'propose_bet' } },
      });
      const completion = await this.retry(createCompletion);
      
      const toolCall = completion.choices[0].message.tool_calls?.[0];
      // FIX: Add a type guard to ensure toolCall is a function call before accessing its 'function' property.
      if (!toolCall || toolCall.type !== 'function' || toolCall.function.name !== 'propose_bet') {
        throw new Error("AI did not propose a bet using the required tool.");
      }

      // FIX: Safely access 'function' property after the type guard.
      const betArgs = JSON.parse(toolCall.function.arguments);
      
      return {
        analysis: betArgs.analysis,
        suggestion: {
          marketId: betArgs.marketId,
          outcome: betArgs.outcome,
          amount: betArgs.amount,
          price: betArgs.price,
          sourceIntelId: betArgs.sourceIntelId,
        }
      };

    } catch (error) {
      console.error(`[AiService] suggestBet failed for agent ID ${agentId}:`, error);
       if (error instanceof OpenAI.APIError && error.status === 429 && apiKey) {
            apiKeyProvider.reportRateLimit(apiKey, 30);
        }
      throw new Error("Failed to get a bet suggestion from the AI.");
    }
  }
  
  async generateDailySummary(activities: { trades: TradeRecord[], intel: BettingIntel[] }): Promise<string | null> {
    let apiKey: string | null = null;
    try {
      apiKey = await apiKeyProvider.getKeyForAgent('system-summary');
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

      const createCompletion = () => openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
      });
      const completion = await this.retry(createCompletion);
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
    let apiKey: string | null = null;
    try {
        apiKey = await apiKeyProvider.getKeyForAgent(agent.id);
        if (!apiKey) return null;

        const openai = new OpenAI({ apiKey });
        const prompt = `You are ${agent.name}, an AI agent with this personality: "${agent.personality}".
    You recently found this piece of intel: "${intel.content}" regarding the market "${intel.market}".
    
    Formulate a short, engaging question or thought to send to your user based on this intel.
    Your message should be conversational and proactive, as if you're a real partner. Keep it to a single sentence.
    
    Example: "Just a thought on that ETH market: have you considered the impact of the recent staking numbers?"
    `;

        const createCompletion = () => openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
        });
        const completion = await this.retry(createCompletion);
        return completion.choices[0].message.content?.trim() ?? null;
    } catch (error) {
        console.error(`[AiService] Failed to generate proactive engagement message for ${agent.name}:`, error);
        if (error instanceof OpenAI.APIError && error.status === 429 && apiKey) {
            apiKeyProvider.reportRateLimit(apiKey, 60);
        }
        return null;
    }
  }

   async researchTopic(agent: Agent, topic: string): Promise<{ summary: string; sources: { title: string; url: string; }[] } | null> {
    if (!firecrawlService.isConfigured()) {
      console.warn(`[AiService] Research skipped for ${agent.name}: Firecrawl service not configured.`);
      return { summary: "Research could not be performed because the web scraping service is not configured on the server.", sources: [] };
    }

    const apiKey = await apiKeyProvider.getKeyForAgent('system-research');
    if (!apiKey) {
      console.error(`[AiService] No system API key available for research task on topic: "${topic}".`);
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
        return { summary: 'The AI failed to generate a summary from the research material.', sources: scrapedData.map(r => ({ title: r.title || 'Untitled', url: r.url })) };
      }

      return {
        summary,
        sources: scrapedData.map(r => ({ title: r.title || 'Untitled', url: r.url })),
      };

    } catch (error) {
      console.error(`[AiService] Research process failed for topic "${topic}":`, error);
      if (error instanceof OpenAI.APIError && error.status === 429 && apiKey) {
           apiKeyProvider.reportRateLimit(apiKey, 60);
      }
      return { summary: `An error occurred during the research process: ${error instanceof Error ? error.message : 'Unknown error'}.`, sources: [] };
    }
  }
}
export const aiService = new AiService();
